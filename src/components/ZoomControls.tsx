import { memo, useState, useCallback } from 'react'
import { useReactFlow, useStore } from '@xyflow/react'
import { useWorkflowStore } from '../store/workflowStore'
import { cn } from '../utils/cn'

/**
 * ZoomControls — Toolbar / canvas controls that surface the current zoom level
 * and provide:
 *   - Live zoom percentage (subscribed to RF's viewport)
 *   - + / - zoom buttons
 *   - "100%" reset
 *   - Fit view
 *   - Zoom-to-selection (when ≥ 1 node is selected)
 *   - Lock / unlock the selected nodes (Dify 风格)
 */
export const ZoomControls = memo(function ZoomControls() {
  const rf = useReactFlow()
  const [zoom, setZoom] = useState<number>(rf.getZoom())
  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds)
  const nodes = useWorkflowStore((s) => s.nodes)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)

  // Subscribe to viewport changes (RF re-renders this on zoom/pan)
  useStore((s) => {
    const z = s.transform[2]
    if (z !== zoom) setZoom(z)
    return z
  })

  const setZoomSafe = useCallback(
    (next: number) => {
      const clamped = Math.max(0.1, Math.min(4, next))
      rf.zoomTo(clamped, { duration: 150 })
    },
    [rf],
  )

  const fitView = useCallback(() => rf.fitView({ padding: 0.2, duration: 200 }), [rf])

  const zoomToSelection = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      fitView()
      return
    }
    const targets = nodes.filter((n) => selectedNodeIds.includes(n.id))
    if (targets.length === 0) return
    // Use RF's fitView with nodes option
    const w = (n: { width?: number }) => (n as { width?: number }).width ?? 240
    const h = (n: { height?: number }) => (n as { height?: number }).height ?? 80
    const minX = Math.min(...targets.map((n) => n.position.x)) - 24
    const minY = Math.min(...targets.map((n) => n.position.y)) - 48
    const maxX = Math.max(...targets.map((n) => n.position.x + w(n))) + 24
    const maxY = Math.max(...targets.map((n) => n.position.y + h(n))) + 24
    void rf
    // We can use RF's fitView with a custom rect via setViewport — compute scale from rect vs viewport
    const pane = document.querySelector('.react-flow') as HTMLDivElement | null
    if (!pane) return
    const cw = pane.clientWidth
    const ch = pane.clientHeight
    const targetW = maxX - minX
    const targetH = maxY - minY
    const sx = cw / targetW
    const sy = ch / targetH
    const next = Math.max(0.1, Math.min(4, Math.min(sx, sy) * 0.92))
    rf.setViewport(
      { x: -minX * next + (cw - targetW * next) / 2, y: -minY * next + (ch - targetH * next) / 2, zoom: next },
      { duration: 200 },
    )
  }, [fitView, nodes, rf, selectedNodeIds])

  // Lock / unlock the selected nodes (toggles a flag we read in CustomNode)
  const selectedLockedCount = nodes.filter((n) => selectedNodeIds.includes(n.id) && (n.data as Record<string, unknown>)._locked).length
  const allLocked = selectedNodeIds.length > 0 && selectedLockedCount === selectedNodeIds.length

  const toggleLockSelection = useCallback(() => {
    selectedNodeIds.forEach((id) => {
      const n = nodes.find((x) => x.id === id)
      if (!n) return
      const cur = !!(n.data as Record<string, unknown>)._locked
      updateNodeData(id, { _locked: !cur } as Partial<typeof n.data>)
    })
  }, [nodes, selectedNodeIds, updateNodeData])

  return (
    <div className="flex items-center bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden mr-2">
      <button
        onClick={() => setZoomSafe(zoom - 0.1)}
        className="w-6 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="缩小"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      <button
        onClick={() => setZoomSafe(1)}
        className="h-7 px-1.5 text-[11px] font-mono text-gray-600 hover:bg-gray-100 transition-colors min-w-[42px] text-center"
        title="重置为 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => setZoomSafe(zoom + 0.1)}
        className="w-6 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="放大"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      <div className="w-px h-4 bg-gray-200" />
      <button
        onClick={fitView}
        className="h-7 px-2 text-[11px] text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1"
        title="缩放到适合（全部节点）"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        适合
      </button>
      <button
        onClick={zoomToSelection}
        disabled={selectedNodeIds.length === 0}
        className={cn(
          'h-7 px-2 text-[11px] transition-colors flex items-center gap-1 border-l border-gray-200',
          selectedNodeIds.length === 0
            ? 'text-gray-300 cursor-not-allowed'
            : 'text-gray-600 hover:bg-gray-100',
        )}
        title={selectedNodeIds.length === 0 ? '先选中节点' : `缩放到选中的 ${selectedNodeIds.length} 个节点`}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5"/></svg>
        选中
      </button>
      <button
        onClick={toggleLockSelection}
        disabled={selectedNodeIds.length === 0}
        className={cn(
          'h-7 w-7 flex items-center justify-center transition-colors border-l border-gray-200',
          selectedNodeIds.length === 0
            ? 'text-gray-300 cursor-not-allowed'
            : allLocked
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
              : 'text-gray-600 hover:bg-gray-100',
        )}
        title={
          selectedNodeIds.length === 0
            ? '先选中节点'
            : allLocked
              ? '解锁所选节点'
              : '锁定所选节点（不可拖动）'
        }
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          {allLocked ? (
            <>
              <rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </>
          ) : (
            <>
              <rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </>
          )}
        </svg>
      </button>
    </div>
  )
})
