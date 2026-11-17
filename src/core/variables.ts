import type { VariableType } from './types'

/** Build a `{{#nodeTitle.varName#}}` reference for the editor. */
export function makeVarRef(nodeTitle: string, varName: string): string {
  return `{{#${nodeTitle}.${varName}#}}`
}

/** Parse `{{#...#}}` references from a string. */
export function extractVarRefs(text: string): string[] {
  const re = /\{\{#([^{}]+?)#\}\}/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1])
  return out
}

/**
 * Safe path lookup. Never uses eval/new Function, so model-authored expressions
 * cannot execute code (important for the DSH host side).
 */
export function getByPath(scope: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined
  const parts = path.split('.').filter(Boolean)
  let current: unknown = scope
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export type TemplateResolution = {
  value: string
  missing: string[]
}

/** Resolve all `{{#a.b#}}` references against a variable scope. */
export function resolveTemplateWithReport(
  text: string,
  scope: Record<string, unknown>,
): TemplateResolution {
  const missing: string[] = []
  const value = text.replace(/\{\{#([^{}]+?)#\}\}/g, (_whole, ref: string) => {
    const resolved = getByPath(scope, ref.trim())
    if (resolved === undefined) {
      missing.push(ref.trim())
      return ''
    }
    if (resolved === null) return 'null'
    if (typeof resolved === 'object') return JSON.stringify(resolved)
    return String(resolved)
  })
  return { value, missing }
}

export function resolveTemplate(text: string, scope: Record<string, unknown>): string {
  return resolveTemplateWithReport(text, scope).value
}

/** Coerce a resolved template value to the declared variable type. */
export function coerceVariable(raw: string, type: VariableType): unknown {
  switch (type) {
    case 'number': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    }
    case 'boolean':
      return raw === 'true' || raw === '1'
    case 'object':
    case 'array': {
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return type === 'array' ? [] : {}
      }
    }
    default:
      return raw
  }
}
