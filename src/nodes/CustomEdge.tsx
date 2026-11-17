import { memo, useCallback, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { AppEdge } from '../types/workflow'

/**
 * CustomEdge — Dify-style smooth-step edges with hover highlight, delete button,
 * and source/target node highlighting via the `edge-hovering` class on the wrapper.
 */
const CustomEdge = memo((props: EdgeProps<AppEdge>) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
    label,
    style,
  } = props

  const [hovering, setHovering] = useState(false)

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  })

  const isActive = selected || hovering || data?._hovering
  const isElse = data?.sourceType === 'if-else' && props.sourceHandleId === 'false'

  const onEdgeClick = useCallback((evt: React.MouseEvent) => {
    evt.stopPropagation()
  }, [])

  return (
    <>
      {/* Invisible wider path for easier hover/click */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction cursor-pointer"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        onClick={onEdgeClick}
        className={hovering ? 'edge-hovering' : ''}
        style={{
          strokeWidth: isActive ? 3 : 2,
          stroke: isElse
            ? (isActive ? '#ef4444' : '#fca5a5')
            : data?._sourceRunningStatus === 'succeeded'
              ? '#22c55e'
              : isActive
                ? '#3b82f6'
                : '#94a3b8',
          transition: 'stroke 0.15s, stroke-width 0.15s',
          ...style,
        }}
      />

      {/* Hover info: source + target node IDs rendered as a small pill on the edge */}
      {hovering && (
        <EdgeLabelRenderer>
          <div
            className="absolute flex items-center gap-1.5 bg-white border border-gray-200 rounded-md shadow-md px-2 py-1 text-[10px] font-medium text-gray-700 pointer-events-none animate-in fade-in"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 28}px)`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="font-mono">{data?.sourceType ?? 'source'}</span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 4h6M5 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="font-mono">{data?.targetType ?? 'target'}</span>
            {isElse && (
              <span className="ml-1 text-red-500 font-semibold">ELSE</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Delete button on hover */}
      {hovering && (
        <EdgeLabelRenderer>
          <button
            className="absolute bg-white border border-red-200 text-red-500 rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-50 hover:border-red-300 shadow-sm cursor-pointer"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
            onClick={(e) => {
              e.stopPropagation()
              const event = new CustomEvent('remove-edge', { detail: { edgeId: id } })
              window.dispatchEvent(event)
            }}
            title="删除连线"
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}

      {/* Edge label (e.g. condition description) */}
      {label && (
        <EdgeLabelRenderer>
          <div
            className="absolute bg-white px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-500 border border-gray-200 shadow-sm pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Midpoint "+" hint for inserting a node on this edge (visible on hover) */}
      {hovering && (
        <EdgeLabelRenderer>
          <div
            className="absolute pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 ring-4 ring-blue-100 animate-pulse" />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

CustomEdge.displayName = 'CustomEdge'
export default memo(CustomEdge)
