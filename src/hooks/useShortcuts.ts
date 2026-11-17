import { useEffect, useRef, useCallback } from 'react'
import { useWorkflowStore } from '../store/workflowStore'

const MOVE_DELTA = 8

type Shortcut = {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean
}

function matchShortcut(e: KeyboardEvent, s: Shortcut): boolean {
  if (e.key.toLowerCase() !== s.key.toLowerCase()) return false
  const wantCtrl = !!s.ctrl
  const wantMeta = !!s.meta
  const wantShift = !!s.shift
  const wantAlt = !!s.alt
  // Match either ctrl or meta when either is requested
  const haveCtrl = e.ctrlKey || e.metaKey
  if (wantCtrl && !haveCtrl) return false
  if (wantMeta && !haveCtrl) return false
  if (wantShift !== e.shiftKey) return false
  if (wantAlt !== e.altKey) return false
  return true
}

/**
 * Hook for global keyboard shortcuts.
 * Skips when target is an editable element (input, textarea, contenteditable).
 */
export function useShortcuts(): void {
  const copySelected = useWorkflowStore((s) => s.copySelected)
  const pasteClipboard = useWorkflowStore((s) => s.pasteClipboard)
  const duplicateSelected = useWorkflowStore((s) => s.duplicateSelected)
  const removeNodes = useWorkflowStore((s) => s.removeNodes)
  const selectAllNodes = useWorkflowStore((s) => s.selectAllNodes)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const moveNodes = useWorkflowStore((s) => s.moveNodes)
  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
  const edges = useWorkflowStore((s) => s.edges)

  // Use refs to avoid re-binding the listener on every change
  const stateRef = useRef({
    selectedNodeIds,
    selectedNodeId,
    edges,
  })
  stateRef.current = { selectedNodeIds, selectedNodeId, edges }

  const isEditableTarget = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (target.isContentEditable) return true
    return false
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Always allow Esc even in inputs
      if (e.key === 'Escape') {
        if (stateRef.current.selectedNodeIds.length > 0) {
          selectNode(null)
          e.preventDefault()
        }
        return
      }

      // Skip other shortcuts when typing in an input
      if (isEditableTarget(e.target)) return

      const { selectedNodeIds: ids } = stateRef.current
      const hasSelection = ids.length > 0

      // Copy
      if (matchShortcut(e, { key: 'c', ctrl: true })) {
        if (hasSelection) {
          copySelected()
          e.preventDefault()
        }
        return
      }

      // Paste
      if (matchShortcut(e, { key: 'v', ctrl: true })) {
        pasteClipboard()
        e.preventDefault()
        return
      }

      // Cut (Cmd/Ctrl+X): copy + delete
      if (matchShortcut(e, { key: 'x', ctrl: true })) {
        if (hasSelection) {
          copySelected()
          removeNodes(ids)
          e.preventDefault()
        }
        return
      }

      // Duplicate (Cmd/Ctrl+D)
      if (matchShortcut(e, { key: 'd', ctrl: true })) {
        if (hasSelection) {
          duplicateSelected()
          e.preventDefault()
        }
        return
      }

      // Select all (Cmd/Ctrl+A)
      if (matchShortcut(e, { key: 'a', ctrl: true })) {
        selectAllNodes()
        e.preventDefault()
        return
      }

      // Undo (Cmd/Ctrl+Z) / Redo (Cmd/Ctrl+Shift+Z)
      if (matchShortcut(e, { key: 'z', ctrl: true, shift: true })) {
        useWorkflowStore.getState().redo()
        e.preventDefault()
        return
      }
      if (matchShortcut(e, { key: 'z', ctrl: true })) {
        useWorkflowStore.getState().undo()
        e.preventDefault()
        return
      }

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasSelection) {
          removeNodes(ids)
          e.preventDefault()
        } else if (stateRef.current.selectedNodeId === null) {
          // No-op when no selection — let Backspace not navigate
        }
        return
      }

      // Arrow keys: move selected nodes by 8px (Shift = 32px)
      const step = e.shiftKey ? MOVE_DELTA * 4 : MOVE_DELTA
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      else if (e.key === 'ArrowRight') dx = step
      else if (e.key === 'ArrowUp') dy = -step
      else if (e.key === 'ArrowDown') dy = step
      if (dx !== 0 || dy !== 0) {
        if (hasSelection) {
          moveNodes({ x: dx, y: dy })
          e.preventDefault()
        }
        return
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }
  }, [
    copySelected,
    pasteClipboard,
    duplicateSelected,
    removeNodes,
    selectAllNodes,
    selectNode,
    moveNodes,
    isEditableTarget,
  ])
}
