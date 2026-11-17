import { memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow, useStore } from '@xyflow/react'
import { useWorkflowStore } from '../store/workflowStore'

const SNAP_THRESHOLD = 4 // px (in flow space) — close enough to show guide

/**
 * AlignmentGuides — while dragging a node, draw pink dashed lines for the
 * center X / Y of every other node so the user can snap into alignment.
 * Inspired by Figma / Dify.
 */
export const AlignmentGuides = memo(function AlignmentGuides() {
  const selectedIds = useWorkflowStore((s) => s.selectedNodeIds)
  const nodes = useWorkflowStore((s) => s.nodes)
  const rf = useReactFlow()

  // Subscribe to dragging state changes
  const draggingNode = useStore((s) => {
    let dragging: { id: string; position: { x: number; y: number }; dragging: boolean; measured?: { width?: number; height?: number } } | undefined
    for (const n of s.nodeLookup.values() as Iterable<{ id: string; position: { x: number; y: number }; dragging: boolean; measured?: { width?: number; height?: number } }>) {
      if (n.dragging) { dragging = n; break }
    }
    return dragging
      ? { id: dragging.id, x: dragging.position.x, y: dragging.position.y, width: dragging.measured?.width ?? 240, height: dragging.measured?.height ?? 80 }
      : null
  })

  const guides = useMemo(() => {
    if (!draggingNode) return []
    if (!selectedIds.includes(draggingNode.id)) return []
    const out: { kind: 'h' | 'v'; pos: number; from: number; to: number }[] = []
    const drCenterX = draggingNode.x + draggingNode.width / 2
    const drCenterY = draggingNode.y + draggingNode.height / 2
    const drLeft = draggingNode.x
    const drRight = draggingNode.x + draggingNode.width
    const drTop = draggingNode.y
    const drBottom = draggingNode.y + draggingNode.height

    let minX1 = drLeft, maxX1 = drRight
    let minY1 = drTop, maxY1 = drBottom

    for (const n of nodes) {
      if (n.id === draggingNode.id) continue
      const w = (n as { width?: number }).width ?? 240
      const h = (n as { height?: number }).height ?? 80
      const oLeft = n.position.x
      const oRight = oLeft + w
      const oTop = n.position.y
      const oBottom = oTop + h
      const oCx = oLeft + w / 2
      const oCy = oTop + h / 2

      // Vertical guides (X axis) — match on center / left / right
      if (Math.abs(drCenterX - oCx) < SNAP_THRESHOLD) {
        out.push({ kind: 'v', pos: oCx, from: Math.min(drTop, oTop) - 20, to: Math.max(drBottom, oBottom) + 20 })
        minX1 = Math.min(minX1, oLeft)
        maxX1 = Math.max(maxX1, oRight)
      } else if (Math.abs(drLeft - oLeft) < SNAP_THRESHOLD) {
        out.push({ kind: 'v', pos: oLeft, from: Math.min(drTop, oTop) - 20, to: Math.max(drBottom, oBottom) + 20 })
      } else if (Math.abs(drRight - oRight) < SNAP_THRESHOLD) {
        out.push({ kind: 'v', pos: oRight, from: Math.min(drTop, oTop) - 20, to: Math.max(drBottom, oBottom) + 20 })
      }

      // Horizontal guides (Y axis)
      if (Math.abs(drCenterY - oCy) < SNAP_THRESHOLD) {
        out.push({ kind: 'h', pos: oCy, from: Math.min(drLeft, oLeft) - 20, to: Math.max(drRight, oRight) + 20 })
        minY1 = Math.min(minY1, oTop)
        maxY1 = Math.max(maxY1, oBottom)
      } else if (Math.abs(drTop - oTop) < SNAP_THRESHOLD) {
        out.push({ kind: 'h', pos: oTop, from: Math.min(drLeft, oLeft) - 20, to: Math.max(drRight, oRight) + 20 })
      } else if (Math.abs(drBottom - oBottom) < SNAP_THRESHOLD) {
        out.push({ kind: 'h', pos: oBottom, from: Math.min(drLeft, oLeft) - 20, to: Math.max(drRight, oRight) + 20 })
      }
    }
    return out
  }, [draggingNode, selectedIds, nodes])

  if (guides.length === 0) return null
  if (typeof document === 'undefined') return null

  // Portal to <body> so the SVG is NOT inside the ReactFlow transform tree.
  // `flowToScreenPosition` already returns viewport coordinates, but when the
  // container is positioned inside a transformed ancestor (every ReactFlow
  // node wrapper has `transform: translate(x,y) scale(z)`) the browser would
  // re-apply that transform, causing the guides to render at the wrong place.
  const svg = (
    <svg
      className="fixed inset-0 pointer-events-none z-50"
      width="100vw"
      height="100vh"
      style={{ overflow: 'visible' }}
    >
      {guides.map((g, i) => {
        const a = rf.flowToScreenPosition({ x: g.kind === 'v' ? g.pos : g.from, y: g.kind === 'h' ? g.pos : g.from })
        const b = rf.flowToScreenPosition({ x: g.kind === 'v' ? g.pos : g.to, y: g.kind === 'h' ? g.pos : g.to })
        const x1 = a.x
        const y1 = a.y
        const x2 = b.x
        const y2 = b.y
        if (g.kind === 'v') {
          return (
            <g key={`v-${i}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 3" />
            </g>
          )
        }
        return (
          <g key={`h-${i}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ec4899" strokeWidth={1} strokeDasharray="4 3" />
          </g>
        )
      })}
    </svg>
  )
  return createPortal(svg, document.body)
})
