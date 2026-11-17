import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../store/workflowStore'
import type { NodeBundle, AppNode } from '../types/workflow'
import { cn } from '../utils/cn'

const COLOR_STYLES: Record<NodeBundle['color'], { border: string; bg: string; text: string; pill: string }> = {
  gray: { border: 'border-gray-300', bg: 'bg-gray-50/60', text: 'text-gray-700', pill: 'bg-gray-100' },
  blue: { border: 'border-blue-300', bg: 'bg-blue-50/60', text: 'text-blue-700', pill: 'bg-blue-100' },
  green: { border: 'border-green-300', bg: 'bg-green-50/60', text: 'text-green-700', pill: 'bg-green-100' },
  orange: { border: 'border-orange-300', bg: 'bg-orange-50/60', text: 'text-orange-700', pill: 'bg-orange-100' },
  violet: { border: 'border-violet-300', bg: 'bg-violet-50/60', text: 'text-violet-700', pill: 'bg-violet-100' },
}

/**
 * BundleLayer — renders all node bundles as colored rectangles on the canvas.
 * Dify-style features:
 *   - Auto-fit bounds (driven by store, recalculated on node move)
 *   - Drag the title pill to move the whole group
 *   - Double-click title pill to rename
 *   - Color dots, lock toggle, expand/collapse
 *   - Collapsed → shows the member node titles
 *   - Nested groups (parentId); children are drawn first
 */
export const BundleLayer = memo(function BundleLayer() {
  const bundles = useWorkflowStore((s) => s.bundles)
  const nodes = useWorkflowStore((s) => s.nodes)
  const toggleBundleCollapsed = useWorkflowStore((s) => s.toggleBundleCollapsed)
  const removeBundle = useWorkflowStore((s) => s.removeBundle)
  const updateBundle = useWorkflowStore((s) => s.updateBundle)
  const moveBundle = useWorkflowStore((s) => s.moveBundle)
  const toggleBundleLocked = useWorkflowStore((s) => s.toggleBundleLocked)
  const autoFitBundle = useWorkflowStore((s) => s.autoFitBundle)
  const rf = useReactFlow()

  // Sort: parents first, children after
  const sorted = [...bundles].sort((a, b) => {
    if (a.parentId === b.id) return 1
    if (b.parentId === a.id) return -1
    return 0
  })

  return (
    <>
      {sorted.map((b) => (
        <BundleRect
          key={b.id}
          bundle={b}
          nodes={nodes}
          rf={rf}
          onToggle={() => toggleBundleCollapsed(b.id)}
          onRemove={() => removeBundle(b.id)}
          onUpdate={(patch) => updateBundle(b.id, patch)}
          onMove={(delta) => moveBundle(b.id, delta)}
          onToggleLock={() => toggleBundleLocked(b.id)}
          onAutoFit={() => autoFitBundle(b.id)}
        />
      ))}
    </>
  )
})

const BundleRect = memo(function BundleRect({
  bundle,
  nodes,
  rf,
  onToggle,
  onRemove,
  onUpdate,
  onMove,
  onToggleLock,
  onAutoFit,
}: {
  bundle: NodeBundle
  nodes: AppNode[]
  rf: ReturnType<typeof useReactFlow>
  onToggle: () => void
  onRemove: () => void
  onUpdate: (patch: Partial<NodeBundle>) => void
  onMove: (delta: { x: number; y: number }) => void
  onToggleLock: () => void
  onAutoFit: () => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(bundle.title)
  const styles = COLOR_STYLES[bundle.color]
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  // Compute screen position from flow position
  const topLeft = rf.flowToScreenPosition({ x: bundle.x, y: bundle.y })
  const bottomRight = rf.flowToScreenPosition({ x: bundle.x + bundle.width, y: bundle.y + bundle.height })
  const screenW = bottomRight.x - topLeft.x
  const screenH = bottomRight.y - topLeft.y
  const viewport = rf.getViewport()

  // Drag the entire group by the title pill
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Don't initiate drag while editing the title
      if (editingTitle) return
      if (bundle.locked) return
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      dragRef.current = { startX: e.clientX, startY: e.clientY, moved: false }
    },
    [editingTitle, bundle.locked],
  )

  const onHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (Math.abs(dx) + Math.abs(dy) < 2) return
      d.moved = true
      // Convert screen delta → flow delta
      const flowDx = dx / viewport.zoom
      const flowDy = dy / viewport.zoom
      // Reset to start and apply incremental move (so it tracks the pointer precisely)
      d.startX = e.clientX
      d.startY = e.clientY
      onMove({ x: flowDx, y: flowDy })
    },
    [onMove, viewport.zoom],
  )

  const onHeaderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      // We treat this as a click if pointer didn't move — Dify convention
      if (d && !d.moved) onToggle()
    },
    [onToggle],
  )

  const memberNodes = nodes.filter((n) => bundle.nodeIds.includes(n.id))
  const collapsedHeight = 56

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: screenW,
        height: bundle.collapsed ? collapsedHeight : screenH,
      }}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-xl border-2 border-dashed pointer-events-auto transition-colors',
          styles.border,
          styles.bg,
          bundle.locked && 'opacity-90',
        )}
      >
        {/* Header pill (draggable, double-click to rename) */}
        <div
          className={cn(
            'absolute -top-3 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shadow-sm select-none',
            styles.pill,
            styles.text,
            styles.border,
            bundle.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
          )}
          onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true) }}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={() => { dragRef.current = null }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0">
            <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => { onUpdate({ title: draftTitle.trim() || bundle.title }); setEditingTitle(false) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onUpdate({ title: draftTitle.trim() || bundle.title }); setEditingTitle(false) }
                if (e.key === 'Escape') { setDraftTitle(bundle.title); setEditingTitle(false) }
              }}
              className="bg-transparent outline-none w-24 text-[11px]"
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate max-w-[160px]" title={bundle.title}>{bundle.title}</span>
          )}
          <span className="text-[9px] text-gray-400 ml-1 shrink-0">· {bundle.nodeIds.length}</span>

          {/* Lock toggle */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleLock() }}
            className={cn(
              'w-3.5 h-3.5 flex items-center justify-center rounded shrink-0',
              bundle.locked ? 'text-amber-600' : 'opacity-60 hover:opacity-100 hover:bg-white/60',
            )}
            title={bundle.locked ? '解锁（自动边界）' : '锁定（保持当前大小）'}
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              {bundle.locked ? (
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

          {/* Color dots */}
          <div className="flex items-center gap-0.5 ml-0.5 pl-1 border-l border-current/20 shrink-0">
            {(Object.keys(COLOR_STYLES) as NodeBundle['color'][]).map((c) => (
              <button
                key={c}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onUpdate({ color: c }) }}
                className={cn(
                  'w-2.5 h-2.5 rounded-full transition-transform',
                  COLOR_STYLES[c].pill,
                  bundle.color === c ? 'ring-2 ring-current scale-110' : 'opacity-60 hover:opacity-100',
                )}
                title={c}
              />
            ))}
          </div>

          {/* Expand / collapse */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-white/60 shrink-0"
            title={bundle.collapsed ? '展开' : '折叠'}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className={cn('transition-transform', bundle.collapsed && 'rotate-180')}>
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Auto-fit */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAutoFit() }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-white/60 shrink-0"
            title="自动贴合（按当前节点重新计算边界）"
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Delete */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-red-100 hover:text-red-500 shrink-0"
            title="删除组合（不影响节点）"
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Collapsed: render member titles in a row */}
        {bundle.collapsed && (
          <div className="absolute inset-0 top-3 px-3 py-1.5 flex flex-wrap items-center gap-1.5 overflow-hidden pointer-events-none">
            {memberNodes.length === 0 ? (
              <div className="text-[10px] text-gray-400 italic">（已折叠）</div>
            ) : (
              memberNodes.map((n) => (
                <div key={n.id} className="flex items-center gap-1 text-[10px] text-gray-600 bg-white/70 border border-gray-200 rounded px-1.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  <span className="truncate max-w-[100px]">{n.data.title || '节点'}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Expanded: show member count badge */}
        {!bundle.collapsed && memberNodes.length > 0 && (
          <div className="absolute bottom-1 right-2 text-[9px] text-gray-400 pointer-events-none">
            {memberNodes.length} 个节点
          </div>
        )}
      </div>
    </div>
  )
})
