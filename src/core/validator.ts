import { branchOf, detectCycles, indexGraph, reachableFromStart } from './graph'
import {
  BlockEnum,
  NODE_DEFAULTS,
  type ValidationError,
  type WorkflowDefinition,
  type WorkflowNode,
} from './types'

/** Validate a workflow definition. Web editor and DSH tool share this logic. */
export function validateWorkflow(def: WorkflowDefinition): ValidationError[] {
  const errors: ValidationError[] = []
  const nodes = def.nodes

  if (nodes.length < 2) {
    errors.push({ message: '流程至少需要包含开始和结束节点', severity: 'error' })
  }

  const startNodes = nodes.filter((n) => n.data.type === BlockEnum.Start)
  const endNodes = nodes.filter((n) => n.data.type === BlockEnum.End)
  if (startNodes.length === 0) {
    errors.push({ message: '缺少开始节点', severity: 'error' })
  } else if (startNodes.length > 1) {
    errors.push({ message: '开始节点只能有一个', severity: 'error' })
  }
  if (endNodes.length === 0) {
    errors.push({ message: '缺少结束节点', severity: 'error' })
  }

  const seen = new Set<string>()
  for (const node of nodes) {
    if (seen.has(node.id)) {
      errors.push({ nodeId: node.id, message: `重复的节点 id: ${node.id}`, severity: 'error' })
    }
    seen.add(node.id)
    if (!NODE_DEFAULTS[node.data.type]) {
      errors.push({
        nodeId: node.id,
        message: `未知的节点类型: ${String(node.data.type)}`,
        severity: 'error',
      })
      continue
    }
    const singleton = NODE_DEFAULTS[node.data.type].isSingleton
    if (singleton && nodes.filter((n) => n.data.type === node.data.type).length > 1) {
      errors.push({
        nodeId: node.id,
        message: `${NODE_DEFAULTS[node.data.type].title}节点只能有一个`,
        severity: 'error',
      })
    }
  }

  const connected = new Set<string>()
  const edgeIds = new Set<string>()
  for (const edge of def.edges) {
    connected.add(edge.source)
    connected.add(edge.target)
    if (edgeIds.has(edge.id)) {
      errors.push({ edgeId: edge.id, message: `重复的连线 id: ${edge.id}`, severity: 'error' })
    }
    edgeIds.add(edge.id)
    if (!seen.has(edge.source) || !seen.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        message: `连线 "${edge.id}" 引用了不存在的节点`,
        severity: 'error',
      })
    }
    if (edge.source === edge.target) {
      errors.push({ edgeId: edge.id, message: '节点不能连接到自身', severity: 'error' })
    }
  }

  const graph = indexGraph(def)
  for (const node of nodes) {
    const type = node.data.type
    if (type === BlockEnum.Start || type === BlockEnum.End || type === BlockEnum.Note) continue

    if (!connected.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `节点 "${node.data.title || node.id}" 未连接到流程`,
        severity: 'warning',
      })
    }

    if (type === BlockEnum.HttpRequest) {
      const url = String((node.data as { url?: string }).url ?? '').trim()
      if (!url) {
        errors.push({ nodeId: node.id, message: `HTTP 节点 "${node.data.title}" URL 不能为空`, severity: 'error' })
      } else if (!/^https?:\/\//i.test(url)) {
        errors.push({ nodeId: node.id, message: `HTTP 节点 "${node.data.title}" URL 必须以 http(s):// 开头`, severity: 'error' })
      }
      const timeout = Number((node.data as { timeout?: number }).timeout ?? 0)
      if (!Number.isFinite(timeout) || timeout < 0) {
        errors.push({ nodeId: node.id, message: `HTTP 节点 "${node.data.title}" 超时时间无效`, severity: 'error' })
      }
    }

    if (type === BlockEnum.IfElse) {
      const expression = String((node.data as { expression?: string }).expression ?? '').trim()
      if (!expression) {
        errors.push({ nodeId: node.id, message: `条件节点 "${node.data.title}" 表达式不能为空`, severity: 'error' })
      }
      const outs = graph.outgoing.get(node.id) ?? []
      const hasTrue = outs.some((e) => branchOf(e) === 'true')
      const hasFalse = outs.some((e) => branchOf(e) === 'false')
      if (outs.length > 0 && !hasTrue && !hasFalse) {
        errors.push({
          nodeId: node.id,
          message: `条件节点 "${node.data.title}" 缺少 true/false 分支连线`,
          severity: 'warning',
        })
      }
    }

    if (type === BlockEnum.Delay) {
      const duration = Number((node.data as { duration?: number }).duration ?? NaN)
      if (!Number.isFinite(duration) || duration < 0) {
        errors.push({ nodeId: node.id, message: `延迟节点 "${node.data.title}" 时间无效`, severity: 'error' })
      }
    }

    if (type === BlockEnum.Iteration) {
      const input = String((node.data as { iteratorInput?: string }).iteratorInput ?? '').trim()
      if (!input) {
        errors.push({ nodeId: node.id, message: `迭代节点 "${node.data.title}" 输入变量不能为空`, severity: 'error' })
      }
    }

    if (type === BlockEnum.Parallel) {
      const count = Number((node.data as { branchCount?: number }).branchCount ?? 0)
      if (!Number.isInteger(count) || count < 1) {
        errors.push({ nodeId: node.id, message: `并行节点 "${node.data.title}" 分支数无效`, severity: 'error' })
      }
    }

    if (type === BlockEnum.Code) {
      const code = String((node.data as { code?: string }).code ?? '').trim()
      if (!code) {
        errors.push({ nodeId: node.id, message: `代码节点 "${node.data.title}" 代码不能为空`, severity: 'error' })
      }
    }
  }

  for (const start of startNodes) {
    if (!graph.outgoing.get(start.id)?.length) {
      errors.push({ nodeId: start.id, message: '开始节点必须有输出连线', severity: 'error' })
    }
  }
  for (const end of endNodes) {
    if (!graph.incoming.get(end.id)?.length) {
      errors.push({ nodeId: end.id, message: '结束节点必须有输入连线', severity: 'error' })
    }
  }

  for (const cycle of detectCycles(def)) {
    const titles = cycle.map((id) => nodes.find((n) => n.id === id)?.data.title ?? id)
    errors.push({ message: `检测到循环依赖: ${titles.join(' → ')}`, severity: 'error' })
  }

  const reachable = reachableFromStart(def)
  for (const node of nodes) {
    if (startNodes.length > 0 && !reachable.has(node.id) && node.data.type !== BlockEnum.Note) {
      errors.push({
        nodeId: node.id,
        message: `节点 "${node.data.title || node.id}" 无法从开始节点到达`,
        severity: 'warning',
      })
    }
  }

  return errors
}

export function hasBlockingErrors(errors: ValidationError[]): boolean {
  return errors.some((e) => e.severity === 'error')
}

export function nodeByTitle(def: WorkflowDefinition, title: string): WorkflowNode | undefined {
  return def.nodes.find((n) => n.data.title === title)
}
