import { memo, useEffect, useState } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import type { AppNode } from '../types/workflow'

/**
 * ConnectionHint — while the user is dragging a connection from a source handle,
 * highlight all valid target handles. Also, while dragging a node near an
 * existing handle, show a "snap" highlight to encourage connection.
 *
 * Implementation: We listen for connection drag events at the document level by
 * reading ReactFlow's internal connection state via the rendered preview
 * path. We re-evaluate on every cursor move and project highlight markers.
 */
export const ConnectionHint = memo(function ConnectionHint() {
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    const onMouseMove = (e: MouseEvent) => {
      setPointer({ x: e.clientX, y: e.clientY })
      // Find a target node under the cursor
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (!target) return
      // While dragging connection line, ReactFlow adds a .react-flow__connectionline to the DOM
      const connectionLine = document.querySelector('.react-flow__connectionline')
      if (connectionLine) {
        // We're dragging a connection: find source node
        const handle = (connectionLine as SVGElement).dataset?.sourceNodeId
        if (handle) {
          setSourceNodeId(handle)
        } else {
          // Best-effort: find the source from current internal state
          // RF exposes rf.getEdges() and the connection drag is implicit; fall back to using the closest source handle
          const srcEl = document.querySelector('.react-flow__handle-connectingfrom, .react-flow__handle.source')
          if (srcEl) {
            const nodeEl = srcEl.closest('.react-flow__node') as HTMLElement | null
            if (nodeEl) setSourceNodeId(nodeEl.dataset.id ?? null)
          }
        }
      } else {
        setSourceNodeId(null)
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [])

  if (!sourceNodeId || !pointer) return null

  // Compute valid targets
  const source = nodes.find((n) => n.id === sourceNodeId) as AppNode | undefined
  if (!source) return null
  const usedTargets = new Set(
    edges.filter((e) => e.source === sourceNodeId).map((e) => e.target),
  )
  const candidates = nodes.filter(
    (n) =>
      n.id !== sourceNodeId &&
      !usedTargets.has(n.id) &&
      n.data.type !== 'start', // start has no target handle
  )

  return (
    <div className="fixed inset-0 pointer-events-none z-[60]">
      {candidates.map((n) => {
        const nodeEl = document.querySelector(`[data-id="${n.id}"]`) as HTMLElement | null
        if (!nodeEl) return null
        const rect = nodeEl.getBoundingClientRect()
        return (
          <div
            key={n.id}
            className="absolute border-2 border-blue-400 rounded-lg bg-blue-100/20 animate-pulse pointer-events-none"
            style={{
              // Use viewport coordinates (`getBoundingClientRect`) but place via
              // `fixed`-positioned root so the offsets are always relative to
              // the screen — NOT the ReactFlow pane, which would shift them.
              left: rect.left - 4,
              top: rect.top - 4,
              width: rect.width + 8,
              height: rect.height + 8,
            }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-bold text-white bg-blue-500 whitespace-nowrap shadow-sm">
              可连接
            </div>
          </div>
        )
      })}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-500 text-white shadow-md pointer-events-none">
        释放以创建连线 · {candidates.length} 个可选目标
      </div>
    </div>
  )
})
