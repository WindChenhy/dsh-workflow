import type { WorkflowRunResult, RunEvent } from '../core/engine'
import type { Config } from './config'
import type WorkflowService from './service'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Capability provided by the workflow-orchestrator L5 bundle. */
    workflow: WorkflowService
  }

  interface Events {
    'workflow/registered': (payload: { id: string; name: string }) => void
    'workflow/removed': (payload: { id: string }) => void
    'workflow/run-started': (payload: { runId: string; workflowId: string; workflow: string }) => void
    'workflow/node': (payload: Extract<RunEvent, { type: 'node-start' | 'node-end' }>) => void
    'workflow/log': (payload: Extract<RunEvent, { type: 'log' }>) => void
    'workflow/run-finished': (payload: {
      runId: string
      workflowId: string
      result: Pick<WorkflowRunResult, 'status' | 'error' | 'logs'>
    }) => void
  }
}

export type { Config }
