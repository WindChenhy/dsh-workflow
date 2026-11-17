import type { WorkflowDefinition } from '../types/workflow'

/**
 * yaml.ts — Minimal YAML serializer/parser (zero-dependency, browser-friendly)
 * tailored to WorkflowDefinition. Supports:
 *   - Scalars (string, number, boolean, null)
 *   - Block / flow style for objects & arrays
 *   - Indent-based hierarchy
 *
 * Limitations: no anchors/aliases, no multi-line scalars (folded/literal),
 * no comments. Sufficient for round-tripping Dify-compatible workflows.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

const INDENT = 2

function isPlainObject(v: unknown): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

type Line = { indent: number; content: string; lineno: number }

/** Convert a primitive to its YAML scalar form. */
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

function needsQuote(s: string): boolean {
  if (s === '') return true
  // Quote if it contains characters that have YAML meaning
  if (/[:#&*!|>'"%@`{}\[\],\n\r\t]/.test(s)) return true
  if (/^(true|false|null|yes|no|on|off)$/i.test(s)) return true
  if (/^-?\d/.test(s)) return true
  return false
}

/** Serialize a JSON-like value to YAML. */
export function toYaml(value: Json): string {
  return dumpValue(value, 0).replace(/\n+$/, '') + '\n'
}

function dumpValue(v: Json, level: number): string {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return toScalar(v)
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    // Use block style for arrays of objects
    if (v.every((it) => isPlainObject(it))) {
      return v.map((it) => dumpArrayItem(it, level)).join('')
    }
    // For arrays of scalars, use flow style
    return '[' + v.map((it) => toScalar(it as Json)).join(', ') + ']'
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v)
    if (keys.length === 0) return '{}'
    return keys.map((k) => dumpKey(k, v[k], level)).join('')
  }
  return ''
}

function dumpArrayItem(item: Record<string, Json>, level: number): string {
  const keys = Object.keys(item)
  if (keys.length === 0) return `${' '.repeat(level)}- {}\n`
  const first = keys[0]
  const firstVal = item[first]
  let head: string
  let rest: string
  if (firstVal === null || typeof firstVal === 'string' || typeof firstVal === 'number' || typeof firstVal === 'boolean') {
    head = `${' '.repeat(level)}- ${first}: ${toScalar(firstVal)}\n`
    rest = keys.slice(1).map((k) => dumpKey(k, item[k], level + INDENT)).join('')
  } else {
    head = `${' '.repeat(level)}- ${first}:\n`
    rest = dumpValue(firstVal, level + INDENT + 2) + '\n' + keys.slice(1).map((k) => dumpKey(k, item[k], level + INDENT + 2)).join('')
  }
  return head + rest
}

function dumpKey(k: string, v: Json, level: number): string {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return `${' '.repeat(level)}${needsKeyQuote(k) ? JSON.stringify(k) : k}: ${toScalar(v)}\n`
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return `${' '.repeat(level)}${k}: []\n`
    if (v.every((it) => isPlainObject(it))) {
      return `${' '.repeat(level)}${k}:\n${v.map((it) => dumpArrayItem(it, level + INDENT)).join('')}`
    }
    return `${' '.repeat(level)}${k}: [${v.map((it) => toScalar(it as Json)).join(', ')}]\n`
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v)
    if (keys.length === 0) return `${' '.repeat(level)}${k}: {}\n`
    return `${' '.repeat(level)}${k}:\n${keys.map((kk) => dumpKey(kk, v[kk], level + INDENT)).join('')}`
  }
  return ''
}

function needsKeyQuote(s: string): boolean {
  if (s === '') return true
  if (/[:#&*!|>'"%@`{}\[\],]/.test(s)) return true
  if (/^-?\d/.test(s)) return true
  return false
}

/* ─── Parser ─── */

export class YamlError extends Error {
  public line: number
  constructor(message: string, line: number) {
    super(`YAML 解析失败 (line ${line}): ${message}`)
    this.line = line
  }
}

/** Parse a YAML string into a JSON value. */
export function parseYaml(src: string): Json {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  // Strip top-level comments and blank lines for parsing — keep them in count for errors
  const items: { indent: number; content: string; lineno: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue
    const indent = raw.match(/^ */)?.[0].length ?? 0
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
  // Detect array or object
  const content = first.content
  if (content.startsWith('- ')) {
    return parseArrayItems(items, start, first.indent)
  }
  if (/^[^\s:#]+/.test(content)) {
    return parseObjectItems(items, start, first.indent)
  }
  throw new YamlError('无法识别的行', first.lineno)
}

function parseArrayItems(items: Line[], start: number, baseIndent: number): ParseResult {
  const out: Json[] = []
  let i = start
  while (i < items.length) {
    const it = items[i]
    if (it.indent < baseIndent) break
    if (it.indent > baseIndent) throw new YamlError('数组项缩进不一致', it.lineno)
    let body = it.content
    if (!body.startsWith('-')) break
    body = body.slice(1).replace(/^ /, '')
    if (body === '') {
      // Nested block under this dash
      const sub = parseBlock(items, i + 1, baseIndent + INDENT)
      out.push(sub.value)
      i = sub.next
      continue
    }
    if (/^[^\s:#]+:/.test(body)) {
      // First key of object
      const sub = parseObjectFromFirst(items, i, baseIndent, body)
      out.push(sub.value)
      i = sub.next
      continue
    }
    // Scalar
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
    const body = it.content
    if (body.startsWith('- ')) break
    const m = body.match(/^("?[^":]+"?):\s*(.*)$/)
    if (!m) throw new YamlError(`无效的属性行: ${body}`, it.lineno)
    const key = unquoteKey(m[1])
    const rest = m[2]
    if (rest === '' || rest === undefined) {
      // Indented block follows
      const next = i + 1
      if (next < items.length && items[next].indent > baseIndent) {
        const sub = parseBlock(items, next, baseIndent + INDENT)
        out[key] = sub.value
        i = sub.next
        continue
      }
      out[key] = null
      i++
      continue
    }
    out[key] = parseScalar(rest, it.lineno)
    i++
  }
  return { value: out, next: i }
}

function parseObjectFromFirst(items: Line[], start: number, baseIndent: number, firstBody: string): ParseResult {
  const obj: Record<string, Json> = {}
  const m = firstBody.match(/^("?[^":]+"?):\s*(.*)$/)
  if (!m) throw new YamlError(`无效的对象项: ${firstBody}`, items[start].lineno)
  const key = unquoteKey(m[1])
  const rest = m[2]
  if (rest === '' || rest === undefined) {
    const next = start + 1
    if (next < items.length && items[next].indent > baseIndent) {
      const sub = parseBlock(items, next, baseIndent + INDENT)
      obj[key] = sub.value
      return { value: obj, next: sub.next }
    }
    obj[key] = null
    return { value: obj, next: start + 1 }
  }
  obj[key] = parseScalar(rest, items[start].lineno)
  return { value: obj, next: start + 1 }
}

function unquoteKey(k: string): string {
  const s = k.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try { return JSON.parse(s.replace(/^'|'$/g, '"')) } catch { return s.slice(1, -1) }
  }
  return s
}

function parseScalar(s: string, lineno: number): Json {
  const t = s.trim()
  if (t === '') return null
  if (t === 'null' || t === '~') return null
  if (t === 'true' || t === 'True' || t === 'TRUE') return true
  if (t === 'false' || t === 'False' || t === 'FALSE') return false
  // Flow array
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim()
    if (inner === '') return []
    // Naive: split on comma
    return inner.split(',').map((x) => parseScalar(x.trim(), lineno))
  }
  // Flow object
  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1).trim()
    if (inner === '') return {}
    const out: Record<string, Json> = {}
    for (const part of splitTopLevel(inner, ',')) {
      const m = part.match(/^("?[^":]+"?):\s*(.*)$/)
      if (!m) throw new YamlError(`无效的流对象项: ${part}`, lineno)
      out[unquoteKey(m[1])] = parseScalar(m[2], lineno)
    }
    return out
  }
  // Quoted string
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try { return JSON.parse(t.replace(/^'|'$/g, '"')) } catch { return t.slice(1, -1) }
  }
  // Number
  if (/^-?\d+$/.test(t)) return parseInt(t, 10)
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t)
  return t
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr: string | null = null
  let buf = ''
  for (const ch of s) {
    if (inStr) {
      buf += ch
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue }
    if (ch === '[' || ch === '{') { depth++; buf += ch; continue }
    if (ch === ']' || ch === '}') { depth--; buf += ch; continue }
    if (ch === sep && depth === 0) { out.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf) out.push(buf)
  return out
}

/* ─── WorkflowDefinition helpers ─── */

/** Convert a WorkflowDefinition to a YAML string. */
export function exportToYaml(def: WorkflowDefinition): string {
  return toYaml(def as unknown as Json)
}

/** Parse a YAML string into a WorkflowDefinition (throws on shape mismatch). */
export function importFromYaml(text: string): WorkflowDefinition {
  const v = parseYaml(text)
  if (!isPlainObject(v)) throw new YamlError('根节点必须是对象', 1)
  if (v.version !== '1.0') throw new YamlError(`不支持的 version: ${String(v.version)}`, 1)
  if (!Array.isArray(v.nodes)) throw new YamlError('nodes 必须是数组', 1)
  if (!Array.isArray(v.edges)) throw new YamlError('edges 必须是数组', 1)
  return v as unknown as WorkflowDefinition
}
