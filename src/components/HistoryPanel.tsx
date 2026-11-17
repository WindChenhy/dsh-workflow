import { memo, useState, useRef, useEffect } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { cn } from '../utils/cn'

export const HistoryPanel = memo(function HistoryPanel() {
  const history = useWorkflowStore((s) => s.history)
  const undo = useWorkflowStore((s) => s.undo)
  const redo = useWorkflowStore((s) => s.redo)
  const jumpToHistory = useWorkflowStore((s) => s.jumpToHistory)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Render entries newest-first for natural mental model
  // (entries are stored oldest→newest; index points to current)
  const ordered = history.entries
    .map((e, i) => ({ ...e, _idx: i }))
    .reverse()

  const canUndo = history.index > 0
  const canRedo = history.index < history.entries.length - 1

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'h-7 flex items-center gap-1 px-2 text-xs rounded-md transition-colors',
          open ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100',
        )}
        title="撤销/重做历史"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8a5 5 0 1 0 1.5-3.5L3 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 3v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="font-mono text-[10px]">
          {history.index + 1}/{history.entries.length}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-50 w-80 bg-white rounded-lg border border-gray-200 shadow-2xl flex flex-col max-h-96"
        >
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-800">撤销/重做历史</div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                当前 {history.index + 1} / {history.entries.length} · 点击跳转
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => undo()}
                disabled={!canUndo}
                className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                title="撤销 (Ctrl+Z)"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 7H3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 1v6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13 3a5 5 0 0 1 0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                onClick={() => redo()}
                disabled={!canRedo}
                className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                title="重做 (Ctrl+Shift+Z)"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M12 7h1a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 1v6L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M3 3a5 5 0 0 0 0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {ordered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11px] text-gray-400">无历史记录</div>
            ) : (
              ordered.map((e) => {
                const isCurrent = e._idx === history.index
                const isFuture = e._idx > history.index
                return (
                  <button
                    key={e.id}
                    onClick={() => jumpToHistory(e._idx)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors',
                      isCurrent
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : isFuture
                          ? 'text-gray-300 hover:bg-gray-50'
                          : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {/* Marker */}
                    <span className="w-4 flex flex-col items-center shrink-0">
                      {isCurrent ? (
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                      ) : (
                        <span className={cn('w-1.5 h-1.5 rounded-full', isFuture ? 'bg-gray-200' : 'bg-gray-400')} />
                      )}
                    </span>
                    <span className="flex-1 truncate">{e.description}</span>
                    <span className="text-[10px] text-gray-400 font-mono shrink-0">
                      {new Date(e.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] text-blue-600 font-bold shrink-0">当前</span>
                    )}
                  </button>
                )
              })
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
            <span>最多 {history.maxEntries} 步</span>
            <span>{ordered.length} 条</span>
          </div>
        </div>
      )}
    </div>
  )
})
