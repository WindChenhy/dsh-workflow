import { memo, useEffect, useState, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { BlockEnum, NODE_DEFAULTS } from '../types/workflow'

const NODE_W = 240
const NODE_H = 80
const NOTE_W = 200
const NOTE_H = 100

const COLORS: Record<string, { border: string; bg: string; dot: string; label: string; icon: string }> = {
  [BlockEnum.Start]: { border: '#3b82f6', bg: '#eff6ff', dot: '#3b82f6', label: '开始', icon: '▶' },
  [BlockEnum.End]: { border: '#f97316', bg: '#fff7ed', dot: '#f97316', label: '结束', icon: '■' },
  [BlockEnum.HttpRequest]: { border: '#3b82f6', bg: '#eff6ff', dot: '#3b82f6', label: 'HTTP 请求', icon: '🌐' },
  [BlockEnum.IfElse]: { border: '#06b6d4', bg: '#ecfeff', dot: '#06b6d4', label: '条件判断', icon: '◇' },
  [BlockEnum.Delay]: { border: '#8b5cf6', bg: '#f5f3ff', dot: '#8b5cf6', label: '延迟', icon: '⏱' },
  [BlockEnum.Log]: { border: '#64748b', bg: '#f9fafb', dot: '#64748b', label: '日志输出', icon: '📝' },
  [BlockEnum.Note]: { border: '#eab308', bg: '#fefce8', dot: '#eab308', label: '便签', icon: '📌' },
}

/**
 * DropPreview — shows a semi-transparent ghost of the node being dragged from
 * the sidebar, following the cursor over the canvas. Becomes a solid "insert
 * here" indicator when over a valid drop zone.
 */
export const DropPreview = memo(function DropPreview() {
  const rf = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [preview, setPreview] = useState<{
    blockType: BlockEnum
    flowX: number
    flowY: number
    over: boolean
  } | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return

    let currentType: BlockEnum | null = null
    const wrapper = document.querySelector('.react-flow') as HTMLDivElement | null
    wrapperRef.current = wrapper

    const onDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement
      if (!target) return
      const draggable = target.closest('[draggable="true"]') as HTMLElement | null
      if (!draggable) return
      const type = draggable.dataset.blockType as BlockEnum | undefined
      if (type) currentType = type
    }

    const onDragOver = (e: DragEvent) => {
      if (!currentType || !wrapper) return
      const rect = wrapper.getBoundingClientRect()
      const over = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
      try {
        const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        // Center the preview on the cursor
        const w = currentType === BlockEnum.Note ? NOTE_W : NODE_W
        const h = currentType === BlockEnum.Note ? NOTE_H : NODE_H
        setPreview({ blockType: currentType, flowX: flow.x - w / 2, flowY: flow.y - h / 2, over })
      } catch {
        // ignore
      }
    }

    const onDragEnd = () => {
      currentType = null
      setPreview(null)
    }

    document.addEventListener('dragstart', onDragStart)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragend', onDragEnd)
    document.addEventListener('drop', onDragEnd)
    return () => {
      document.removeEventListener('dragstart', onDragStart)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragend', onDragEnd)
      document.removeEventListener('drop', onDragEnd)
    }
  }, [rf])

  if (!preview) return null
  const colors = COLORS[preview.blockType] || COLORS[BlockEnum.HttpRequest]
  const w = preview.blockType === BlockEnum.Note ? NOTE_W : NODE_W
  const h = preview.blockType === BlockEnum.Note ? NOTE_H : NODE_H
  const a = rf.flowToScreenPosition({ x: preview.flowX, y: preview.flowY })
  const b = rf.flowToScreenPosition({ x: preview.flowX + w, y: preview.flowY + h })

  return (
    <div
      className="absolute pointer-events-none z-20"
      style={{
        left: a.x,
        top: a.y,
        width: b.x - a.x,
        height: b.y - a.y,
      }}
    >
      <div
        className="w-full h-full rounded-xl border-2 flex items-center justify-center"
        style={{
          borderColor: colors.border,
          backgroundColor: preview.over ? colors.bg : 'rgba(255,255,255,0.7)',
          opacity: preview.over ? 0.9 : 0.5,
          borderStyle: preview.over ? 'solid' : 'dashed',
          boxShadow: preview.over ? `0 0 0 4px ${colors.dot}30` : 'none',
          transition: 'all 0.1s',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: colors.dot }}
          />
          <span className="text-sm font-medium" style={{ color: colors.border }}>
            {colors.icon} {colors.label}
          </span>
        </div>
        {preview.over && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap" style={{ backgroundColor: colors.border }}>
            放置在此处
          </div>
        )}
      </div>
    </div>
  )
})

void NODE_DEFAULTS
