import { contextBridge, ipcRenderer } from 'electron'
import type { PipelineEvent, BatchFileEvent } from '../main/types'

contextBridge.exposeInMainWorld('api', {
  // ── Single-file pipeline ──────────────────────────────────────────────────
  runPipeline: (pdfPath: string) =>
    ipcRenderer.invoke('pipeline:run', pdfPath),

  onPipelineEvent: (cb: (event: PipelineEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: PipelineEvent) => cb(event)
    ipcRenderer.on('pipeline:event', handler)
    return () => ipcRenderer.removeListener('pipeline:event', handler)
  },

  // ── Batch pipeline ────────────────────────────────────────────────────────
  batch: {
    run: (inputDir: string, outputDir: string) =>
      ipcRenderer.invoke('batch:run', inputDir, outputDir),

    stop: () =>
      ipcRenderer.invoke('batch:stop'),

    retryFailed: (failedPaths: string[], outputDir: string) =>
      ipcRenderer.invoke('batch:retryFailed', failedPaths, outputDir),

    onFileStatus: (cb: (event: BatchFileEvent) => void) => {
      const handler = (_: Electron.IpcRendererEvent, event: BatchFileEvent) => cb(event)
      ipcRenderer.on('batch:fileStatus', handler)
      return () => ipcRenderer.removeListener('batch:fileStatus', handler)
    }
  },

  // ── Config (batch folder paths) ───────────────────────────────────────────
  config: {
    getBatchFolders: (): Promise<{ inputDir: string | null; outputDir: string | null }> =>
      ipcRenderer.invoke('config:getBatchFolders'),

    setBatchFolders: (dirs: { inputDir: string; outputDir: string }) =>
      ipcRenderer.invoke('config:setBatchFolders', dirs)
  },

  // ── File dialogs ──────────────────────────────────────────────────────────
  openPdfDialog: () =>
    ipcRenderer.invoke('dialog:openPdf'),

  openFolderDialog: () =>
    ipcRenderer.invoke('dialog:openFolder'),

  saveExcel: (filename: string, buffer: Buffer) =>
    ipcRenderer.invoke('dialog:saveExcel', filename, buffer),

  // ── Secrets ───────────────────────────────────────────────────────────────
  secrets: {
    set: (service: 'anthropic' | 'llamaparse', key: string) =>
      ipcRenderer.invoke('secrets:set', service, key),
    get: (service: 'anthropic' | 'llamaparse') =>
      ipcRenderer.invoke('secrets:get', service),
    hasAll: () =>
      ipcRenderer.invoke('secrets:hasAll'),
    test: (service: 'anthropic' | 'llamaparse') =>
      ipcRenderer.invoke('secrets:test', service)
  }
})
