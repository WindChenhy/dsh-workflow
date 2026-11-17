import {
  createElement as h,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import { topologicalSort } from '../core/graph'
import type { WorkflowDefinition } from '../core/types'

const API_BASE = '/api/dsh-workflow-orchestrator'
const VIEW_ID = 'dsh-workflow-orchestrator'
const SIDEBAR_KIND = 'dsh-workflow-orchestrator'

type Row = { id: string; name: string; nodes: number; edges: number }
type Issue = { message: string; severity: 'error' | 'warning' }
type RunResult = { status: string; logs: string[]; error?: string; nodeResults: Record<string, { status: string; durationMs?: number }> }

interface ClientCtx {
  slots: {
    inject(name: string, callback: () => unknown): unknown
    register(options: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): unknown
    entries?(name: string): unknown
  }
  effect(body: () => unknown, label?: string): unknown
  inject(deps: string[], callback: (ctx: ClientCtx) => unknown): unknown
  get(name: string): unknown
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as { ok?: boolean; value?: T; error?: string }
  if (!response.ok || payload.ok !== true) throw new Error(payload.error ?? `HTTP ${response.status}`)
  return payload.value as T
}

function seated(ctx: ClientCtx, name: string, id: string): boolean {
  try {
    const entries = ctx.slots.entries?.(name)
    if (!Array.isArray(entries)) return false
    return entries.some((entry) => {
      const options = (entry as { options?: { id?: string } }).options
      return options?.id === id
    })
  } catch {
    return false
  }
}

const panel: CSSProperties = {
  height: '100%', overflow: 'auto', padding: 16, fontSize: 13,
  color: 'var(--dsw-alias-label-primary, #1f2937)',
  background: 'var(--dsw-alias-bg-base, #ffffff)',
}
const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }
const button: CSSProperties = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
  border: '1px solid var(--dsw-alias-border, #d1d5db)',
  background: 'var(--dsw-alias-interactive-bg, #f9fafb)',
  color: 'inherit',
}
const input: CSSProperties = {
  padding: '5px 8px', borderRadius: 6, fontSize: 12, minWidth: 180,
  border: '1px solid var(--dsw-alias-border, #d1d5db)',
  background: 'var(--dsw-alias-bg-base, #fff)', color: 'inherit',
}
function GraphView({ def }: { def: WorkflowDefinition }): ReactElement {
  const layout = useMemo(() => {
    const { order } = topologicalSort(def)
    const level = new Map<string, number>()
    const incoming = new Map<string, string[]>()
    for (const edge of def.edges) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
    for (const id of order) {
      const parents = incoming.get(id) ?? []
      level.set(id, parents.length ? Math.max(...parents.map(p => level.get(p) ?? 0)) + 1 : 0)
    }
    const columns = new Map<number, string[]>()
    for (const id of order) {
      const l = level.get(id) ?? 0
      columns.set(l, [...(columns.get(l) ?? []), id])
    }
    const pos = new Map<string, { x: number; y: number }>()
    for (const [l, ids] of columns) {
      ids.forEach((id, i) => pos.set(id, { x: 30 + l * 150, y: 30 + i * 66 }))
    }
    return { pos, order }
  }, [def])

  return h('svg', {
    width: Math.max(360, ...[...layout.pos.values()].map(p => p.x + 130)),
    height: Math.max(120, ...[...layout.pos.values()].map(p => p.y + 60)),
    style: { maxWidth: '100%', border: '1px solid var(--dsw-alias-border, #e5e7eb)', borderRadius: 8 },
  }, [
    ...def.edges.map(edge => {
      const a = layout.pos.get(edge.source)
      const b = layout.pos.get(edge.target)
      if (!a || !b) return null
      return h('line', {
        key: edge.id, x1: a.x + 110, y1: a.y + 20, x2: b.x, y2: b.y + 20,
        stroke: '#9ca3af', strokeWidth: 1.5,
      })
    }),
    ...def.nodes.map(node => {
      const p = layout.pos.get(node.id)
      if (!p) return null
      return h('g', { key: node.id }, [
        h('rect', {
          x: p.x, y: p.y, width: 110, height: 40, rx: 7,
          fill: '#f3f4f6', stroke: '#9ca3af', strokeWidth: 1,
        }),
        h('text', {
          x: p.x + 8, y: p.y + 16, fontSize: 11, fill: '#374151',
        }, String(node.data.title || node.id)),
        h('text', {
          x: p.x + 8, y: p.y + 31, fontSize: 10, fill: '#6b7280',
        }, String(node.type)),
      ])
    }),
  ])
}

function Panel({ compact = false }: { compact?: boolean }): ReactElement {
  const [rows, setRows] = useState<Row[]>([])
  const [id, setId] = useState('')
  const [def, setDef] = useState<WorkflowDefinition | null>(null)
  const [yaml, setYaml] = useState('')
  const [draft, setDraft] = useState('')
  const [result, setResult] = useState<RunResult | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setError('')
      setRows(await post<Row[]>('list', {}))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const pick = useCallback(async (next: string) => {
    setId(next)
    setResult(null)
    setIssues([])
    try {
      setError('')
      setDef(await post<WorkflowDefinition>('get', { id: next }))
      setYaml(await post<string>('export', { id: next }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const run = useCallback(async () => {
    if (!id) return
    setBusy(true)
    try {
      setError('')
      setResult(await post<RunResult>('run', { id, inputs: {} }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [id])

  const save = useCallback(async () => {
    if (!id || !draft.trim()) return
    setBusy(true)
    try {
      setError('')
      const isYaml = draft.trimStart().startsWith('version:') || draft.includes('\nnodes:')
      const definition = isYaml ? null : JSON.parse(draft) as WorkflowDefinition
      if (definition) await post('register', { id, definition })
      else await post('registerYaml', { id, text: draft })
      setDraft('')
      await refresh()
      await pick(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [draft, id, pick, refresh])

  const download = useCallback(() => {
    if (!yaml) return
    const url = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${id || 'workflow'}.yaml`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [yaml, id])

  return h('div', { style: panel }, [
    h('div', { key: 'title', style: { fontWeight: 600, marginBottom: 10 } }, '工作流编排'),
    h('div', { key: 'list', style: row }, [
      h('select', {
        value: id,
        onChange: (e: { target: { value: string } }) => { void pick(e.target.value) },
        style: input,
      }, [
        h('option', { value: '', key: 'none' }, '选择工作流'),
        ...rows.map(r => h('option', { value: r.id, key: r.id }, `${r.name} (${r.id})`)),
      ]),
      h('button', { type: 'button', style: button, onClick: () => { void refresh() } }, '刷新'),
    ]),
    error ? h('p', { key: 'error', style: { color: '#b91c1c' } }, error) : null,
    def ? h('div', { key: 'graph' }, [
      h(GraphView, { def }),
      h('div', { style: { ...row, marginTop: 10 } }, [
        h('button', { type: 'button', style: button, disabled: busy, onClick: () => { void run() } }, busy ? '运行中…' : '运行'),
        h('button', { type: 'button', style: button, onClick: download }, '导出 YAML'),
      ]),
    ]) : h('p', { key: 'empty', style: { color: '#6b7280' } }, '用 workflow.register 工具注册工作流后会显示在这里。'),
    !compact ? h('div', { key: 'editor', style: { marginTop: 14 } }, [
      h('div', { style: { marginBottom: 6 } }, '导入 / 覆盖定义（JSON 或 YAML）'),
      h('input', {
        style: { ...input, width: '100%', marginBottom: 6 },
        placeholder: '工作流 id',
        value: id,
        onChange: (e: { target: { value: string } }) => setId(e.target.value),
      }),
      h('textarea', {
        style: { ...input, width: '100%', minHeight: 110, fontFamily: 'monospace' },
        placeholder: '粘贴 WorkflowDefinition JSON 或 YAML',
        value: draft,
        onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
      }),
      h('button', {
        type: 'button', style: { ...button, marginTop: 6 }, disabled: busy || !draft.trim(),
        onClick: () => { void save() },
      }, '保存定义'),
    ]) : null,
    issues.length ? h('div', { key: 'issues', style: { marginTop: 10 } },
      issues.map((x, i) => h('div', { key: i, style: { color: x.severity === 'error' ? '#b91c1c' : '#92400e' } }, x.message)),
    ) : null,
    result ? h('div', { key: 'result', style: { marginTop: 10 } }, [
      h('div', {}, `状态：${result.status}`),
      ...result.logs.map((line, i) => h('div', { key: i, style: { fontFamily: 'monospace', fontSize: 11 } }, line)),
      result.error ? h('div', { style: { color: '#b91c1c' } }, result.error) : null,
    ]) : null,
  ])
}

module.exports = {
  name: VIEW_ID,
  inject: ['slots'],
  apply(ctx: ClientCtx): void {
    if (seated(ctx, 'conversation.view', VIEW_ID)) return

    ctx.effect(() => {
      return ctx.slots.inject('conversation.view', () => ctx.slots.register(
        { name: 'conversation.view', id: VIEW_ID, order: 20, label: () => '工作流' },
        (props: Record<string, unknown>) => h(Panel, props),
      )) as () => void
    }, 'dsh-workflow-orchestrator: main tab')

    ctx.inject(['sidebarRightTabs'], (raw: ClientCtx) => {
      const tabs = raw.get('sidebarRightTabs') as {
        register?(def: Record<string, unknown>): () => void
      } | undefined
      if (typeof tabs?.register !== 'function') return
      const disposers: (() => void)[] = []
      disposers.push(tabs.register({
        id: VIEW_ID,
        kind: SIDEBAR_KIND,
        title: () => '工作流',
        guide: [{
          id: VIEW_ID, order: 20, title: () => '工作流', description: () => '查看和编辑工作流',
        }],
      }))
      disposers.push(raw.slots.inject('sidebar.right.pane.tab', () => raw.slots.register(
        { name: 'sidebar.right.pane.tab', key: VIEW_ID },
        (props: Record<string, unknown>) => h(Panel, { ...props, compact: true }),
      )) as () => void)
      disposers.push(raw.slots.inject('sidebar.right.pane.tab.title', () => raw.slots.register(
        { name: 'sidebar.right.pane.tab.title', key: VIEW_ID },
        () => h('span', {}, '工作流'),
      )) as () => void)
      return () => { for (const dispose of disposers) dispose() }
    })
  },
}
