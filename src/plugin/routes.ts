import type { Context } from '@deepseek-ai/cordis'
import type WorkflowService from './service'

export const API_BASE = '/api/dsh-workflow-orchestrator'

type ConnectionFace = {
  fetch?: {
    register?(route: {
      path: string
      methods: readonly string[]
      requestBody: 'buffered'
      fetch: (request: Request) => Response | Promise<Response>
    }): () => void
  }
}

function ok(value: unknown): Response {
  return Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
}

function fail(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status, headers: { 'cache-control': 'no-store' } })
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json() as unknown
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Host half of the UI data plane: browser-relative POST routes. */
export function mountWorkflowRoutes(ctx: Context, service: WorkflowService): void {
  ctx.inject(['connection'], (c) => {
    const connection = c.get('connection') as ConnectionFace | undefined
    const register = connection?.fetch?.register
    if (typeof register !== 'function') return

    const mount = (path: string, handler: (body: Record<string, unknown>) => Promise<Response> | Response): void => {
      c.effect(() => register.call(connection!.fetch, {
        path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request: Request) => {
          const body = await bodyOf(request)
          if (body === null) return fail('body must be a JSON object')
          try {
            return await handler(body)
          } catch (error) {
            return fail(error instanceof Error ? error.message : String(error), 500)
          }
        },
      }), `dsh-workflow-orchestrator: route ${path}`)
    }

    mount(`${API_BASE}/list`, () => ok(service.list()))
    mount(`${API_BASE}/get`, (body) => {
      const def = service.get(text(body.id))
      return def === undefined ? fail('workflow not found', 404) : ok(def)
    })
    mount(`${API_BASE}/validate`, (body) => ok(service.validate(body.definition as never)))
    mount(`${API_BASE}/history`, (body) => ok(service.history(typeof body.limit === 'number' ? body.limit : 10)))
    mount(`${API_BASE}/export`, (body) => {
      try {
        return ok(service.exportYaml(text(body.id)))
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error), 404)
      }
    })
    mount(`${API_BASE}/run`, async (body) => {
      const inputs = body.inputs !== null && typeof body.inputs === 'object' && !Array.isArray(body.inputs)
        ? body.inputs as Record<string, unknown>
        : {}
      const result = await service.run(text(body.id), inputs)
      return ok(result)
    })
    mount(`${API_BASE}/register`, (body) => {
      const id = text(body.id)
      const definition = body.definition
      if (!id || definition === null || typeof definition !== 'object') return fail('id and definition are required')
      service.register(id, definition as never)
      return ok({ id })
    })
    mount(`${API_BASE}/registerYaml`, (body) => {
      try {
        const def = service.registerYaml(text(body.id), text(body.text))
        return ok({ id: text(body.id), name: def.name })
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
    })
    mount(`${API_BASE}/remove`, (body) => ok({ removed: service.remove(text(body.id)) }))
  })
}
