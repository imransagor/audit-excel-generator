import { create } from 'zustand'

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

interface AppState {
  stage: Stage
  logs: LogEntry[]
  result: ResultData | null
  error: string | null
  pdfPath: string | null
  showSettings: boolean

  setStage: (s: Stage) => void
  addLog: (stage: string, message: string) => void
  clearLogs: () => void
  setResult: (r: ResultData) => void
  setError: (e: string) => void
  setPdfPath: (p: string | null) => void
  setShowSettings: (v: boolean) => void
  reset: () => void
}

let logId = 0

export const useStore = create<AppState>((set) => ({
  stage: 'idle',
  logs: [],
  result: null,
  error: null,
  pdfPath: null,
  showSettings: false,

  setStage: (stage) => set({ stage }),
  addLog: (stage, message) =>
    set((s) => ({ logs: [...s.logs, { id: logId++, stage, message, ts: Date.now() }] })),
  clearLogs: () => set({ logs: [] }),
  setResult: (result) => set({ result, stage: 'ready' }),
  setError: (error) => set({ error, stage: 'error' }),
  setPdfPath: (pdfPath) => set({ pdfPath }),
  setShowSettings: (showSettings) => set({ showSettings }),
  reset: () => set({ stage: 'idle', logs: [], result: null, error: null, pdfPath: null })
}))
