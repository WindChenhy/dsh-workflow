import { memo } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { BlockEnum } from '../types/workflow'

/**
 * EmptyCanvasGuide — Shown at the center of the canvas when no nodes exist.
 * Dify-style quick start: shows a hint, two example templates, and a one-click
 * "Build the simplest flow" button that drops a Start → HTTP → End graph.
 */
export const EmptyCanvasGuide = memo(function EmptyCanvasGuide() {
  const addNode = useWorkflowStore((s) => s.addNode)
  const addEdge = useWorkflowStore((s) => s.addEdge)

  const buildSimpleFlow = () => {
    const start = addNode(BlockEnum.Start, { x: 240, y: 200 })
    const http = addNode(BlockEnum.HttpRequest, { x: 480, y: 200 })
    const end = addNode(BlockEnum.End, { x: 720, y: 200 })
    if (start && http) addEdge(start, http)
    if (http && end) addEdge(http, end)
  }

  const buildIfElseFlow = () => {
    const start = addNode(BlockEnum.Start, { x: 240, y: 200 })
    const ife = addNode(BlockEnum.IfElse, { x: 480, y: 200 })
    const log = addNode(BlockEnum.Log, { x: 720, y: 80 })
    const end = addNode(BlockEnum.End, { x: 720, y: 320 })
    if (start && ife) addEdge(start, ife)
    if (ife && log) addEdge(ife, log, undefined, 'true')
    if (ife && end) addEdge(ife, end, undefined, 'false')
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
      // Allow clicks only on the inner card; outside clicks pass through to the canvas
    >
      <div
        className="pointer-events-auto w-[480px] max-w-[90vw] bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-xl p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative empty-illustration */}
        <div className="mx-auto w-14 h-14 mb-3 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-blue-200">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M6 8h6v16H6zM14 14h6v10h-6zM22 4h6v20h-6z" fill="currentColor" fillOpacity="0.85"/>
            <path d="M9 16h2M17 19h2M25 12h2" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-gray-800 mb-1">开始构建你的第一个工作流</h2>
        <p className="text-[12px] text-gray-500 leading-relaxed mb-4 max-w-sm mx-auto">
          从左侧 <span className="text-blue-600 font-medium">节点库</span> 拖动任意节点到画布，
          或者从下面的模板开始 — 一键插入完整示例。
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={buildSimpleFlow}
            className="group p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-base">▶</span>
              <span className="text-base">🌐</span>
              <span className="text-base">■</span>
            </div>
            <div className="text-[12px] font-medium text-gray-700">HTTP 调用</div>
            <div className="text-[10px] text-gray-400 leading-relaxed mt-0.5">Start → HTTP → End</div>
          </button>
          <button
            onClick={buildIfElseFlow}
            className="group p-3 rounded-lg border border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-left"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-base">▶</span>
              <span className="text-base">◇</span>
              <span className="text-base">📝</span>
              <span className="text-base">■</span>
            </div>
            <div className="text-[12px] font-medium text-gray-700">条件分支</div>
            <div className="text-[10px] text-gray-400 leading-relaxed mt-0.5">Start → IfElse → Log / End</div>
          </button>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">快捷键</div>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
            <div className="flex items-center justify-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">Space</kbd>拖动画布
            </div>
            <div className="flex items-center justify-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">/</kbd>唤起变量
            </div>
            <div className="flex items-center justify-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">F11</kbd>全屏
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
