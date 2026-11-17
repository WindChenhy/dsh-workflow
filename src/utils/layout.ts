import dagre from 'dagre'
import type { AppNode, AppEdge } from '../types/workflow'
import { NODE_WIDTH, NODE_LAYOUT_HORIZONTAL_PADDING, NODE_LAYOUT_VERTICAL_PADDING, NODE_LAYOUT_MIN_DISTANCE } from '../constants'

export type LayoutResult = Map<string, { x: number; y: number }>

const NODE_HEIGHT = 80

/**
 * Auto-layout workflow nodes using dagre (layered graph layout, LR direction).
 * Mirrors Dify's ELK-based approach.
 */
export function getLayout(
  nodes: AppNode[],
  edges: AppEdge[],
): LayoutResult {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    nodesep: NODE_LAYOUT_VERTICAL_PADDING,
    ranksep: NODE_LAYOUT_MIN_DISTANCE,
    marginx: NODE_LAYOUT_HORIZONTAL_PADDING,
    marginy: NODE_LAYOUT_VERTICAL_PADDING,
  })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const result = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const dagreNode = g.node(node.id)
    if (dagreNode) {
      result.set(node.id, {
        x: dagreNode.x - dagreNode.width / 2,
        y: dagreNode.y - dagreNode.height / 2,
      })
    }
  }

  return result
}
