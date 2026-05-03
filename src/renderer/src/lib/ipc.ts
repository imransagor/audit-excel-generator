import type { PipelineEvent } from '../../../main/types'

declare global {
  interface Window {
    api: {
      runPipeline: (pdfPath: string) => Promise<
        | { ok: true; filename: string; buffer: Buffer; validationMismatches: number }
        | { ok: false; error: string }
      >
      openPdfDialog: () => Promise<string | null>
      saveExcel: (filename: string, buffer: Buffer) => Promise<string | null>
      onPipelineEvent: (cb: (event: PipelineEvent) => void) => () => void
      secrets: {
        set: (service: 'anthropic' | 'llamaparse', key: string) => Promise<void>
        get: (service: 'anthropic' | 'llamaparse') => Promise<string | null>
        hasAll: () => Promise<boolean>
        test: (service: 'anthropic' | 'llamaparse') => Promise<{ ok: boolean; error?: string }>
      }
    }
  }
}

export const api = window.api
