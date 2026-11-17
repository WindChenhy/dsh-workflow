import { memo } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { NODE_TYPE_META } from '../types/workflow'
import type { BlockEnum, CommonNodeType } from '../types/workflow'

export const SimulationLog = memo(function SimulationLog() {
  const simulation = useWorkflowStore((s) => s.simulation)
  const nodes = useWorkflowStore((s) => s.nodes)

  if (simulation.status === 'idle') return null

  const results = Object.values(simulation.nodeResults).filter((r) => r.status !== 'pending')

  return (
    <div className="absolute bottom-4 right-4 w-80 max-h-80 bg-white border border-gray-200 rounded-xl shadow-xl z-10 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-xs font-semibold text-gray-600">
            {simulation.mode === 'auto' ? '运行日志' : '调试日志'}
          </span>
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
          {results.length}/{Object.keys(simulation.nodeResults).length}
        </span>
      </div>

      {/* Empty state */}
      {simulation.status === 'running' && results.length === 0 && (
        <div className="p-6 text-center">
          <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="#d1d5db" strokeWidth="2" />
              <path d="M8 2a6 6 0 0 1 6 6" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-gray-400">准备开始模拟...</p>
        </div>
      )}

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {results.map((r) => {
          const node = nodes.find((n) => n.id === r.nodeId)
          const blockType = (node?.data as CommonNodeType)?.type as BlockEnum
          const meta = NODE_TYPE_META[blockType]
          const icon = meta?.icon || '•'

          let StatusIcon: React.ReactNode
          let rowBg = ''
          if (r.status === 'running') {
            StatusIcon = <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            rowBg = 'bg-blue-50'
          } else if (r.status === 'success') {
            StatusIcon = (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#22c55e" />
                <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )
            rowBg = ''
          } else {
            StatusIcon = (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#ef4444" />
                <path d="M6 6l4 4M10 6l-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )
            rowBg = 'bg-red-50'
          }

          return (
            <div key={r.nodeId} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg text-xs ${rowBg}`}>
              <span className="shrink-0 mt-0.5">{StatusIcon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span>{icon}</span>
                  <span className="font-medium text-gray-700 truncate">
                    {(node?.data as CommonNodeType)?.title || node?.type || '未知'}
                  </span>
                  {r.duration && (
                    <span className="text-[10px] text-gray-400 ml-auto shrink-0">{r.duration}ms</span>
                  )}
                </div>
                {r.output && (
                  <div className="text-gray-400 truncate mt-0.5 ml-5">{r.output}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {simulation.status === 'completed' && (
        <div className="px-3 py-2 border-t border-gray-100 bg-green-50 text-xs text-green-700 flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" fill="#22c55e" />
            <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          模拟完成 — 纯前端模拟，未发起真实请求
        </div>
      )}
    </div>
  )
})
