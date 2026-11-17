/** React-specific aliases over the shared, DOM-free core model. */
import type { Edge, Node } from '@xyflow/react'
import type { BlockEnum, CommonNodeType, NodeRunningStatus } from '../core/types'

export * from '../core/types'

export type AppNode<T = Record<string, unknown>> = Node<CommonNodeType<T>, string>

export type AppEdge = Edge<{
  sourceType?: BlockEnum
  targetType?: BlockEnum
  _hovering?: boolean
  _isBundled?: boolean
  _sourceRunningStatus?: NodeRunningStatus
  _targetRunningStatus?: NodeRunningStatus
}>
