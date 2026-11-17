import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { importFromYaml } from '../core/yaml'
import type { Config } from './config'
import type WorkflowService from './service'

function parseDefinition(text: string, format: string) {
  if (format === 'yaml') return importFromYaml(text)
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { nodes?: unknown }).nodes)
    || !Array.isArray((parsed as { edges?: unknown }).edges)) {
    throw new Error('definition 必须是包含 nodes/edges 的工作流 JSON')
  }
  return parsed as Parameters<WorkflowService['register']>[1]
}

/** Build the DSH tool set. Each returned definition is registered via ctx.tools. */
export function createWorkflowTools(service: WorkflowService, config: Config): ToolDefinition[] {
  const p = config.toolPrefix.replace(/[^A-Za-z0-9_.-]/g, '') || 'workflow'
  const tools: ToolDefinition[] = [
    defineTool({
      name: `${p}.list`,
      description: '列出已注册的工作流（id、名称、节点数、边数）。',
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute() {
        return JSON.stringify(service.list(), null, 2)
      },
    }),

    defineTool({
      name: `${p}.get`,
      description: '按 id 获取已注册工作流的完整定义（JSON）。',
      parameters: {
        id: { type: 'string', required: true, description: '工作流 id' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const def = service.get(args.id)
        if (!def) throw new Error(`工作流不存在: ${args.id}`)
        return JSON.stringify(def, null, 2)
      },
    }),

    defineTool({
      name: `${p}.validate`,
      description: '校验工作流定义，返回错误与警告列表。definition 为 JSON 或 YAML 字符串。',
      parameters: {
        definition: { type: 'string', required: true, description: '工作流定义文本' },
        format: { type: 'string', enum: ['json', 'yaml'], description: '定义格式，默认 json' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const def = parseDefinition(args.definition, args.format ?? 'json')
        const issues = service.validate(def)
        return JSON.stringify({
          ok: !issues.some((i) => i.severity === 'error'),
          issues,
        }, null, 2)
      },
    }),

    defineTool({
      name: `${p}.run`,
      description: '执行已注册的工作流。inputs 为 JSON 对象字符串，会作为 env 变量注入。',
      parameters: {
        id: { type: 'string', required: true, description: '工作流 id' },
        inputs: { type: 'string', description: '输入变量 JSON 对象字符串' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        let inputs: Record<string, unknown> = {}
        if (args.inputs) {
          const parsed = JSON.parse(args.inputs) as unknown
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('inputs 必须是 JSON 对象')
          }
          inputs = parsed as Record<string, unknown>
        }
        const result = await service.run(args.id, inputs)
        return JSON.stringify(result, null, 2)
      },
    }),

    defineTool({
      name: `${p}.history`,
      description: '查看最近的工作流运行记录。',
      parameters: {
        limit: { type: 'integer', description: '返回条数，默认 10' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return JSON.stringify(service.history(args.limit ?? 10), null, 2)
      },
    }),

    defineTool({
      name: `${p}.export`,
      description: '将已注册工作流导出为 YAML 字符串。',
      parameters: {
        id: { type: 'string', required: true, description: '工作流 id' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        return service.exportYaml(args.id)
      },
    }),
  ]

  if (config.allowMutations) {
    tools.push(
      defineTool({
        name: `${p}.register`,
        description: '注册（或覆盖）一个工作流定义。definition 为 JSON 或 YAML 字符串。',
        parameters: {
          id: { type: 'string', required: true, description: '工作流 id' },
          definition: { type: 'string', required: true, description: '工作流定义文本' },
          format: { type: 'string', enum: ['json', 'yaml'], description: '定义格式，默认 json' },
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args) {
          const def = parseDefinition(args.definition, args.format ?? 'json')
          service.register(args.id, def)
          return `已注册工作流 ${args.id}（${def.nodes.length} 个节点）`
        },
      }),
      defineTool({
        name: `${p}.remove`,
        description: '删除一个已注册的工作流。',
        parameters: {
          id: { type: 'string', required: true, description: '工作流 id' },
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        async execute(args) {
          return service.remove(args.id) ? `已删除 ${args.id}` : `工作流不存在: ${args.id}`
        },
      }),
    )
  }

  return tools
}
