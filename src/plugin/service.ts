import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import { WorkflowEngine, type RunEvent, type WorkflowRunResult } from '../core/engine'
import { toPersistableDefinition, type WorkflowDefinition } from '../core/types'
import { hasBlockingErrors, validateWorkflow } from '../core/validator'
import { exportToYaml, importFromYaml } from '../core/yaml'
import type { Config } from './config'
import './events'

export type RunSummary = {
  runId: string
  workflowId: string
  workflow: string
  status: WorkflowRunResult['status']
  error?: string
  startedAt: number
  durationMs: number
}

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

/**
 * Capability service exposed as `ctx.workflow`.
 *
 * Class form is required because this plugin provides a service to other
 * plugins. Registration is owned by the Cordis fiber, so no manual teardown.
 */
export default class WorkflowService extends Service {
  private readonly settings: Config
  private readonly workflows = new Map<string, WorkflowDefinition>()
  private readonly historyItems: RunSummary[] = []
  private readonly ready: Promise<void>
  private lastPersistError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'workflow')
    this.settings = config
    this.ready = this.loadPersisted()
  }

  /** Wait for the optional persistence layer to finish loading. */
  async readyToUse(): Promise<void> {
    await this.ready
  }

  /** Flush state; called from the plugin's single serial effect disposer. */
  async close(): Promise<void> {
    await this.ready
    await this.persist()
  }

  get lastError(): string | undefined {
    return this.lastPersistError
  }

  list(): { id: string; name: string; nodes: number; edges: number }[] {
    return [...this.workflows.entries()].map(([id, def]) => ({
      id,
      name: def.name,
      nodes: def.nodes.length,
      edges: def.edges.length,
    }))
  }

  get(id: string): WorkflowDefinition | undefined {
    const def = this.workflows.get(id)
    return def ? structuredClone(def) : undefined
  }

  validate(def: WorkflowDefinition) {
    return validateWorkflow(def)
  }

  register(id: string, def: WorkflowDefinition): void {
    this.assertId(id)
    const errors = validateWorkflow(def)
    if (hasBlockingErrors(errors)) {
      throw new Error(errors.filter((e) => e.severity === 'error').map((e) => e.message).join('; '))
    }
    if (!this.workflows.has(id) && this.workflows.size >= this.settings.maxWorkflows) {
      throw new Error(`注册的工作流数量已达上限 ${this.settings.maxWorkflows}`)
    }
    this.workflows.set(id, toPersistableDefinition(def))
    void this.persist()
    this.ctx.emit('workflow/registered', { id, name: def.name })
  }

  remove(id: string): boolean {
    const removed = this.workflows.delete(id)
    if (removed) {
      void this.persist()
      this.ctx.emit('workflow/removed', { id })
    }
    return removed
  }

  registerYaml(id: string, text: string): WorkflowDefinition {
    const def = importFromYaml(text)
    this.register(id, def)
    return def
  }

  exportYaml(id: string): string {
    const def = this.workflows.get(id)
    if (!def) throw new Error(`工作流不存在: ${id}`)
    return exportToYaml(def)
  }

  history(limit = this.settings.maxHistory): RunSummary[] {
    return this.historyItems.slice(0, Math.max(0, Math.min(limit, this.historyItems.length)))
  }

  async run(id: string, inputs: Record<string, unknown> = {}): Promise<WorkflowRunResult> {
    await this.ready
    const def = this.workflows.get(id)
    if (!def) throw new Error(`工作流不存在: ${id}`)
    return this.execute(def, id, inputs)
  }

  async runInline(def: WorkflowDefinition, inputs: Record<string, unknown> = {}): Promise<WorkflowRunResult> {
    const errors = validateWorkflow(def)
    if (hasBlockingErrors(errors)) {
      throw new Error(errors.filter((e) => e.severity === 'error').map((e) => e.message).join('; '))
    }
    return this.execute(def, '(inline)', inputs)
  }

  private async execute(
    def: WorkflowDefinition,
    workflowId: string,
    inputs: Record<string, unknown>,
  ): Promise<WorkflowRunResult> {
    const runId = `run-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
    const startedAt = Date.now()
    const emitEvent = (event: RunEvent): void => {
      if (!this.settings.emitEvents) return
      switch (event.type) {
        case 'run-start':
          this.ctx.emit('workflow/run-started', { runId, workflowId, workflow: event.workflow })
          break
        case 'node-start':
        case 'node-end':
          this.ctx.emit('workflow/node', event)
          break
        case 'log':
          this.ctx.emit('workflow/log', event)
          break
        case 'run-end':
          break
      }
    }

    const engine = new WorkflowEngine({
      runId,
      maxIterations: this.settings.maxIterations,
      maxParallelBranches: this.settings.maxParallelBranches,
      maxDelayMs: this.settings.maxDelayMs,
      httpTimeoutMs: this.settings.httpTimeoutMs,
      onEvent: emitEvent,
      // Code nodes stay disabled unless another plugin provides a real sandbox.
      codeExecutor: undefined,
    })
    const result = await engine.run(def, inputs)
    this.historyItems.unshift({
      runId,
      workflowId,
      workflow: def.name,
      status: result.status,
      ...(result.error ? { error: result.error } : {}),
      startedAt,
      durationMs: Date.now() - startedAt,
    })
    if (this.historyItems.length > this.settings.maxHistory) {
      this.historyItems.length = this.settings.maxHistory
    }
    this.ctx.emit('workflow/run-finished', {
      runId,
      workflowId,
      result: { status: result.status, ...(result.error ? { error: result.error } : {}), logs: result.logs },
    })
    return result
  }

  private assertId(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw new Error(`工作流 id 非法（仅允许字母数字与 _ . : -，最长 128）: ${id}`)
    }
  }

  private async loadPersisted(): Promise<void> {
    const path = this.settings.persistencePath
    if (!path) return
    try {
      const raw = await readFile(path, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) throw new Error('持久化文件必须是数组')
      for (const entry of parsed as { id?: unknown; definition?: WorkflowDefinition }[]) {
        if (!entry || typeof entry.id !== 'string' || !entry.definition) continue
        const def = entry.definition
        if (!def.name || !Array.isArray(def.nodes) || !Array.isArray(def.edges)) continue
        if (!ID_PATTERN.test(entry.id)) continue
        if (hasBlockingErrors(validateWorkflow(def))) continue
        this.workflows.set(entry.id, toPersistableDefinition(def))
      }
    } catch (error) {
      // Corrupt persistence must not take the whole plugin down.
      this.lastPersistError = error instanceof Error ? error.message : String(error)
    }
  }

  private async persist(): Promise<void> {
    const path = this.settings.persistencePath
    if (!path) return
    try {
      await mkdir(dirname(path), { recursive: true })
      const temp = `${path}.tmp-${process.pid}`
      const payload = [...this.workflows.entries()].map(([id, definition]) => ({ id, definition }))
      await writeFile(temp, JSON.stringify(payload, null, 2), 'utf8')
      await rename(temp, path)
      this.lastPersistError = undefined
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error)
    }
  }
}
