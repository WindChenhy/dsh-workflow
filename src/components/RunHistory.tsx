import { memo, useState, useRef, useEffect } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import type { RunRecord } from '../store/workflowStore'
import { cn } from '../utils/cn'
import { formatClock } from '../utils/format'

/**
 * RunHistory — Toolbar dropdown that lists every run that has been executed
 * (either full-flux simulation or single-node tests). Click a row to inspect
 * the per-node result.
 */
export const RunHistory = memo(function RunHistory() {
  const runHistory = useWorkflowStore((s) => s.runHistory)
  const activeRunId = useWorkflowStore((s) => s.activeRunId)
  const setActiveRun = useWorkflowStore((s) => s.setActiveRun)
  const deleteRun = useWorkflowStore((s) => s.deleteRun)
  const clearRunHistory = useWorkflowStore((s) => s.clearRunHistory)
  const nodes = useWorkflowStore((s) => s.nodes)

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

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={runHistory.length === 0}
        className={cn(
          'h-7 px-2 text-xs rounded transition-colors flex items-center gap-1',
          open ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100',
          runHistory.length === 0 && 'opacity-50 cursor-not-allowed hover:bg-transparent',
        )}
        title="运行历史"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8 4v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        历史
        <span className="text-[9px] text-gray-400">{runHistory.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-[360px] bg-white rounded-lg border border-gray-200 shadow-2xl py-1 max-h-[60vh] flex flex-col">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 flex items-center justify-between">
            <span>运行历史 ({runHistory.length})</span>
            {runHistory.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('清空所有运行历史？')) clearRunHistory()
                }}
                className="text-[10px] text-red-500 hover:text-red-600 hover:underline normal-case font-normal"
              >
                清空
              </button>
            )}
          </div>
          {runHistory.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-gray-400">
              还没有运行记录 — 在工具栏点击"运行"或"单步"开始
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {runHistory.map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  active={r.id === activeRunId}
                  nodeLookup={Object.fromEntries(nodes.map((n) => [n.id, n.data.title]))}
                  onClick={() => { setActiveRun(r.id); setOpen(false) }}
                  onDelete={(e) => { e.stopPropagation(); deleteRun(r.id) }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

const RunRow = memo(function RunRow({
  run, active, onClick, onDelete, nodeLookup,
}: {
  run: RunRecord
  active: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  nodeLookup: Record<string, string>
}) {
  const started = new Date(run.startedAt)
  const dur = run.finishedAt ? run.finishedAt - run.startedAt : 0
  const totalNodes = run.executionOrder.length
  const successCount = Object.values(run.nodeResults).filter((r) => r.status === 'success').length
  const errorCount = Object.values(run.nodeResults).filter((r) => r.status === 'error').length
  const statusColor =
    run.status === 'running' ? 'bg-blue-500 animate-pulse' :
    run.status === 'completed' ? (errorCount > 0 ? 'bg-amber-500' : 'bg-green-500') :
    'bg-red-500'
  const label = run.mode === 'auto' ? '自动' : '单步'
  const title = totalNodes === 1
    ? `单节点测试: ${nodeLookup[run.executionOrder[0]] ?? run.executionOrder[0]}`
    : `流程模拟 · ${label} · ${totalNodes} 节点`

  return (
    <div
      onClick={onClick}
      className={cn(
        'group px-3 py-2 cursor-pointer transition-colors border-b border-gray-50 last:border-b-0',
        active ? 'bg-blue-50/60' : 'hover:bg-gray-50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-gray-700 truncate">{title}</div>
          <div className="text-[10px] text-gray-400 flex items-center gap-2 mt-0.5">
            <span>{formatClock(started)}</span>
            <span>·</span>
            <span className="font-mono">{dur > 0 ? `${dur}ms` : '—'}</span>
            <span>·</span>
            <span className="text-green-600">{successCount}✓</span>
            {errorCount > 0 && <span className="text-red-500">{errorCount}✕</span>}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 rounded"
          title="删除此记录"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
})

