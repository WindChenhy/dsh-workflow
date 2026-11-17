import { memo, useState, useRef, useEffect } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { cn } from '../utils/cn'

/**
 * BundlePanel — small toolbar dropdown that surfaces bundle actions:
 *  - Collapse all / Expand all
 *  - Auto-fit all (recompute bounds)
 *  - Remove all (keeps nodes, removes grouping)
 *  - Lock all / Unlock all
 */
export const BundlePanel = memo(function BundlePanel() {
  const bundles = useWorkflowStore((s) => s.bundles)
  const collapseAll = useWorkflowStore((s) => s.collapseAllBundles)
  const expandAll = useWorkflowStore((s) => s.expandAllBundles)
  const autoFitAll = useWorkflowStore((s) => s.autoFitBundles)
  const removeAll = useWorkflowStore((s) => s.removeAllBundles)
  const updateBundle = useWorkflowStore((s) => s.updateBundle)

  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const lockedCount = bundles.filter((b) => b.locked).length
  const collapsedCount = bundles.filter((b) => b.collapsed).length

  const lockAll = () => bundles.forEach((b) => updateBundle(b.id, { locked: true }))
  const unlockAll = () => bundles.forEach((b) => updateBundle(b.id, { locked: false }))

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={bundles.length === 0}
        className={cn(
          'h-7 px-2 text-xs rounded transition-colors flex items-center gap-1',
          open ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100',
          bundles.length === 0 && 'opacity-50 cursor-not-allowed hover:bg-transparent',
        )}
        title="分组管理"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5"/>
          <rect x="5" y="7" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5"/>
        </svg>
        分组
        <span className="text-[9px] text-gray-400">{bundles.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 bg-white rounded-lg border border-gray-200 shadow-2xl py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
            分组 ({bundles.length})
          </div>

          <button
            onClick={() => { autoFitAll(); setOpen(false) }}
            disabled={bundles.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-4 h-4 flex items-center justify-center text-gray-500">⊡</span>
            <span className="flex-1">自动贴合所有分组</span>
          </button>

          <button
            onClick={() => { collapseAll(); setOpen(false) }}
            disabled={bundles.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-4 h-4 flex items-center justify-center text-gray-500">▾</span>
            <span className="flex-1">折叠全部</span>
            <span className="text-[10px] text-gray-400">{collapsedCount}/{bundles.length}</span>
          </button>

          <button
            onClick={() => { expandAll(); setOpen(false) }}
            disabled={bundles.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-4 h-4 flex items-center justify-center text-gray-500">▴</span>
            <span className="flex-1">展开全部</span>
          </button>

          <div className="my-1 h-px bg-gray-100" />

          <button
            onClick={() => { lockAll(); setOpen(false) }}
            disabled={bundles.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-4 h-4 flex items-center justify-center text-gray-500">🔒</span>
            <span className="flex-1">全部锁定</span>
          </button>
          <button
            onClick={() => { unlockAll(); setOpen(false) }}
            disabled={bundles.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-4 h-4 flex items-center justify-center text-gray-500">🔓</span>
            <span className="flex-1">全部解锁</span>
            <span className="text-[10px] text-gray-400">{lockedCount} 锁定</span>
          </button>

          <div className="my-1 h-px bg-gray-100" />

          <button
            onClick={() => {
              if (bundles.length > 0 && confirm(`确定要删除全部 ${bundles.length} 个分组吗？\n（节点本身不会被删除）`)) {
                removeAll()
              }
              setOpen(false)
            }}
            disabled={bundles.length === 0}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <span className="w-4 h-4 flex items-center justify-center">✕</span>
            <span className="flex-1">删除所有分组</span>
          </button>
        </div>
      )}
    </div>
  )
})

