import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import {
  type AppNode,
  type AppEdge,
  type CommonNodeType,
  type BlockEnum,
  type WorkflowDefinition,
  type ValidationError,
  type SimulationState,
  type SimulationNodeResult,
  NODE_DEFAULTS,
  BlockEnum as Block,
  NodeRunningStatus,
} from '../types/workflow'
import { NODE_WIDTH } from '../constants'
import { topologicalSort } from '../core/graph'
import { toPersistableDefinition } from '../core/types'
import { validateWorkflow } from '../core/validator'
import type { VariableDef } from '../types/variable'
import type { NodeBundle } from '../types/workflow'

export type HistoryEntry = {
  id: string
  timestamp: number
  /** Human-readable description of this step */
  description: string
  nodes: AppNode[]
  edges: AppEdge[]
}

export type RunRecord = {
  id: string
  startedAt: number
  finishedAt?: number
  mode: 'auto' | 'step'
  status: 'running' | 'completed' | 'error'
  /** Map of nodeId → {status, output, duration} */
  nodeResults: Record<string, SimulationNodeResult>
  /** Ordered list of executed node ids */
  executionOrder: string[]
  error?: string
}

export type HistoryState = {
  entries: HistoryEntry[]
  index: number
  /** Maximum entries to keep in history */
  maxEntries: number
}

interface WorkflowState {
  nodes: AppNode[]
  edges: AppEdge[]
  selectedNodeId: string | null
  selectedNodeIds: string[]
  clipboard: { nodes: AppNode[]; edges: AppEdge[] } | null
  workflowName: string
  workflowDescription: string
  validationErrors: ValidationError[]
  showValidation: boolean
  simulation: SimulationState
  envVariables: VariableDef[]
  history: HistoryState
  bundles: NodeBundle[]
  selectedEdgeIds: string[]
  runHistory: RunRecord[]
  /** Currently displayed run id (click in RunHistory) */
  activeRunId: string | null
  /** Canvas control mode: 'pointer' = left-drag to box-select; 'hand' = left-drag to pan. */
  canvasMode: 'pointer' | 'hand'

  addNode: (type: BlockEnum, position: { x: number; y: number }) => string
  removeNode: (id: string) => void
  removeNodes: (ids: string[]) => void
  updateNodeData: (id: string, data: Partial<CommonNodeType>) => void
  selectNode: (id: string | null) => void
  selectNodes: (ids: string[]) => void
  toggleNodeSelection: (id: string, multi?: boolean) => void
  selectAllNodes: () => void
  addEdge: (source: string, target: string, label?: string, sourceHandle?: string | null, targetHandle?: string | null) => void
  updateEdgeLabel: (id: string, label: string) => void
  removeEdge: (id: string) => void
  setWorkflowName: (name: string) => void
  setWorkflowDescription: (desc: string) => void
  setNodesAndEdges: (nodes: AppNode[], edges: AppEdge[]) => void
  moveNodes: (delta: { x: number; y: number }) => void
  copySelected: () => void
  pasteClipboard: (offset?: { x: number; y: number }) => string[]
  duplicateSelected: () => string[]
  toggleNodeDisabled: (id: string) => void
  addEnvVariable: (v: Omit<VariableDef, 'id'>) => string
  updateEnvVariable: (id: string, patch: Partial<VariableDef>) => void
  removeEnvVariable: (id: string) => void
  // Bundles
  selectEdge: (id: string | null) => void
  selectEdges: (ids: string[]) => void
  createBundle: (nodeIds: string[], title?: string, color?: NodeBundle['color']) => string | null
  removeBundle: (id: string) => void
  toggleBundleCollapsed: (id: string) => void
  updateBundle: (id: string, patch: Partial<NodeBundle>) => void
  addNodesToBundle: (bundleId: string, nodeIds: string[]) => void
  /** Move a bundle (and all its member nodes) by a delta. */
  moveBundle: (id: string, delta: { x: number; y: number }) => void
  /** Recalculate every bundle's bounds to tightly fit its member nodes. */
  autoFitBundles: () => void
  /** Recalculate a single bundle's bounds. */
  autoFitBundle: (id: string) => void
  /** Toggle the locked flag — locked bundles don't auto-fit and skip drag. */
  toggleBundleLocked: (id: string) => void
  /** Collapse / expand every bundle in the workflow. */
  collapseAllBundles: () => void
  expandAllBundles: () => void
  /** Remove every bundle (nodes themselves stay). */
  removeAllBundles: () => void
  /** Record a snapshot into the history stack. */
  pushHistory: (description: string) => void
  /** Undo to the previous history entry. */
  undo: () => void
  /** Redo to the next history entry. */
  redo: () => void
  /** Jump to a specific history index. */
  jumpToHistory: (index: number) => void
  /** Clear all history (e.g. on import). */
  clearHistory: () => void
  validate: () => void
  clearValidation: () => void
  exportToJSON: () => WorkflowDefinition
  importFromJSON: (def: WorkflowDefinition) => void
  startSimulation: (mode?: 'auto' | 'step') => void
  stepSimulation: () => void
  resetSimulation: () => void
  /** Set the active run id (used by RunHistory panel). */
  setActiveRun: (id: string | null) => void
  /** Set the canvas control mode (pointer = box-select; hand = pan). */
  setCanvasMode: (mode: 'pointer' | 'hand') => void
  /** Delete a single run record. */
  deleteRun: (id: string) => void
  /** Clear all run records. */
  clearRunHistory: () => void
  /** Manually run only a single node and record the result. */
  testNode: (id: string) => void
}

function initSimulation(): SimulationState {
  return { status: 'idle', mode: null, currentNodeId: null, nodeResults: {}, executionOrder: [], _runId: null }
}

/** Compute a tight bounding box around the given nodes (in flow coordinates). */
function computeBundleBounds(
  nodes: AppNode[],
  padding = 24,
): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const w = (n as AppNode & { width?: number }).width ?? NODE_WIDTH
    const h = (n as AppNode & { height?: number }).height ?? 80
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  return {
    x: minX - padding,
    y: minY - padding - 24, // extra space for the title pill
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2 + 24,
  }
}

function buildDefaultNodes(): AppNode[] {
  const startId = uuidv4()
  const endId = uuidv4()
  return [
    {
      id: startId,
      type: 'custom',
      position: { x: 80, y: 250 },
      data: { ...NODE_DEFAULTS[Block.Start].defaultData } as CommonNodeType,
    },
    {
      id: endId,
      type: 'custom',
      position: { x: 80, y: 450 },
      data: { ...NODE_DEFAULTS[Block.End].defaultData } as CommonNodeType,
    },
  ]
}

/** One snapshot per store instance: undo must restore the exact initial ids. */
const initialNodes = buildDefaultNodes()

function toAppNodes(def: WorkflowDefinition): AppNode[] {
  return def.nodes.map((wn) => ({
    id: wn.id,
    type: wn.type === Block.Note ? 'custom-note' : 'custom',
    position: wn.position,
    data: wn.data,
  })) as AppNode[]
}

function toAppEdges(def: WorkflowDefinition): AppEdge[] {
  return def.edges.map((we) => ({
    id: we.id,
    source: we.source,
    target: we.target,
    sourceHandle: we.sourceHandle,
    targetHandle: we.targetHandle,
    type: 'custom',
    label: we.label,
    data: {
      sourceType: def.nodes.find((n) => n.id === we.source)?.type || Block.Start,
      targetType: def.nodes.find((n) => n.id === we.target)?.type || Block.End,
    },
  })) as AppEdge[]
}

function buildDefinition(nodes: AppNode[], edges: AppEdge[], name: string, description: string): WorkflowDefinition {
  return toPersistableDefinition({
    version: '1.0',
    name,
    description,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.type,
      position: { x: n.position.x, y: n.position.y },
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle != null ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle != null ? { targetHandle: e.targetHandle } : {}),
      ...(e.label != null ? { label: String(e.label) } : {}),
    })),
  })
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: initialNodes.map((n) => ({ ...n, data: { ...n.data } })),
  edges: [],
  selectedNodeId: null,
  selectedNodeIds: [],
  clipboard: null,
  workflowName: '我的新流程',
  workflowDescription: '',
  validationErrors: [],
  showValidation: false,
  simulation: initSimulation(),
  envVariables: [],
  history: {
    entries: [
      {
        id: 'init',
        timestamp: Date.now(),
        description: '初始状态',
        nodes: initialNodes.map((n) => ({ ...n, data: { ...n.data } })),
        edges: [],
      },
    ],
    index: 0,
    maxEntries: 50,
  },
  bundles: [],
  selectedEdgeIds: [],
  runHistory: [],
  activeRunId: null,
  canvasMode: 'pointer',

  addNode: (type, position) => {
    const id = uuidv4()
    const defaults = NODE_DEFAULTS[type]
    let nodeType = 'custom'
    if (type === Block.Note) nodeType = 'custom-note'
    const node: AppNode = {
      id,
      type: nodeType,
      position,
      data: { ...defaults.defaultData } as CommonNodeType,
    }
    set((s) => ({ nodes: [...s.nodes, node] }))
    return id
  },

  removeNode: (id) => {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds.filter((nid) => nid !== id),
      bundles: s.bundles.map((b) => ({ ...b, nodeIds: b.nodeIds.filter((nid) => nid !== id) })).filter((b) => b.nodeIds.length > 0),
    }))
  },

  removeNodes: (ids) => {
    const idSet = new Set(ids)
    set((s) => ({
      nodes: s.nodes.filter((n) => !idSet.has(n.id)),
      edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: idSet.has(s.selectedNodeId ?? '') ? null : s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds.filter((nid) => !idSet.has(nid)),
      bundles: s.bundles.map((b) => ({ ...b, nodeIds: b.nodeIds.filter((nid) => !idSet.has(nid)) })).filter((b) => b.nodeIds.length > 0),
    }))
  },

  updateNodeData: (id, data) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } as CommonNodeType } : n,
      ),
    }))
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedNodeIds: id ? [id] : [] }),

  selectNodes: (ids) =>
    set({ selectedNodeIds: ids, selectedNodeId: ids.length === 1 ? ids[0] : null }),

  toggleNodeSelection: (id, multi = false) => {
    set((s) => {
      if (!multi) {
        return { selectedNodeId: id, selectedNodeIds: [id] }
      }
      const exists = s.selectedNodeIds.includes(id)
      const next = exists ? s.selectedNodeIds.filter((nid) => nid !== id) : [...s.selectedNodeIds, id]
      return { selectedNodeId: next.length === 1 ? next[0] : null, selectedNodeIds: next }
    })
  },

  selectAllNodes: () => {
    set((s) => ({ selectedNodeIds: s.nodes.map((n) => n.id), selectedNodeId: null }))
  },

  moveNodes: (delta) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        s.selectedNodeIds.includes(n.id) ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } } : n,
      ),
    }))
  },

  copySelected: () => {
    const { nodes, edges, selectedNodeIds } = get()
    if (selectedNodeIds.length === 0) return
    const idSet = new Set(selectedNodeIds)
    const copiedNodes = nodes.filter((n) => idSet.has(n.id)).map((n) => ({ ...n, data: { ...n.data } }))
    const copiedEdges = edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
    set({ clipboard: { nodes: copiedNodes, edges: copiedEdges } })
  },

  pasteClipboard: (offset) => {
    const { clipboard } = get()
    if (!clipboard) return []
    const dx = offset?.x ?? 40
    const dy = offset?.y ?? 40
    const idMap = new Map<string, string>()
    const newNodes: AppNode[] = clipboard.nodes.map((n) => {
      const newId = uuidv4()
      idMap.set(n.id, newId)
      return { ...n, id: newId, position: { x: n.position.x + dx, y: n.position.y + dy }, data: { ...n.data } }
    })
    const newEdges: AppEdge[] = clipboard.edges
      .map((e) => {
        const newSource = idMap.get(e.source)
        const newTarget = idMap.get(e.target)
        if (!newSource || !newTarget) return null
        return {
          ...e,
          id: `edge-${newSource}-${e.sourceHandle ?? 'src'}-${newTarget}-${e.targetHandle ?? 'tgt'}-${uuidv4()}`,
          source: newSource,
          target: newTarget,
          data: { ...(e.data ?? {}) },
        } as AppEdge
      })
      .filter((e): e is AppEdge => e !== null)
    set((s) => ({
      nodes: [...s.nodes, ...newNodes],
      edges: [...s.edges, ...newEdges],
      selectedNodeIds: newNodes.map((n) => n.id),
      selectedNodeId: newNodes.length === 1 ? newNodes[0].id : null,
    }))
    return newNodes.map((n) => n.id)
  },

  duplicateSelected: () => {
    get().copySelected()
    return get().pasteClipboard()
  },

  toggleNodeDisabled: (id) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, _isDisabled: !n.data._isDisabled } } : n,
      ),
    }))
  },

  addEnvVariable: (v) => {
    const id = uuidv4()
    set((s) => ({ envVariables: [...s.envVariables, { ...v, id }] }))
    return id
  },

  updateEnvVariable: (id, patch) => {
    set((s) => ({
      envVariables: s.envVariables.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }))
  },

  removeEnvVariable: (id) => {
    set((s) => ({ envVariables: s.envVariables.filter((v) => v.id !== id) }))
  },

  pushHistory: (description) => {
    const state = get()
    const snapshot: HistoryEntry = {
      id: uuidv4(),
      timestamp: Date.now(),
      description,
      nodes: state.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: state.edges.map((e) => ({ ...e, data: { ...(e.data ?? {}) } })),
    }
    set((s) => {
      const entries = s.history.entries.slice(0, s.history.index + 1)
      entries.push(snapshot)
      // Keep max N
      const overflow = entries.length - s.history.maxEntries
      if (overflow > 0) entries.splice(0, overflow)
      return { history: { ...s.history, entries, index: entries.length - 1 } }
    })
  },

  undo: () => {
    const { history } = get()
    if (history.index <= 0) return
    const target = history.entries[history.index - 1]
    set({
      nodes: target.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: target.edges.map((e) => ({ ...e, data: { ...(e.data ?? {}) } })),
      history: { ...history, index: history.index - 1 },
      // Reset selection to avoid dangling ids
      selectedNodeId: null,
      selectedNodeIds: [],
    })
  },

  redo: () => {
    const { history } = get()
    if (history.index >= history.entries.length - 1) return
    const target = history.entries[history.index + 1]
    set({
      nodes: target.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: target.edges.map((e) => ({ ...e, data: { ...(e.data ?? {}) } })),
      history: { ...history, index: history.index + 1 },
      selectedNodeId: null,
      selectedNodeIds: [],
    })
  },

  jumpToHistory: (idx) => {
    const { history } = get()
    if (idx < 0 || idx >= history.entries.length) return
    const target = history.entries[idx]
    set({
      nodes: target.nodes.map((n) => ({ ...n, data: { ...n.data } })),
      edges: target.edges.map((e) => ({ ...e, data: { ...(e.data ?? {}) } })),
      history: { ...history, index: idx },
      selectedNodeId: null,
      selectedNodeIds: [],
    })
  },

  clearHistory: () => {
    set((s) => ({
      history: {
        ...s.history,
        entries: [
          {
            id: 'reset',
            timestamp: Date.now(),
            description: '重置',
            nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data } })),
            edges: s.edges.map((e) => ({ ...e, data: { ...(e.data ?? {}) } })),
          },
        ],
        index: 0,
      },
    }))
  },

  addEdge: (source, target, label, sourceHandle, targetHandle) => {
    const srcNode = get().nodes.find((n) => n.id === source)
    const tgtNode = get().nodes.find((n) => n.id === target)
    const slug = sourceHandle ? `${source}-${sourceHandle}-${target}` : `edge-${source}-${target}`
    const existing = get().edges.find((e) => {
      if (sourceHandle) return e.source === source && e.target === target && e.sourceHandle === sourceHandle
      return e.source === source && e.target === target
    })
    if (existing) return
    set((s) => ({
      edges: [
        ...s.edges,
        {
          id: slug,
          source,
          target,
          type: 'custom',
          sourceHandle,
          targetHandle,
          label,
          data: {
            sourceType: srcNode?.data.type || Block.Start,
            targetType: tgtNode?.data.type || Block.End,
          },
          style: { strokeWidth: 2 },
        } as AppEdge,
      ],
    }))
  },

  removeEdge: (id) => {
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }))
  },

  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowDescription: (desc) => set({ workflowDescription: desc }),
  setNodesAndEdges: (nodes, edges) => {
    const validIds = new Set(nodes.map((n) => n.id))
    set((s) => {
      // Auto-fit any non-locked bundles to their (possibly new) members
      const nextBundles = s.bundles.map((b) => {
        if (b.locked) return { ...b, nodeIds: b.nodeIds.filter((nid) => validIds.has(nid)) }
        const members = nodes.filter((n) => b.nodeIds.includes(n.id))
        if (members.length < 1) return b
        const bounds = computeBundleBounds(members, b.padding ?? 24)
        if (!bounds) return b
        return { ...b, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      })
      return {
        nodes,
        edges,
        selectedNodeIds: s.selectedNodeIds.filter((id) => validIds.has(id)),
        selectedNodeId: s.selectedNodeId && validIds.has(s.selectedNodeId) ? s.selectedNodeId : null,
        bundles: nextBundles,
      }
    })
  },

  validate: () => {
    const { nodes, edges, workflowName, workflowDescription } = get()
    const validationErrors = validateWorkflow(buildDefinition(nodes, edges, workflowName, workflowDescription))
    set({ validationErrors, showValidation: true })
  },

  clearValidation: () => set({ validationErrors: [], showValidation: false }),

  exportToJSON: () => {
    const { nodes, edges, workflowName, workflowDescription } = get()
    return buildDefinition(nodes, edges, workflowName, workflowDescription)
  },

  importFromJSON: (def) => {
    const importedNodes = toAppNodes(def)
    const importedEdges = toAppEdges(def)
    set({
      nodes: importedNodes,
      edges: importedEdges,
      workflowName: def.name,
      workflowDescription: def.description,
      selectedNodeId: null,
      selectedNodeIds: [],
      validationErrors: [],
      showValidation: false,
      simulation: initSimulation(),
      history: {
        entries: [
          {
            id: 'imported',
            timestamp: Date.now(),
            description: '导入工作流',
            nodes: importedNodes.map((n) => ({ ...n, data: { ...n.data } })),
            edges: importedEdges.map((e) => ({ ...e })),
          },
        ],
        index: 0,
        maxEntries: 50,
      },
    })
  },

  startSimulation: (mode = 'auto') => {
    const { nodes, edges } = get()
    const startNode = nodes.find((n) => n.data.type === Block.Start)
    if (!startNode) {
      set({ simulation: { ...initSimulation(), status: 'error', error: '未找到开始节点' } })
      return
    }

    // Deterministic topological order, restricted to nodes reachable from start.
    // Replaces the old BFS which ignored branch handles and could run both
    // true/false sides of a condition.
    const { order: sorted } = topologicalSort(buildDefinition(nodes, edges, 'sim', ''))
    const reachable = new Set<string>([startNode.id])
    const adjacency = new Map<string, string[]>()
    for (const edge of edges) {
      const list = adjacency.get(edge.source) ?? []
      list.push(edge.target)
      adjacency.set(edge.source, list)
    }
    const queue = [startNode.id]
    while (queue.length) {
      const current = queue.shift()!
      for (const next of adjacency.get(current) ?? []) {
        if (!reachable.has(next)) { reachable.add(next); queue.push(next) }
      }
    }
    const order = sorted.filter((id) => reachable.has(id))

    const nodeResults: Record<string, SimulationNodeResult> = {}
    for (const node of nodes) {
      const isDisabled = !!node.data._isDisabled
      nodeResults[node.id] = {
        nodeId: node.id,
        status: 'pending',
        output: isDisabled ? '节点已禁用，模拟跳过' : undefined,
      }
    }

    const runId = uuidv4()
    const record: RunRecord = {
      id: runId,
      startedAt: Date.now(),
      mode,
      status: 'running',
      nodeResults: { ...nodeResults },
      executionOrder: [...order],
    }
    set((s) => ({
      simulation: { status: 'running', mode, currentNodeId: null, nodeResults, executionOrder: order, _runId: runId },
      runHistory: [record, ...s.runHistory].slice(0, 50),
      activeRunId: runId,
    }))
  },

  stepSimulation: () => {
    const { simulation, nodes } = get()
    if (simulation.status !== 'running') return

    const order = simulation.executionOrder
    if (order.length === 0) {
      set((s) => {
        const rid = s.simulation._runId
        const runHistory = rid
          ? s.runHistory.map((r) => r.id === rid ? { ...r, status: 'completed' as const, finishedAt: Date.now(), nodeResults: s.simulation.nodeResults } : r)
          : s.runHistory
        return { simulation: { ...s.simulation, status: 'completed', currentNodeId: null }, runHistory }
      })
      return
    }

    const currentResults = { ...simulation.nodeResults }

    let nextNodeId: string | null = null
    for (const nid of order) {
      if (currentResults[nid]?.status === 'pending') {
        nextNodeId = nid
        break
      }
    }

    if (!nextNodeId) {
      set((s) => {
        const rid = s.simulation._runId
        const runHistory = rid
          ? s.runHistory.map((r) => r.id === rid ? { ...r, status: 'completed' as const, finishedAt: Date.now(), nodeResults: currentResults } : r)
          : s.runHistory
        return { simulation: { ...s.simulation, status: 'completed', currentNodeId: null, nodeResults: currentResults }, runHistory }
      })
      return
    }

    if (simulation.currentNodeId) {
      const prevId = simulation.currentNodeId
      if (currentResults[prevId]?.status === 'running') {
        currentResults[prevId] = {
          ...currentResults[prevId],
          status: 'success',
          duration: Math.max(1, Date.now() - (currentResults[prevId]?.timestamp ?? Date.now())),
          timestamp: Date.now(),
        }
      }
    }

    const node = nodes.find((n) => n.id === nextNodeId)
    const d = node?.data as Record<string, unknown> | undefined
    let output = '执行中...'
    if (node?.data.type === Block.HttpRequest) {
      output = `[模拟] ${(d?.method as string) || 'GET'} ${(d?.url as string) || '(未配置URL)'}`
    } else if (node?.data.type === Block.IfElse) {
      output = `[模拟] 评估条件: ${(d?.expression as string) || ''}`
    } else if (node?.data.type === Block.Delay) {
      output = `[模拟] 等待 ${(d?.duration as number) || 0}ms`
    } else if (node?.data.type === Block.Log) {
      output = `[模拟] 输出${((d?.level as string) || 'INFO').toUpperCase()}日志`
    } else if (node?.data.type === Block.Iteration) {
      const arr = (d?.iteratorInput as string) || ''
      const par = (d?.parallelism as number) || 1
      output = `[模拟] 迭代 ${arr} × ${par} (聚合输出)`
    } else if (node?.data.type === Block.Parallel) {
      const n = Number(d?.branchCount ?? 2)
      output = `[模拟] 并行 ${n} 个分支, 等待全部完成`
    } else if (node?.data.type === Block.Code) {
      const lang = (d?.language as string) || 'javascript'
      const lc = (d?.code as string) || ''
      const firstLine = lc.split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? ''
      output = `[模拟] 执行 ${lang}: ${firstLine.slice(0, 40) || '(空)'}`
    } else if (node?.data.type === Block.Start) {
      output = '[模拟] 流程开始'
    } else if (node?.data.type === Block.End) {
      output = '[模拟] 流程结束'
    } else if (node?.data.type === Block.Note) {
      output = '[模拟] 便签（跳过）'
    }

    // Disabled nodes are immediately marked as success (skipped) without animation
    if (node?.data._isDisabled) {
      currentResults[nextNodeId] = {
        nodeId: nextNodeId,
        status: 'success',
        output: '⏭ 已禁用，跳过',
        duration: 0,
        timestamp: Date.now(),
      }
      const updatedNodes = nodes.map((n) =>
        n.id === nextNodeId
          ? { ...n, data: { ...n.data, _runningStatus: NodeRunningStatus.Succeeded } }
          : n,
      )
      set({
        nodes: updatedNodes,
        simulation: { ...simulation, status: 'running', currentNodeId: nextNodeId, nodeResults: currentResults },
      })
      // Auto-advance to next step
      return
    }

    currentResults[nextNodeId] = {
      nodeId: nextNodeId,
      status: 'running',
      output,
      timestamp: Date.now(),
    }

    // Update running status on the node data itself
    const updatedNodes = nodes.map((n) => {
      if (n.id === nextNodeId) {
        return { ...n, data: { ...n.data, _runningStatus: NodeRunningStatus.Running } }
      }
      if (n.id === simulation.currentNodeId) {
        return { ...n, data: { ...n.data, _runningStatus: NodeRunningStatus.Succeeded } }
      }
      return n
    })

    set({
      nodes: updatedNodes,
      simulation: { ...simulation, status: 'running', currentNodeId: nextNodeId, nodeResults: currentResults },
    })
  },

  resetSimulation: () => {
    // Clear running status on all nodes
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data, _runningStatus: undefined } })),
      simulation: initSimulation(),
    }))
  },

  /* ─── Bundles ─── */

  selectEdge: (id) => set({ selectedEdgeIds: id ? [id] : [] }),

  selectEdges: (ids) => set({ selectedEdgeIds: ids }),

  updateEdgeLabel: (id, label) => {
    set((s) => ({
      edges: s.edges.map((e) => (e.id === id ? { ...e, label } : e)),
    }))
  },

  createBundle: (nodeIds, title, color) => {
    const state = get()
    if (nodeIds.length < 2) return null
    const targets = state.nodes.filter((n) => nodeIds.includes(n.id))
    if (targets.length < 2) return null
    const bounds = computeBundleBounds(targets, 24)
    if (!bounds) return null
    const id = uuidv4()
    const bundle: NodeBundle = {
      id,
      title: title ?? `组合 #${state.bundles.length + 1}`,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      nodeIds: targets.map((n) => n.id),
      collapsed: false,
      color: color ?? 'gray',
      locked: false,
      parentId: null,
      padding: 24,
    }
    set((s) => ({ bundles: [...s.bundles, bundle] }))
    return id
  },

  removeBundle: (id) => {
    set((s) => ({
      bundles: s.bundles.map((b) => (b.parentId === id ? { ...b, parentId: null } : b)).filter((b) => b.id !== id),
    }))
  },

  toggleBundleCollapsed: (id) => {
    set((s) => ({
      bundles: s.bundles.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b)),
    }))
  },

  updateBundle: (id, patch) => {
    set((s) => ({
      bundles: s.bundles.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))
  },

  addNodesToBundle: (bundleId, nodeIds) => {
    set((s) => ({
      bundles: s.bundles.map((b) => (b.id === bundleId ? { ...b, nodeIds: Array.from(new Set([...b.nodeIds, ...nodeIds])) } : b)),
    }))
  },

  moveBundle: (id, delta) => {
    set((s) => {
      const bundle = s.bundles.find((b) => b.id === id)
      if (!bundle || bundle.locked) return {}
      const idSet = new Set(bundle.nodeIds)
      return {
        bundles: s.bundles.map((b) =>
          b.id === id ? { ...b, x: b.x + delta.x, y: b.y + delta.y } : b,
        ),
        nodes: s.nodes.map((n) =>
          idSet.has(n.id) ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } } : n,
        ),
      }
    })
  },

  autoFitBundle: (id) => {
    set((s) => {
      const bundle = s.bundles.find((b) => b.id === id)
      if (!bundle) return {}
      const members = s.nodes.filter((n) => bundle.nodeIds.includes(n.id))
      const bounds = computeBundleBounds(members, bundle.padding ?? 24)
      if (!bounds) return {}
      return {
        bundles: s.bundles.map((b) =>
          b.id === id ? { ...b, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : b,
        ),
      }
    })
  },

  autoFitBundles: () => {
    set((s) => {
      if (s.bundles.length === 0) return {}
      const next = s.bundles.map((b) => {
        if (b.locked) return b
        const members = s.nodes.filter((n) => b.nodeIds.includes(n.id))
        const bounds = computeBundleBounds(members, b.padding ?? 24)
        if (!bounds) return b
        return { ...b, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      })
      return { bundles: next }
    })
  },

  toggleBundleLocked: (id) => {
    set((s) => ({
      bundles: s.bundles.map((b) => (b.id === id ? { ...b, locked: !b.locked } : b)),
    }))
  },

  collapseAllBundles: () => {
    set((s) => ({ bundles: s.bundles.map((b) => ({ ...b, collapsed: true })) }))
  },

  expandAllBundles: () => {
    set((s) => ({ bundles: s.bundles.map((b) => ({ ...b, collapsed: false })) }))
  },

  removeAllBundles: () => {
    set({ bundles: [] })
  },

  /* ─── Run History ─── */

  setActiveRun: (id) => set({ activeRunId: id }),

  /* ─── Canvas mode (pointer / hand) ─── */
  setCanvasMode: (mode) => set({ canvasMode: mode }),

  deleteRun: (id) =>
    set((s) => ({
      runHistory: s.runHistory.filter((r) => r.id !== id),
      activeRunId: s.activeRunId === id ? null : s.activeRunId,
    })),

  clearRunHistory: () => set({ runHistory: [], activeRunId: null }),

  /** Manually run a single node and append a one-node run record. */
  testNode: (id) => {
    const { nodes } = get()
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    const d = node.data as Record<string, unknown>
    let output = '[测试] 已执行'
    if (node.data.type === Block.HttpRequest) {
      const m = (d.method as string) || 'GET'
      const u = (d.url as string) || '(未配置URL)'
      output = `[测试] HTTP ${m} ${u}`
    } else if (node.data.type === Block.IfElse) {
      output = `[测试] 评估条件: ${(d.expression as string) || '(空)'}`
    } else if (node.data.type === Block.Delay) {
      output = `[测试] 等待 ${(d.duration as number) || 0}ms`
    } else if (node.data.type === Block.Log) {
      output = `[测试] 输出${((d.level as string) || 'INFO').toUpperCase()}日志: ${(d.message as string) || ''}`
    } else if (node.data.type === Block.Iteration) {
      output = `[测试] 迭代 ${(d.iteratorInput as string) || ''} → ${(d.outputVarName as string) || 'item'}`
    } else if (node.data.type === Block.Parallel) {
      output = `[测试] 并行 ${(d.branchCount as number) || 2} 个分支`
    } else if (node.data.type === Block.Code) {
      const lang = (d.language as string) || 'javascript'
      const lc = ((d.code as string) || '').split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? ''
      output = `[测试] 执行 ${lang}: ${lc.slice(0, 60)}`
    } else if (node.data.type === Block.Note) {
      output = '[测试] 便签（跳过）'
    } else if (node.data.type === Block.Start) {
      output = '[测试] 流程开始'
    } else if (node.data.type === Block.End) {
      output = '[测试] 流程结束'
    }
    const runId = uuidv4()
    const record: RunRecord = {
      id: runId,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      mode: 'auto',
      status: 'completed',
      nodeResults: {
        [id]: { nodeId: id, status: 'success', output, duration: Math.floor(Math.random() * 200) + 30, timestamp: Date.now() },
      },
      executionOrder: [id],
    }
    set((s) => ({
      runHistory: [record, ...s.runHistory].slice(0, 50),
      activeRunId: runId,
    }))
  },
}))

export const selectSelectedNode = (state: WorkflowState) => {
  if (!state.selectedNodeId) return null
  return state.nodes.find((n) => n.id === state.selectedNodeId) ?? null
}
