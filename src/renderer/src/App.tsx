import React, { useEffect, useCallback } from 'react'
import { Settings, FileSpreadsheet } from 'lucide-react'
import { useStore } from './store'
import { api } from './lib/ipc'
import DropZone from './components/DropZone'
import ProgressStepper from './components/ProgressStepper'
import LogTerminal from './components/LogTerminal'
import DownloadCard from './components/DownloadCard'
import SettingsModal from './components/SettingsModal'
import type { PipelineEvent } from '../../main/types'

export default function App() {
  const {
    stage, logs, result, error, pdfPath,
    showSettings, setShowSettings,
    setStage, addLog, setResult, setError, reset
  } = useStore()

  // Check for API keys on startup
  useEffect(() => {
    api.secrets.hasAll().then((has) => {
      if (!has) setShowSettings(true)
    })
  }, [setShowSettings])

  // Listen for pipeline events from main process
  useEffect(() => {
    const off = api.onPipelineEvent((event: PipelineEvent) => {
      addLog(event.stage, event.message)
      if (event.stage === 'error') setError(event.message)
    })
    return off
  }, [addLog, setError])

  // Auto-run pipeline when a PDF path is selected
  useEffect(() => {
    if (!pdfPath || (stage !== 'idle' && stage !== 'ready' && stage !== 'error')) return

    const run = async () => {
      setStage('uploading')
      addLog('upload', `Selected: ${pdfPath}`)

      const response = await api.runPipeline(pdfPath)

      if (response.ok) {
        setResult({
          filename: response.filename,
          buffer: response.buffer,
          validationMismatches: response.validationMismatches
        })
      } else {
        setError(response.error)
      }
    }

    run()
  }, [pdfPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = useCallback(() => {
    reset()
  }, [reset])

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={24} className="text-green-400" />
          <h1 className="text-lg font-semibold text-slate-100">Audit Excel Generator</h1>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-slate-400 hover:text-slate-200 transition-colors"
          title="Settings"
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        {/* Drop zone always visible when idle/ready/error */}
        {(stage === 'idle' || stage === 'ready' || stage === 'error') && (
          <DropZone />
        )}

        {/* Progress stepper when running */}
        {stage !== 'idle' && (
          <ProgressStepper stage={stage} />
        )}

        {/* Error banner */}
        {stage === 'error' && error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Result card */}
        {stage === 'ready' && result && (
          <DownloadCard result={result} onReset={handleReset} />
        )}

        {/* Log terminal — show when pipeline is running or done */}
        {stage !== 'idle' && (
          <LogTerminal logs={logs} />
        )}
      </main>

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
