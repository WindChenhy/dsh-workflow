import { memo, useEffect, useRef, useState } from 'react'
import { useWorkflowStore } from '../store/workflowStore'

/**
 * TestNodePanel — a small inline card shown at the top of PropertyPanel when
 * a single node is selected. Lets the user:
 *   - Run the node in isolation (calls store.testNode)
 *   - See the latest single-node run result
 *   - Copy the JSON / output to clipboard
 */
export const TestNodePanel = memo(function TestNodePanel({ nodeId, nodeTitle }: { nodeId: string; nodeTitle: string }) {
  const testNode = useWorkflowStore((s) => s.testNode)
  const runHistory = useWorkflowStore((s) => s.runHistory)
  const activeRunId = useWorkflowStore((s) => s.activeRunId)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  // Find the most recent single-node run for this node
  const lastResult = runHistory.find(
    (r) => r.executionOrder.length === 1 && r.executionOrder[0] === nodeId,
  )

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const onTest = () => {
    testNode(nodeId)
  }

  const onCopy = async () => {
    if (!lastResult) return
    const r = lastResult.nodeResults[nodeId]
    const payload = JSON.stringify(r, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      // ignore
    }
    setCopied(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 2l9 6-9 6V2z" fill="#d97706"/>
          </svg>
          <span className="text-[11px] font-semibold text-amber-800">单节点测试</span>
        </div>
        <button
          onClick={onTest}
          className="h-6 px-2.5 text-[10px] font-medium text-white bg-amber-500 hover:bg-amber-600 rounded transition-colors flex items-center gap-1"
          title={`运行 "${nodeTitle}" 一次`}
        >
          <svg width="9" height="9" viewBox="0 0 10 12" fill="currentColor"><path d="M0 0l10 6-10 6V0z"/></svg>
          测试
        </button>
      </div>
      {lastResult ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>成功</span>
            {lastResult.nodeResults[nodeId]?.duration && (
              <span className="text-amber-600/70">· {lastResult.nodeResults[nodeId].duration}ms</span>
            )}
            {activeRunId === lastResult.id && <span className="text-amber-600/70">· 当前活动</span>}
          </div>
          <pre className="text-[10px] font-mono text-amber-900 bg-white/70 border border-amber-100 rounded px-1.5 py-1 max-h-[80px] overflow-auto whitespace-pre-wrap break-all" title={lastResult.nodeResults[nodeId]?.output ?? ''}>
            {lastResult.nodeResults[nodeId]?.output ?? '(无输出)'}
          </pre>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onCopy}
              className="text-[10px] text-amber-700 hover:text-amber-900 hover:underline"
            >
              {copied ? '已复制 ✓' : '复制结果'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-amber-700/80 leading-relaxed">
          尚未运行。点击「测试」会执行一次本节点并把结果记入运行历史。
        </p>
      )}
    </div>
  )
})
