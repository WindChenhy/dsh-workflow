import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkflowStore } from '../store/workflowStore'
import { BlockEnum } from '../types/workflow'
import { VariableType } from '../types/variable'

beforeEach(() => {
  useWorkflowStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedNodeIds: [],
    clipboard: null,
    workflowName: '我的新流程',
    workflowDescription: '',
    validationErrors: [],
    showValidation: false,
    simulation: { status: 'idle', mode: null, currentNodeId: null, nodeResults: {}, executionOrder: [], _runId: null },
    envVariables: [],
    history: { entries: [{ id: 'init', timestamp: 0, description: '初始', nodes: [], edges: [] }], index: 0, maxEntries: 50 },
    bundles: [],
    selectedEdgeIds: [],
    runHistory: [],
    activeRunId: null,
    canvasMode: 'pointer',
  })
})

describe('WorkflowStore', () => {
  /* ─── Node Operations ─── */

  it('should add a node', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.HttpRequest, { x: 100, y: 200 })

    const state = useWorkflowStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.nodes[0].id).toBe(id)
    expect(state.nodes[0].type).toBe('custom')
    expect(state.nodes[0].data.type).toBe(BlockEnum.HttpRequest)
    expect(state.nodes[0].data.title).toBe('HTTP 请求')
    expect(state.nodes[0].position).toEqual({ x: 100, y: 200 })
  })

  it('should add a note node with custom-note type', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.Note, { x: 0, y: 0 })
    void id

    const state = useWorkflowStore.getState()
    expect(state.nodes[0].type).toBe('custom-note')
    expect(state.nodes[0].data.type).toBe(BlockEnum.Note)
  })

  it('should remove a node and its connected edges', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 100 })
    store.addEdge(id1, id2)

    expect(useWorkflowStore.getState().edges).toHaveLength(1)

    useWorkflowStore.getState().removeNode(id1)
    const state = useWorkflowStore.getState()
    expect(state.nodes).toHaveLength(1)
    expect(state.edges).toHaveLength(0)
  })

  it('should update node data', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })

    store.updateNodeData(id, { url: 'https://example.com/api' })
    const state = useWorkflowStore.getState()
    const node = state.nodes.find((n) => n.id === id)
    expect((node?.data as Record<string, unknown>).url).toBe('https://example.com/api')
  })

  it('should select and deselect nodes', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.Log, { x: 0, y: 0 })

    store.selectNode(id)
    expect(useWorkflowStore.getState().selectedNodeId).toBe(id)

    store.selectNode(null)
    expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
  })

  /* ─── Multi-select / Copy / Paste / Duplicate ─── */

  it('should toggle multi-select', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })

    store.toggleNodeSelection(a, true)
    store.toggleNodeSelection(b, true)
    const s1 = useWorkflowStore.getState()
    expect(s1.selectedNodeIds).toEqual([a, b])

    // Toggle again removes
    store.toggleNodeSelection(a, true)
    expect(useWorkflowStore.getState().selectedNodeIds).toEqual([b])
  })

  it('should select all nodes', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    store.selectAllNodes()
    expect(useWorkflowStore.getState().selectedNodeIds).toEqual([a, b])
  })

  it('should copy and paste a single node with a new id', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 10, y: 20 })
    store.updateNodeData(a, { url: 'https://a' })

    store.selectNode(a)
    store.copySelected()
    const pasted = store.pasteClipboard({ x: 50, y: 60 })

    expect(pasted).toHaveLength(1)
    expect(pasted[0]).not.toBe(a)
    const state = useWorkflowStore.getState()
    expect(state.nodes).toHaveLength(2)
    const copied = state.nodes.find((n) => n.id === pasted[0])
    expect(copied?.position).toEqual({ x: 60, y: 80 })
    expect((copied?.data as Record<string, unknown>).url).toBe('https://a')
  })

  it('should duplicate selected nodes', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.Log, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 0 })
    store.addEdge(a, b)
    store.selectNodes([a, b])

    const newIds = store.duplicateSelected()
    expect(newIds).toHaveLength(2)
    expect(useWorkflowStore.getState().nodes).toHaveLength(4)
    expect(useWorkflowStore.getState().edges).toHaveLength(2)
  })

  it('should remove multiple nodes at once', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.Log, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 0 })
    store.addEdge(a, b)
    store.removeNodes([a, b])
    const s = useWorkflowStore.getState()
    expect(s.nodes).toHaveLength(0)
    expect(s.edges).toHaveLength(0)
  })

  it('should move selected nodes by a delta', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.Log, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    store.selectNodes([a, b])
    store.moveNodes({ x: 10, y: 20 })
    const s = useWorkflowStore.getState()
    const na = s.nodes.find((n) => n.id === a)!
    const nb = s.nodes.find((n) => n.id === b)!
    expect(na.position).toEqual({ x: 10, y: 20 })
    expect(nb.position).toEqual({ x: 110, y: 120 })
  })

  /* ─── Disable / Notes ─── */


  it('should toggle node disabled flag', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })

    store.toggleNodeDisabled(id)
    expect(useWorkflowStore.getState().nodes[0].data._isDisabled).toBe(true)

    store.toggleNodeDisabled(id)
    expect(useWorkflowStore.getState().nodes[0].data._isDisabled).toBe(false)
  })

  it('should skip disabled nodes during simulation', () => {
    const store = useWorkflowStore.getState()
    const s = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const m = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 100 })
    const e = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(s, m)
    store.addEdge(m, e)
    store.toggleNodeDisabled(m)

    store.startSimulation('step')
    // Step 1: start becomes running
    store.stepSimulation()
    expect(useWorkflowStore.getState().simulation.currentNodeId).toBe(s)

    // Step 2: disabled HttpRequest skipped, marked success
    store.stepSimulation()
    const sim1 = useWorkflowStore.getState().simulation
    expect(sim1.nodeResults[m].status).toBe('success')
    expect(sim1.nodeResults[m].output).toContain('已禁用')

    // Step 3: end node picked up
    store.stepSimulation()
    const sim2 = useWorkflowStore.getState().simulation
    expect(sim2.currentNodeId).toBe(e)
  })

  /* ─── Edge Operations ─── */

  it('should add an edge between two nodes', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)

    const state = useWorkflowStore.getState()
    expect(state.edges).toHaveLength(1)
    expect(state.edges[0].source).toBe(id1)
    expect(state.edges[0].target).toBe(id2)
  })

  it('should not add duplicate edges', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)
    store.addEdge(id1, id2)

    expect(useWorkflowStore.getState().edges).toHaveLength(1)
  })

  it('should remove an edge', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)

    const edgeId = useWorkflowStore.getState().edges[0].id
    store.removeEdge(edgeId)
    expect(useWorkflowStore.getState().edges).toHaveLength(0)
  })

  /* ─── Validation ─── */

  it('should return errors for disconnected nodes', () => {
    const store = useWorkflowStore.getState()
    store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    store.addNode(BlockEnum.Log, { x: 0, y: 100 })

    store.validate()
    const state = useWorkflowStore.getState()
    expect(state.validationErrors.length).toBeGreaterThan(0)
    expect(state.showValidation).toBe(true)
  })

  it('should validate HTTP node requires a URL', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 100 })
    const id3 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)
    store.addEdge(id2, id3)

    store.validate()
    const state = useWorkflowStore.getState()
    const urlErrors = state.validationErrors.filter((e) => e.message.includes('URL'))
    expect(urlErrors.length).toBeGreaterThan(0)
  })

  /* ─── Import/Export ─── */

  it('should export a valid WorkflowDefinition', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.HttpRequest, { x: 100, y: 100 })
    store.addEdge(id1, id2)

    const def = store.exportToJSON()
    expect(def.version).toBe('1.0')
    expect(def.nodes).toHaveLength(2)
    expect(def.edges).toHaveLength(1)
    expect(def.name).toBe('我的新流程')
  })

  it('should import a WorkflowDefinition and restore state', () => {
    const def = {
      version: '1.0' as const,
      name: '导入的流程',
      description: '测试导入',
      nodes: [
        { id: 'n1', type: BlockEnum.Start as BlockEnum, position: { x: 0, y: 0 }, data: { title: '开始', desc: '', type: BlockEnum.Start } },
        { id: 'n2', type: BlockEnum.End as BlockEnum, position: { x: 0, y: 200 }, data: { title: '结束', desc: '', type: BlockEnum.End } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    }
    useWorkflowStore.getState().importFromJSON(def)

    const state = useWorkflowStore.getState()
    expect(state.nodes).toHaveLength(2)
    expect(state.edges).toHaveLength(1)
    expect(state.workflowName).toBe('导入的流程')
    expect(state.workflowDescription).toBe('测试导入')
  })

  /* ─── Simulation ─── */

  it('should start simulation with BFS order', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 100 })
    const id3 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)
    store.addEdge(id2, id3)

    store.startSimulation('step')
    const sim = useWorkflowStore.getState().simulation
    expect(sim.status).toBe('running')
    expect(sim.mode).toBe('step')
    expect(sim.executionOrder).toHaveLength(3)
    expect(sim.executionOrder[0]).toBe(id1)
    expect(Object.values(sim.nodeResults).every((r) => r.status === 'pending')).toBe(true)
  })

  it('should step through simulation nodes', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)

    store.startSimulation('step')
    store.stepSimulation()

    let sim = useWorkflowStore.getState().simulation
    expect(sim.currentNodeId).toBe(id1)
    expect(sim.nodeResults[id1].status).toBe('running')

    store.stepSimulation()
    sim = useWorkflowStore.getState().simulation
    expect(sim.nodeResults[id1].status).toBe('success')
    expect(sim.currentNodeId).toBe(id2)

    store.stepSimulation()
    sim = useWorkflowStore.getState().simulation
    expect(sim.status).toBe('completed')
  })

  it('should reset simulation and clear running status', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)

    store.startSimulation('step')
    store.stepSimulation()
    store.resetSimulation()

    const sim = useWorkflowStore.getState().simulation
    expect(sim.status).toBe('idle')
    expect(sim.currentNodeId).toBeNull()
    expect(Object.keys(sim.nodeResults)).toHaveLength(0)
  })
})

describe('WorkflowStore - Edge Cases', () => {
  it('should handle simulation when start node is missing', () => {
    useWorkflowStore.getState().addNode(BlockEnum.End, { x: 0, y: 0 })
    useWorkflowStore.getState().startSimulation('auto')
    const sim = useWorkflowStore.getState().simulation
    expect(sim.status).toBe('error')
    expect(sim.error).toBe('未找到开始节点')
  })

  it('should start simulation in auto mode', () => {
    const store = useWorkflowStore.getState()
    const id1 = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const id2 = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(id1, id2)

    store.startSimulation('auto')
    const sim = useWorkflowStore.getState().simulation
    expect(sim.status).toBe('running')
    expect(sim.mode).toBe('auto')
  })

  it('should handle empty workflow', () => {
    const def = { version: '1.0' as const, name: '空流程', description: '', nodes: [], edges: [] }
    useWorkflowStore.getState().importFromJSON(def)
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)
  })
})

describe('WorkflowStore - Variables', () => {
  it('should add, update and remove environment variables', () => {
    const store = useWorkflowStore.getState()
    const id = store.addEnvVariable({ name: 'apiKey', type: VariableType.String, defaultValue: 'sk-xxx' })
    expect(useWorkflowStore.getState().envVariables).toHaveLength(1)
    expect(useWorkflowStore.getState().envVariables[0].id).toBe(id)

    store.updateEnvVariable(id, { name: 'API_KEY' })
    expect(useWorkflowStore.getState().envVariables[0].name).toBe('API_KEY')

    store.removeEnvVariable(id)
    expect(useWorkflowStore.getState().envVariables).toHaveLength(0)
  })
})

describe('WorkflowStore - History', () => {
  it('should push history entries with descriptions', () => {
    const store = useWorkflowStore.getState()
    const initialCount = store.history.entries.length
    store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    store.pushHistory('添加 HTTP 节点')

    const h = useWorkflowStore.getState().history
    expect(h.entries.length).toBe(initialCount + 1)
    expect(h.index).toBe(h.entries.length - 1)
    expect(h.entries[h.index].description).toBe('添加 HTTP 节点')
  })

  it('should undo and redo node additions', () => {
    const store = useWorkflowStore.getState()
    expect(store.nodes.length).toBe(0)
    store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    store.pushHistory('添加 1')
    expect(useWorkflowStore.getState().nodes.length).toBe(1)

    store.undo()
    expect(useWorkflowStore.getState().nodes.length).toBe(0)

    store.redo()
    expect(useWorkflowStore.getState().nodes.length).toBe(1)
  })

  it('should not undo past the first entry', () => {
    const store = useWorkflowStore.getState()
    const first = store.history.index
    store.undo()
    expect(useWorkflowStore.getState().history.index).toBe(first)
  })

  it('should jump to a specific history index', () => {
    const store = useWorkflowStore.getState()
    store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    store.pushHistory('A')
    store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    store.pushHistory('B')
    expect(useWorkflowStore.getState().nodes.length).toBe(2)

    const targetIdx = useWorkflowStore.getState().history.entries.findIndex((e) => e.description === 'A')
    store.jumpToHistory(targetIdx)
    expect(useWorkflowStore.getState().history.index).toBe(targetIdx)
  })

  it('should clear history on import', () => {
    const store = useWorkflowStore.getState()
    store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    store.pushHistory('A')
    const beforeImport = useWorkflowStore.getState().history.entries.length
    expect(beforeImport).toBeGreaterThan(1)

    const def = {
      version: '1.0' as const,
      name: '导入',
      description: '',
      nodes: [
        { id: 'n1', type: BlockEnum.Start as BlockEnum, position: { x: 0, y: 0 }, data: { title: '开始', desc: '', type: BlockEnum.Start } },
      ],
      edges: [],
    }
    store.importFromJSON(def)
    expect(useWorkflowStore.getState().history.entries).toHaveLength(1)
    expect(useWorkflowStore.getState().history.entries[0].description).toBe('导入工作流')
  })
})

describe('WorkflowStore - Bundles & Edge Labels', () => {
  it('should create a bundle from selected nodes', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    const c = store.addNode(BlockEnum.Delay, { x: 200, y: 200 })
    const id = store.createBundle([a, b, c], '预处理组', 'blue')
    expect(id).not.toBeNull()
    const b0 = useWorkflowStore.getState().bundles[0]
    expect(b0.title).toBe('预处理组')
    expect(b0.color).toBe('blue')
    expect(b0.nodeIds).toEqual([a, b, c])
  })

  it('should not create a bundle with fewer than 2 nodes', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const id = store.createBundle([a])
    expect(id).toBeNull()
  })

  it('should toggle bundle collapsed', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    const id = store.createBundle([a, b])!
    expect(useWorkflowStore.getState().bundles[0].collapsed).toBe(false)
    store.toggleBundleCollapsed(id)
    expect(useWorkflowStore.getState().bundles[0].collapsed).toBe(true)
  })

  it('should remove a bundle but keep its nodes', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    const id = store.createBundle([a, b])!
    expect(useWorkflowStore.getState().bundles).toHaveLength(1)
    store.removeBundle(id)
    expect(useWorkflowStore.getState().bundles).toHaveLength(0)
    expect(useWorkflowStore.getState().nodes).toHaveLength(2) // nodes still there
  })

  it('should clean up bundle node references when a node is removed', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 100 })
    store.createBundle([a, b])!
    store.removeNode(a)
    const remaining = useWorkflowStore.getState().bundles
    // Bundle still exists but no longer contains a
    expect(remaining).toHaveLength(1)
    expect(remaining[0].nodeIds).toEqual([b])
  })

  it('should update edge label', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.End, { x: 100, y: 100 })
    store.addEdge(a, b)
    const edgeId = useWorkflowStore.getState().edges[0].id
    store.updateEdgeLabel(edgeId, 'status == 200')
    expect(useWorkflowStore.getState().edges[0].label).toBe('status == 200')
  })
})

describe('WorkflowStore - New Node Types', () => {
  it('adds an Iteration node with default data', () => {
    const id = useWorkflowStore.getState().addNode(BlockEnum.Iteration, { x: 0, y: 0 })
    const n = useWorkflowStore.getState().nodes[0]
    expect(n.data.type).toBe(BlockEnum.Iteration)
    expect((n.data as Record<string, unknown>).outputVarName).toBe('item')
    expect((n.data as Record<string, unknown>).parallelism).toBe(1)
    expect(id).toBeTruthy()
  })

  it('adds a Parallel node with 2 branches by default', () => {
    useWorkflowStore.getState().addNode(BlockEnum.Parallel, { x: 0, y: 0 })
    const n = useWorkflowStore.getState().nodes[0]
    expect(n.data.type).toBe(BlockEnum.Parallel)
    expect((n.data as Record<string, unknown>).branchCount).toBe(2)
    expect((n.data as Record<string, unknown>).branchLabels).toEqual(['分支 1', '分支 2'])
  })

  it('adds a Code node with javascript default', () => {
    useWorkflowStore.getState().addNode(BlockEnum.Code, { x: 0, y: 0 })
    const n = useWorkflowStore.getState().nodes[0]
    expect(n.data.type).toBe(BlockEnum.Code)
    expect((n.data as Record<string, unknown>).language).toBe('javascript')
    expect((n.data as Record<string, unknown>).code).toContain('return')
  })
})

describe('WorkflowStore - Bundles (advanced)', () => {
  it('auto-fits bundle bounds to its members', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 100, y: 100 })
    const b = store.addNode(BlockEnum.Log, { x: 300, y: 200 })
    const id = store.createBundle([a, b])!
    const initial = useWorkflowStore.getState().bundles[0]
    // Now move 'a' — autoFit on setNodesAndEdges
    const updated = useWorkflowStore.getState().nodes.map((n) => n.id === a ? { ...n, position: { x: 0, y: 0 } } : n)
    useWorkflowStore.getState().setNodesAndEdges(updated, useWorkflowStore.getState().edges)
    const after = useWorkflowStore.getState().bundles.find((bb) => bb.id === id)!
    expect(after.x).not.toBe(initial.x)
  })

  it('moveBundle moves the bundle and its members', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 100, y: 100 })
    const b = store.addNode(BlockEnum.Log, { x: 200, y: 200 })
    const id = store.createBundle([a, b])!
    const beforeX = useWorkflowStore.getState().bundles[0].x
    store.moveBundle(id, { x: 50, y: 30 })
    const s = useWorkflowStore.getState()
    const na = s.nodes.find((n) => n.id === a)!
    const nb = s.nodes.find((n) => n.id === b)!
    expect(na.position).toEqual({ x: 150, y: 130 })
    expect(nb.position).toEqual({ x: 250, y: 230 })
    expect(s.bundles[0].x).toBe(beforeX + 50)
  })

  it('locked bundle ignores moveBundle and auto-fit', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 0 })
    const id = store.createBundle([a, b])!
    store.toggleBundleLocked(id)
    const b0 = useWorkflowStore.getState().bundles[0]
    store.moveBundle(id, { x: 10, y: 0 })
    const na = useWorkflowStore.getState().nodes.find((n) => n.id === a)!
    expect(na.position).toEqual({ x: 0, y: 0 }) // unchanged
    expect(useWorkflowStore.getState().bundles[0].x).toBe(b0.x)
    void b
  })

  it('collapseAllBundles / expandAllBundles toggles every bundle', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 0 })
    const c = store.addNode(BlockEnum.Delay, { x: 200, y: 0 })
    const d = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 100 })
    store.createBundle([a, b])!
    store.createBundle([c, d])!
    store.collapseAllBundles()
    expect(useWorkflowStore.getState().bundles.every((bb) => bb.collapsed)).toBe(true)
    store.expandAllBundles()
    expect(useWorkflowStore.getState().bundles.every((bb) => !bb.collapsed)).toBe(true)
  })

  it('removeAllBundles empties the bundles list', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 100, y: 0 })
    store.createBundle([a, b])!
    expect(useWorkflowStore.getState().bundles).toHaveLength(1)
    store.removeAllBundles()
    expect(useWorkflowStore.getState().bundles).toHaveLength(0)
  })
})

describe('WorkflowStore - Run History', () => {
  it('appends a RunRecord when startSimulation is called', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(a, b)
    store.startSimulation('auto')
    expect(useWorkflowStore.getState().runHistory).toHaveLength(1)
    expect(useWorkflowStore.getState().activeRunId).toBeTruthy()
    const rec = useWorkflowStore.getState().runHistory[0]
    expect(rec.status).toBe('running')
    expect(rec.executionOrder).toEqual([a, b])
  })

  it('marks RunRecord as completed when simulation finishes', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.Start, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.End, { x: 0, y: 200 })
    store.addEdge(a, b)
    store.startSimulation('step')
    store.stepSimulation()
    store.stepSimulation()
    store.stepSimulation()
    const rec = useWorkflowStore.getState().runHistory[0]
    expect(rec.status).toBe('completed')
    expect(rec.finishedAt).toBeGreaterThan(rec.startedAt - 1)
  })

  it('testNode creates a single-node run record', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.HttpRequest, { x: 0, y: 0 })
    store.testNode(id)
    const rec = useWorkflowStore.getState().runHistory[0]
    expect(rec.executionOrder).toEqual([id])
    expect(rec.status).toBe('completed')
    expect(rec.nodeResults[id].status).toBe('success')
    expect(rec.nodeResults[id].output).toContain('HTTP')
  })

  it('deleteRun removes a record by id', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.Log, { x: 0, y: 0 })
    store.testNode(id)
    const rid = useWorkflowStore.getState().runHistory[0].id
    store.deleteRun(rid)
    expect(useWorkflowStore.getState().runHistory).toHaveLength(0)
  })

  it('clearRunHistory empties the list', () => {
    const store = useWorkflowStore.getState()
    const id = store.addNode(BlockEnum.Log, { x: 0, y: 0 })
    store.testNode(id)
    store.testNode(id)
    store.clearRunHistory()
    expect(useWorkflowStore.getState().runHistory).toHaveLength(0)
  })
})

describe('WorkflowStore - addEdge (with sourceHandle)', () => {
  it('preserves sourceHandle when adding an edge', () => {
    const store = useWorkflowStore.getState()
    const a = store.addNode(BlockEnum.IfElse, { x: 0, y: 0 })
    const b = store.addNode(BlockEnum.Log, { x: 200, y: 0 })
    store.addEdge(a, b, undefined, 'true')
    const e = useWorkflowStore.getState().edges[0]
    expect(e.source).toBe(a)
    expect(e.target).toBe(b)
    expect(e.sourceHandle).toBe('true')
  })
})

describe('WorkflowStore - pushHistory (triggered by user actions)', () => {
  it('adds a history entry when pushHistory is called', () => {
    const store = useWorkflowStore.getState()
    const before = useWorkflowStore.getState().history.entries.length
    store.pushHistory('添加新节点')
    const after = useWorkflowStore.getState().history.entries.length
    expect(after).toBe(before + 1)
    expect(useWorkflowStore.getState().history.entries[after - 1].description).toBe('添加新节点')
  })
})

describe('WorkflowStore - canvasMode (pointer / hand)', () => {
  it('defaults to pointer', () => {
    expect(useWorkflowStore.getState().canvasMode).toBe('pointer')
  })

  it('setCanvasMode toggles between pointer and hand', () => {
    const store = useWorkflowStore.getState()
    expect(useWorkflowStore.getState().canvasMode).toBe('pointer')
    store.setCanvasMode('hand')
    expect(useWorkflowStore.getState().canvasMode).toBe('hand')
    store.setCanvasMode('pointer')
    expect(useWorkflowStore.getState().canvasMode).toBe('pointer')
  })
})
