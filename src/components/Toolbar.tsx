import { memo, useRef, useState, useCallback, useEffect } from 'react'
import { useWorkflowStore } from '../store/workflowStore'
import { useSimulationRunner } from '../hooks/useSimulationRunner'
import { getLayout } from '../utils/layout'
import type { WorkflowDefinition, AppNode, AppEdge } from '../types/workflow'
import { HistoryPanel } from './HistoryPanel'
import { BundlePanel } from './BundlePanel'
import { ZoomControls } from './ZoomControls'
import { RunHistory } from './RunHistory'
import { exportToPdf, exportToPng, downloadBlob, renderSvg } from '../utils/exportImage'
import { exportToYaml, importFromYaml } from '../utils/yaml'

export const Toolbar = memo(function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const yamlFileInputRef = useRef<HTMLInputElement>(null)
  const workflowName = useWorkflowStore((s) => s.workflowName)
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName)
  const validate = useWorkflowStore((s) => s.validate)
  const exportToJSON = useWorkflowStore((s) => s.exportToJSON)
  const importFromJSON = useWorkflowStore((s) => s.importFromJSON)
  const startSimulation = useWorkflowStore((s) => s.startSimulation)
  const stepSimulation = useWorkflowStore((s) => s.stepSimulation)
  const simulation = useWorkflowStore((s) => s.simulation)
  const nodes = useWorkflowStore((s) => s.nodes)
  const edges = useWorkflowStore((s) => s.edges)
  const setNodesAndEdges = useWorkflowStore((s) => s.setNodesAndEdges)
  const { resetSimulation } = useSimulationRunner()

  // Canvas mode: pointer (box-select) vs hand (pan). Stored in Zustand so the
  // WorkflowCanvas re-renders when this changes (avoids the window-bridge delay).
  const controlMode = useWorkflowStore((s) => s.canvasMode)
  const setCanvasMode = useWorkflowStore((s) => s.setCanvasMode)

  const handleExport = () => {
    const def = exportToJSON()
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${def.name.replace(/\s+/g, '_')}.workflow.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const def = JSON.parse(text) as WorkflowDefinition
      if (!def.version || !def.nodes || !def.edges) {
        alert('无效的工作流文件格式')
        return
      }
      importFromJSON(def)
    } catch {
      alert('文件解析失败')
    }
    e.target.value = ''
  }

  const handleExportYaml = () => {
    const def = exportToJSON()
    const text = exportToYaml(def)
    const blob = new Blob([text], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(workflowName || 'workflow').replace(/\s+/g, '_')}.workflow.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportYaml = () => yamlFileInputRef.current?.click()

  const handleYamlFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const def = importFromYaml(text)
      importFromJSON(def)
    } catch (err) {
      alert(`YAML 解析失败: ${err instanceof Error ? err.message : String(err)}`)
    }
    e.target.value = ''
  }

  const handleAutoLayout = () => {
    const layout = getLayout(nodes, edges)
    const updated = nodes.map((n) => {
      const pos = layout.get(n.id)
      if (pos) return { ...n, position: pos }
      return n
    })
    setNodesAndEdges(updated, edges)
  }

  const handleUndo = useCallback(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __workflowUndo?: () => void }
    w.__workflowUndo?.()
  }, [])

  const handleRedo = useCallback(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __workflowRedo?: () => void }
    w.__workflowRedo?.()
  }, [])

  const isIdle = simulation.status === 'idle'

  // F11 toggles fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('workflow:toggleFullscreen'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggleFullscreen = () => {
    window.dispatchEvent(new CustomEvent('workflow:toggleFullscreen'))
  }

  return (
    <header className="h-12 border-b border-gray-200 bg-white flex items-center gap-1 px-3 shrink-0 select-none">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 mr-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
          W
        </div>
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="text-sm font-semibold text-gray-800 bg-transparent border-none focus:outline-none focus:bg-gray-50 px-2 py-1 rounded w-32"
          placeholder="未命名流程"
        />
      </div>

      <div className="flex-1" />

      {/* Undo / Redo with history panel trigger */}
      <div className="flex items-center gap-0.5 mr-2">
        <button
          onClick={handleUndo}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="撤销 (Ctrl+Z)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 7H3a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 1v6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M13 3a5 5 0 0 1 0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <button
          onClick={handleRedo}
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="重做 (Ctrl+Shift+Z)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M12 7h1a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 1v6L9 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 3a5 5 0 0 0 0 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <HistoryPanel />
        <BundlePanel />
      </div>

      {/* Zoom controls (scale + zoom to fit) */}
      <ZoomControls />

      {/* Run history */}
      <RunHistory />

      {/* Mode toggle */}
      <div className="flex items-center bg-gray-100 rounded-md p-0.5 mr-2">
        <button
          onClick={() => setCanvasMode('pointer')}
          className={`w-7 h-6 flex items-center justify-center rounded text-xs transition-colors ${controlMode === 'pointer' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          title="指针模式 (拖拽空白处可框选)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l4.5 12 1.5-5 5-1.5L2 2z" fill="currentColor"/></svg>
        </button>
        <button
          onClick={() => setCanvasMode('hand')}
          className={`w-7 h-6 flex items-center justify-center rounded text-xs transition-colors ${controlMode === 'hand' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          title="拖拽模式 (按住 Space 可临时切换)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M7 2v4H3V2h4zm6 0v4H9V2h4zM7 10v4H3v-4h4zm6 0v4H9v-4h4z" fill="currentColor"/></svg>
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Simulation controls */}
      {isIdle ? (
        <>
          <button
            onClick={() => startSimulation('auto')}
            className="flex items-center gap-1 h-7 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 px-3 rounded-md transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 12" fill="currentColor"><path d="M0 0l10 6-10 6V0z"/></svg>
            运行
          </button>
          <button
            onClick={() => startSimulation('step')}
            className="flex items-center gap-1 h-7 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 px-3 rounded-md transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="0.5" y="0.5" width="3" height="11" rx="0.5"/><rect x="6.5" y="0.5" width="3" height="11" rx="0.5"/></svg>
            单步
          </button>
        </>
      ) : simulation.status === 'running' ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-blue-600 mr-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            {simulation.mode === 'auto' ? '运行中' : '单步调试'}
          </span>
          {simulation.mode === 'step' && (
            <button onClick={() => stepSimulation()} className="h-7 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 rounded-md">
              下一步
            </button>
          )}
          <button onClick={resetSimulation} className="h-7 text-xs text-gray-500 hover:text-gray-700 px-2 rounded hover:bg-gray-100">
            停止
          </button>
        </>
      ) : simulation.status === 'completed' ? (
        <>
          <span className="text-xs text-green-600 mr-2 flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#22c55e" stroke="white" strokeWidth="2"/><path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            完成
          </span>
          <button onClick={resetSimulation} className="h-7 text-xs text-gray-500 hover:text-gray-700 px-2 rounded hover:bg-gray-100">重置</button>
        </>
      ) : (
        <>
          <span className="text-xs text-red-500 mr-2">{simulation.error}</span>
          <button onClick={resetSimulation} className="h-7 text-xs text-gray-500 hover:text-gray-700 px-2 rounded hover:bg-gray-100">重置</button>
        </>
      )}

      {/* Separator */}
      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Actions */}
      <button onClick={handleAutoLayout} className="h-7 text-xs text-gray-600 hover:text-gray-800 px-2 rounded hover:bg-gray-100 transition-colors" title="自动布局">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4.5h2M4.5 7v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      </button>
      <button onClick={validate} className="h-7 text-xs text-gray-600 hover:text-gray-800 px-2 rounded hover:bg-gray-100 transition-colors" title="校验">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 4L6 12 2.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button onClick={handleExport} className="h-7 text-xs text-gray-600 hover:text-gray-800 px-2 rounded hover:bg-gray-100 transition-colors" title="导出 JSON">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button onClick={handleImport} className="h-7 text-xs text-gray-600 hover:text-gray-800 px-2 rounded hover:bg-gray-100 transition-colors" title="导入 JSON">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 4l3-3 3 3M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      <button onClick={handleExportYaml} className="h-7 text-xs text-gray-600 hover:text-gray-800 px-2 rounded hover:bg-gray-100 transition-colors" title="导出 YAML（兼容 Dify 生态）">
        <span className="font-mono text-[10px] font-bold">YAML</span>
      </button>
      <button onClick={handleImportYaml} className="h-7 text-xs text-gray-600 hover:text-gray-800 px-2 rounded hover:bg-gray-100 transition-colors" title="导入 YAML">
        <span className="font-mono text-[10px] font-bold opacity-70">↑YAML</span>
      </button>

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded hover:bg-gray-100 transition-colors"
        title="全屏 (F11)"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 5V2h3M14 5V2h-3M2 11v3h3M14 11v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Export Image / PDF */}
      <ExportDropdown
        workflowName={workflowName}
        nodes={nodes}
        edges={edges}
      />

      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
      <input ref={yamlFileInputRef} type="file" accept=".yaml,.yml" onChange={handleYamlFileChange} className="hidden" />
    </header>
  )
})

/* ─── Export dropdown ─── */
const ExportDropdown = memo(function ExportDropdown({ workflowName, nodes, edges }: { workflowName: string; nodes: AppNode[]; edges: AppEdge[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const slug = (workflowName || 'workflow').replace(/\s+/g, '_')

  const handlePng = async () => {
    setBusy('png')
    try {
      const blob = await exportToPng(nodes, edges, { workflowName })
      downloadBlob(blob, `${slug}.png`)
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }

  const handlePdf = async () => {
    setBusy('pdf')
    try {
      const blob = await exportToPdf(nodes, edges, { workflowName })
      downloadBlob(blob, `${slug}.pdf`)
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }

  const handleSvg = () => {
    const svg = renderSvg(nodes, edges, { workflowName })
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    downloadBlob(blob, `${slug}.svg`)
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={
          'h-7 text-xs px-2 rounded transition-colors flex items-center gap-1 ' +
          (open ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100')
        }
        title="导出为图片 / PDF"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M2 11l3-3 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="11" cy="6" r="1.2" fill="currentColor"/>
        </svg>
        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-48 bg-white rounded-lg border border-gray-200 shadow-2xl py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
            导出当前画布
          </div>
          <button
            onClick={handlePng}
            disabled={busy !== null}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold">PNG</span>
            <span className="flex-1">{busy === 'png' ? '正在生成…' : 'PNG 图片'}</span>
            <span className="text-[10px] text-gray-400 font-mono">.png</span>
          </button>
          <button
            onClick={handlePdf}
            disabled={busy !== null}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-5 h-5 rounded bg-red-50 text-red-600 flex items-center justify-center text-[10px] font-bold">PDF</span>
            <span className="flex-1">{busy === 'pdf' ? '正在生成…' : 'PDF 文档'}</span>
            <span className="text-[10px] text-gray-400 font-mono">.pdf</span>
          </button>
          <button
            onClick={handleSvg}
            disabled={busy !== null}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span className="w-5 h-5 rounded bg-violet-50 text-violet-600 flex items-center justify-center text-[10px] font-bold">SVG</span>
            <span className="flex-1">SVG 矢量图</span>
            <span className="text-[10px] text-gray-400 font-mono">.svg</span>
          </button>
        </div>
      )}
    </div>
  )
})
