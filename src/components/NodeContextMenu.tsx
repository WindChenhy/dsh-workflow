import { memo, useEffect, useRef } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { BlockEnum } from '../types/workflow'

export type ContextMenuState = {
  nodeId: string
  x: number
  y: number
} | null

type ContextMenuProps = {
  state: ContextMenuState
  onClose: () => void
}

type MenuItem = {
  key: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  divider?: boolean
  shortcut?: string
}

const Icon = {
  Copy: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Duplicate: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="6" y="6" width="8" height="8" rx="1.5" fill="white" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  ),
  Delete: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 4h10M6 4V2.5A.5.5 0 0 1 6.5 2h3a.5.5 0 0 1 .5.5V4M5 4l.5 9a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Disable: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4.5 4.5l7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Enable: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 8.5l2 2 4-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Rename: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 13l1-3L11 3l2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Note: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 6h6M5 9h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Bundle: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5"/>
      <rect x="5" y="7" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5"/>
    </svg>
  ),
  Tag: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h6l4 4-6 6-4-4V3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Lock: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
}

export const NodeContextMenu = memo(function NodeContextMenu({ state, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest onClose in a ref so the capture-phase listener below
  // can be installed ONCE (when `state` flips non-null) and not be torn down
  // on every parent re-render. Without this, `onClose={() => setContextMenu(null)}`
  // is a fresh function reference on every render, which would cause the
  // useEffect's dep array to invalidate repeatedly and the outside-click
  // listener to be removed+re-added on every render — a window during which
  // outside clicks silently no-op.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Read fresh values
  const node = useWorkflowStore((s) => s.nodes.find((n) => n.id === state?.nodeId))
  const copySelected = useWorkflowStore((s) => s.copySelected)
  const duplicateSelected = useWorkflowStore((s) => s.duplicateSelected)
  const removeNodes = useWorkflowStore((s) => s.removeNodes)
  const toggleNodeDisabled = useWorkflowStore((s) => s.toggleNodeDisabled)
  const selectNodes = useWorkflowStore((s) => s.selectNodes)
  const createBundle = useWorkflowStore((s) => s.createBundle)
  const addNode = useWorkflowStore((s) => s.addNode)
  const addEdge = useWorkflowStore((s) => s.addEdge)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)

  useEffect(() => {
    if (!state) return
    // We listen in the CAPTURE phase so we run BEFORE ReactFlow's internal
    // d3-drag handler. d3-drag calls `event.stopImmediatePropagation()` on
    // mousedown for any node, which would otherwise swallow the event and
    // prevent a default-phase document listener from ever firing.
    //
    // We also gate the FIRST event after registration with an animation
    // frame so the right-click that opened us (which dispatches mousedown →
    // mouseup → contextmenu) doesn't have a stray capture-phase mousedown
    // close us immediately after open.
    let activated = false
    const handler = (e: globalThis.MouseEvent) => {
      if (!activated) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current()
      }
    }
    const escHandler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('mousedown', handler, true)
    document.addEventListener('keydown', escHandler)
    const raf = requestAnimationFrame(() => {
      activated = true
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handler, true)
      document.removeEventListener('keydown', escHandler)
    }
  }, [state])

  if (!state || !node) return null

  const isNote = node.data.type === BlockEnum.Note
  const isDisabled = !!node.data._isDisabled
  const isUndeletable = node.data.type === BlockEnum.Start || node.data.type === BlockEnum.End

  // Adjust position to keep menu in viewport
  const MENU_W = 220
  const MENU_H = 280
  const x = Math.min(state.x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - MENU_W - 8)
  const y = Math.min(state.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - MENU_H - 8)

  const handleRename = () => {
    const next = window.prompt('重命名节点', node.data.title)
    if (next && next.trim()) {
      useWorkflowStore.getState().updateNodeData(node.id, { title: next.trim() })
    }
    onClose()
  }

  const handleAddNote = () => {
    const noteId = addNode(BlockEnum.Note, { x: node.position.x + 40, y: node.position.y + 80 })
    onClose()
    // No edge, just a floating note
    void noteId
  }

  const handleInsertAfter = (blockType: BlockEnum) => {
    const newId = addNode(blockType, { x: node.position.x + 280, y: node.position.y })
    addEdge(node.id, newId, undefined, 'source', 'target')
    selectNodes([newId])
    onClose()
  }

  const items: MenuItem[] = [
    { key: 'rename', label: '重命名', icon: <Icon.Rename />, onClick: handleRename },
    { key: 'duplicate', label: '复制节点', icon: <Icon.Duplicate />, onClick: () => { selectNodes([node.id]); duplicateSelected(); onClose() }, shortcut: 'Ctrl+D' },
    { key: 'copy', label: '复制到剪贴板', icon: <Icon.Copy />, onClick: () => { selectNodes([node.id]); copySelected(); onClose() }, shortcut: 'Ctrl+C' },
    { key: 'divider1', label: '', divider: true, onClick: () => {} },
    isDisabled
      ? { key: 'enable', label: '启用节点', icon: <Icon.Enable />, onClick: () => { toggleNodeDisabled(node.id); onClose() } }
      : { key: 'disable', label: '禁用节点', icon: <Icon.Disable />, onClick: () => { toggleNodeDisabled(node.id); onClose() } },
    { key: 'note', label: '插入便签', icon: <Icon.Note />, onClick: handleAddNote },
    {
      key: 'bundle',
      label: '将所选节点加入分组',
      icon: <Icon.Bundle />,
      onClick: () => {
        const ids = useWorkflowStore.getState().selectedNodeIds
        if (ids.length >= 2) createBundle(ids)
        else { selectNodes([node.id]); createBundle([node.id, node.id]) } // fallback: pair with self
        onClose()
      },
      disabled: false,
    },
    {
      key: 'lock',
      label: (node.data as Record<string, unknown>)._locked ? '解锁节点' : '锁定节点',
      icon: <Icon.Lock />,
      onClick: () => { updateNodeData(node.id, { _locked: !(node.data as Record<string, unknown>)._locked } as Partial<typeof node.data>); onClose() },
    },
    { key: 'divider2', label: '', divider: true, onClick: () => {} },
    {
      key: 'delete',
      label: isUndeletable ? '禁止删除（开始/结束节点）' : '删除节点',
      icon: <Icon.Delete />,
      onClick: () => { removeNodes([node.id]); onClose() },
      danger: true,
      disabled: isUndeletable,
      shortcut: 'Del',
    },
  ]

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 w-56 bg-white rounded-lg border border-gray-200 shadow-xl py-1 animate-in fade-in"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
        {node.data.title || '节点'} · 节点操作
      </div>
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.key} className="my-1 h-px bg-gray-100" />
        }
        return (
          <button
            key={item.key}
            disabled={item.disabled}
            onClick={item.onClick}
            className={[
              'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
              item.disabled
                ? 'text-gray-300 cursor-not-allowed'
                : item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-gray-400 font-mono">{item.shortcut}</span>
            )}
          </button>
        )
      })}
      {!isNote && (
        <>
          <div className="my-1 h-px bg-gray-100" />
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            在此节点之后插入
          </div>
          {[
            { type: BlockEnum.HttpRequest, label: 'HTTP 请求', color: '#3b82f6' },
            { type: BlockEnum.IfElse, label: '条件判断', color: '#06b6d4' },
            { type: BlockEnum.Delay, label: '延迟', color: '#8b5cf6' },
            { type: BlockEnum.Log, label: '日志输出', color: '#64748b' },
          ].map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleInsertAfter(opt.type)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
              <span className="flex-1">{opt.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
})
