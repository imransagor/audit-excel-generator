import { create } from 'zustand'
import type { BatchFileStatus } from '../../main/types'

// ── Single-file pipeline state ────────────────────────────────────────────────

export type Stage = 'idle' | 'uploading' | 'parsing' | 'ai' | 'generating' | 'ready' | 'error'

export interface LogEntry {
  id: number
  stage: string
  message: string
  ts: number
}

export interface ResultData {
  filename: string
  buffer: Buffer
  validationMismatches: number
}

// ── Batch state ───────────────────────────────────────────────────────────────

export interface BatchFile {
  path: string
  name: string
  status: BatchFileStatus
  message?: string      // e.g. retry countdown
  outputFile?: string
  error?: string
}

// ── Combined store ────────────────────────────────────────────────────────────

interface AppState {
  // Single-file
  stage: Stage
  logs: LogEntry[]
  result: ResultData | null
  error: string | null
  pdfPath: string | null
  showSettings: boolean

  // Batch
  activeTab: 'single' | 'batch'
  batchInputDir: string | null
  batchOutputDir: string | null
  batchFiles: BatchFile[]
  batchRunning: boolean
  batchTotal: number   // total files reported by the first event of each run

  // Single-file actions
  setStage: (s: Stage) => void
  addLog: (stage: string, message: string) => void
  clearLogs: () => void
  setResult: (r: ResultData) => void
  setError: (e: string) => void
  setPdfPath: (p: string | null) => void
  setShowSettings: (v: boolean) => void
  reset: () => void

  // Batch actions
  setActiveTab: (tab: 'single' | 'batch') => void
  setBatchDirs: (inputDir: string, outputDir: string) => void
  clearBatchFiles: () => void
  setBatchTotal:   (n: number) => void
  updateBatchFile: (path: string, patch: Partial<BatchFile> & { name?: string }) => void
  setBatchRunning: (running: boolean) => void
}

let logId = 0

export const useStore = create<AppState>((set) => ({
  // ── Single-file initial state ─────────────────────────────────────────────
  stage:        'idle',
  logs:         [],
  result:       null,
  error:        null,
  pdfPath:      null,
  showSettings: false,

  // ── Batch initial state ───────────────────────────────────────────────────
  activeTab:      'single',
  batchInputDir:  null,
  batchOutputDir: null,
  batchFiles:     [],
  batchRunning:   false,
  batchTotal:     0,

  // ── Single-file actions ───────────────────────────────────────────────────
  setStage: (stage) => set({ stage }),
  addLog: (stage, message) =>
    set((s) => ({ logs: [...s.logs, { id: logId++, stage, message, ts: Date.now() }] })),
  clearLogs: () => set({ logs: [] }),
  setResult: (result) => set({ result, stage: 'ready' }),
  setError:  (error)  => set({ error, stage: 'error' }),
  setPdfPath: (pdfPath) => set({ pdfPath }),
  setShowSettings: (showSettings) => set({ showSettings }),
  reset: () => set({ stage: 'idle', logs: [], result: null, error: null, pdfPath: null }),

  // ── Batch actions ─────────────────────────────────────────────────────────
  setActiveTab: (activeTab) => set({ activeTab }),

  setBatchDirs: (inputDir, outputDir) =>
    set({ batchInputDir: inputDir, batchOutputDir: outputDir }),

  clearBatchFiles: () => set({ batchFiles: [], batchTotal: 0 }),

  setBatchTotal: (batchTotal) => set({ batchTotal }),

  // Upsert: update the file if it exists, otherwise add it
  updateBatchFile: (path, patch) =>
    set((s) => {
      const exists = s.batchFiles.some((f) => f.path === path)
      if (exists) {
        return { batchFiles: s.batchFiles.map((f) => f.path === path ? { ...f, ...patch } : f) }
      }
      return {
        batchFiles: [
          ...s.batchFiles,
          { path, name: patch.name ?? path, status: 'pending' as const, ...patch }
        ]
      }
    }),

  setBatchRunning: (batchRunning) => set({ batchRunning }),
}))
