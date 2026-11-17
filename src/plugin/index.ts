import type { Context } from '@deepseek-ai/cordis'
import '@deepseek-ai/dsh-tools'
import WorkflowService from './service'
import { mountWorkflowRoutes } from './routes'
import { createWorkflowTools } from './tools'
import './events'

export { Config } from './config'

import type { Config as ConfigShape } from './config'

/** Cordis identity in the config tree. Keep stable: renaming is breaking. */
export const name = 'workflow-orchestrator'

/** `tools` is required: this bundle's main job is registering workflow tools. */
export const inject = ['tools']

/**
 * Function-form plugin entry. `apply` is repeatable (HMR/provider replacement):
 * every registration is owned by the current fiber and disposed automatically.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  // Service base class registers itself on ctx and is removed with this fiber.
  const service = new WorkflowService(ctx, config)
  mountWorkflowRoutes(ctx, service)

  if (config.enableTools) {
    for (const tool of createWorkflowTools(service, config)) {
      ctx.tools.register(tool)
    }
  }

  // One disposer owns the ordered flush; async disposers elsewhere may race.
  ctx.effect(() => () => service.close())
}
