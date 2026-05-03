import { contextBridge, ipcRenderer } from 'electron'
import type { PipelineEvent } from '../main/types'

contextBridge.exposeInMainWorld('api', {
  runPipeline: (pdfPath: string) =>
    ipcRenderer.invoke('pipeline:run', pdfPath),

  openPdfDialog: () =>
    ipcRenderer.invoke('dialog:openPdf'),

  saveExcel: (filename: string, buffer: Buffer) =>
    ipcRenderer.invoke('dialog:saveExcel', filename, buffer),

  onPipelineEvent: (cb: (event: PipelineEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, event: PipelineEvent) => cb(event)
    ipcRenderer.on('pipeline:event', handler)
    return () => ipcRenderer.removeListener('pipeline:event', handler)
  },

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
