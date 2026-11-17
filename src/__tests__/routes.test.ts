import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { mountWorkflowRoutes, API_BASE } from '../plugin/routes'
import type WorkflowService from '../plugin/service'

const definition = {
  version: '1.0' as const,
  name: 'demo',
  description: '',
  nodes: [
    { id: 's', type: 'start' as const, position: { x: 0, y: 0 }, data: { title: 's', desc: '', type: 'start' as const } },
    { id: 'e', type: 'end' as const, position: { x: 0, y: 0 }, data: { title: 'e', desc: '', type: 'end' as const } },
  ],
  edges: [{ id: '1', source: 's', target: 'e' }],
}

function fakeCtx(handlers: Map<string, (r: Request) => Promise<Response>>) {
  const ctx = {
    inject: (_deps: string[], cb: (c: Context) => unknown) => cb(ctx as unknown as Context),
    effect: (body: () => unknown) => { body(); return () => {} },
    get: (name: string) => name === 'connection'
      ? { fetch: { register: (route: { path: string; fetch: (r: Request) => Promise<Response> }) => {
          handlers.set(route.path, route.fetch)
          return () => { handlers.delete(route.path) }
        } } }
      : undefined,
  } as unknown as Context
  return ctx
}

describe('plugin UI routes', () => {
  it('mounts routes and serves list/get/run without a browser', async () => {
    const handlers = new Map<string, (r: Request) => Promise<Response>>()
    const service = {
      list: () => [{ id: 'demo', name: 'demo', nodes: 2, edges: 1 }],
      get: (id: string) => id === 'demo' ? definition : undefined,
      validate: () => [],
      history: () => [],
      exportYaml: () => 'version: "1.0"',
      run: async () => ({ status: 'succeeded', outputs: {}, nodeResults: {}, logs: [] }),
      register: () => {},
      registerYaml: () => definition,
      remove: () => true,
    } as unknown as WorkflowService
    mountWorkflowRoutes(fakeCtx(handlers), service)

    expect(handlers.size).toBeGreaterThanOrEqual(9)
    const call = async (path: string, body: unknown) => {
      const handler = handlers.get(`${API_BASE}/${path}`)
      if (!handler) throw new Error(`missing route ${path}`)
      const res = await handler(new Request('http://local', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      return { status: res.status, json: await res.json() as { ok?: boolean; value?: unknown } }
    }

    expect((await call('list', {})).json.value).toHaveLength(1)
    expect((await call('get', { id: 'demo' })).json.value).toEqual(definition)
    expect((await call('get', { id: 'missing' })).status).toBe(404)
    expect((await call('run', { id: 'demo', inputs: {} })).json.value).toMatchObject({ status: 'succeeded' })
    expect((await call('export', { id: 'demo' })).json.value).toContain('version:')
    expect((await call('register', { id: 'x', definition })).json.ok).toBe(true)
  })
})
