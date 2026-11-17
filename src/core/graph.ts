import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from './types'

export type GraphIndex = {
  nodes: Map<string, WorkflowNode>
  outgoing: Map<string, WorkflowEdge[]>
  incoming: Map<string, WorkflowEdge[]>
  startIds: string[]
}

/** Build adjacency maps. Duplicate ids are ignored (validator reports them). */
export function indexGraph(def: WorkflowDefinition): GraphIndex {
  const nodes = new Map<string, WorkflowNode>()
  for (const node of def.nodes) if (!nodes.has(node.id)) nodes.set(node.id, node)

  const outgoing = new Map<string, WorkflowEdge[]>()
  const incoming = new Map<string, WorkflowEdge[]>()
  for (const id of nodes.keys()) {
    outgoing.set(id, [])
    incoming.set(id, [])
  }
  for (const edge of def.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue
    outgoing.get(edge.source)!.push(edge)
    incoming.get(edge.target)!.push(edge)
  }
  return {
    nodes,
    outgoing,
    incoming,
    startIds: def.nodes.filter((n) => n.type === 'start').map((n) => n.id),
  }
}

/** Kahn topological order. Returns `cycle` nodes when the graph cannot be ordered. */
export function topologicalSort(def: WorkflowDefinition): {
  order: string[]
  cycleNodes: string[]
} {
  const graph = indexGraph(def)
  const indegree = new Map<string, number>()
  for (const id of graph.nodes.keys()) indegree.set(id, graph.incoming.get(id)!.length)

  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const edge of graph.outgoing.get(id) ?? []) {
      const next = (indegree.get(edge.target) ?? 0) - 1
      indegree.set(edge.target, next)
      if (next === 0) queue.push(edge.target)
    }
  }
  return {
    order,
    cycleNodes: [...indegree.entries()].filter(([, d]) => d > 0).map(([id]) => id),
  }
}

/** All simple cycles (limited) for precise validation messages. */
export function detectCycles(def: WorkflowDefinition): string[][] {
  const graph = indexGraph(def)
  const state = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const cycles: string[][] = []
  const seen = new Set<string>()

  const visit = (id: string): void => {
    state.set(id, 1)
    stack.push(id)
    for (const edge of graph.outgoing.get(id) ?? []) {
      const next = edge.target
      if (state.get(next) === 1) {
        const at = stack.indexOf(next)
        const cycle = stack.slice(at)
        const key = [...cycle].sort().join('|')
        if (!seen.has(key)) { seen.add(key); cycles.push(cycle) }
      } else if (!state.get(next)) {
        visit(next)
      }
    }
    stack.pop()
    state.set(id, 2)
  }
  for (const id of graph.nodes.keys()) if (!state.get(id)) visit(id)
  return cycles
}

export type BranchKind = 'true' | 'false' | 'branch' | 'loop' | 'exit' | 'default'

/** Normalise the many sourceHandle spellings emitted by the editor. */
export function branchOf(edge: WorkflowEdge): BranchKind {
  const h = (edge.sourceHandle ?? '').toLowerCase()
  if (!h || h === 'source' || h === 'out') return 'default'
  if (/true|^yes$|^y$/.test(h)) return 'true'
  if (/false|^no$|^n$/.test(h)) return 'false'
  if (/branch|parallel|\b\d+\b/.test(h)) return 'branch'
  if (/loop|body|iterate/.test(h)) return 'loop'
  if (/exit|done|complete|else/.test(h)) return 'exit'
  return 'default'
}

export function branchIndex(edge: WorkflowEdge): number {
  const m = /(?:branch|parallel)?[-_]?(\d+)/i.exec(edge.sourceHandle ?? '')
  return m ? Number.parseInt(m[1], 10) : 0
}

/** Nodes reachable from any start node (branch edges included). */
export function reachableFromStart(def: WorkflowDefinition): Set<string> {
  const graph = indexGraph(def)
  const seen = new Set<string>()
  const queue = [...graph.startIds]
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const edge of graph.outgoing.get(id) ?? []) queue.push(edge.target)
  }
  return seen
}
