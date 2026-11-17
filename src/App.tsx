import { useState, useMemo, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { Sidebar } from './components/Sidebar'
import { PropertyPanel } from './components/PropertyPanel'
import { Toolbar } from './components/Toolbar'
import { ValidationBar } from './components/ValidationBar'
import { SimulationLog } from './components/SimulationLog'
import { VariablePanel } from './components/VariablePanel'
import { RunHistoryPanel } from './components/RunHistoryPanel'
import { useWorkflowStore } from './store/workflowStore'

type RightTab = 'inspector' | 'variables' | 'runs'

function App() {
  const [tab, setTab] = useState<RightTab>('inspector')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const selectedIds = useWorkflowStore((s) => s.selectedNodeIds)
  const envCount = useWorkflowStore((s) => s.envVariables.length)
  const nodeCount = useWorkflowStore((s) => s.nodes.length)
  const runHistoryCount = useWorkflowStore((s) => s.runHistory.length)

  // Show variable badge when env vars exist or any node is on canvas
  const variableBadge = useMemo(() => envCount + nodeCount, [envCount, nodeCount])

  // Expose layout state to other components (avoid prop drilling)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __toggleFullscreen?: () => void; __sidebarCollapsed?: boolean }
    w.__toggleFullscreen = () => setFullscreen((f) => !f)
    w.__sidebarCollapsed = sidebarCollapsed
  }, [sidebarCollapsed])

  // Listen for F11 / Esc-like events: Toolbar dispatches 'workflow:toggleFullscreen'
  useEffect(() => {
    const handler = () => setFullscreen((f) => !f)
    window.addEventListener('workflow:toggleFullscreen', handler)
    return () => window.removeEventListener('workflow:toggleFullscreen', handler)
  }, [])

  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden">
        {/* Top toolbar (hidden in fullscreen) */}
        {!fullscreen && <Toolbar />}

        {/* Validation bar (hidden in fullscreen) */}
        {!fullscreen && <ValidationBar />}

        {/* Main area: sidebar + canvas + right panel */}
        <div className="flex flex-1 overflow-hidden relative">
          {!fullscreen && !sidebarCollapsed && <Sidebar collapsed={false} onCollapsedChange={setSidebarCollapsed} />}
          {fullscreen && (
            <button
              onClick={() => setFullscreen(false)}
              className="absolute top-2 right-2 z-30 h-7 px-2 text-[11px] text-gray-500 hover:text-gray-700 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm flex items-center gap-1"
              title="退出全屏 (Esc)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              退出全屏
            </button>
          )}

          <WorkflowCanvas
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            sidebarCollapsed={sidebarCollapsed}
            fullscreen={fullscreen}
          />

          {/* Right panel with tab switcher (hidden in fullscreen) */}
          {!fullscreen && (
            <div className="w-72 shrink-0 border-l border-gray-200 bg-white flex flex-col">
              <div className="h-9 border-b border-gray-200 flex items-stretch bg-gray-50/50">
                <button
                  onClick={() => setTab('inspector')}
                  className={
                    'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ' +
                    (tab === 'inspector'
                      ? 'bg-white text-blue-600 border-b-2 border-blue-500 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent')
                  }
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  检查器
                  {selectedIds.length > 1 && (
                    <span className="ml-0.5 px-1 text-[9px] rounded-full bg-blue-100 text-blue-700">{selectedIds.length}</span>
                  )}
                </button>
                <button
                  onClick={() => setTab('variables')}
                  className={
                    'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ' +
                    (tab === 'variables'
                      ? 'bg-white text-blue-600 border-b-2 border-blue-500 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent')
                  }
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 5h10v6H3z" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  变量
                  {variableBadge > 0 && (
                    <span className="ml-0.5 px-1 text-[9px] rounded-full bg-gray-200 text-gray-600">{variableBadge}</span>
                  )}
                </button>
                <button
                  onClick={() => setTab('runs')}
                  className={
                    'flex-1 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors ' +
                    (tab === 'runs'
                      ? 'bg-white text-blue-600 border-b-2 border-blue-500 -mb-px'
                      : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent')
                  }
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M8 4v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  运行
                  {runHistoryCount > 0 && (
                    <span className="ml-0.5 px-1 text-[9px] rounded-full bg-gray-200 text-gray-600">{runHistoryCount}</span>
                  )}
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {tab === 'inspector' && <PropertyPanel />}
                {tab === 'variables' && <VariablePanel />}
                {tab === 'runs' && <RunHistoryPanel />}
              </div>
            </div>
          )}
        </div>

        {/* Simulation log overlay */}
        <SimulationLog />
      </div>
    </ReactFlowProvider>
  )
}

export default App
