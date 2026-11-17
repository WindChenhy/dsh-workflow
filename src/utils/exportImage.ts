import type { AppNode, AppEdge } from '../types/workflow'
import { BlockEnum } from '../types/workflow'

type ExportOptions = {
  padding?: number
  background?: string
  scale?: number
  workflowName?: string
}

const NODE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; headerBg: string }> = {
  [BlockEnum.Start]: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', dot: '#3b82f6', headerBg: '#dbeafe' },
  [BlockEnum.End]: { bg: '#fff7ed', border: '#f97316', text: '#c2410c', dot: '#f97316', headerBg: '#ffedd5' },
  [BlockEnum.HttpRequest]: { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8', dot: '#3b82f6', headerBg: '#dbeafe' },
  [BlockEnum.IfElse]: { bg: '#ecfeff', border: '#06b6d4', text: '#0e7490', dot: '#06b6d4', headerBg: '#cffafe' },
  [BlockEnum.Delay]: { bg: '#f5f3ff', border: '#8b5cf6', text: '#6d28d9', dot: '#8b5cf6', headerBg: '#ede9fe' },
  [BlockEnum.Log]: { bg: '#f9fafb', border: '#64748b', text: '#475569', dot: '#64748b', headerBg: '#f3f4f6' },
  [BlockEnum.Note]: { bg: '#fefce8', border: '#eab308', text: '#a16207', dot: '#eab308', headerBg: '#fef9c3' },
}

const NODE_W = 240
const NODE_H = 80
const NOTE_W = 200
const NOTE_H = 100

const ICONS: Record<string, string> = {
  [BlockEnum.Start]: '▶',
  [BlockEnum.End]: '■',
  [BlockEnum.HttpRequest]: '🌐',
  [BlockEnum.IfElse]: '◇',
  [BlockEnum.Delay]: '⏱',
  [BlockEnum.Log]: '📝',
  [BlockEnum.Note]: '📌',
}

const LABELS: Record<string, string> = {
  [BlockEnum.Start]: '开始',
  [BlockEnum.End]: '结束',
  [BlockEnum.HttpRequest]: 'HTTP 请求',
  [BlockEnum.IfElse]: '条件判断',
  [BlockEnum.Delay]: '延迟',
  [BlockEnum.Log]: '日志输出',
  [BlockEnum.Note]: '便签',
}

/** Compute the bounding box of all nodes */
function computeBounds(nodes: AppNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 400 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    const w = n.data.type === BlockEnum.Note ? NOTE_W : NODE_W
    const h = n.data.type === BlockEnum.Note ? NOTE_H : NODE_H
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  return { minX, minY, maxX, maxY }
}

/** Build a simple edge path between two points (right→left for normal, top→bottom for else) */
function edgePath(sx: number, sy: number, tx: number, ty: number, sourceHandle?: string | null, _targetHandle?: string | null): string {
  // Source handle on right (or bottom for else)
  const isElse = sourceHandle === 'false'
  let startX = sx
  let startY = sy
  let endX = tx
  let endY = ty
  if (isElse) {
    startY = sy // bottom of source
  }
  // Smooth curve
  const dx = Math.max(40, Math.abs(endX - startX) * 0.5)
  if (isElse) {
    return `M ${startX} ${startY} C ${startX} ${startY + 40}, ${endX} ${endY - 40}, ${endX} ${endY}`
  }
  return `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`
}

/** Render workflow to an SVG string */
export function renderSvg(nodes: AppNode[], edges: AppEdge[], options: ExportOptions = {}): string {
  const padding = options.padding ?? 40
  const background = options.background ?? '#ffffff'
  const titleBar = options.workflowName ?? '工作流'
  const { minX, minY, maxX, maxY } = computeBounds(nodes)
  const width = maxX - minX + padding * 2
  const height = maxY - minY + padding * 2 + 30 // +30 for title bar
  const offX = -minX + padding
  const offY = -minY + padding + 30

  const edgeElems = edges.map((e) => {
    const sn = nodes.find((n) => n.id === e.source)
    const tn = nodes.find((n) => n.id === e.target)
    if (!sn || !tn) return ''
    const sIsElse = e.sourceHandle === 'false'
    const sx = sn.position.x + NODE_W + offX
    const sy = (sIsElse ? sn.position.y + NODE_H : sn.position.y + NODE_H / 2) + offY
    const tx = tn.position.x + offX
    const ty = tn.position.y + NODE_H / 2 + offY
    const d = edgePath(sx, sy, tx, ty, e.sourceHandle, e.targetHandle)
    const isElse = e.sourceHandle === 'false'
    return `<path d="${d}" stroke="${isElse ? '#ef4444' : '#94a3b8'}" stroke-width="2" fill="none" />
            <polygon points="${tx - 4},${ty - 4} ${tx},${ty} ${tx - 4},${ty + 4}" fill="${isElse ? '#ef4444' : '#94a3b8'}" />`
  }).join('\n')

  const nodeElems = nodes.map((n) => {
    const colors = NODE_COLORS[n.data.type] || NODE_COLORS[BlockEnum.HttpRequest]
    const icon = ICONS[n.data.type] || '?'
    const label = LABELS[n.data.type] || n.data.type
    const isNote = n.data.type === BlockEnum.Note
    const x = n.position.x + offX
    const y = n.position.y + offY
    const w = isNote ? NOTE_W : NODE_W
    const h = isNote ? NOTE_H : NODE_H
    const d = n.data as Record<string, unknown>

    if (isNote) {
      const text = (d.text as string) || ''
      return `<g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1.5" />
        <text x="${x + 12}" y="${y + 22}" font-family="system-ui, sans-serif" font-size="11" fill="${colors.text}" font-weight="500">${escapeXml(label)}</text>
        <foreignObject x="${x + 12}" y="${y + 30}" width="${w - 24}" height="${h - 40}">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:system-ui,sans-serif;font-size:11px;color:#666;line-height:1.4;overflow:hidden">${escapeXml(text)}</div>
        </foreignObject>
      </g>`
    }

    // Method/url hint for HTTP
    let body = ''
    if (n.data.type === BlockEnum.HttpRequest) {
      const method = (d.method as string) || 'GET'
      const url = (d.url as string) || ''
      body = `
        <g transform="translate(${x + 12}, ${y + 44})">
          <rect width="38" height="16" rx="3" fill="#dbeafe" />
          <text x="19" y="12" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#1d4ed8" text-anchor="middle">${method}</text>
          <text x="46" y="12" font-family="ui-monospace, monospace" font-size="10" fill="#6b7280">${escapeXml(truncate(url, 24) || '(URL未配置)')}</text>
        </g>`
    } else if (n.data.type === BlockEnum.IfElse) {
      const expr = (d.expression as string) || ''
      body = `
        <text x="${x + 12}" y="${y + 56}" font-family="ui-monospace, monospace" font-size="10" fill="#6b7280">${escapeXml(truncate(expr, 26) || '(条件未配置)')}</text>`
    } else if (n.data.type === BlockEnum.Delay) {
      const dur = (d.duration as number) || 0
      body = `<text x="${x + 12}" y="${y + 56}" font-family="ui-monospace, monospace" font-size="10" fill="#6b7280">${dur}ms</text>`
    } else if (n.data.type === BlockEnum.Log) {
      const msg = (d.message as string) || ''
      body = `<text x="${x + 12}" y="${y + 56}" font-family="system-ui, sans-serif" font-size="10" fill="#6b7280">${escapeXml(truncate(msg, 26) || '(无消息)')}</text>`
    } else if (n.data.type === BlockEnum.Start) {
      body = `<text x="${x + w / 2}" y="${y + 50}" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">工作流的起点</text>`
    } else if (n.data.type === BlockEnum.End) {
      body = `<text x="${x + w / 2}" y="${y + 50}" font-family="system-ui, sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">工作流的终点</text>`
    }

    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="white" stroke="${colors.border}" stroke-width="1" />
      <rect x="${x}" y="${y}" width="${w}" height="32" rx="10" fill="${colors.headerBg}" />
      <rect x="${x}" y="${y + 22}" width="${w}" height="10" fill="${colors.headerBg}" />
      <circle cx="${x + 14}" cy="${y + 16}" r="4" fill="${colors.dot}" />
      <text x="${x + 26}" y="${y + 20}" font-family="system-ui, sans-serif" font-size="13" font-weight="500" fill="#1f2937">${escapeXml(n.data.title || label)}</text>
      <text x="${x + w - 12}" y="${y + 20}" font-family="system-ui, sans-serif" font-size="10" font-weight="500" fill="${colors.text}" text-anchor="end">${icon} ${escapeXml(label)}</text>
      ${body}
    </g>`
  }).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${background}" />
    <text x="${padding}" y="22" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#1f2937">${escapeXml(titleBar)}</text>
    <text x="${width - padding}" y="22" font-family="system-ui, sans-serif" font-size="10" fill="#9ca3af" text-anchor="end">Dify-style Workflow · ${nodes.length} nodes · ${edges.length} edges</text>
    ${edgeElems}
    ${nodeElems}
  </svg>`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

/** Convert an SVG string to a PNG data URL by drawing it on a canvas */
async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const w = img.width * scale
      const h = img.height * scale
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

/** Export workflow as a PNG Blob */
export async function exportToPng(nodes: AppNode[], edges: AppEdge[], options: ExportOptions = {}): Promise<Blob> {
  const svg = renderSvg(nodes, edges, options)
  return svgToPng(svg, options.scale ?? 2)
}

/** Export workflow as a PDF Blob (single page, JPEG/XObject DCTDecode). */
export async function exportToPdf(nodes: AppNode[], edges: AppEdge[], options: ExportOptions = {}): Promise<Blob> {
  const svg = renderSvg(nodes, edges, options)
  const png = await svgToPng(svg, options.scale ?? 2)
  const jpeg = await pngToJpeg(png)
  const pdf = buildPdfWithJpeg(jpeg.bytes, jpeg.width, jpeg.height)
  return new Blob([toArrayBuffer(pdf)], { type: 'application/pdf' })
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** PNG -> JPEG. PDF's DCTDecode filter expects JPEG bytes, not PNG bytes. */
async function pngToJpeg(blob: Blob): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('PNG 解码失败'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('JPEG 编码失败')), 'image/jpeg', 0.92)
    })
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Build a minimal single-page PDF embedding JPEG bytes with DCTDecode. */
function buildPdfWithJpeg(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  let position = 0
  const write = (value: string | Uint8Array): void => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value
    parts.push(bytes)
    position += bytes.length
  }

  const margin = 20
  const scale = Math.min((595 - margin * 2) / width, (842 - margin * 2) / height)
  const drawW = width * scale
  const drawH = height * scale
  const drawX = (595 - drawW) / 2
  const drawY = margin + (842 - margin * 2 - drawH) / 2
  const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`
  const contentBytes = encoder.encode(content)

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  write(header)
  const offsets: number[] = []

  offsets.push(position)
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  offsets.push(position)
  write('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n')
  offsets.push(position)
  write('3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 5 0 R >> /ProcSet [/PDF /ImageC] >> /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n')
  offsets.push(position)
  write(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
  write(contentBytes)
  write('\nendstream\nendobj\n')
  offsets.push(position)
  write(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  write(jpeg)
  write('\nendstream\nendobj\n')

  const xref = position
  write('xref\n0 6\n0000000000 65535 f \n')
  for (const offset of offsets) write(`${offset.toString().padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const output = new Uint8Array(position)
  let cursor = 0
  for (const part of parts) { output.set(part, cursor); cursor += part.length }
  return output
}

/** Trigger a download for a Blob */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

