import { memo } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { cn } from '../utils/cn'
import { formatClock } from '../utils/format'
import type { RunRecord } from '../store/workflowStore'

/**
 * RunHistoryPanel — full-height right-tab version of RunHistory.
 * Lists every recorded run and expands to show per-node results.
 */
export const RunHistoryPanel = memo(function RunHistoryPanel() {
  const runHistory = useWorkflowStore((s) => s.runHistory)
  const activeRunId = useWorkflowStore((s) => s.activeRunId)
  const setActiveRun = useWorkflowStore((s) => s.setActiveRun)
  const deleteRun = useWorkflowStore((s) => s.deleteRun)
  const clearRunHistory = useWorkflowStore((s) => s.clearRunHistory)
  const nodes = useWorkflowStore((s) => s.nodes)
  const nodeLookup = Object.fromEntries(nodes.map((n) => [n.id, n.data.title]))

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          运行历史 · {runHistory.length}
        </div>
        {runHistory.length > 0 && (
          <button
            onClick={() => {
              if (confirm('清空所有运行历史？')) clearRunHistory()
            }}
            className="text-[10px] text-red-500 hover:text-red-600 hover:underline"
          >
            清空
          </button>
        )}
      </div>
      {runHistory.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-2">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M8 4v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-[12px] font-medium text-gray-600">还没有运行</div>
          <div className="text-[11px] text-gray-400 mt-1 leading-relaxed">
            在工具栏点击 <span className="text-blue-500">▶ 运行</span><br />
            或在选中节点时点 <span className="text-amber-500">测试</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {runHistory.map((r) => (
            <RunBlock
              key={r.id}
              run={r}
              active={r.id === activeRunId}
              nodeLookup={nodeLookup}
              onClick={() => setActiveRun(r.id)}
              onDelete={() => deleteRun(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

const RunBlock = memo(function RunBlock({
  run, active, onClick, onDelete, nodeLookup,
}: {
  run: RunRecord
  active: boolean
  onClick: () => void
  onDelete: () => void
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
  const label = run.mode === 'auto' ? '自动运行' : run.mode === 'step' ? '单步运行' : '运行'
  const title = totalNodes === 1
    ? `单节点测试: ${nodeLookup[run.executionOrder[0]] ?? run.executionOrder[0]}`
    : `${label} · ${totalNodes} 节点`

  return (
    <div
      onClick={onClick}
      className={cn(
        'group cursor-pointer border-b border-gray-100 transition-colors',
        active ? 'bg-blue-50/60' : 'hover:bg-gray-50',
      )}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor)} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-gray-700 truncate font-medium">{title}</div>
            <div className="text-[10px] text-gray-400 flex items-center gap-1.5 mt-0.5">
              <span>{formatClock(started)}</span>
              <span>·</span>
              <span className="font-mono">{dur > 0 ? `${dur}ms` : '—'}</span>
              <span>·</span>
              <span className="text-green-600">{successCount}✓</span>
              {errorCount > 0 && <span className="text-red-500">{errorCount}✕</span>}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 rounded shrink-0"
            title="删除此记录"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Per-node result list */}
        {active && run.executionOrder.length > 1 && (
          <div className="mt-2 pl-4 space-y-1 border-l-2 border-blue-200">
            {run.executionOrder.map((nid, i) => {
              const r = run.nodeResults[nid]
              const dot = r?.status === 'success' ? 'bg-green-500' : r?.status === 'error' ? 'bg-red-500' : r?.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
              return (
                <div key={nid} className="flex items-center gap-1.5 text-[10px]">
                  <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
                  <span className="text-gray-400 font-mono w-4 text-right">{i + 1}.</span>
                  <span className="text-gray-600 truncate flex-1">{nodeLookup[nid] ?? nid}</span>
                  {r?.output && <span className="text-gray-400 truncate max-w-[120px]" title={r.output}>{r.output.slice(0, 20)}…</span>}
                </div>
              )
            })}
          </div>
        )}
        {active && run.executionOrder.length === 1 && run.nodeResults[run.executionOrder[0]]?.output && (
          <pre className="mt-2 ml-4 text-[10px] font-mono text-gray-600 bg-gray-50 border border-gray-100 rounded px-2 py-1 max-h-[100px] overflow-auto whitespace-pre-wrap break-all">
            {run.nodeResults[run.executionOrder[0]].output}
          </pre>
        )}
      </div>
    </div>
  )
})

