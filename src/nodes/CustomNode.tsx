import { memo, useState, useRef, useEffect, type FC, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import type { AppNode, CommonNodeType, BlockEnum } from '../types/workflow'
import { BlockEnum as BE, NodeRunningStatus } from '../types/workflow'
import { cn } from '../utils/cn'
import { useWorkflowStore } from '../store/workflowStore'

/* ─── Block colors (Dify palette) ─── */
const BLOCK_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  [BE.Start]: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  [BE.End]: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  [BE.HttpRequest]: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  [BE.IfElse]: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  [BE.Delay]: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  [BE.Log]: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-500' },
  [BE.Note]: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  [BE.Iteration]: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  [BE.Parallel]: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  [BE.Code]: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', dot: 'bg-sky-500' },
}

const BLOCK_ICONS: Record<string, string> = {
  [BE.Start]: '▶',
  [BE.End]: '■',
  [BE.HttpRequest]: '🌐',
  [BE.IfElse]: '◇',
  [BE.Delay]: '⏱',
  [BE.Log]: '📝',
  [BE.Note]: '📌',
  [BE.Iteration]: '↻',
  [BE.Parallel]: '⫶',
  [BE.Code]: '⌨',
}

const BLOCK_LABELS: Record<string, string> = {
  [BE.Start]: '开始',
  [BE.End]: '结束',
  [BE.HttpRequest]: 'HTTP 请求',
  [BE.IfElse]: '条件分支',
  [BE.Delay]: '延迟',
  [BE.Log]: '日志',
  [BE.Note]: '便签',
  [BE.Iteration]: '迭代',
  [BE.Parallel]: '并行',
  [BE.Code]: '代码执行',
}

/* ─── BlockSelector Popup ─── */
type BlockSelectorProps = {
  open: boolean
  /** Screen (viewport) coordinates — use `fixed` positioning so the popup
   *  is not affected by the ReactFlow viewport. */
  position: { x: number; y: number }
  onSelect: (type: BlockEnum) => void
  onClose: () => void
}

const BLOCK_OPTIONS: { type: BlockEnum; label: string; desc: string; icon: string; color: string }[] = [
  { type: BE.HttpRequest, label: 'HTTP 请求', desc: '通过 HTTP 协议发送服务器请求', icon: '🌐', color: '#3b82f6' },
  { type: BE.IfElse, label: '条件分支', desc: '根据条件执行不同的分支', icon: '◇', color: '#06b6d4' },
  { type: BE.Delay, label: '延迟', desc: '延迟指定时间后继续执行', icon: '⏱', color: '#8b5cf6' },
  { type: BE.Log, label: '日志', desc: '输出日志信息', icon: '📝', color: '#64748b' },
  { type: BE.Iteration, label: '迭代', desc: '遍历数组并对每个元素执行子流程', icon: '↻', color: '#10b981' },
  { type: BE.Parallel, label: '并行', desc: '并行执行多条独立分支', icon: '⫶', color: '#f43f5e' },
  { type: BE.Code, label: '代码执行', desc: '在沙箱中执行 JS / Python / TS', icon: '⌨', color: '#0ea5e9' },
  { type: BE.Note, label: '便签', desc: '在画布上添加说明便签', icon: '📌', color: '#eab308' },
]

const BlockSelectorPopup = memo(function BlockSelectorPopup({ open, position, onSelect, onClose }: BlockSelectorProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest onClose in a ref so the capture-phase listener below
  // can be installed ONCE (when `open` flips true) and not be torn down on
  // every parent re-render. Without this, `onClose={() => setSelectorOpen(false)}`
  // is a fresh function reference on every render, which would cause the
  // useEffect's dep array to invalidate repeatedly and the outside-click
  // listener to be removed+re-added on every CustomNode re-render — a window
  // during which `attached` resets to false and outside clicks silently no-op.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // We listen in the CAPTURE phase. ReactFlow internally registers
    // `d3-drag` on every node DOM element, and `d3-drag`'s `mousedowned`
    // handler calls `event.stopImmediatePropagation()` on the mousedown
    // event (see d3-drag/src/drag.js `nopropagation`). That stops the
    // event from bubbling up to `document`, so a default-phase document
    // listener never fires when the user clicks anywhere on a node. By
    // registering in capture phase we get a chance to run *before* the
    // event reaches ReactFlow's internal d3-drag handler.
    //
    // We also gate the FIRST event after registration with a small "ignore"
    // window so the very click that *opened* the popup (whose mousedown was
    // already stopped by the + button's stopImmediatePropagation) doesn't
    // also fire a phantom mousedown that closes it again.
    let activated = false
    const handler = (e: globalThis.MouseEvent) => {
      if (!activated) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current()
      }
    }
    document.addEventListener('mousedown', handler, true)
    // Activate on the next animation frame so the click that opened us has
    // already finished propagating.
    const raf = requestAnimationFrame(() => {
      activated = true
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handler, true)
    }
  }, [open])

  // Block raw DOM events so ReactFlow doesn't treat the popup as a node click
  const swallow = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation?.()
  }

  if (!open) return null

  // Portal to <body> so the popup is NOT inside the ReactFlow transform tree.
  // When a `position: fixed` element is rendered inside an ancestor with
  // `transform` (ReactFlow applies a translate+scale to every node), browsers
  // silently turn `fixed` into `relative` to the transformed parent, which
  // pushes the popup away from where we want it.
  if (typeof document === 'undefined') return null

  const popup = (
    <div
      ref={ref}
      onMouseDown={swallow}
      onClick={swallow}
      onPointerDown={swallow}
      className="fixed z-[1000] w-56 bg-white rounded-lg border border-gray-200 shadow-xl py-1 max-h-[60vh] overflow-y-auto"
      style={{ left: position.x, top: position.y }}
    >
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
        添加节点
      </div>
      {BLOCK_OPTIONS.map((opt) => (
        <button
          key={opt.type}
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation?.()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation?.()
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation?.()
            onSelect(opt.type)
          }}
          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 mt-0.5" style={{ backgroundColor: opt.color + '18', color: opt.color }}>
            {opt.icon}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-700">{opt.label}</div>
            <div className="text-xs text-gray-400 truncate">{opt.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )

  return createPortal(popup, document.body)
})

/* ─── Node content components ─── */
const StartContent: FC<{ data: CommonNodeType }> = memo(() => (
  <div className="text-[11px] text-gray-400 text-center">工作流的起点</div>
))

const EndContent: FC<{ data: CommonNodeType }> = memo(() => (
  <div className="text-[11px] text-gray-400 text-center">工作流的终点</div>
))

const HttpContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const method = (d.method as string) || 'GET'
  const url = (d.url as string) || ''
  const methodColors: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-orange-100 text-orange-700',
    DELETE: 'bg-red-100 text-red-700',
    PATCH: 'bg-purple-100 text-purple-700',
  }
  return (
    <div className="space-y-1.5">
      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${methodColors[method] || 'bg-gray-100 text-gray-600'}`}>
        {method}
      </span>
      <div className="text-xs text-gray-500 truncate max-w-[180px]" title={url}>
        {url || <span className="text-gray-300 italic">未配置 URL</span>}
      </div>
    </div>
  )
})

const ConditionContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const expr = (d.expression as string) || ''
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-green-400" title="True 分支" />
        <span className="text-[10px] text-gray-400">IF</span>
        <span className="inline-block w-2 h-2 rounded-full bg-red-400" title="False 分支" />
        <span className="text-[10px] text-gray-400">ELSE</span>
      </div>
      <div className="text-xs text-gray-500 truncate max-w-[180px]" title={expr}>
        {expr || <span className="text-gray-300 italic">未配置条件</span>}
      </div>
    </div>
  )
})

const DelayContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const duration = (d.duration as number) || 0
  return <div className="text-xs text-gray-500 font-mono">{duration}ms</div>
})

const LogContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const level = (d.level as string) || 'info'
  const msg = (d.message as string) || ''
  const lc: Record<string, string> = {
    info: 'bg-blue-100 text-blue-700',
    warn: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
  }
  return (
    <div className="space-y-1.5">
      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${lc[level] || lc.info}`}>
        {level.toUpperCase()}
      </span>
      {msg && <div className="text-xs text-gray-500 truncate max-w-[180px]">{msg}</div>}
    </div>
  )
})

const IterationContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const iter = (d.iteratorInput as string) || ''
  const par = (d.parallelism as number) || 1
  const out = (d.outputVarName as string) || 'item'
  return (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="inline-block text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">ARRAY</span>
        <code className="font-mono text-[10px] text-gray-600 truncate max-w-[140px]" title={iter}>{iter || '未配置'}</code>
      </div>
      <div className="text-[10px] text-gray-400 flex items-center gap-2">
        <span>→ {out}</span>
        {par > 1 && <span className="text-emerald-600">×{par} 并行</span>}
      </div>
    </div>
  )
})

const ParallelContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const n = Math.max(1, Math.min(8, Number(d.branchCount ?? 2)))
  const labels = (Array.isArray(d.branchLabels) ? d.branchLabels : []) as string[]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="inline-block text-[9px] font-bold px-1 py-0.5 rounded bg-rose-100 text-rose-700">FORK</span>
        <span className="text-[10px] text-gray-500">{n} 个分支</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: n }).map((_, i) => (
          <span key={i} className="text-[9px] text-gray-500 bg-rose-50 border border-rose-200 rounded px-1 py-0.5">
            {labels[i] || `分支 ${i + 1}`}
          </span>
        ))}
      </div>
    </div>
  )
})

const CodeContent: FC<{ data: CommonNodeType }> = memo(({ data }) => {
  const d = data as Record<string, unknown>
  const lang = ((d.language as string) || 'javascript').toUpperCase()
  const code = ((d.code as string) || '').split('\n').slice(0, 2).join('\n')
  const lc: Record<string, string> = {
    JAVASCRIPT: 'bg-yellow-100 text-yellow-700',
    TYPESCRIPT: 'bg-blue-100 text-blue-700',
    PYTHON: 'bg-green-100 text-green-700',
  }
  return (
    <div className="space-y-1">
      <span className={`inline-block text-[9px] font-bold px-1 py-0.5 rounded ${lc[lang] || lc.JAVASCRIPT}`}>{lang}</span>
      <pre className="text-[10px] text-gray-500 font-mono bg-gray-50 border border-gray-100 rounded px-1.5 py-1 max-w-[180px] overflow-hidden truncate" title={d.code as string}>
        {code || '// 点击编辑代码'}
      </pre>
    </div>
  )
})

const NodeContentMap: Record<string, FC<{ data: CommonNodeType }>> = {
  [BE.Start]: StartContent,
  [BE.End]: EndContent,
  [BE.HttpRequest]: HttpContent,
  [BE.IfElse]: ConditionContent,
  [BE.Delay]: DelayContent,
  [BE.Log]: LogContent,
  [BE.Iteration]: IterationContent,
  [BE.Parallel]: ParallelContent,
  [BE.Code]: CodeContent,
}

/* ─── CustomNode — main Dify-style node ─── */
const CustomNode = (props: NodeProps<AppNode>) => {
  const { id, data, selected } = props
  const blockType = data.type as BlockEnum
  const colors = BLOCK_COLORS[blockType] || BLOCK_COLORS[BE.Start]
  const icon = BLOCK_ICONS[blockType] || '?'
  const label = BLOCK_LABELS[blockType] || blockType
  const Content = NodeContentMap[blockType]

  const isStart = blockType === BE.Start
  const isEnd = blockType === BE.End
  const isCondition = blockType === BE.IfElse
  const isNote = blockType === BE.Note
  const isIteration = blockType === BE.Iteration
  const isParallel = blockType === BE.Parallel
  const isMultiSource = isCondition || isIteration || isParallel

  // BlockSelector state — triggered by hovering the + button
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorPos, setSelectorPos] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)
  const hideTimer = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rf = useReactFlow()
  const addNode = useWorkflowStore((s) => s.addNode)
  const addEdge = useWorkflowStore((s) => s.addEdge)

  // Hover detection: keep `hovering=true` for a short grace period after the
  // pointer leaves the wrapper so the user has time to move the cursor onto
  // the (slightly offset) + button without it disappearing mid-flight.
  const onWrapEnter = () => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    setHovering(true)
  }
  const onWrapLeave = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setHovering(false), 300)
  }
  // When selector opens, force keep the button visible
  useEffect(() => {
    if (selectorOpen) {
      setHovering(true)
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
    }
    return () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [selectorOpen])

  if (isNote) return null // Handled by NoteNode

  // Status border
  const isDisabled = !!data._isDisabled
  const isLocked = !!data._locked
  const statusRing =
    data._runningStatus === NodeRunningStatus.Running ? 'ring-2 ring-blue-400 border-blue-400' :
    data._runningStatus === NodeRunningStatus.Succeeded ? 'ring-2 ring-green-300 border-green-300 opacity-75' :
    data._runningStatus === NodeRunningStatus.Failed ? 'ring-2 ring-red-400 border-red-400' :
    selected ? 'ring-2 ring-blue-300 border-blue-400' :
    'border-gray-200'

  const openSelector = (e: React.MouseEvent) => {
    // Block all DOM events so ReactFlow doesn't treat this as a node click / drag
    e.stopPropagation()
    e.preventDefault()
    e.nativeEvent.stopImmediatePropagation?.()
    const btn = e.currentTarget as HTMLElement | null
    if (!btn) return
    // Read the rect immediately (synchronous, before React commits) and again
    // on the next frame. The first read gives us the click-time position; the
    // rAF read is a safety net in case any animation or layout shift happened
    // between the click and React's commit phase.
    const compute = () => {
      const br = btn.getBoundingClientRect()
      const POPUP_W = 224
      const POPUP_H = 240
      const margin = 6
      let x = br.right + margin
      if (x + POPUP_W > window.innerWidth - margin) {
        x = br.left - POPUP_W - margin
        if (x < margin) x = margin
      }
      let y = br.top - 8
      y = Math.max(margin, Math.min(y, window.innerHeight - POPUP_H - margin))
      setSelectorPos({ x, y })
      setSelectorOpen(true)
    }
    compute()
    rafRef.current = requestAnimationFrame(compute)
  }

  const handleSelectorPick = (type: BlockEnum) => {
    setSelectorOpen(false)
    if (!wrapperRef.current) return
    // Insert the new node 220px to the right, in flow coordinates
    const r = wrapperRef.current.getBoundingClientRect()
    const flow = rf.screenToFlowPosition({ x: r.right + 220, y: r.top + r.height / 2 })
    const newId = addNode(type, flow)
    // Auto-connect from this node's main source handle
    if (newId && !isEnd) {
      const sourceHandle = isCondition ? 'true' : isIteration ? 'loop' : isParallel ? 'branch-0' : 'source'
      addEdge(id, newId, undefined, sourceHandle)
    }
    // Push history
    useWorkflowStore.getState().pushHistory(`添加 ${BLOCK_LABELS[type] ?? type}`)
  }

  return (
    <div
      className="relative group"
      ref={wrapperRef}
      onMouseEnter={onWrapEnter}
      onMouseLeave={onWrapLeave}
    >
      {/* Target Handle (left side, except Start) */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
        />
      )}

      {/* Node body */}
      <div
        className={cn(
          'relative bg-white rounded-xl border shadow-sm transition-all duration-200 min-w-[220px]',
          statusRing,
          selected && 'shadow-md',
          data._runningStatus === NodeRunningStatus.Running && 'shadow-blue-100',
          isDisabled && 'opacity-50 grayscale',
          isLocked && 'cursor-not-allowed',
        )}
        title={isDisabled ? '节点已禁用，模拟时将跳过' : isLocked ? '节点已锁定（不可拖动）' : undefined}
        draggable={!isLocked}
      >
        {/* Disabled badge */}
        {isDisabled && (
          <div className="absolute -top-2.5 left-3 z-10 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gray-700 text-white shadow-sm flex items-center gap-1">
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4.5 4.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            已禁用
          </div>
        )}

        {/* Locked badge */}
        {isLocked && !isDisabled && (
          <div className="absolute -top-2.5 right-3 z-10 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500 text-white shadow-sm flex items-center gap-1" title="节点已锁定">
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity="0.3"/>
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
            </svg>
            锁定
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Type dot */}
          <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', colors.dot)} />
          {/* Title */}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-800 truncate" title={data.title}>
              {data.title || label}
            </div>
          </div>
          {/* Type badge */}
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0', colors.bg, colors.text)}>
            {icon} {label}
          </span>
          {/* Running status indicator */}
          {data._runningStatus === NodeRunningStatus.Running && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          )}
          {data._runningStatus === NodeRunningStatus.Succeeded && (
            <span className="text-green-500 text-xs shrink-0">✓</span>
          )}
          {data._runningStatus === NodeRunningStatus.Failed && (
            <span className="text-red-500 text-xs shrink-0">✕</span>
          )}
        </div>

        {/* Body */}
        {Content && (
          <div className="px-3 pb-3">
            <Content data={data} />
          </div>
        )}

        {/* Description */}
        {data.desc && (
          <div className="px-3 pb-2.5 text-[11px] text-gray-400 truncate border-t border-gray-50 pt-2">
            {data.desc}
          </div>
        )}
      </div>

      {/* Source Handle (right side, except End and multi-source) */}
      {!isEnd && !isMultiSource && (
        <Handle
          type="source"
          position={Position.Right}
          id="source"
        />
      )}

      {/* Condition node: two source handles (IF/ELSE) */}
      {isCondition && (
        <>
          {/* True branch - right side */}
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: '35%', backgroundColor: '#22c55e', boxShadow: '0 0 0 2px #22c55e' }}
          />
          {/* False branch - bottom side */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ backgroundColor: '#ef4444', boxShadow: '0 0 0 2px #ef4444' }}
          />
        </>
      )}

      {/* Iteration node: 2 source handles (loop body + done) */}
      {isIteration && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="loop"
            style={{ top: '35%', backgroundColor: '#10b981', boxShadow: '0 0 0 2px #10b981' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="done"
            style={{ backgroundColor: '#94a3b8', boxShadow: '0 0 0 2px #94a3b8' }}
          />
        </>
      )}

      {/* Parallel node: N source handles (1 per branch) on the right */}
      {isParallel && (() => {
        const d = data as Record<string, unknown>
        const n = Math.max(1, Math.min(8, Number(d.branchCount ?? 2)))
        const labels = (Array.isArray(d.branchLabels) ? d.branchLabels : []) as string[]
        const palette = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9']
        return Array.from({ length: n }).map((_, i) => {
          const color = palette[i % palette.length]
          const top = `${15 + (i * (70 / Math.max(1, n - 1)))}%`
          return (
            <Handle
              key={`branch-${i}`}
              type="source"
              position={Position.Right}
              id={`branch-${i}`}
              title={labels[i] || `分支 ${i + 1}`}
              style={{
                top,
                backgroundColor: color,
                boxShadow: `0 0 0 2px ${color}`,
              }}
            />
          )
        })
      })()}

      {/* Hover-triggered + button (Dify 风格) — except End node (no source) and disabled.
         *  The source handle sits at the vertical center of the node (top: 50%),
         *  so we place the + button at top-2 (well above the handle line) and
         *  to the LEFT of the right edge so it never overlaps the connection
         *  point. The button is 18×18 (smaller than before) and overlaps the
         *  node border by 3px for a snug, integrated look. */}
      {!isEnd && !isDisabled && !isLocked && (
        <button
          type="button"
          data-no-node-drag="true"
          onPointerDown={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation?.()
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation?.()
          }}
          onClick={(e) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation?.()
            openSelector(e)
          }}
          className={cn(
            'absolute top-2 right-2 w-[18px] h-[18px] rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow flex items-center justify-center transition-all z-30',
            hovering || selectorOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-75 pointer-events-none',
          )}
          onMouseEnter={onWrapEnter}
          onMouseLeave={onWrapLeave}
          title="在此节点后添加新节点"
          style={{ transitionProperty: 'opacity, transform, background-color' } as CSSProperties}
        >
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </button>
      )}

      <BlockSelectorPopup
        open={selectorOpen}
        position={selectorPos}
        onSelect={handleSelectorPick}
        onClose={() => setSelectorOpen(false)}
      />
    </div>
  )
}

CustomNode.displayName = 'CustomNode'
export default memo(CustomNode)

export { BLOCK_COLORS, BLOCK_ICONS, BLOCK_LABELS, BlockSelectorPopup }
