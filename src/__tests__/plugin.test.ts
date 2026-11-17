import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from '../plugin/config'
import { apply, name } from '../plugin/index'
import type WorkflowService from '../plugin/service'

const config: Config = {
  toolPrefix: 'workflow',
  enableTools: true,
  allowMutations: true,
  maxIterations: 10,
  maxParallelBranches: 4,
  maxDelayMs: 1000,
  httpTimeoutMs: 1000,
  maxWorkflows: 5,
  maxHistory: 5,
  persistencePath: '',
  emitEvents: true,
}

function fakeCtx() {
  const tools: { name: string }[] = []
  const emitted: { event: string; payload: unknown }[] = []
  const ctx = {
    tools: { register: (tool: { name: string }) => { tools.push(tool); return () => true } },
    reflect: { provide: (serviceName: string, instance: unknown) => { (ctx as Record<string, unknown>)[serviceName] = instance; return () => {} } },
    emit: (event: string, payload: unknown) => { emitted.push({ event, payload }) },
    on: () => () => true,
    effect: (body: () => unknown) => { body(); return async () => {} },
    inject: (_deps: string[], cb: (c: unknown) => unknown) => { cb(ctx); return () => {} },
    get: () => undefined,
  } as unknown as Context & Record<string, unknown>
  return { ctx, tools, emitted }
}

const definition = {
  version: '1.0' as const,
  name: 'demo',
  description: '',
  nodes: [
    { id: 's', type: 'start' as const, position: { x: 0, y: 0 }, data: { title: 's', desc: '', type: 'start' as const } },
    { id: 'l', type: 'log' as const, position: { x: 0, y: 0 }, data: { title: 'l', desc: '', type: 'log' as const, message: 'ok', level: 'info' } },
    { id: 'e', type: 'end' as const, position: { x: 0, y: 0 }, data: { title: 'e', desc: '', type: 'end' as const } },
  ],
  edges: [
    { id: '1', source: 's', target: 'l' },
    { id: '2', source: 'l', target: 'e' },
  ],
}

describe('plugin (DSH L5)', () => {
  it('exports a stable identity and a function-form entry', () => {
    expect(name).toBe('workflow-orchestrator')
    expect(typeof apply).toBe('function')
  })

  it('registers tools + service and executes a workflow through ctx', async () => {
    const { ctx, tools, emitted } = fakeCtx()
    apply(ctx, config)

    expect(tools.map((t) => t.name)).toEqual([
      'workflow.list', 'workflow.get', 'workflow.validate',
      'workflow.run', 'workflow.history', 'workflow.export',
      'workflow.register', 'workflow.remove',
    ])

    const service = ctx.workflow as WorkflowService
    expect(service).toBeDefined()
    await service.readyToUse()
    service.register('demo', definition)

    const result = await service.run('demo', {})
    expect(result.status).toBe('succeeded')
    expect(result.logs).toContain('[info] ok')
    expect(service.list()).toHaveLength(1)
    expect(service.history()).toHaveLength(1)
    expect(emitted.some((e) => e.event === 'workflow/run-finished')).toBe(true)

    const yaml = service.exportYaml('demo')
    expect(yaml).toContain('version: "1.0"')
    expect(service.remove('demo')).toBe(true)
    await service.close()
  })

  it('omits mutation tools when disabled and rejects invalid ids', () => {
    const { ctx, tools } = fakeCtx()
    apply(ctx, { ...config, allowMutations: false })
    expect(tools.some((t) => t.name === 'workflow.register')).toBe(false)
    expect(() => (ctx.workflow as WorkflowService).register('../bad', definition)).toThrow(/id 非法/)
  })
})
