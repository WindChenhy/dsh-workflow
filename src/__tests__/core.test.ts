import { describe, expect, it } from 'vitest'
import { runWorkflow, evaluateCondition } from '../core/engine'
import { topologicalSort, detectCycles } from '../core/graph'
import type { WorkflowDefinition } from '../core/types'
import { exportToYaml, importFromYaml } from '../core/yaml'
import { validateWorkflow } from '../core/validator'
import { extractVarRefs, resolveTemplate } from '../core/variables'

function node(id: string, type: string, data: Record<string, unknown> = {}) {
  return {
    id,
    type: type as WorkflowDefinition['nodes'][number]['type'],
    position: { x: 0, y: 0 },
    data: { title: id, desc: '', type: type as WorkflowDefinition['nodes'][number]['type'], ...data },
  }
}

const edge = (id: string, source: string, target: string, sourceHandle?: string) => ({
  id, source, target, ...(sourceHandle ? { sourceHandle } : {}),
})

function simpleDef(): WorkflowDefinition {
  return {
    version: '1.0',
    name: 'test',
    description: '',
    nodes: [
      node('s', 'start'),
      node('log', 'log', { message: 'hi {{#env.name#}}', level: 'info' }),
      node('e', 'end'),
    ],
    edges: [edge('e1', 's', 'log'), edge('e2', 'log', 'e')],
  }
}

describe('core/graph + validator', () => {
  it('sorts topologically and detects cycles', () => {
    const def = simpleDef()
    expect(topologicalSort(def).order).toEqual(['s', 'log', 'e'])
    expect(detectCycles(def)).toHaveLength(0)

    def.edges.push(edge('cycle', 'e', 's'))
    expect(topologicalSort(def).cycleNodes.length).toBeGreaterThan(0)
    expect(detectCycles(def).length).toBeGreaterThan(0)
    expect(validateWorkflow(def).some((e) => e.message.includes('循环依赖'))).toBe(true)
  })

  it('reports missing HTTP URL and unreachable nodes', () => {
    const def = simpleDef()
    def.nodes.push(node('orphan', 'delay', { duration: 10 }))
    def.nodes.push(node('http', 'http-request', {}))
    const errors = validateWorkflow(def)
    expect(errors.some((e) => e.message.includes('URL'))).toBe(true)
    expect(errors.some((e) => e.message.includes('未连接到流程'))).toBe(true)
  })
})

describe('core/yaml', () => {
  it('round-trips quoted commas in flow arrays', () => {
    const def = simpleDef()
    def.nodes[1].data.branchLabels = ['a,b', 'c']
    const yaml = exportToYaml(def)
    const parsed = importFromYaml(yaml)
    expect((parsed.nodes[1].data as unknown as { branchLabels: string[] }).branchLabels).toEqual(['a,b', 'c'])
  })

  it('rejects dangling edges and unknown node types', () => {
    const def = simpleDef()
    def.edges.push(edge('bad', 's', 'missing'))
    expect(() => importFromYaml(exportToYaml(def))).toThrow(/source|target/)
  })
})

describe('core/variables + conditions', () => {
  it('resolves references without eval and reports missing ones', () => {
    expect(extractVarRefs('{{#a.b#}} + {{#c.d#}}')).toEqual(['a.b', 'c.d'])
    expect(resolveTemplate('Hello {{#env.name#}}', { env: { name: 'Ada' } })).toBe('Hello Ada')
    expect(resolveTemplate('{{#env.x#}}', { env: {} })).toBe('')
  })

  it('evaluates comparisons safely', () => {
    const scope = { env: { count: 3, name: 'abc' } }
    expect(evaluateCondition('{{#env.count#}} >= 3', scope)).toBe(true)
    expect(evaluateCondition('{{#env.name#}} contains b', scope)).toBe(true)
    expect(evaluateCondition('{{#env.count#}} > 9 || {{#env.name#}} == abc', scope)).toBe(true)
  })
})

describe('core/engine', () => {
  it('runs a linear workflow deterministically', async () => {
    const result = await runWorkflow(simpleDef(), { name: 'Ada' })
    expect(result.status).toBe('succeeded')
    expect(result.logs).toContain('[info] hi Ada')
    expect(Object.values(result.nodeResults).every((r) => r.status === 'success')).toBe(true)
  })

  it('only activates the selected condition branch', async () => {
    const def: WorkflowDefinition = {
      version: '1.0', name: 'branch', description: '',
      nodes: [
        node('s', 'start'),
        node('cond', 'if-else', { expression: '{{#env.ok#}} == true' }),
        node('yes', 'log', { message: 'YES', level: 'info' }),
        node('no', 'log', { message: 'NO', level: 'info' }),
        node('e', 'end'),
      ],
      edges: [
        edge('1', 's', 'cond'),
        edge('2', 'cond', 'yes', 'true'),
        edge('3', 'cond', 'no', 'false'),
        edge('4', 'yes', 'e'),
        edge('5', 'no', 'e'),
      ],
    }
    const result = await runWorkflow(def, { ok: true })
    expect(result.status).toBe('succeeded')
    expect(result.logs).toContain('[info] YES')
    expect(result.logs).not.toContain('[info] NO')
    expect(result.nodeResults.no.status).toBe('skipped')
  })

  it('fails loudly when a code sandbox is not configured', async () => {
    const def = simpleDef()
    def.nodes.splice(1, 0, node('code', 'code', { code: 'return 1', language: 'javascript' }))
    def.edges = [edge('1', 's', 'code'), edge('2', 'code', 'log'), edge('3', 'log', 'e')]
    const result = await runWorkflow(def)
    expect(result.status).toBe('failed')
    expect(result.error).toContain('代码沙箱')
  })
})
