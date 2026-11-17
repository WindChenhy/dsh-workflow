import { memo, useEffect, useState, useRef } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import type { AppEdge } from '../types/workflow'

/**
 * EdgeLabelEditor — overlay that shows an inline input for editing a
 * selected edge's label. Triggered by double-clicking an edge.
 */
export const EdgeLabelEditor = memo(function EdgeLabelEditor() {
  const selectedEdgeIds = useWorkflowStore((s) => s.selectedEdgeIds)
  const edges = useWorkflowStore((s) => s.edges)
  const updateEdgeLabel = useWorkflowStore((s) => s.updateEdgeLabel)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.edgeId) {
        const edge = edges.find((ed) => ed.id === detail.edgeId)
        setEditing({ id: detail.edgeId, value: (edge?.label as string) ?? '' })
      }
    }
    window.addEventListener('edit-edge-label', handler)
    return () => window.removeEventListener('edit-edge-label', handler)
  }, [edges])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // Auto-pop edit input when a single edge is selected (and not currently editing)
  useEffect(() => {
    if (selectedEdgeIds.length !== 1) return
    if (editing) return
    const edge = edges.find((e) => e.id === selectedEdgeIds[0])
    if (!edge) return
    setEditing({ id: edge.id, value: (edge.label as string) ?? '' })
  }, [selectedEdgeIds, edges, editing])

  if (!editing) return null

  const commit = () => {
    updateEdgeLabel(editing.id, editing.value)
    setEditing(null)
  }

  // Compute position near the selected edge (use middle of labelX/labelY in screen coords)
  const edge = edges.find((e) => e.id === editing.id) as AppEdge | undefined
  if (!edge) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 shadow-xl rounded-lg p-3 flex items-center gap-2 w-[420px]">
      <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M2 8h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <circle cx="3.5" cy="8" r="1.2" fill="currentColor"/>
          <circle cx="12.5" cy="8" r="1.2" fill="currentColor"/>
        </svg>
      </div>
      <input
        ref={inputRef}
        value={editing.value}
        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(null)
        }}
        placeholder="边的标签（例：status === 200）"
        className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400"
      />
      <button
        onClick={commit}
        className="h-7 text-xs px-3 bg-blue-500 text-white rounded hover:bg-blue-600"
      >保存</button>
      <button
        onClick={() => setEditing(null)}
        className="h-7 text-xs px-2 text-gray-500 rounded hover:bg-gray-100"
      >取消</button>
      <button
        onClick={() => { updateEdgeLabel(editing.id, ''); setEditing(null) }}
        className="h-7 text-xs px-2 text-red-500 rounded hover:bg-red-50"
        title="清空标签"
      >清空</button>
    </div>
  )
})
