import { branchOf, branchIndex, indexGraph, topologicalSort } from './graph'
import { BlockEnum, type WorkflowDefinition, type WorkflowEdge, type WorkflowNode } from './types'
import { getByPath, resolveTemplateWithReport } from './variables'
import { hasBlockingErrors, validateWorkflow } from './validator'

export type NodeOutput = Record<string, unknown>

export type RunEvent =
  | { type: 'run-start'; runId: string; workflow: string; at: number }
  | { type: 'node-start'; runId: string; nodeId: string; title: string; blockType: string; at: number }
  | { type: 'node-end'; runId: string; nodeId: string; title: string; status: 'success' | 'error'; durationMs: number; at: number }
  | { type: 'log'; runId: string; nodeId: string; level: 'info' | 'warn' | 'error'; message: string; at: number }
  | { type: 'run-end'; runId: string; status: WorkflowRunResult['status']; at: number }

export type NodeResult = {
  status: 'success' | 'error' | 'skipped'
  output?: NodeOutput
  error?: string
  durationMs?: number
}

export type WorkflowRunResult = {
  status: 'succeeded' | 'failed' | 'cancelled'
  outputs: Record<string, NodeOutput>
  nodeResults: Record<string, NodeResult>
  logs: string[]
  error?: string
}

export type HttpResponse = {
  status: number
  body: unknown
  headers: Record<string, string>
}

export type NodeExecutionContext = {
  node: WorkflowNode
  /** Inputs merged from all taken incoming edges. */
  inputs: Record<string, unknown>
  /** Template scope keyed by node title (plus `env`). */
  scope: Record<string, unknown>
  signal?: AbortSignal
  sleep: (ms: number) => Promise<void>
  emit: (event: RunEvent) => void
}

export type NodeHandler = (ctx: NodeExecutionContext) => Promise<unknown> | unknown

export type EngineOptions = {
  /** Override or add handlers per block type. Handlers must be pure/safe. */
  handlers?: Partial<Record<BlockEnum, NodeHandler>>
  /** Injected HTTP implementation. Defaults to global fetch when available. */
  fetchImpl?: (url: string, init: {
    method: string
    headers: Record<string, string>
    body?: string
    signal?: AbortSignal
    timeoutMs: number
  }) => Promise<HttpResponse>
  /** Injected code sandbox. Code nodes fail loudly when this is absent. */
  codeExecutor?: (code: string, language: string, inputs: Record<string, unknown>) => Promise<unknown>
  maxIterations?: number
  maxParallelBranches?: number
  maxDelayMs?: number
  httpTimeoutMs?: number
  runId?: string
  signal?: AbortSignal
  onEvent?: (event: RunEvent) => void
  /** Skip pre-flight validation (used by the editor's per-node test action). */
  skipValidation?: boolean
}

const DEFAULT_MAX_ITERATIONS = 100
const DEFAULT_MAX_PARALLEL = 8
const DEFAULT_MAX_DELAY = 60_000
const DEFAULT_HTTP_TIMEOUT = 10_000

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('cancelled')); return }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(new Error('cancelled')) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function parseLiteral(raw: string): unknown {
  const t = raw.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return t
}

function splitLogic(expr: string, op: '&&' | '||'): string[] {
  const out: string[] = []
  let buf = ''
  let quote: string | null = null
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (quote) {
      buf += ch
      if (ch === quote && expr[i - 1] !== '\\') quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (ch === op[0] && expr[i + 1] === op[1]) { out.push(buf); buf = ''; i++; continue }
    buf += ch
  }
  out.push(buf)
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * Small, side-effect-free condition evaluator.
 * Supports `== != > >= < <= contains not-contains`, `&&`, `||`,
 * node references (`start.query`) and quoted literals. No eval/new Function.
 */
export function evaluateCondition(expression: string, scope: Record<string, unknown>): boolean {
  const resolved = resolveTemplateWithReport(expression, scope).value.trim()
  return splitLogic(resolved, '||').some((orPart) =>
    splitLogic(orPart, '&&').every((term) => evaluateTerm(term, scope)),
  )
}

function evaluateTerm(term: string, scope: Record<string, unknown>): boolean {
  const cleaned = term.replace(/^\((.*)\)$/, '$1').trim()
  const m = /^(.*?)\s*(==|!=|>=|<=|>|<|contains|not-contains)\s*(.+)$/.exec(cleaned)
  if (!m) {
    const raw = cleaned.startsWith('"') ? parseLiteral(cleaned) : getByPath(scope, cleaned)
    return Boolean(raw)
  }
  const lhsRaw = m[1].trim()
  const isLiteral = /^["']/.test(lhsRaw) || /^(true|false|null)$/.test(lhsRaw) || /^-?\d+(\.\d+)?$/.test(lhsRaw)
  const lhs = isLiteral ? parseLiteral(lhsRaw) : (getByPath(scope, lhsRaw) ?? lhsRaw)
  const rhs = parseLiteral(m[3])
  switch (m[2]) {
    case '==': return String(lhs) === String(rhs)
    case '!=': return String(lhs) !== String(rhs)
    case '>': return Number(lhs) > Number(rhs)
    case '>=': return Number(lhs) >= Number(rhs)
    case '<': return Number(lhs) < Number(rhs)
    case '<=': return Number(lhs) <= Number(rhs)
    case 'contains': return String(lhs ?? '').includes(String(rhs))
    case 'not-contains': return !String(lhs ?? '').includes(String(rhs))
    default: return false
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

/** Extract the loop body of an iteration node as an independent definition. */
function iterationBody(def: WorkflowDefinition, iterationId: string): WorkflowDefinition {
  const graph = indexGraph(def)
  const bodyIds = new Set<string>()
  const queue = (graph.outgoing.get(iterationId) ?? [])
    .filter((e) => branchOf(e) === 'loop' || branchOf(e) === 'default')
    .map((e) => e.target)
  while (queue.length) {
    const id = queue.shift()!
    if (bodyIds.has(id)) continue
    bodyIds.add(id)
    for (const edge of graph.outgoing.get(id) ?? []) {
      if (branchOf(edge) === 'exit') continue
      if (!bodyIds.has(edge.target)) queue.push(edge.target)
    }
  }
  return {
    version: '1.0',
    name: `${def.name}::iteration-body`,
    description: '',
    nodes: def.nodes.filter((n) => bodyIds.has(n.id)),
    edges: def.edges.filter((e) => bodyIds.has(e.source) && bodyIds.has(e.target)),
  }
}

export class WorkflowEngine {
  private readonly options: Required<Pick<EngineOptions,
    'maxIterations' | 'maxParallelBranches' | 'maxDelayMs' | 'httpTimeoutMs' | 'runId'>> &
    Omit<EngineOptions, 'maxIterations' | 'maxParallelBranches' | 'maxDelayMs' | 'httpTimeoutMs' | 'runId'>

  constructor(options: EngineOptions = {}) {
    this.options = {
      ...options,
      maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      maxParallelBranches: options.maxParallelBranches ?? DEFAULT_MAX_PARALLEL,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY,
      httpTimeoutMs: options.httpTimeoutMs ?? DEFAULT_HTTP_TIMEOUT,
      runId: options.runId ?? `run-${Date.now().toString(36)}`,
    }
  }

  async run(def: WorkflowDefinition, initialInputs: Record<string, unknown> = {}): Promise<WorkflowRunResult> {
    const runId = this.options.runId
    const emit = this.options.onEvent ?? (() => {})
    const startedAt = Date.now()
    emit({ type: 'run-start', runId, workflow: def.name, at: startedAt })

    if (!this.options.skipValidation) {
      const errors = validateWorkflow(def)
      if (hasBlockingErrors(errors)) {
        const message = errors.filter((e) => e.severity === 'error').map((e) => e.message).join('; ')
        emit({ type: 'run-end', runId, status: 'failed', at: Date.now() })
        return this.fail(message, {})
      }
    }

    try {
      const { outputs, nodeResults, logs } = await this.runDefinition(def, {
        env: initialInputs,
      })
      const status: WorkflowRunResult['status'] = this.options.signal?.aborted ? 'cancelled' : 'succeeded'
      emit({ type: 'run-end', runId, status, at: Date.now() })
      return { status, outputs, nodeResults, logs }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      emit({ type: 'run-end', runId, status: message === 'cancelled' ? 'cancelled' : 'failed', at: Date.now() })
      return this.fail(message, {})
    }
  }

  private fail(error: string, outputs: Record<string, NodeOutput>): WorkflowRunResult {
    return {
      status: error === 'cancelled' ? 'cancelled' : 'failed',
      outputs,
      nodeResults: {},
      logs: [error],
      error,
    }
  }

  private async runDefinition(
    def: WorkflowDefinition,
    seedScope: Record<string, unknown>,
  ): Promise<Pick<WorkflowRunResult, 'outputs' | 'nodeResults' | 'logs'>> {
    const { order, cycleNodes } = topologicalSort(def)
    if (cycleNodes.length) throw new Error(`工作流存在循环依赖: ${cycleNodes.join(', ')}`)

    const graph = indexGraph(def)
    const level = new Map<string, number>()
    for (const id of order) {
      const parents = graph.incoming.get(id) ?? []
      level.set(id, parents.length
        ? Math.max(...parents.map((e) => level.get(e.source) ?? 0)) + 1
        : 0)
    }
    const waves = new Map<number, string[]>()
    for (const id of order) {
      const l = level.get(id) ?? 0
      waves.set(l, [...(waves.get(l) ?? []), id])
    }

    const scope: Record<string, unknown> = { ...seedScope }
    const outputs: Record<string, NodeOutput> = {}
    const nodeResults: Record<string, NodeResult> = {}
    const logs: string[] = []
    const takenEdges = new Set<string>()
    const active = new Set<string>(graph.startIds.length
      ? graph.startIds
      : order.filter((id) => (graph.incoming.get(id) ?? []).length === 0))
    const emit = this.options.onEvent ?? (() => {})
    const runId = this.options.runId

    const levels = [...waves.keys()].sort((a, b) => a - b)
    for (const l of levels) {
      const batch = (waves.get(l) ?? []).filter((id) => active.has(id))
      if (!batch.length) continue
      await mapLimit(batch, this.options.maxParallelBranches, async (id) => {
        const node = graph.nodes.get(id)!
        if (node.data.type === BlockEnum.Note) {
          nodeResults[id] = { status: 'skipped' }
          return
        }
        const started = Date.now()
        emit({ type: 'node-start', runId, nodeId: id, title: node.data.title, blockType: node.data.type, at: started })
        try {
          const inputs = this.collectInputs(graph.incoming.get(id) ?? [], takenEdges, outputs, scope)
          const output = await this.runNode(node, inputs, scope, logs, def)
          const safeOutput = output && typeof output === 'object' && !Array.isArray(output)
            ? output as NodeOutput
            : { value: output }
          const durationMs = Date.now() - started
          outputs[id] = safeOutput
          scope[node.data.title] = safeOutput
          nodeResults[id] = { status: 'success', output: safeOutput, durationMs }
          emit({ type: 'node-end', runId, nodeId: id, title: node.data.title, status: 'success', durationMs, at: Date.now() })
          for (const edge of this.nextEdges(node, graph.outgoing.get(id) ?? [], safeOutput)) {
            takenEdges.add(edge.id)
            active.add(edge.target)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          nodeResults[id] = { status: 'error', error: message, durationMs: Date.now() - started }
          logs.push(`[${node.data.title}] ${message}`)
          emit({ type: 'node-end', runId, nodeId: id, title: node.data.title, status: 'error', durationMs: Date.now() - started, at: Date.now() })
          throw new Error(`节点 "${node.data.title}" 执行失败: ${message}`)
        }
      })
    }

    for (const id of order) {
      if (!nodeResults[id]) nodeResults[id] = { status: 'skipped' }
    }
    return { outputs, nodeResults, logs }
  }

  private collectInputs(
    incoming: WorkflowEdge[],
    takenEdges: Set<string>,
    outputs: Record<string, NodeOutput>,
    scope: Record<string, unknown>,
  ): Record<string, unknown> {
    const inputs: Record<string, unknown> = {}
    for (const edge of incoming) {
      if (!takenEdges.has(edge.id)) continue
      Object.assign(inputs, outputs[edge.source] ?? {})
    }
    const env = scope.env
    if (env && typeof env === 'object') Object.assign(inputs, env)
    return inputs
  }

  private nextEdges(
    node: WorkflowNode,
    outgoing: WorkflowEdge[],
    output: NodeOutput,
  ): WorkflowEdge[] {
    if (node.data.type === BlockEnum.IfElse) {
      const result = Boolean(output.result)
      const matched = outgoing.filter((e) => branchOf(e) === (result ? 'true' : 'false'))
      return matched.length ? matched : outgoing
    }
    if (node.data.type === BlockEnum.Iteration) {
      const loop = outgoing.filter((e) => branchOf(e) === 'loop' || branchOf(e) === 'default')
      const exit = outgoing.filter((e) => branchOf(e) === 'exit')
      return [...loop, ...exit]
    }
    if (node.data.type === BlockEnum.Parallel) {
      const limit = Number((node.data as { branchCount?: number }).branchCount ?? this.options.maxParallelBranches)
      return outgoing
        .filter((e) => branchOf(e) === 'branch' || branchOf(e) === 'default')
        .sort((a, b) => branchIndex(a) - branchIndex(b))
        .slice(0, Math.min(limit, this.options.maxParallelBranches))
    }
    // Avoid re-triggering loop bodies from a plain node inside the body.
    return outgoing.filter((e) => branchOf(e) !== 'loop')
  }

  private async runNode(
    node: WorkflowNode,
    inputs: Record<string, unknown>,
    scope: Record<string, unknown>,
    logs: string[],
    def: WorkflowDefinition,
  ): Promise<unknown> {
    const signal = this.options.signal
    if (signal?.aborted) throw new Error('cancelled')
    const ctx: NodeExecutionContext = {
      node,
      inputs,
      scope,
      signal,
      sleep: (ms) => defaultSleep(Math.min(Math.max(ms, 0), this.options.maxDelayMs), signal),
      emit: this.options.onEvent ?? (() => {}),
    }
    const custom = this.options.handlers?.[node.data.type]
    if (custom) return custom(ctx)

    switch (node.data.type) {
      case BlockEnum.Start:
        return { ...inputs }

      case BlockEnum.End:
        return { result: inputs.result ?? inputs.value ?? inputs }

      case BlockEnum.Log: {
        const data = node.data as { message?: string; level?: 'info' | 'warn' | 'error' }
        const message = resolveTemplateWithReport(String(data.message ?? ''), scope).value
        const level = data.level ?? 'info'
        logs.push(`[${level}] ${message}`)
        ctx.emit({ type: 'log', runId: this.options.runId, nodeId: node.id, level, message, at: Date.now() })
        return { message, level }
      }

      case BlockEnum.Delay: {
        const duration = Number((node.data as { duration?: number }).duration ?? 0)
        await ctx.sleep(duration)
        return { waitedMs: duration }
      }

      case BlockEnum.HttpRequest: {
        const data = node.data as {
          method?: string; url?: string; headers?: string; body?: string; timeout?: number
        }
        const url = resolveTemplateWithReport(String(data.url ?? ''), scope).value
        let headers: Record<string, string> = {}
        try { headers = JSON.parse(resolveTemplateWithReport(String(data.headers ?? '{}'), scope).value) as Record<string, string> } catch { /* empty */ }
        const bodyText = data.body ? resolveTemplateWithReport(String(data.body), scope).value : undefined
        const timeoutMs = Math.min(Number(data.timeout) || this.options.httpTimeoutMs, this.options.httpTimeoutMs)
        const fetchImpl = this.options.fetchImpl
        if (!fetchImpl && typeof globalThis.fetch !== 'function') {
          throw new Error('未配置 HTTP 执行器（宿主未提供 fetch）')
        }
        const response = fetchImpl
          ? await fetchImpl(url, {
              method: data.method ?? 'GET',
              headers,
              ...(bodyText ? { body: bodyText } : {}),
              signal,
              timeoutMs,
            })
          : await this.defaultFetch(url, data.method ?? 'GET', headers, bodyText, signal, timeoutMs)
        return { status: response.status, body: response.body, headers: response.headers }
      }

      case BlockEnum.IfElse: {
        const expression = String((node.data as { expression?: string }).expression ?? '')
        return { result: evaluateCondition(expression, scope) }
      }

      case BlockEnum.Parallel: {
        const label = String((node.data as { branchLabels?: string[] }).branchLabels?.join(', ') ?? '')
        return { results: [], branches: label }
      }

      case BlockEnum.Iteration: {
        const data = node.data as { iteratorInput?: string; outputVarName?: string; exitCondition?: string }
        const raw = resolveTemplateWithReport(String(data.iteratorInput ?? ''), scope).value
        let items: unknown[]
        try {
          const parsed = JSON.parse(raw) as unknown
          items = Array.isArray(parsed) ? parsed : [parsed]
        } catch {
          items = raw ? raw.split(',').map((s) => s.trim()) : []
        }
        const varName = data.outputVarName || 'item'
        const body = iterationBody(def, node.id)
        const results: unknown[] = []
        const count = Math.min(items.length, this.options.maxIterations)
        for (let i = 0; i < count; i++) {
          if (signal?.aborted) throw new Error('cancelled')
          const result = await this.runDefinition(body, {
            ...scope,
            [node.data.title]: { [varName]: items[i], index: i },
          })
          results.push(Object.values(result.outputs).at(-1) ?? null)
          if (data.exitCondition && evaluateCondition(data.exitCondition, { ...scope, [node.data.title]: { result: results.at(-1) } })) break
        }
        return { output: results, count: results.length }
      }

      case BlockEnum.Code: {
        if (!this.options.codeExecutor) {
          throw new Error('未配置代码沙箱；请在插件配置中启用并注入可信执行器')
        }
        const data = node.data as { code?: string; language?: string }
        const codeInputs: Record<string, unknown> = {}
        for (const key of (data as { inputVariables?: string[] }).inputVariables ?? []) {
          codeInputs[key] = getByPath(scope, key) ?? inputs[key]
        }
        return { result: await this.options.codeExecutor(String(data.code ?? ''), String(data.language ?? 'javascript'), codeInputs) }
      }

      default:
        return { ...inputs }
    }
  }

  private async defaultFetch(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string | undefined,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<HttpResponse> {
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await globalThis.fetch(url, {
        method, headers, ...(body ? { body } : {}), signal: controller.signal,
      })
      const text = await res.text()
      let parsed: unknown = text
      try { parsed = JSON.parse(text) as unknown } catch { /* plain text */ }
      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => { responseHeaders[key] = value })
      return { status: res.status, body: parsed, headers: responseHeaders }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

/** Convenience wrapper used by both the plugin service and the editor adapter. */
export async function runWorkflow(
  def: WorkflowDefinition,
  inputs: Record<string, unknown> = {},
  options: EngineOptions = {},
): Promise<WorkflowRunResult> {
  const engine = new WorkflowEngine(options)
  return engine.run(def, inputs)
}
