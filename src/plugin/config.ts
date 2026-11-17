import Schema from '@deepseek-ai/schemastery'

/** User-facing configuration. Defaults live in the schema (loud validation). */
export interface Config {
  /** Prefix for all registered tool names. */
  toolPrefix: string
  /** Register DSH tools on ctx.tools. */
  enableTools: boolean
  /** Allow model-callable tools that mutate the in-memory registry. */
  allowMutations: boolean
  /** Hard cap for iteration nodes. */
  maxIterations: number
  /** Hard cap for concurrently executed nodes / parallel branches. */
  maxParallelBranches: number
  /** Hard cap for delay nodes, in milliseconds. */
  maxDelayMs: number
  /** Hard cap for HTTP requests, in milliseconds. */
  httpTimeoutMs: number
  /** Maximum number of registered workflows. */
  maxWorkflows: number
  /** Maximum number of retained run records. */
  maxHistory: number
  /** Optional JSON file used to persist registered workflows. */
  persistencePath: string
  /** Emit workflow/* Cordis events during execution. */
  emitEvents: boolean
}

export const Config: Schema<Config> = Schema.object({
  toolPrefix: Schema.string().default('workflow').description('工具名前缀'),
  enableTools: Schema.boolean().default(true).description('是否注册 DSH 工具'),
  allowMutations: Schema.boolean().default(true).description('是否允许模型调用注册/删除工作流的工具'),
  maxIterations: Schema.number().default(100).description('迭代节点最大轮数'),
  maxParallelBranches: Schema.number().default(8).description('最大并行度'),
  maxDelayMs: Schema.number().default(60_000).description('延迟节点最大毫秒数'),
  httpTimeoutMs: Schema.number().default(10_000).description('HTTP 请求超时毫秒数'),
  maxWorkflows: Schema.number().default(100).description('最多注册的工作流数'),
  maxHistory: Schema.number().default(50).description('保留的运行记录数'),
  persistencePath: Schema.string().default('').description('工作流持久化 JSON 路径，留空表示仅内存'),
  emitEvents: Schema.boolean().default(true).description('是否发出 workflow/* 事件'),
})
