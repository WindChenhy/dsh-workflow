import { memo } from 'react'
import { useWorkflowStore } from '../store/workflowStore'

export const ValidationBar = memo(function ValidationBar() {
  const errors = useWorkflowStore((s) => s.validationErrors)
  const show = useWorkflowStore((s) => s.showValidation)

  if (!show || errors.length === 0) return null

  const errorCount = errors.filter((e) => e.severity === 'error').length
  const warningCount = errors.filter((e) => e.severity === 'warning').length

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="text-xs font-semibold text-gray-600">校验结果</span>
        {errorCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {errorCount} 错误
          </span>
        )}
        {warningCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            {warningCount} 警告
          </span>
        )}
      </div>
      <div className="px-4 pb-2.5 space-y-1">
        {errors.map((err, i) => (
          <div key={i} className={`text-xs flex items-start gap-2 pl-1 ${err.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
            <span className="mt-0.5 shrink-0">{err.severity === 'error' ? '✕' : '⚠'}</span>
            <span>{err.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
})
