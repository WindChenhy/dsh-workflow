import { memo, useCallback, useRef, useEffect, useState, type DragEvent } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'

import { useWorkflowStore } from '../store/workflowStore'
import CustomNode from '../nodes/CustomNode'
import CustomNoteNode from '../nodes/NoteNode'
import CustomEdge from '../nodes/CustomEdge'
import type { AppNode, AppEdge, CommonNodeType, BlockEnum } from '../types/workflow'
import { BlockEnum as BE } from '../types/workflow'
import { CUSTOM_NODE, CUSTOM_NOTE_NODE, CUSTOM_EDGE, NODE_WIDTH } from '../constants'
import { useShortcuts } from '../hooks/useShortcuts'
import { NodeContextMenu, type ContextMenuState } from './NodeContextMenu'
import { AlignmentGuides } from './AlignmentGuides'
import { DropPreview } from './DropPreview'
import { BundleLayer } from './BundleLayer'
import { ConnectionHint } from './ConnectionHint'
import { EdgeLabelEditor } from './EdgeLabelEditor'
import { EmptyCanvasGuide } from './EmptyCanvasGuide'

const nodeTypes = {
  [CUSTOM_NODE]: CustomNode,
  [CUSTOM_NOTE_NODE]: CustomNoteNode,
}
const edgeTypes = {
  [CUSTOM_EDGE]: CustomEdge,
}

/* ─── Selection box overlay (drawn on top of canvas) ─── */
type SelectionBox = { startX: number; startY: number; endX: number; endY: number } | null

export const WorkflowCanvas = memo(function WorkflowCanvas({
  onToggleSidebar,
  sidebarCollapsed = false,
  fullscreen = false,
}: {
  onToggleSidebar?: () => void
  sidebarCollapsed?: boolean
  fullscreen?: boolean
} = {}) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const rfInstance = useRef<ReactFlowInstance<AppNode, AppEdge> | null>(null)
  const reactFlowRootRef = useRef<HTMLDivElement | null>(null)
  const paneRef = useRef<HTMLElement | null>(null)

  // Wire up keyboard shortcuts
  useShortcuts()

  const storeNodes = useWorkflowStore((s) => s.nodes)
  const storeEdges = useWorkflowStore((s) => s.edges)
  const setNodesAndEdges = useWorkflowStore((s) => s.setNodesAndEdges)
  const addNode = useWorkflowStore((s) => s.addNode)
  const addEdge = useWorkflowStore((s) => s.addEdge)
  const removeEdgeAction = useWorkflowStore((s) => s.removeEdge)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const selectNodes = useWorkflowStore((s) => s.selectNodes)
  const toggleNodeSelection = useWorkflowStore((s) => s.toggleNodeSelection)
  const simulation = useWorkflowStore((s) => s.simulation)
  const pushHistory = useWorkflowStore((s) => s.pushHistory)
  const undo = useWorkflowStore((s) => s.undo)
  const redo = useWorkflowStore((s) => s.redo)

  // Canvas control mode (pointer = box-select; hand = pan)
  const controlMode = useWorkflowStore((s) => s.canvasMode)

  // Expose undo/redo to window for toolbar
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const w = window as unknown as Record<string, unknown>
      w.__workflowUndo = undo
      w.__workflowRedo = redo
    } catch {
      // ignore
    }
  }, [undo, redo])

  // Edge deletion event
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.edgeId) {
        pushHistory('删除连线')
        removeEdgeAction(detail.edgeId)
      }
    }
    window.addEventListener('remove-edge', handler)
    return () => window.removeEventListener('remove-edge', handler)
  }, [removeEdgeAction, pushHistory])

  // Apply selected flag
  const selectedIds = useWorkflowStore((s) => s.selectedNodeIds)
  const finalNodes: AppNode[] = storeNodes.map((n) => {
    const sel = selectedIds.includes(n.id)
    return {
      ...n,
      selected: sel,
      data: { ...n.data },
    }
  })

  // Animate edges during simulation
  const finalEdges: AppEdge[] =
    simulation.status === 'idle'
      ? storeEdges
      : storeEdges.map((e) => {
          const animating =
            simulation.currentNodeId === e.target &&
            simulation.nodeResults[e.source]?.status === 'success'
          if (!animating) return e
          return { ...e, animated: true, style: { strokeWidth: 3, stroke: '#22c55e' } } as AppEdge
        })

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, storeNodes) as AppNode[]
      for (const c of changes) {
        if (c.type === 'select') {
          if (c.id) {
            toggleNodeSelection(c.id, !!(c as { multi?: boolean }).multi)
          }
        }
        if (c.type === 'position' && c.dragging === false) {
          setTimeout(() => pushHistory('移动节点'), 0)
        }
        if (c.type === 'remove') pushHistory('删除节点')
      }
      setNodesAndEdges(updated, storeEdges)
    },
    [storeNodes, storeEdges, toggleNodeSelection, setNodesAndEdges, pushHistory],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updated = applyEdgeChanges(changes, storeEdges) as AppEdge[]
      const selectEdge = useWorkflowStore.getState().selectEdge
      for (const c of changes) {
        if (c.type === 'remove') {
          pushHistory('删除连线')
          removeEdgeAction(c.id)
        }
        if (c.type === 'select' && c.id) {
          selectEdge(c.selected ? c.id : null)
        }
      }
      setNodesAndEdges(storeNodes, updated)
    },
    [storeNodes, storeEdges, removeEdgeAction, setNodesAndEdges, pushHistory],
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      pushHistory('连线')
      addEdge(connection.source, connection.target, undefined, connection.sourceHandle, connection.targetHandle)
    },
    [addEdge, pushHistory],
  )

  // Box selection state
  const [selectionBox, setSelectionBox] = useState<SelectionBox>(null)
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null)
  const isSelectingRef = useRef(false)
  const spacePressedRef = useRef(false)
  const [spacePressed, setSpacePressed] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  // Track Space key for hand-tool mode toggle (optional bonus: pan)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const down = (e: KeyboardEvent) => {
      // Avoid triggering in inputs
      if (e.target instanceof HTMLElement) {
        const t = e.target.tagName
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.target.isContentEditable) return
      }
      if (e.code === 'Space' && !spacePressedRef.current) {
        spacePressedRef.current = true
        setSpacePressed(true)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spacePressedRef.current = false
        setSpacePressed(false)
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Initialize the RF root ref so we can attach box selection listeners
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.querySelector('.react-flow') as HTMLDivElement | null
    reactFlowRootRef.current = root
    const pane = root?.querySelector('.react-flow__pane') as HTMLElement | null
    paneRef.current = pane
  }, [])

  // Box selection handlers — attached to ReactFlow's pane
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return

    const getXY = (e: PointerEvent) => {
      const rect = pane.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onPointerDown = (e: PointerEvent) => {
      // Right click or middle click — let RF handle pan
      if (e.button !== 0) return
      // Hand mode = pan only; do NOT start a box-selection.
      // Also skip if Space is being held (Space also = pan).
      const mode = useWorkflowStore.getState().canvasMode
      if (mode === 'hand') return
      if (spacePressedRef.current) return
      const xy = getXY(e)
      selectionStartRef.current = xy
      isSelectingRef.current = true
      setSelectionBox({ startX: xy.x, startY: xy.y, endX: xy.x, endY: xy.y })
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!isSelectingRef.current || !selectionStartRef.current) return
      const xy = getXY(e)
      setSelectionBox({ startX: selectionStartRef.current.x, startY: selectionStartRef.current.y, endX: xy.x, endY: xy.y })
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!isSelectingRef.current) return
      isSelectingRef.current = false
      const start = selectionStartRef.current
      selectionStartRef.current = null
      if (!start) {
        setSelectionBox(null)
        return
      }
      const end = getXY(e)
      const box = {
        left: Math.min(start.x, end.x),
        top: Math.min(start.y, end.y),
        right: Math.max(start.x, end.x),
        bottom: Math.max(start.y, end.y),
      }
      // If the box is too small, treat as a click — clear selection
      if (box.right - box.left < 4 && box.bottom - box.top < 4) {
        setSelectionBox(null)
        return
      }
      // Hit-test using RF's flow coordinates
      const inst = rfInstance.current
      if (!inst) {
        setSelectionBox(null)
        return
      }
      const flowTL = inst.screenToFlowPosition({ x: pane.getBoundingClientRect().left + box.left, y: pane.getBoundingClientRect().top + box.top })
      const flowBR = inst.screenToFlowPosition({ x: pane.getBoundingClientRect().left + box.right, y: pane.getBoundingClientRect().top + box.bottom })
      const hit: string[] = []
      for (const n of useWorkflowStore.getState().nodes) {
        // Approximate node bounds: RF stores dimensions in n.width/height? — fall back to constant
        const w = (n as AppNode & { width?: number; height?: number }).width ?? NODE_WIDTH
        const h = (n as AppNode & { width?: number; height?: number }).height ?? 80
        const nx1 = n.position.x
        const ny1 = n.position.y
        const nx2 = nx1 + w
        const ny2 = ny1 + h
        if (nx1 < flowBR.x && nx2 > flowTL.x && ny1 < flowBR.y && ny2 > flowTL.y) {
          hit.push(n.id)
        }
      }
      selectNodes(hit)
      setSelectionBox(null)
    }

    pane.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      pane.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [selectNodes])

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      pushHistory('添加节点')
      const type = event.dataTransfer.getData('application/reactflow-type') as BlockEnum
      if (!type) return
      const wrapper = reactFlowWrapper.current
      if (!wrapper) return
      const position = rfInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }) || { x: event.clientX - 110, y: event.clientY - 40 }
      addNode(type, position)
    },
    [addNode, pushHistory],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: AppNode) => {
      toggleNodeSelection(node.id, false)
    },
    [toggleNodeSelection],
  )

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      // If not already in selection, replace selection with this node
      const current = useWorkflowStore.getState().selectedNodeIds
      if (!current.includes(node.id)) {
        selectNodes([node.id])
      }
      setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY })
    },
    [selectNodes],
  )

  const onPaneClick = useCallback(() => {
    // Only clear if RF fired a pane click (not handled by our box-select pointer events)
    // The pointer-up handler clears the box and selects; pane click clears when no box
    selectNode(null)
  }, [selectNode])

  return (
    <div
      ref={reactFlowWrapper}
      className="flex-1 h-full relative"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* Selection hint when Space is held (hand tool) */}
      {spacePressed && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-800/90 text-white shadow-sm">
          ✋ 拖拽模式（按住空格）
        </div>
      )}

      {/* Simulation badge */}
      {simulation.status !== 'idle' && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            模拟中 {simulation.mode === 'auto' ? '(自动)' : '(单步)'}
          </span>
        </div>
      )}

      {/* Sidebar expand toggle — only visible when the sidebar is COLLAPSED.
       *  When the sidebar is open it already has its own collapse button in
       *  its top-right, so we don't need a duplicate floating one. */}
      {!fullscreen && onToggleSidebar && sidebarCollapsed && (
        <button
          onClick={onToggleSidebar}
          className="absolute top-3 left-3 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
          title="展开节点库"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Empty state guide — shown when there are no nodes */}
      {storeNodes.length === 0 && !spacePressed && (
        <EmptyCanvasGuide />
      )}

      <ReactFlow
        nodes={finalNodes}
        edges={finalEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onInit={(instance) => { rfInstance.current = instance }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        multiSelectionKeyCode={['Shift']}
        selectionKeyCode={['Shift']}
        deleteKeyCode={null /* handled by shortcuts */}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          type: CUSTOM_EDGE,
          style: { strokeWidth: 2, stroke: '#94a3b8' },
        }}
        minZoom={0.1}
        maxZoom={4}
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
        className="!bg-gray-50"
        panOnDrag={spacePressed || controlMode === 'hand' ? true : [1, 2]}
        selectionOnDrag={!spacePressed && controlMode !== 'hand'}
        panOnScroll={false}
        nodesDraggable={true}
        nodesConnectable={true}
      >
        <Background color="#e5e7eb" gap={16} size={0.5} />
        <Controls
          className="!shadow-sm !rounded-lg !border !border-gray-200 !bg-white"
          position="bottom-left"
        />
        <MiniMap
          className="!shadow-sm !rounded-lg !border !border-gray-200 !bg-white"
          nodeColor={(n) => {
            const t = (n.data as CommonNodeType)?.type as BlockEnum
            const m: Record<string, string> = {
              [BE.Start]: '#3b82f6',
              [BE.End]: '#f97316',
              [BE.HttpRequest]: '#3b82f6',
              [BE.IfElse]: '#06b6d4',
              [BE.Delay]: '#8b5cf6',
              [BE.Log]: '#64748b',
              [BE.Note]: '#eab308',
              [BE.Iteration]: '#10b981',
              [BE.Parallel]: '#f43f5e',
              [BE.Code]: '#0ea5e9',
            }
            return m[t] || '#94a3b8'
          }}
          nodeStrokeColor={(n) => {
            const t = (n.data as CommonNodeType)?.type as BlockEnum
            const m: Record<string, string> = {
              [BE.Start]: '#1d4ed8',
              [BE.End]: '#c2410c',
              [BE.Iteration]: '#047857',
              [BE.Parallel]: '#be123c',
              [BE.Code]: '#0369a1',
            }
            return m[t] || '#475569'
          }}
          maskColor="rgba(241, 245, 249, 0.65)"
          pannable
          zoomable
          ariaLabel="流程缩略图"
        />
      </ReactFlow>

      {/* Selection box overlay (drawn in screen coordinates inside the wrapper) */}
      {selectionBox && (
        <div
          className="pointer-events-none absolute border border-blue-400 bg-blue-100/30 z-30"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.abs(selectionBox.endX - selectionBox.startX),
            height: Math.abs(selectionBox.endY - selectionBox.startY),
          }}
        />
      )}

      {/* Alignment guides (drawn above canvas, below selection box) */}
      <AlignmentGuides />

      {/* Drop preview ghost (when dragging from sidebar) */}
      <DropPreview />

      {/* Node bundles (group rectangles) */}
      <BundleLayer />

      {/* Connection drag hint (highlights valid targets) */}
      <ConnectionHint />

      {/* Edge label editor */}
      <EdgeLabelEditor />

      {/* Node context menu */}
      <NodeContextMenu state={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  )
})
