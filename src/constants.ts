// Match Dify's constants
export const NODE_WIDTH = 240
export const X_OFFSET = 60
export const Y_OFFSET = 39
export const NODE_WIDTH_X_OFFSET = NODE_WIDTH + X_OFFSET
export const START_INITIAL_POSITION = { x: 80, y: 282 }
export const AUTO_LAYOUT_OFFSET = { x: -42, y: 243 }

export const NODE_LAYOUT_HORIZONTAL_PADDING = 60
export const NODE_LAYOUT_VERTICAL_PADDING = 60
export const NODE_LAYOUT_MIN_DISTANCE = 100

export const CUSTOM_NODE = 'custom'
export const CUSTOM_NOTE_NODE = 'custom-note'
export const CUSTOM_EDGE = 'custom'

export const NOTE_THEME_MAP: Record<string, Record<string, string>> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', header: 'bg-blue-100' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', header: 'bg-cyan-100' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', header: 'bg-green-100' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', header: 'bg-yellow-100' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', header: 'bg-pink-100' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', header: 'bg-violet-100' },
}
