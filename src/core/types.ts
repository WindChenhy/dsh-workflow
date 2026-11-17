/**
 * Core workflow domain model.
 *
 * Pure TypeScript only: no DOM, no Node builtins, no React, no DSH runtime.
 * Shared by the Web editor and the DeepSeek Harness L5 plugin.
 *
 * NOTE: `erasableSyntaxOnly` is enabled in tsconfig. Enums are therefore
 * expressed as const objects plus union types (identical call sites:
 * `BlockEnum.Start`, `const x: BlockEnum = ...`).
 */

export const BlockEnum = {
  Start: 'start',
  End: 'end',
  HttpRequest: 'http-request',
  IfElse: 'if-else',
  Delay: 'delay',
  Log: 'log',
  Note: 'custom-note',
  Iteration: 'iteration',
  Parallel: 'parallel',
  Code: 'code',
} as const
export type BlockEnum = (typeof BlockEnum)[keyof typeof BlockEnum]

export const NodeRunningStatus = {
  NotStart: 'not-start',
  Running: 'running',
  Succeeded: 'succeeded',
  Failed: 'failed',
} as const
export type NodeRunningStatus = (typeof NodeRunningStatus)[keyof typeof NodeRunningStatus]

export const BlockClassificationEnum = {
  Control: 'control',
  Action: 'action',
  Logic: 'logic',
  Note: 'note',
} as const
export type BlockClassificationEnum =
  (typeof BlockClassificationEnum)[keyof typeof BlockClassificationEnum]

export const VariableType = {
  String: 'string',
  Number: 'number',
  Boolean: 'boolean',
  Object: 'object',
  Array: 'array',
} as const
export type VariableType = (typeof VariableType)[keyof typeof VariableType]

export type XYPosition = { x: number; y: number }

export type CommonNodeType<T = Record<string, unknown>> = {
  title: string
  desc: string
  type: BlockEnum
  width?: number
  height?: number
  selected?: boolean
  _runningStatus?: NodeRunningStatus
  _isCandidate?: boolean
  _isBundled?: boolean
  _isDisabled?: boolean
  _locked?: boolean
  _connectedSourceHandleIds?: string[]
  _connectedTargetHandleIds?: string[]
  _targetBranches?: { id: string; name: string }[]
  /** Editor callback; stripped from persisted/exported definitions. */
  _onAddNode?: (sourceId: string, type: BlockEnum, sourceHandle?: string) => void
} & T

export type WorkflowNode<T = Record<string, unknown>> = {
  id: string
  type: BlockEnum
  position: XYPosition
  data: CommonNodeType<T>
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
}

export type HttpRequestNodeType = CommonNodeType<{
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers: string
  body: string
  timeout: number
}>

export type ConditionNodeType = CommonNodeType<{
  expression: string
  trueBranchLabel?: string
  falseBranchLabel?: string
}>

export type DelayNodeType = CommonNodeType<{ duration: number }>

export type LogNodeType = CommonNodeType<{
  message: string
  level: 'info' | 'warn' | 'error'
}>

export type NoteNodeType = CommonNodeType<{
  text: string
  theme: 'blue' | 'cyan' | 'green' | 'yellow' | 'pink' | 'violet'
  author?: string
  showAuthor?: boolean
}>

export type IterationNodeType = CommonNodeType<{
  iteratorInput: string
  exitCondition?: string
  parallelism: number
  outputVarName: string
}>

export type ParallelNodeType = CommonNodeType<{
  branchCount: number
  waitForAll: boolean
  branchLabels: string[]
}>

export type CodeNodeType = CommonNodeType<{
  language: 'javascript' | 'python' | 'typescript'
  code: string
  inputVariables: string[]
  outputSchema: string
}>

export type WorkflowDefinition = {
  version: '1.0'
  name: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type ValidationError = {
  nodeId?: string
  edgeId?: string
  message: string
  severity: 'error' | 'warning'
}

export type SimulationState = {
  status: 'idle' | 'running' | 'completed' | 'error'
  mode: 'auto' | 'step' | null
  currentNodeId: string | null
  nodeResults: Record<string, SimulationNodeResult>
  error?: string
  executionOrder: string[]
  _runId?: string | null
}

export type SimulationNodeResult = {
  nodeId: string
  status: 'pending' | 'running' | 'success' | 'error'
  output?: string
  duration?: number
  timestamp?: number
}

export type NodeBundle = {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  nodeIds: string[]
  collapsed: boolean
  color: 'gray' | 'blue' | 'green' | 'orange' | 'violet'
  locked: boolean
  parentId: string | null
  padding: number
}

export type NodeDefault<T = Record<string, unknown>> = {
  classification: BlockClassificationEnum
  type: BlockEnum
  title: string
  description?: string
  isSingleton?: boolean
  isUndeletable?: boolean
  defaultData: T
}

export type NodeTypeMeta = {
  type: BlockEnum
  label: string
  category: BlockClassificationEnum
  color: string
  icon: string
}

export const NODE_DEFAULTS: Record<BlockEnum, NodeDefault> = {
  [BlockEnum.Start]: {
    classification: BlockClassificationEnum.Control,
    type: BlockEnum.Start,
    title: '开始',
    description: '流程开始节点',
    isSingleton: true,
    isUndeletable: true,
    defaultData: { title: '开始', desc: '', type: BlockEnum.Start },
  },
  [BlockEnum.End]: {
    classification: BlockClassificationEnum.Control,
    type: BlockEnum.End,
    title: '结束',
    description: '流程结束节点',
    isSingleton: true,
    isUndeletable: true,
    defaultData: { title: '结束', desc: '', type: BlockEnum.End },
  },
  [BlockEnum.HttpRequest]: {
    classification: BlockClassificationEnum.Action,
    type: BlockEnum.HttpRequest,
    title: 'HTTP 请求',
    description: '发送 HTTP 请求',
    defaultData: {
      title: 'HTTP 请求', desc: '', type: BlockEnum.HttpRequest,
      method: 'GET', url: '', headers: '', body: '', timeout: 5000,
    },
  },
  [BlockEnum.IfElse]: {
    classification: BlockClassificationEnum.Logic,
    type: BlockEnum.IfElse,
    title: '条件判断',
    description: '根据条件分支执行',
    defaultData: {
      title: '条件判断', desc: '', type: BlockEnum.IfElse,
      expression: '', trueBranchLabel: '真', falseBranchLabel: '假',
    },
  },
  [BlockEnum.Delay]: {
    classification: BlockClassificationEnum.Action,
    type: BlockEnum.Delay,
    title: '延迟',
    description: '等待指定时间',
    defaultData: { title: '延迟', desc: '', type: BlockEnum.Delay, duration: 1000 },
  },
  [BlockEnum.Log]: {
    classification: BlockClassificationEnum.Action,
    type: BlockEnum.Log,
    title: '日志输出',
    description: '输出日志信息',
    defaultData: { title: '日志输出', desc: '', type: BlockEnum.Log, message: '', level: 'info' },
  },
  [BlockEnum.Note]: {
    classification: BlockClassificationEnum.Note,
    type: BlockEnum.Note,
    title: '便签',
    description: '在画布上添加便签说明',
    defaultData: {
      title: '便签', desc: '', type: BlockEnum.Note,
      text: '在此输入说明文字...', theme: 'yellow', showAuthor: false,
    },
  },
  [BlockEnum.Iteration]: {
    classification: BlockClassificationEnum.Logic,
    type: BlockEnum.Iteration,
    title: '迭代',
    description: '对数组中的每个元素依次执行子流程',
    defaultData: {
      title: '迭代', desc: '遍历数组并对每个元素执行子流程', type: BlockEnum.Iteration,
      iteratorInput: '{{#start.query#}}', exitCondition: '', parallelism: 1, outputVarName: 'item',
    },
  },
  [BlockEnum.Parallel]: {
    classification: BlockClassificationEnum.Logic,
    type: BlockEnum.Parallel,
    title: '并行',
    description: '并行执行多个分支，全部完成后汇聚',
    defaultData: {
      title: '并行', desc: '并行执行多条独立分支', type: BlockEnum.Parallel,
      branchCount: 2, waitForAll: true, branchLabels: ['分支 1', '分支 2'],
    },
  },
  [BlockEnum.Code]: {
    classification: BlockClassificationEnum.Action,
    type: BlockEnum.Code,
    title: '代码执行',
    description: '在沙箱中执行 JavaScript / Python / TypeScript',
    defaultData: {
      title: '代码执行', desc: '运行一段代码并返回结果', type: BlockEnum.Code,
      language: 'javascript',
      code: '// 入参在 inputs 中, 通过 return { result } 输出\nconst items = inputs.items || [];\nreturn { result: items.length };',
      inputVariables: ['items'],
      outputSchema: '{"result": "number"}',
    },
  },
}

export const NODE_TYPE_META: Record<BlockEnum, NodeTypeMeta> = {
  [BlockEnum.Start]: { type: BlockEnum.Start, label: '开始', category: BlockClassificationEnum.Control, color: '#22c55e', icon: '▶' },
  [BlockEnum.End]: { type: BlockEnum.End, label: '结束', category: BlockClassificationEnum.Control, color: '#ef4444', icon: '■' },
  [BlockEnum.HttpRequest]: { type: BlockEnum.HttpRequest, label: 'HTTP 请求', category: BlockClassificationEnum.Action, color: '#3b82f6', icon: '🌐' },
  [BlockEnum.IfElse]: { type: BlockEnum.IfElse, label: '条件判断', category: BlockClassificationEnum.Logic, color: '#f59e0b', icon: '◇' },
  [BlockEnum.Delay]: { type: BlockEnum.Delay, label: '延迟', category: BlockClassificationEnum.Action, color: '#8b5cf6', icon: '⏱' },
  [BlockEnum.Log]: { type: BlockEnum.Log, label: '日志输出', category: BlockClassificationEnum.Action, color: '#64748b', icon: '📝' },
  [BlockEnum.Note]: { type: BlockEnum.Note, label: '便签', category: BlockClassificationEnum.Note, color: '#eab308', icon: '📌' },
  [BlockEnum.Iteration]: { type: BlockEnum.Iteration, label: '迭代', category: BlockClassificationEnum.Logic, color: '#10b981', icon: '↻' },
  [BlockEnum.Parallel]: { type: BlockEnum.Parallel, label: '并行', category: BlockClassificationEnum.Logic, color: '#f43f5e', icon: '⫶' },
  [BlockEnum.Code]: { type: BlockEnum.Code, label: '代码执行', category: BlockClassificationEnum.Action, color: '#0ea5e9', icon: '⌨' },
}

/* ─── Variable system ─── */

export const VARIABLE_TYPE_LABELS: Record<VariableType, string> = {
  [VariableType.String]: '文本',
  [VariableType.Number]: '数字',
  [VariableType.Boolean]: '布尔',
  [VariableType.Object]: '对象',
  [VariableType.Array]: '数组',
}

export const VARIABLE_TYPE_COLORS: Record<VariableType, { bg: string; text: string; icon: string }> = {
  [VariableType.String]: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'Aa' },
  [VariableType.Number]: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: '#' },
  [VariableType.Boolean]: { bg: 'bg-amber-50', text: 'text-amber-700', icon: '⚑' },
  [VariableType.Object]: { bg: 'bg-violet-50', text: 'text-violet-700', icon: '{}' },
  [VariableType.Array]: { bg: 'bg-pink-50', text: 'text-pink-700', icon: '[]' },
}

export type VariableSource =
  | { kind: 'env'; id: string }
  | { kind: 'node-output'; nodeId: string; nodeTitle: string; varName: string; varType: VariableType }

export type VariableDef = {
  id: string
  name: string
  type: VariableType
  defaultValue?: string
  description?: string
}

export type NodeOutputVar = {
  name: string
  type: VariableType
  description?: string
}

export const NODE_OUTPUT_DEFAULTS: Record<string, NodeOutputVar[]> = {
  start: [
    { name: 'query', type: VariableType.String, description: '用户输入' },
    { name: 'files', type: VariableType.Array, description: '上传的文件' },
  ],
  end: [{ name: 'result', type: VariableType.String, description: '输出结果' }],
  'http-request': [
    { name: 'status', type: VariableType.Number, description: 'HTTP 状态码' },
    { name: 'body', type: VariableType.Object, description: '响应体' },
    { name: 'headers', type: VariableType.Object, description: '响应头' },
  ],
  'if-else': [{ name: 'result', type: VariableType.Boolean, description: '条件结果' }],
  delay: [],
  log: [],
  iteration: [
    { name: 'output', type: VariableType.Array, description: '每轮迭代的输出聚合' },
    { name: 'item', type: VariableType.Object, description: '当前迭代的元素（子流程内可用）' },
  ],
  parallel: [{ name: 'results', type: VariableType.Array, description: '各分支返回结果的数组' }],
  code: [{ name: 'result', type: VariableType.Object, description: '代码 return 的对象' }],
  'custom-note': [],
}

/** Persistable form: strips editor-only runtime fields (`_*`) from node data. */
export function toPersistableDefinition(def: WorkflowDefinition): WorkflowDefinition {
  return {
    version: '1.0',
    name: def.name,
    description: def.description,
    nodes: def.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { ...node.position },
      data: Object.fromEntries(
        Object.entries(node.data).filter(([key]) => !key.startsWith('_')),
      ) as CommonNodeType,
    })),
    edges: def.edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({
      id, source, target,
      ...(sourceHandle != null ? { sourceHandle } : {}),
      ...(targetHandle != null ? { targetHandle } : {}),
      ...(label != null ? { label } : {}),
    })),
  }
}
