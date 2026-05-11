import React, { useCallback } from 'react'
import {
  Folder, Play, Square, RotateCcw,
  CheckCircle, XCircle, Clock, Loader, SkipForward
} from 'lucide-react'
import { useStore } from '../store'
import { api } from '../lib/ipc'
import type { BatchFile } from '../store'

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: BatchFile['status'] }) {
  switch (status) {
    case 'done':       return <CheckCircle size={15} className="text-green-400 shrink-0" />
    case 'failed':     return <XCircle     size={15} className="text-red-400 shrink-0" />
    case 'processing': return <Loader      size={15} className="text-blue-400 shrink-0 animate-spin" />
    case 'retrying':   return <Loader      size={15} className="text-yellow-400 shrink-0 animate-spin" />
    case 'skipped':    return <SkipForward size={15} className="text-slate-500 shrink-0" />
    default:           return <Clock       size={15} className="text-slate-600 shrink-0" />
  }
}

// ── Folder picker row ─────────────────────────────────────────────────────────

function FolderRow({
  label, value, onChange, disabled
}: {
  label: string
  value: string | null
  onChange: (path: string) => void
  disabled: boolean
}) {
  const pick = useCallback(async () => {
    const path = await api.openFolderDialog()
    if (path) onChange(path)
  }, [onChange])

  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-sm w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 truncate min-w-0">
        {value ?? <span className="text-slate-500 italic">Not selected</span>}
      </div>
      <button
        onClick={pick}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600
                   disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-sm transition-colors shrink-0"
      >
        <Folder size={14} />
        Browse
      </button>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({
  completed, total, running
}: {
  completed: number
  total: number
  running: boolean
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-xs text-slate-400">
        <span>
          {total === 0
            ? (running ? 'Scanning folder…' : 'Ready')
            : `${completed} / ${total} files`}
        </span>
        {total > 0 && <span>{pct}%</span>}
      </div>

      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        {total === 0 && running ? (
          // Indeterminate pulse while scanning
          <div className="h-full w-1/3 bg-blue-500 rounded-full animate-pulse" />
        ) : (
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ file }: { file: BatchFile }) {
  const rowBg: Record<BatchFile['status'], string> = {
    pending:    'bg-slate-800/40',
    processing: 'bg-blue-900/20 border border-blue-800/40',
    retrying:   'bg-yellow-900/20 border border-yellow-800/40',
    done:       'bg-green-900/15',
    skipped:    'bg-slate-800/20',
    failed:     'bg-red-900/20',
  }

  const statusLabel: Record<BatchFile['status'], string> = {
    pending:    'Pending',
    processing: 'Processing…',
    retrying:   file.message ?? 'Retrying…',
    done:       file.outputFile ? `Saved: ${file.outputFile}` : 'Done',
    skipped:    'Skipped (already done)',
    failed:     file.error ?? 'Failed',
  }

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg ${rowBg[file.status]}`}
      title={file.status === 'failed' ? file.error : undefined}
    >
      <div className="mt-0.5">
        <StatusIcon status={file.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate font-medium">{file.name}</p>
        <p className={`text-xs truncate mt-0.5 ${
          file.status === 'failed'    ? 'text-red-400' :
          file.status === 'retrying'  ? 'text-yellow-400' :
          file.status === 'processing'? 'text-blue-400' :
          file.status === 'done'      ? 'text-green-400' :
          'text-slate-500'
        }`}>
          {statusLabel[file.status]}
        </p>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BatchPanel() {
  const {
    batchInputDir, batchOutputDir, batchFiles, batchRunning, batchTotal,
    setBatchDirs, clearBatchFiles, setBatchRunning, updateBatchFile
  } = useStore()

  const foldersReady = !!batchInputDir && !!batchOutputDir

  // Derive progress from the file list
  const completed = batchFiles.filter(
    (f) => f.status === 'done' || f.status === 'skipped' || f.status === 'failed'
  ).length
  const total     = batchTotal || batchFiles.length
  const failedFiles = batchFiles.filter((f) => f.status === 'failed')

  // Summary counts for the footer
  const counts = batchFiles.reduce(
    (acc, f) => { acc[f.status] = (acc[f.status] ?? 0) + 1; return acc },
    {} as Partial<Record<BatchFile['status'], number>>
  )

  const handleSetInput = useCallback((path: string) => {
    const out = batchOutputDir ?? ''
    setBatchDirs(path, out)
    api.config.setBatchFolders({ inputDir: path, outputDir: out })
  }, [batchOutputDir, setBatchDirs])

  const handleSetOutput = useCallback((path: string) => {
    const inp = batchInputDir ?? ''
    setBatchDirs(inp, path)
    api.config.setBatchFolders({ inputDir: inp, outputDir: path })
  }, [batchInputDir, setBatchDirs])

  const handleStart = useCallback(async () => {
    if (!batchInputDir || !batchOutputDir) return
    clearBatchFiles()
    setBatchRunning(true)
    try {
      await api.batch.run(batchInputDir, batchOutputDir)
    } finally {
      setBatchRunning(false)
    }
  }, [batchInputDir, batchOutputDir, clearBatchFiles, setBatchRunning])

  const handleStop = useCallback(() => {
    api.batch.stop()
  }, [])

  const handleRetry = useCallback(async () => {
    if (!batchOutputDir || failedFiles.length === 0) return
    // Reset failed files to pending in the list
    failedFiles.forEach((f) => updateBatchFile(f.path, { status: 'pending', error: undefined, message: undefined }))
    setBatchRunning(true)
    try {
      await api.batch.retryFailed(failedFiles.map((f) => f.path), batchOutputDir)
    } finally {
      setBatchRunning(false)
    }
  }, [batchOutputDir, failedFiles, updateBatchFile, setBatchRunning])

  return (
    <div className="flex flex-col gap-4">

      {/* Folder config */}
      <div className="bg-slate-800/50 rounded-xl p-4 flex flex-col gap-3 border border-slate-700">
        <FolderRow label="Input:"  value={batchInputDir}  onChange={handleSetInput}  disabled={batchRunning} />
        <FolderRow label="Output:" value={batchOutputDir} onChange={handleSetOutput} disabled={batchRunning} />
      </div>

      {/* Progress bar — shown once running or files exist */}
      {(batchRunning || batchFiles.length > 0) && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <ProgressBar completed={completed} total={total} running={batchRunning} />

          {/* Current file indicator */}
          {batchRunning && (() => {
            const active = batchFiles.find(
              (f) => f.status === 'processing' || f.status === 'retrying'
            )
            return active ? (
              <p className="text-xs text-slate-400 mt-2 truncate">
                <span className={active.status === 'retrying' ? 'text-yellow-400' : 'text-blue-400'}>
                  {active.status === 'retrying' ? '⏳ Retrying:' : '▶ Processing:'}
                </span>{' '}
                {active.name}
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-2">Starting…</p>
            )
          })()}
        </div>
      )}

      {/* File list */}
      {batchFiles.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-0.5">
          {batchFiles.map((f) => <FileRow key={f.path} file={f} />)}
        </div>
      )}

      {batchFiles.length === 0 && foldersReady && !batchRunning && (
        <p className="text-slate-500 text-sm text-center py-4">
          Click <strong className="text-slate-300">Start</strong> to scan the Input folder and begin processing.
        </p>
      )}

      {/* Controls + summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleStart}
          disabled={!foldersReady || batchRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500
                     disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          <Play size={14} />
          Start
        </button>

        <button
          onClick={handleStop}
          disabled={!batchRunning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600
                     disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-sm transition-colors"
        >
          <Square size={14} />
          Stop
        </button>

        <button
          onClick={handleRetry}
          disabled={batchRunning || failedFiles.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600
                     disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 text-sm transition-colors"
        >
          <RotateCcw size={14} />
          Retry Failed{failedFiles.length > 0 ? ` (${failedFiles.length})` : ''}
        </button>

        {/* Summary */}
        {batchFiles.length > 0 && (
          <span className="ml-auto text-xs text-slate-400">
            {[
              counts.done       && `${counts.done} done`,
              counts.skipped    && `${counts.skipped} skipped`,
              counts.failed     && `${counts.failed} failed`,
              counts.retrying   && `${counts.retrying} retrying`,
              counts.processing && `1 processing`,
              counts.pending    && `${counts.pending} pending`,
            ].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </div>
  )
}
