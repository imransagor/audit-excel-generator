import React, { useEffect, useCallback } from 'react'
import { Settings, FileSpreadsheet } from 'lucide-react'
import { useStore } from './store'
import { api } from './lib/ipc'
import DropZone from './components/DropZone'
import ProgressStepper from './components/ProgressStepper'
import LogTerminal from './components/LogTerminal'
import DownloadCard from './components/DownloadCard'
import SettingsModal from './components/SettingsModal'
import BatchPanel from './components/BatchPanel'
import type { PipelineEvent, BatchFileEvent } from '../../main/types'

export default function App() {
  const {
    stage, logs, result, error, pdfPath,
    showSettings, setShowSettings,
    setStage, addLog, setResult, setError, reset,
    activeTab, setActiveTab,
    batchInputDir, batchOutputDir,
    setBatchDirs, clearBatchFiles, setBatchTotal, updateBatchFile
  } = useStore()

  // ── On mount: load saved batch folders + check API keys ──────────────────
  useEffect(() => {
    api.secrets.hasAll().then((has) => {
      if (!has) setShowSettings(true)
    })

    api.config.getBatchFolders().then(({ inputDir, outputDir }) => {
      if (inputDir && outputDir) setBatchDirs(inputDir, outputDir)
    })
  }, [setShowSettings, setBatchDirs])

  // ── Single-file pipeline events ───────────────────────────────────────────
  useEffect(() => {
    const off = api.onPipelineEvent((event: PipelineEvent) => {
      addLog(event.stage, event.message)
      if (event.stage === 'error') setError(event.message)
    })
    return off
  }, [addLog, setError])

  // ── Batch file status events ──────────────────────────────────────────────
  useEffect(() => {
    const off = api.batch.onFileStatus((event: BatchFileEvent) => {
      // Keep total in sync (reported on every event)
      if (event.total > 0) setBatchTotal(event.total)

      // Skip meta-log events (path is empty string) emitted by the onLog callback
      if (!event.path) return

      updateBatchFile(event.path, {
        name:       event.name,
        status:     event.status,
        message:    event.message,
        outputFile: event.outputFile,
        error:      event.error,
      })
    })
    return off
  }, [setBatchTotal, updateBatchFile])

  // ── Auto-run single-file pipeline when a PDF is selected ─────────────────
  useEffect(() => {
    if (!pdfPath || (stage !== 'idle' && stage !== 'ready' && stage !== 'error')) return

    const run = async () => {
      setStage('uploading')
      addLog('upload', `Selected: ${pdfPath}`)

      const response = await api.runPipeline(pdfPath)

      if (response.ok) {
        setResult({
          filename: response.filename,
          buffer:   response.buffer,
          validationMismatches: response.validationMismatches
        })
      } else {
        setError(response.error)
      }
    }

    run()
  }, [pdfPath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = useCallback(() => reset(), [reset])

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

      {/* Tab bar */}
      <div className="flex border-b border-slate-800 px-6">
        {(['single', 'batch'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-green-400 text-green-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'single' ? 'Single File' : 'Batch'}
          </button>
        ))}
      </div>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-6">
        {activeTab === 'single' ? (
          <>
            {(stage === 'idle' || stage === 'ready' || stage === 'error') && <DropZone />}
            {stage !== 'idle' && <ProgressStepper stage={stage} />}
            {stage === 'error' && error && (
              <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
                <strong>Error:</strong> {error}
              </div>
            )}
            {stage === 'ready' && result && (
              <DownloadCard result={result} onReset={handleReset} />
            )}
            {stage !== 'idle' && <LogTerminal logs={logs} />}
          </>
        ) : (
          <BatchPanel />
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
