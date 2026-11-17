import { memo, useCallback, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import type { AppNode, NoteNodeType } from '../types/workflow'
import { NOTE_THEME_MAP } from '../constants'
import { cn } from '../utils/cn'

/**
 * CustomNoteNode — Dify-style sticky note on canvas.
 * Editable text with theme colors, fixed width, auto-height.
 */
const CustomNoteNode = memo(({ data, selected }: NodeProps<AppNode>) => {
  const note = data as NoteNodeType
  const theme = NOTE_THEME_MAP[note.theme || 'yellow'] || NOTE_THEME_MAP.yellow
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.text || '')
  const textRef = useRef<HTMLTextAreaElement>(null)

  const handleDoubleClick = useCallback(() => {
    setEditing(true)
    setTimeout(() => textRef.current?.focus(), 50)
  }, [])

  const handleBlur = useCallback(() => {
    setEditing(false)
  }, [])

  return (
    <div
      className={cn(
        'relative rounded-lg border shadow-sm transition-shadow',
        theme.bg,
        theme.border,
        selected ? 'ring-2 ring-blue-400 ring-offset-1' : '',
      )}
      style={{ width: data.width || 200, minHeight: 100 }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Handles (left/right) */}
      <Handle type="target" position={Position.Left} id="target" />
      <Handle type="source" position={Position.Right} id="source" />

      {/* Header */}
      <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium', theme.header, theme.text)}>
        <span>📌</span>
        <span className="font-semibold text-[11px]">便签</span>
        {note.author && note.showAuthor && (
          <span className="text-[10px] opacity-60 ml-auto">— {note.author}</span>
        )}
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {editing ? (
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            className={cn('w-full bg-transparent resize-none text-xs outline-none min-h-[50px]', theme.text)}
            autoFocus
          />
        ) : (
          <div
            className={cn('text-xs whitespace-pre-wrap cursor-text min-h-[32px]', theme.text)}
            onClick={handleDoubleClick}
          >
            {text || <span className="opacity-40 italic">双击编辑...</span>}
          </div>
        )}
      </div>
    </div>
  )
})

CustomNoteNode.displayName = 'CustomNoteNode'
export default memo(CustomNoteNode)
