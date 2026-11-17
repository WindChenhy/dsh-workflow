import { memo, useState } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { VariableType, VARIABLE_TYPE_LABELS, VARIABLE_TYPE_COLORS } from '../types/variable'
import { cn } from '../utils/cn'

export const VariablePanel = memo(function VariablePanel() {
  const envVariables = useWorkflowStore((s) => s.envVariables)
  const addEnvVariable = useWorkflowStore((s) => s.addEnvVariable)
  const updateEnvVariable = useWorkflowStore((s) => s.updateEnvVariable)
  const removeEnvVariable = useWorkflowStore((s) => s.removeEnvVariable)
  const nodes = useWorkflowStore((s) => s.nodes)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-800">变量</div>
          <div className="text-[11px] text-gray-400 mt-0.5">在工作流中可引用的变量</div>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="新增环境变量"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Env Variables section */}
        <section>
          <header className="flex items-center justify-between mb-1.5">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">环境变量</h3>
            <span className="text-[10px] text-gray-400">{envVariables.length}</span>
          </header>
          {newOpen && (
            <NewEnvVarRow
              onSubmit={(name, type, def) => {
                addEnvVariable({ name, type, defaultValue: def })
                setNewOpen(false)
              }}
              onCancel={() => setNewOpen(false)}
            />
          )}
          {envVariables.length === 0 && !newOpen ? (
            <button
              onClick={() => setNewOpen(true)}
              className="w-full border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 text-gray-400 hover:text-blue-500 rounded-md py-3 text-[11px] transition-colors"
            >
              + 添加第一个环境变量
            </button>
          ) : (
            <ul className="space-y-1.5">
              {envVariables.map((v) => (
                <li
                  key={v.id}
                  className={cn(
                    'group rounded-md border bg-white px-2.5 py-1.5 transition-colors',
                    editingId === v.id ? 'border-blue-300' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  {editingId === v.id ? (
                    <EditRow
                      initial={v}
                      onSave={(patch) => { updateEnvVariable(v.id, patch); setEditingId(null) }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={cn('w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center shrink-0', VARIABLE_TYPE_COLORS[v.type].bg, VARIABLE_TYPE_COLORS[v.type].text)}>
                        {VARIABLE_TYPE_COLORS[v.type].icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-gray-800 truncate" title={v.name}>{v.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {VARIABLE_TYPE_LABELS[v.type]}{v.defaultValue ? ` · ${v.defaultValue}` : ''}
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                        <button
                          onClick={() => setEditingId(v.id)}
                          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded"
                          title="编辑"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 13l1-3L11 3l2 2-7 7-3 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={() => removeEnvVariable(v.id)}
                          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 rounded"
                          title="删除"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* System variables */}
        <section>
          <header className="flex items-center justify-between mb-1.5">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">系统变量</h3>
            <span className="text-[10px] text-gray-400">3</span>
          </header>
          <ul className="space-y-1.5">
            <SystemVarRow name="sys.query" type={VariableType.String} desc="用户的输入" />
            <SystemVarRow name="sys.user_id" type={VariableType.String} desc="用户标识" />
            <SystemVarRow name="sys.timestamp" type={VariableType.Number} desc="当前时间戳" />
          </ul>
        </section>

        {/* Node output variables */}
        <section>
          <header className="flex items-center justify-between mb-1.5">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">节点输出</h3>
            <span className="text-[10px] text-gray-400">{nodes.length}</span>
          </header>
          {nodes.length === 0 ? (
            <div className="text-[11px] text-gray-300 italic text-center py-2">画布上还没有节点</div>
          ) : (
            <ul className="space-y-1.5">
              {nodes.map((n) => {
                const outputs = getOutputsForNode(n)
                if (outputs.length === 0) return null
                const isCurrent = n.id === selectedNodeId
                return (
                  <li key={n.id} className={cn('rounded-md border bg-white', isCurrent ? 'border-blue-300' : 'border-gray-200')}>
                    <div className="px-2.5 py-1.5 border-b border-gray-100 flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-700 truncate">{n.data.title}</span>
                      <span className="text-[9px] text-gray-400 ml-auto">{n.data.type}</span>
                    </div>
                    <ul className="py-1">
                      {outputs.map((o) => (
                        <li key={o.name} className="flex items-center gap-2 px-2.5 py-0.5 text-[11px]">
                          <span className={cn('w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0', VARIABLE_TYPE_COLORS[o.type].bg, VARIABLE_TYPE_COLORS[o.type].text)}>
                            {VARIABLE_TYPE_COLORS[o.type].icon}
                          </span>
                          <code className="font-mono text-[10px] text-gray-600 truncate">
                            {`{{#${n.data.title}.${o.name}#}}`}
                          </code>
                          <span className="text-[10px] text-gray-400 ml-auto shrink-0">{o.description}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
})

/* ─── Sub-components ─── */

const SystemVarRow = memo(function SystemVarRow({ name, type, desc }: { name: string; type: VariableType; desc: string }) {
  return (
    <li className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 flex items-center gap-2">
      <span className={cn('w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center shrink-0', VARIABLE_TYPE_COLORS[type].bg, VARIABLE_TYPE_COLORS[type].text)}>
        {VARIABLE_TYPE_COLORS[type].icon}
      </span>
      <div className="min-w-0 flex-1">
        <code className="text-[11px] font-mono text-gray-700">{name}</code>
        <div className="text-[10px] text-gray-400">{desc}</div>
      </div>
    </li>
  )
})

const NewEnvVarRow = memo(function NewEnvVarRow({ onSubmit, onCancel }: { onSubmit: (name: string, type: VariableType, def: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<VariableType>(VariableType.String)
  const [def, setDef] = useState('')
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50/30 p-2 space-y-1.5 mb-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="变量名（如 apiKey）"
        className="w-full text-[12px] px-2 py-1 rounded border border-gray-200 focus:border-blue-400 focus:outline-none bg-white"
      />
      <div className="flex gap-1">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as VariableType)}
          className="text-[11px] px-1.5 py-1 rounded border border-gray-200 bg-white"
        >
          {Object.entries(VARIABLE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={def}
          onChange={(e) => setDef(e.target.value)}
          placeholder="默认值（可选）"
          className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded border border-gray-200 focus:border-blue-400 focus:outline-none bg-white"
        />
      </div>
      <div className="flex gap-1 justify-end">
        <button onClick={onCancel} className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-0.5 rounded">取消</button>
        <button
          onClick={() => name.trim() && onSubmit(name.trim(), type, def)}
          disabled={!name.trim()}
          className="text-[11px] bg-blue-500 text-white px-2 py-0.5 rounded disabled:opacity-50 hover:bg-blue-600"
        >保存</button>
      </div>
    </div>
  )
})

const EditRow = memo(function EditRow({ initial, onSave, onCancel }: { initial: { name: string; type: VariableType; defaultValue?: string }; onSave: (p: { name?: string; type?: VariableType; defaultValue?: string }) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial.name)
  const [type, setType] = useState(initial.type)
  const [def, setDef] = useState(initial.defaultValue ?? '')
  return (
    <div className="space-y-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-[12px] px-2 py-1 rounded border border-gray-200 focus:border-blue-400 focus:outline-none"
      />
      <div className="flex gap-1">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as VariableType)}
          className="text-[11px] px-1.5 py-1 rounded border border-gray-200"
        >
          {Object.entries(VARIABLE_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={def}
          onChange={(e) => setDef(e.target.value)}
          placeholder="默认值"
          className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded border border-gray-200"
        />
      </div>
      <div className="flex gap-1 justify-end">
        <button onClick={onCancel} className="text-[11px] text-gray-500 px-2 py-0.5 rounded hover:text-gray-700">取消</button>
        <button onClick={() => onSave({ name: name.trim() || initial.name, type, defaultValue: def })} className="text-[11px] bg-blue-500 text-white px-2 py-0.5 rounded hover:bg-blue-600">保存</button>
      </div>
    </div>
  )
})

/* ─── Default output variables per block type (mirrors types/variable NODE_OUTPUT_DEFAULTS) ─── */
import { NODE_OUTPUT_DEFAULTS } from '../types/variable'
import type { AppNode } from '../types/workflow'

function getOutputsForNode(n: AppNode) {
  const typeKey = String(n.data.type)
  return NODE_OUTPUT_DEFAULTS[typeKey] ?? []
}
