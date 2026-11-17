import { memo, useCallback, useRef, useState, useEffect } from 'react'
import { useWorkflowStore, selectSelectedNode } from '../store/workflowStore'
import { BlockEnum } from '../types/workflow'
import type { CommonNodeType } from '../types/workflow'
import { cn } from '../utils/cn'
import { VariableReferencePicker } from './VariableReferencePicker'
import { TestNodePanel } from './TestNodePanel'

export const PropertyPanel = memo(function PropertyPanel() {
  const node = useWorkflowStore(selectSelectedNode)
  const selectedIds = useWorkflowStore((s) => s.selectedNodeIds)
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
  const removeNode = useWorkflowStore((s) => s.removeNode)
  const removeNodes = useWorkflowStore((s) => s.removeNodes)
  const selectNode = useWorkflowStore((s) => s.selectNode)

  const data = node?.data

  // Multi-selection banner
  if (selectedIds.length > 1) {
    return (
      <aside className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">多选</div>
            <div className="text-xs text-gray-400 mt-0.5">已选中 {selectedIds.length} 个节点</div>
          </div>
          <button
            onClick={() => selectNode(null)}
            className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            title="取消选择"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <button
            onClick={() => removeNodes(selectedIds)}
            className="w-full flex items-center justify-center gap-1.5 h-8 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2.5A.5.5 0 0 1 6.5 2h3a.5.5 0 0 1 .5.5V4M5 4l.5 9a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            删除所选 {selectedIds.length} 个节点
          </button>
          <p className="text-[11px] text-gray-400 leading-relaxed mt-3">
            <span className="font-medium text-gray-500">快捷键：</span><br />
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">Ctrl/Cmd</kbd> +
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">C</kbd> 复制 ·
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">V</kbd> 粘贴 ·
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">D</kbd> 复制副本<br />
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">Del</kbd> 删除 ·
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">A</kbd> 全选 ·
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">↑↓←→</kbd> 移动 ·
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">Shift</kbd> 多选<br />
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px]">Space</kbd> 拖动画布
          </p>
        </div>
      </aside>
    )
  }

  if (!node || !data) {
    return (
      <aside className="w-72 shrink-0 border-l border-gray-200 bg-gray-50/50 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8" strokeLinecap="round"/></svg>
          </div>
          <p className="text-xs text-gray-400">选择一个节点</p>
          <p className="text-xs text-gray-300 mt-1">在右侧编辑节点配置</p>
          <p className="text-[10px] text-gray-300 mt-4 leading-relaxed">
            <kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono">Ctrl+A</kbd> 全选<br />
            <kbd className="px-1 py-0.5 rounded bg-gray-100 font-mono">Space</kbd> 拖动画布
          </p>
        </div>
      </aside>
    )
  }

  const blockType = data.type as BlockEnum
  const isNote = blockType === BlockEnum.Note
  const label = data.title || blockType

  return (
    <aside className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h2 className="text-sm font-semibold text-gray-700">节点配置</h2>
        </div>
        {!isNote && (
          <button
            onClick={() => removeNode(node.id)}
            className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Single-node test runner (Dify-style "Run this node") */}
        <TestNodePanel nodeId={node.id} nodeTitle={data.title || label} />

        {/* Basic info */}
        <ConfigSection title="基本信息">
          <ConfigField label="名称">
            <input
              type="text"
              value={data.title || ''}
              onChange={(e) => updateNodeData(node.id, { title: e.target.value })}
              className="config-input"
              placeholder="节点名称"
            />
          </ConfigField>
          <ConfigField label="描述">
            <input
              type="text"
              value={data.desc || ''}
              onChange={(e) => updateNodeData(node.id, { desc: e.target.value })}
              className="config-input"
              placeholder="简短描述（标题下方）"
            />
          </ConfigField>
        </ConfigSection>

        {/* Advanced (notes + enabled toggle) */}
        {!isNote && (
          <ConfigSection title="高级">
            <ConfigField label="备注 / 说明">
              <textarea
                value={(data as Record<string, unknown>).note as string || ''}
                onChange={(e) => updateNodeData(node.id, { note: e.target.value } as Partial<CommonNodeType>)}
                className="config-textarea min-h-[72px] resize-none"
                placeholder="写一些只给你自己看的备注（仅保存在本节点）"
              />
            </ConfigField>
            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-[12px] font-medium text-gray-700">启用此节点</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {data._isDisabled ? '已禁用，模拟时将跳过' : '运行时会正常执行'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => useWorkflowStore.getState().toggleNodeDisabled(node.id)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                  !data._isDisabled ? 'bg-blue-500' : 'bg-gray-300',
                )}
                role="switch"
                aria-checked={!data._isDisabled}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                    !data._isDisabled ? 'translate-x-[18px]' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </ConfigSection>
        )}

        {/* Type-specific config */}
        {blockType === BlockEnum.HttpRequest && (
          <HttpProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.IfElse && (
          <ConditionProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.Delay && (
          <DelayProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.Log && (
          <LogProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.Note && (
          <NoteProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.Iteration && (
          <IterationProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.Parallel && (
          <ParallelProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {blockType === BlockEnum.Code && (
          <CodeProperties data={data} nodeId={node.id} onUpdate={updateNodeData} />
        )}
        {(blockType === BlockEnum.Start || blockType === BlockEnum.End) && (
          <div className="text-xs text-gray-400 italic text-center py-4">
            此节点无需额外配置
          </div>
        )}
      </div>
    </aside>
  )
})

/* ─── Sub-components ─── */

const ConfigSection = memo(function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
})

const ConfigField = memo(function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
})

/* ─── HTTP ─── */
const HttpProperties = memo(function HttpProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>
  const set = useCallback((partial: Record<string, unknown>) => onUpdate(nodeId, partial), [nodeId, onUpdate])

  return (
    <ConfigSection title="HTTP 配置">
      <ConfigField label="请求方法">
        <select
          value={d.method as string || 'GET'}
          onChange={(e) => set({ method: e.target.value })}
          className="config-input"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </ConfigField>
      <ConfigField label="URL">
        <VarInput
          value={d.url as string || ''}
          onChange={(v) => set({ url: v })}
          placeholder="https://api.example.com/endpoint  (输入 / 插入变量)"
          mono
        />
      </ConfigField>
      <ConfigField label="Headers (JSON)">
        <VarInput
          multiline
          rows={3}
          value={d.headers as string || ''}
          onChange={(v) => set({ headers: v })}
          placeholder='{"Content-Type": "application/json"}'
        />
      </ConfigField>
      <ConfigField label="请求体">
        <VarInput
          multiline
          rows={3}
          value={d.body as string || ''}
          onChange={(v) => set({ body: v })}
          placeholder='{"key": "value"}'
        />
      </ConfigField>
      <ConfigField label={`超时: ${d.timeout || 5000}ms`}>
        <input
          type="range" min={500} max={30000} step={100}
          value={d.timeout as number || 5000}
          onChange={(e) => set({ timeout: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </ConfigField>
    </ConfigSection>
  )
})

/* ─── Condition ─── */
const ConditionProperties = memo(function ConditionProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>
  const set = useCallback((partial: Record<string, unknown>) => onUpdate(nodeId, partial), [nodeId, onUpdate])

  return (
    <ConfigSection title="条件配置">
      <ConfigField label="条件表达式">
        <VarInput
          multiline
          rows={4}
          value={d.expression as string || ''}
          onChange={(v) => set({ expression: v })}
          placeholder="response.status === 200   (输入 / 插入变量)"
          mono
        />
      </ConfigField>
      <div className="flex gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          True → 右侧
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          False → 下方
        </span>
      </div>
    </ConfigSection>
  )
})

/* ─── Delay ─── */
const DelayProperties = memo(function DelayProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>

  return (
    <ConfigSection title="延迟配置">
      <ConfigField label={`延迟时长: ${d.duration || 0}ms`}>
        <input
          type="range" min={0} max={10000} step={100}
          value={d.duration as number || 0}
          onChange={(e) => onUpdate(nodeId, { duration: Number(e.target.value) })}
          className="w-full accent-purple-500"
        />
      </ConfigField>
      <ConfigField label="精确值">
        <input
          type="number"
          value={d.duration as number || 0}
          onChange={(e) => onUpdate(nodeId, { duration: Number(e.target.value) })}
          className="config-input font-mono"
          min={0}
          max={60000}
        />
      </ConfigField>
    </ConfigSection>
  )
})

/* ─── Log ─── */
const LogProperties = memo(function LogProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>

  return (
    <ConfigSection title="日志配置">
      <ConfigField label="日志级别">
        <select
          value={d.level as string || 'info'}
          onChange={(e) => onUpdate(nodeId, { level: e.target.value })}
          className="config-input"
        >
          <option value="info">INFO</option>
          <option value="warn">WARN</option>
          <option value="error">ERROR</option>
        </select>
      </ConfigField>
      <ConfigField label="日志内容">
        <textarea
          value={d.message as string || ''}
          onChange={(e) => onUpdate(nodeId, { message: e.target.value })}
          rows={3}
          className="config-textarea"
          placeholder="请输入日志内容"
        />
      </ConfigField>
    </ConfigSection>
  )
})

/* ─── Note ─── */
const NoteProperties = memo(function NoteProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>

  return (
    <ConfigSection title="便签配置">
      <ConfigField label="内容">
        <VarInput
          multiline
          rows={4}
          value={d.text as string || ''}
          onChange={(v) => onUpdate(nodeId, { text: v })}
        />
      </ConfigField>
      <ConfigField label="主题色">
        <div className="flex gap-1.5 flex-wrap">
          {['yellow', 'blue', 'cyan', 'green', 'pink', 'violet'].map((t) => {
            const colorMap: Record<string, string> = {
              yellow: 'bg-yellow-400', blue: 'bg-blue-400', cyan: 'bg-cyan-400',
              green: 'bg-green-400', pink: 'bg-pink-400', violet: 'bg-violet-400',
            }
            return (
              <button
                key={t}
                onClick={() => onUpdate(nodeId, { theme: t })}
                className={cn(
                  'w-6 h-6 rounded-full border-2 transition-all',
                  colorMap[t] || 'bg-gray-400',
                  d.theme === t ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105',
                )}
                title={t}
              />
            )
          })}
        </div>
      </ConfigField>
      <ConfigField label="作者">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={!!d.showAuthor}
              onChange={(e) => onUpdate(nodeId, { showAuthor: e.target.checked })}
              className="rounded accent-blue-500"
            />
            显示作者
          </label>
          {!!d.showAuthor && (
            <input
              type="text"
              value={d.author as string || ''}
              onChange={(e) => onUpdate(nodeId, { author: e.target.value })}
              className="config-input flex-1"
              placeholder="作者名"
            />
          )}
        </div>
      </ConfigField>
    </ConfigSection>
  )
})

/* ─── Variable-aware input (with / trigger) ─── */
type VarInputProps = {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  mono?: boolean
  className?: string
}

const VarInput = memo(function VarInput({ value, onChange, placeholder, multiline, rows, mono, className }: VarInputProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null)

  const updateAnchor = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setAnchor({ left: r.left, top: r.top, bottom: r.bottom })
  }

  useEffect(() => {
    if (value.endsWith('/')) {
      updateAnchor()
      setPickerOpen(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handlePick = (ref: string) => {
    const stripped = value.endsWith('/') ? value.slice(0, -1) : value
    onChange(stripped + ref)
    setPickerOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === '/' && !pickerOpen) {
      e.preventDefault()
      onChange(value + '/')
    }
  }

  return (
    <>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? '输入 / 唤起变量选择器'}
          rows={rows ?? 3}
          className={cn('config-textarea', mono && 'font-mono', className)}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? '输入 / 唤起变量选择器'}
          className={cn('config-input', mono && 'font-mono', className)}
        />
      )}
      {pickerOpen && (
        <VariableReferencePicker
          anchor={anchor}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
})

/* ─── Iteration ─── */
const IterationProperties = memo(function IterationProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>
  return (
    <>
      <ConfigSection title="迭代配置">
        <ConfigField label="迭代输入 (数组)">
          <VarInput
            value={d.iteratorInput as string || ''}
            onChange={(v) => onUpdate(nodeId, { iteratorInput: v })}
            placeholder="{{#节点.字段#}}  (输入 / 唤起变量选择器)"
            mono
          />
        </ConfigField>
        <ConfigField label="每轮的输出变量名">
          <input
            type="text"
            value={d.outputVarName as string || 'item'}
            onChange={(e) => onUpdate(nodeId, { outputVarName: e.target.value })}
            className="config-input font-mono"
            placeholder="item"
          />
        </ConfigField>
        <ConfigField label={`并行度: ${d.parallelism || 1}  (1 = 顺序)`}>
          <input
            type="range" min={1} max={8} step={1}
            value={d.parallelism as number || 1}
            onChange={(e) => onUpdate(nodeId, { parallelism: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
        </ConfigField>
        <ConfigField label="退出条件 (可选)">
          <VarInput
            value={d.exitCondition as string || ''}
            onChange={(v) => onUpdate(nodeId, { exitCondition: v })}
            placeholder="e.g. index > 100"
            mono
          />
        </ConfigField>
      </ConfigSection>
      <ConfigSection title="说明">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          迭代节点会对输入数组中的每个元素执行一次子流程（loop 输出），
          全部完成后从 done 输出。可用输出变量：<br />
          <code className="text-emerald-600">{`{{#${data.title || '节点'}.item#}}`}</code> 当前元素 ·
          <code className="text-emerald-600">{`{{#${data.title || '节点'}.output#}}`}</code> 聚合输出
        </p>
      </ConfigSection>
    </>
  )
})

/* ─── Parallel ─── */
const ParallelProperties = memo(function ParallelProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>
  const count = Math.max(1, Math.min(8, Number(d.branchCount ?? 2)))
  const labels: string[] = Array.isArray(d.branchLabels) ? (d.branchLabels as string[]) : []

  const updateCount = (next: number) => {
    const clamped = Math.max(1, Math.min(8, next))
    const nextLabels = Array.from({ length: clamped }, (_, i) => labels[i] || `分支 ${i + 1}`)
    onUpdate(nodeId, { branchCount: clamped, branchLabels: nextLabels })
  }

  const updateLabel = (i: number, value: string) => {
    const nextLabels = Array.from({ length: count }, (_, idx) => (idx === i ? value : labels[idx] || `分支 ${idx + 1}`))
    onUpdate(nodeId, { branchLabels: nextLabels })
  }

  return (
    <ConfigSection title="并行配置">
      <ConfigField label={`分支数: ${count}  (1-8)`}>
        <input
          type="range" min={1} max={8} step={1}
          value={count}
          onChange={(e) => updateCount(Number(e.target.value))}
          className="w-full accent-rose-500"
        />
      </ConfigField>
      <ConfigField label="分支名称">
        <div className="space-y-1.5">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-rose-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <input
                type="text"
                value={labels[i] || `分支 ${i + 1}`}
                onChange={(e) => updateLabel(i, e.target.value)}
                className="config-input flex-1"
              />
            </div>
          ))}
        </div>
      </ConfigField>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-medium text-gray-700">等待所有分支</div>
          <div className="text-[11px] text-gray-400 mt-0.5">关闭后任意分支完成即继续</div>
        </div>
        <button
          type="button"
          onClick={() => onUpdate(nodeId, { waitForAll: !d.waitForAll })}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
            d.waitForAll !== false ? 'bg-rose-500' : 'bg-gray-300',
          )}
          role="switch"
          aria-checked={d.waitForAll !== false}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              d.waitForAll !== false ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
    </ConfigSection>
  )
})

/* ─── Code ─── */
const CodeProperties = memo(function CodeProperties({
  data, nodeId, onUpdate,
}: { data: CommonNodeType; nodeId: string; onUpdate: (id: string, d: Partial<CommonNodeType>) => void }) {
  const d = data as Record<string, unknown>
  const lang = (d.language as string) || 'javascript'
  const code = (d.code as string) || ''
  const ins: string[] = Array.isArray(d.inputVariables) ? (d.inputVariables as string[]) : []
  const schema = (d.outputSchema as string) || ''

  return (
    <>
      <ConfigSection title="代码配置">
        <ConfigField label="语言">
          <select
            value={lang}
            onChange={(e) => onUpdate(nodeId, { language: e.target.value })}
            className="config-input"
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
          </select>
        </ConfigField>
        <ConfigField label="输入变量 (逗号分隔)">
          <input
            type="text"
            value={ins.join(', ')}
            onChange={(e) => onUpdate(nodeId, { inputVariables: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            className="config-input font-mono"
            placeholder="items, user_id"
          />
        </ConfigField>
        <ConfigField label="代码">
          <textarea
            value={code}
            onChange={(e) => onUpdate(nodeId, { code: e.target.value })}
            rows={10}
            className="config-textarea font-mono text-[11px] leading-snug"
            placeholder={'// 入参在 inputs.xxx 中, 通过 return { result } 输出\nreturn { result: 42 };'}
          />
        </ConfigField>
        <ConfigField label="输出 Schema (JSON 描述, 可选)">
          <input
            type="text"
            value={schema}
            onChange={(e) => onUpdate(nodeId, { outputSchema: e.target.value })}
            className="config-input font-mono"
            placeholder='{"result": "number"}'
          />
        </ConfigField>
      </ConfigSection>
      <ConfigSection title="说明">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          在沙箱中执行选定的语言。代码可通过 <code className="text-sky-600">inputs</code> 访问入参，
          通过 <code className="text-sky-600">return {'{...}'}</code> 给出输出。结果会作为节点的 <code>{`{{#${data.title || '节点'}.result#}}`}</code> 暴露。
        </p>
      </ConfigSection>
    </>
  )
})
