import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { NODE_OUTPUT_DEFAULTS, VARIABLE_TYPE_COLORS, VARIABLE_TYPE_LABELS, VariableType, type NodeOutputVar } from '../types/variable'
import { cn } from '../utils/cn'

export type PickerRef = { id: string; text: string } | null

type PickerProps = {
  /** Anchor rect for the trigger element (input) */
  anchor: { left: number; top: number; bottom: number } | null
  /** Called with the inserted reference. */
  onPick: (ref: string) => void
  onClose: () => void
}

type PickerEntry =
  | { kind: 'env'; id: string; name: string; type: VariableType; description?: string; defaultValue?: string }
  | { kind: 'system'; name: string; type: VariableType; description: string }
  | { kind: 'node'; nodeId: string; nodeTitle: string; var: NodeOutputVar }

export const VariableReferencePicker = memo(function VariableReferencePicker({ anchor, onPick, onClose }: PickerProps) {
  const envVariables = useWorkflowStore((s) => s.envVariables)
  const nodes = useWorkflowStore((s) => s.nodes)
  const ref = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [highlight, setHighlight] = useState(0)

  const entries: PickerEntry[] = useMemo(() => {
    const out: PickerEntry[] = []
    envVariables.forEach((v) => out.push({ kind: 'env', ...v }))
    out.push({ kind: 'system', name: 'sys.query', type: VariableType.String, description: '用户输入' })
    out.push({ kind: 'system', name: 'sys.user_id', type: VariableType.String, description: '用户标识' })
    out.push({ kind: 'system', name: 'sys.timestamp', type: VariableType.Number, description: '当前时间戳' })
    for (const n of nodes) {
      const defs = NODE_OUTPUT_DEFAULTS[String(n.data.type)] ?? []
      for (const v of defs) {
        out.push({ kind: 'node', nodeId: n.id, nodeTitle: n.data.title || '节点', var: v })
      }
    }
    return out
  }, [envVariables, nodes])

  const filtered = useMemo(() => {
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter((e) => {
      if (e.kind === 'env') return e.name.toLowerCase().includes(q)
      if (e.kind === 'system') return e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
      return e.nodeTitle.toLowerCase().includes(q) || e.var.name.toLowerCase().includes(q) || (e.var.description ?? '').toLowerCase().includes(q)
    })
  }, [entries, search])

  // Reset highlight when filtered changes
  useEffect(() => setHighlight(0), [search])

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(filtered.length - 1, h + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(0, h - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[highlight]
        if (item) pick(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Click outside
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  function pick(e: PickerEntry) {
    if (e.kind === 'env') onPick(`{{env.${e.name}}}`)
    else if (e.kind === 'system') onPick(`{{${e.name}}}`)
    else onPick(`{{#${e.nodeTitle}.${e.var.name}#}}`)
  }

  if (!anchor) return null
  const style: React.CSSProperties = {
    position: 'fixed',
    left: anchor.left,
    // Open upward when near bottom of viewport
    top: anchor.bottom + 280 > (typeof window !== 'undefined' ? window.innerHeight : 800) ? anchor.top - 320 : anchor.bottom + 4,
  }

  return (
    <div
      ref={ref}
      className="z-50 w-80 bg-white rounded-lg border border-gray-200 shadow-2xl py-1 max-h-80 flex flex-col"
      style={style}
    >
      <div className="px-3 py-2 border-b border-gray-100">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索变量…"
          className="w-full text-[12px] px-2 py-1 rounded border border-gray-200 focus:border-blue-400 focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-gray-400">无匹配变量</div>
        ) : (
          filtered.map((e, i) => {
            const isHighlighted = i === highlight
            const label =
              e.kind === 'env' ? e.name :
              e.kind === 'system' ? e.name :
              `${e.nodeTitle}.${e.var.name}`
            const desc =
              e.kind === 'env' ? `环境变量 · ${e.type}` :
              e.kind === 'system' ? `系统 · ${e.description}` :
              `${e.nodeTitle} · ${e.var.description ?? e.var.name}`
            const type = e.kind === 'node' ? e.var.type : e.type
            return (
              <button
                key={`${e.kind}-${label}-${i}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(e)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors',
                  isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50',
                )}
              >
                <span className={cn('w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center shrink-0', VARIABLE_TYPE_COLORS[type].bg, VARIABLE_TYPE_COLORS[type].text)}>
                  {VARIABLE_TYPE_COLORS[type].icon}
                </span>
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-[11px] text-gray-700">{label}</code>
                  <div className="text-[10px] text-gray-400 truncate">{desc}</div>
                </div>
                {e.kind !== 'env' && e.kind !== 'system' && (
                  <span className="text-[9px] text-gray-400 shrink-0">{VARIABLE_TYPE_LABELS[type]}</span>
                )}
              </button>
            )
          })
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
        <span>↑↓ 选择 · Enter 插入</span>
        <span>{filtered.length} 个</span>
      </div>
    </div>
  )
})
