import { type DragEvent, memo, useState, useMemo } from 'react'
import { BlockEnum, NODE_TYPE_META, BlockClassificationEnum } from '../types/workflow'
import { cn } from '../utils/cn'

export const Sidebar = memo(function Sidebar({
  collapsed: collapsedProp,
  onCollapsedChange,
}: {
  collapsed?: boolean
  onCollapsedChange?: (next: boolean) => void
} = {}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = collapsedProp ?? internalCollapsed
  const setCollapsed = (v: boolean | ((prev: boolean) => boolean)) => {
    onCollapsedChange?.(typeof v === 'function' ? v(collapsed) : v)
    if (collapsedProp === undefined) setInternalCollapsed(v)
  }
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'flow'>('all')

  const onDragStart = (event: DragEvent<HTMLDivElement>, blockType: BlockEnum) => {
    event.dataTransfer.setData('application/reactflow-type', blockType)
    event.dataTransfer.effectAllowed = 'move'
  }

  const categories = [
    { key: BlockClassificationEnum.Control, label: '流程控制', icon: '⚙' },
    { key: BlockClassificationEnum.Action, label: '动作节点', icon: '⚡' },
    { key: BlockClassificationEnum.Logic, label: '逻辑节点', icon: '🔀' },
    { key: BlockClassificationEnum.Note, label: '辅助工具', icon: '📌' },
  ] as const

  const allNodes = Object.values(NODE_TYPE_META)

  // Tab filter: 'all' shows everything; 'flow' shows flow-control & logic nodes (iteration/parallel/code/if-else)
  const FLOW_TYPES: BlockEnum[] = [BlockEnum.Start, BlockEnum.End, BlockEnum.IfElse, BlockEnum.Iteration, BlockEnum.Parallel, BlockEnum.Code]
  const tabScoped = useMemo(() => {
    if (tab === 'flow') return allNodes.filter((m) => FLOW_TYPES.includes(m.type))
    return allNodes
  }, [allNodes, tab])

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return tabScoped
    const q = search.toLowerCase()
    return tabScoped.filter(
      (m) => m.label.toLowerCase().includes(q) || m.type.toLowerCase().includes(q),
    )
  }, [search, tabScoped])

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories
    return categories.filter((cat) =>
      filteredNodes.some((n) => n.category === cat.key),
    )
  }, [search, filteredNodes, categories])

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col items-center py-3 gap-3">
        <button
          onClick={() => setCollapsed(false)}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
          title="展开节点库"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {allNodes.slice(0, 6).map((meta) => (
          <div
            key={meta.type}
            draggable
            onDragStart={(e) => onDragStart(e, meta.type)}
            className="w-7 h-7 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing text-sm hover:bg-white hover:shadow-sm transition-all"
            style={{ color: meta.color }}
            title={meta.label}
          >
            {meta.icon}
          </div>
        ))}
      </aside>
    )
  }

  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">节点库</h2>
          <button
            onClick={() => setCollapsed(true)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
        {/* Tabs: All / 流程控制 */}
        <div className="flex items-center bg-gray-100 rounded-md p-0.5 mb-2">
          {([
            { key: 'all', label: '全部' },
            { key: 'flow', label: '流程控制' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 h-6 text-[11px] font-medium rounded transition-colors',
                tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索节点..."
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-gray-50"
          />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filteredCategories.map((cat) => {
          const catNodes = filteredNodes.filter((m) => m.category === cat.key)
          if (catNodes.length === 0) return null
          return (
            <div key={cat.key} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400">
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </div>
              <div className="space-y-0.5 px-2">
                {catNodes.map((meta) => (
                  <div
                    key={meta.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, meta.type)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-md cursor-grab active:cursor-grabbing text-sm hover:bg-gray-50 transition-all group"
                  >
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: meta.color + '18', color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <span className="text-xs text-gray-600 group-hover:text-gray-900 transition-colors">{meta.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer tip */}
      <div className="p-3 border-t border-gray-100 bg-gray-50/50">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          拖拽节点到画布，或从节点右侧 <span className="text-blue-400 font-medium">+</span> 快速添加
        </p>
      </div>
    </aside>
  )
})
