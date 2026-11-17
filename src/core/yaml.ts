import { BlockEnum, toPersistableDefinition, type WorkflowDefinition } from './types'

/**
 * Minimal, zero-dependency YAML subset used by the workflow format.
 * Browser-safe and Node-safe. Supports scalars, block/flow maps and arrays.
 * No anchors, comments or multi-line scalars by design.
 */

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

const INDENT = 2

function isPlainObject(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

type Line = { indent: number; content: string; lineno: number }

function needsQuote(s: string): boolean {
  if (s === '') return true
  if (s !== s.trim()) return true // leading/trailing whitespace must survive round-trip
  if (/[:#&*!|>'"%@`{}\[\],\n\r\t]/.test(s)) return true
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true
  if (/^-?\d+(\.\d+)?$/.test(s)) return true
  if (s.startsWith('-') || s.startsWith('?')) return true
  return false
}

function needsKeyQuote(s: string): boolean {
  if (s === '') return true
  if (s !== s.trim()) return true
  if (/[:#&*!|>'"%@`{}\[\],\n\r\t]/.test(s)) return true
  if (/^-?\d/.test(s)) return true
  return false
}

function toScalar(v: Json): string {
  if (v === null) return 'null'
  switch (typeof v) {
    case 'number':
      return Number.isFinite(v) ? String(v) : 'null'
    case 'boolean':
      return v ? 'true' : 'false'
    case 'string':
      return needsQuote(v) ? JSON.stringify(v) : v
    default:
      return JSON.stringify(v)
  }
}

export function toYaml(value: Json): string {
  return dumpValue(value, 0).replace(/\n+$/, '') + '\n'
}

function dumpValue(v: Json, level: number): string {
  if (v === null || typeof v !== 'object') return toScalar(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    if (v.every(isPlainObject)) return v.map((it) => dumpArrayItem(it, level)).join('')
    return `[${v.map((it) => toScalar(it)).join(', ')}]`
  }
  const keys = Object.keys(v)
  if (keys.length === 0) return '{}'
  return keys.map((k) => dumpKey(k, v[k], level)).join('')
}

function dumpArrayItem(item: Record<string, Json>, level: number): string {
  const keys = Object.keys(item)
  if (keys.length === 0) return `${' '.repeat(level)}- {}\n`
  const [first, ...rest] = keys
  const firstVal = item[first]
  const pad = ' '.repeat(level)
  if (firstVal === null || typeof firstVal !== 'object') {
    return `${pad}- ${needsKeyQuote(first) ? JSON.stringify(first) : first}: ${toScalar(firstVal)}\n`
      + rest.map((k) => dumpKey(k, item[k], level + INDENT)).join('')
  }
  return `${pad}- ${needsKeyQuote(first) ? JSON.stringify(first) : first}:\n`
    + dumpValue(firstVal, level + INDENT + 2) + '\n'
    + rest.map((k) => dumpKey(k, item[k], level + INDENT + 2)).join('')
}

function dumpKey(k: string, v: Json, level: number): string {
  const pad = ' '.repeat(level)
  const key = needsKeyQuote(k) ? JSON.stringify(k) : k
  if (v === null || typeof v !== 'object') return `${pad}${key}: ${toScalar(v)}\n`
  if (Array.isArray(v)) {
    if (v.length === 0) return `${pad}${key}: []\n`
    if (v.every(isPlainObject)) {
      return `${pad}${key}:\n${v.map((it) => dumpArrayItem(it, level + INDENT)).join('')}`
    }
    return `${pad}${key}: [${v.map((it) => toScalar(it)).join(', ')}]\n`
  }
  const keys = Object.keys(v)
  if (keys.length === 0) return `${pad}${key}: {}\n`
  return `${pad}${key}:\n${keys.map((kk) => dumpKey(kk, v[kk], level + INDENT)).join('')}`
}

export class YamlError extends Error {
  public line: number
  constructor(message: string, line: number) {
    super(`YAML 解析失败 (line ${line}): ${message}`)
    this.name = 'YamlError'
    this.line = line
  }
}

export function parseYaml(src: string): Json {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const items: Line[] = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue
    const indent = /^ */.exec(raw)?.[0].length ?? 0
    items.push({ indent, content: raw.slice(indent), lineno: i + 1 })
  }
  if (items.length === 0) return null
  return parseBlock(items, 0, 0).value
}

type ParseResult = { value: Json; next: number }

function parseBlock(items: Line[], start: number, baseIndent: number): ParseResult {
  if (start >= items.length) return { value: null, next: start }
  const first = items[start]
  if (first.indent < baseIndent) return { value: null, next: start }
  if (first.content.startsWith('- ')) return parseArrayItems(items, start, first.indent)
  if (/^[^\s:#]+/.test(first.content)) return parseObjectItems(items, start, first.indent)
  throw new YamlError('无法识别的行', first.lineno)
}

function parseArrayItems(items: Line[], start: number, baseIndent: number): ParseResult {
  const out: Json[] = []
  let i = start
  while (i < items.length) {
    const it = items[i]
    if (it.indent < baseIndent) break
    if (it.indent > baseIndent) throw new YamlError('数组项缩进不一致', it.lineno)
    if (!it.content.startsWith('-')) break
    const body = it.content.slice(1).replace(/^ /, '')
    if (body === '') {
      const sub = parseBlock(items, i + 1, baseIndent + INDENT)
      out.push(sub.value)
      i = sub.next
      continue
    }
    if (/^[^\s:#]+:/.test(body)) {
      // Treat the dash line as the first key of an object and let the normal
      // object parser consume all following sibling keys at the deeper indent.
      const synthetic: Line = { indent: baseIndent + 2, content: body, lineno: it.lineno }
      const augmented = [synthetic, ...items.slice(i + 1)]
      const sub = parseObjectItems(augmented, 0, baseIndent + 2)
      out.push(sub.value)
      i = i + sub.next
      continue
    }
    out.push(parseScalar(body, it.lineno))
    i++
  }
  return { value: out, next: i }
}

function parseObjectItems(items: Line[], start: number, baseIndent: number): ParseResult {
  const out: Record<string, Json> = {}
  let i = start
  while (i < items.length) {
    const it = items[i]
    if (it.indent < baseIndent) break
    if (it.indent > baseIndent) throw new YamlError('对象属性缩进不一致', it.lineno)
    if (it.content.startsWith('- ')) break
    const m = /^((?:"[^"]+"|'[^']+'|[^:]+)):\s*(.*)$/.exec(it.content)
    if (!m) throw new YamlError(`无效的属性行: ${it.content}`, it.lineno)
    const key = unquoteKey(m[1])
    const rest = m[2]
    if (rest === '' || rest === undefined) {
      const next = i + 1
      if (next < items.length && items[next].indent > baseIndent) {
        const sub = parseBlock(items, next, baseIndent + INDENT)
        out[key] = sub.value
        i = sub.next
      } else {
        out[key] = null
        i++
      }
      continue
    }
    out[key] = parseScalar(rest, it.lineno)
    i++
  }
  return { value: out, next: i }
}

function unquoteKey(k: string): string {
  const s = k.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try { return JSON.parse(s.replace(/^'|'$/g, '"')) as string } catch { return s.slice(1, -1) }
  }
  return s
}

function parseScalar(s: string, lineno: number): Json {
  const t = s.trim()
  if (t === '') return null
  if (t === 'null' || t === '~') return null
  if (t === 'true' || t === 'True' || t === 'TRUE') return true
  if (t === 'false' || t === 'False' || t === 'FALSE') return false
  // Flow array — split at top level so quoted commas survive.
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevel(inner, ',').map((x) => parseScalar(x.trim(), lineno))
  }
  // Flow object
  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1).trim()
    if (inner === '') return {}
    const out: Record<string, Json> = {}
    for (const part of splitTopLevel(inner, ',')) {
      const m = /^((?:"[^"]+"|'[^']+'|[^:]+)):\s*(.*)$/.exec(part.trim())
      if (!m) throw new YamlError(`无效的流对象项: ${part}`, lineno)
      out[unquoteKey(m[1])] = parseScalar(m[2], lineno)
    }
    return out
  }
  // Quoted string
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try { return JSON.parse(t.replace(/^'|'$/g, '"')) as string } catch { return t.slice(1, -1) }
  }
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10)
  if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t)
  return t
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr: string | null = null
  let escaped = false
  let buf = ''
  for (const ch of s) {
    if (inStr) {
      buf += ch
      if (escaped) escaped = false
      else if (ch === '\\' && inStr === '"') escaped = true
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue }
    if (ch === '[' || ch === '{') { depth++; buf += ch; continue }
    if (ch === ']' || ch === '}') { depth--; buf += ch; continue }
    if (ch === sep && depth === 0) { out.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf.trim() !== '') out.push(buf)
  return out
}

export function exportToYaml(def: WorkflowDefinition): string {
  return toYaml(toPersistableDefinition(def) as unknown as Json)
}

const VALID_TYPES = new Set<string>(Object.values(BlockEnum))

/** Parse and deeply validate a WorkflowDefinition. Invalid input fails loudly. */
export function importFromYaml(text: string): WorkflowDefinition {
  const v = parseYaml(text)
  if (!isPlainObject(v)) throw new YamlError('根节点必须是对象', 1)
  if (v.version !== '1.0') throw new YamlError(`不支持的 version: ${String(v.version)}`, 1)
  if (typeof v.name !== 'string') throw new YamlError('name 必须是字符串', 1)
  if (!Array.isArray(v.nodes)) throw new YamlError('nodes 必须是数组', 1)
  if (!Array.isArray(v.edges)) throw new YamlError('edges 必须是数组', 1)

  const ids = new Set<string>()
  for (const [i, n] of v.nodes.entries()) {
    if (!isPlainObject(n)) throw new YamlError(`nodes[${i}] 必须是对象`, 1)
    if (typeof n.id !== 'string' || !n.id) throw new YamlError(`nodes[${i}].id 无效`, 1)
    if (ids.has(n.id)) throw new YamlError(`重复的节点 id: ${n.id}`, 1)
    ids.add(n.id)
    if (typeof n.type !== 'string' || !VALID_TYPES.has(n.type)) {
      throw new YamlError(`nodes[${i}].type 不支持: ${String(n.type)}`, 1)
    }
    if (!isPlainObject(n.position) || typeof n.position.x !== 'number' || typeof n.position.y !== 'number') {
      throw new YamlError(`nodes[${i}].position 无效`, 1)
    }
    if (!isPlainObject(n.data)) throw new YamlError(`nodes[${i}].data 必须是对象`, 1)
  }
  const edgeIds = new Set<string>()
  for (const [i, e] of v.edges.entries()) {
    if (!isPlainObject(e)) throw new YamlError(`edges[${i}] 必须是对象`, 1)
    if (typeof e.id !== 'string' || !e.id || edgeIds.has(e.id)) {
      throw new YamlError(`edges[${i}].id 无效或重复`, 1)
    }
    edgeIds.add(e.id)
    if (typeof e.source !== 'string' || !ids.has(e.source)) {
      throw new YamlError(`edges[${i}].source 引用了不存在的节点`, 1)
    }
    if (typeof e.target !== 'string' || !ids.has(e.target)) {
      throw new YamlError(`edges[${i}].target 引用了不存在的节点`, 1)
    }
  }
  return v as unknown as WorkflowDefinition
}
