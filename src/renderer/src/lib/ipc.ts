import type { PipelineEvent, BatchFileEvent } from '../../../main/types'

declare global {
  interface Window {
    api: {
      // ── Single-file pipeline ────────────────────────────────────────────
      runPipeline: (pdfPath: string) => Promise<
        | { ok: true;  filename: string; buffer: Buffer; validationMismatches: number }
        | { ok: false; error: string }
      >
      onPipelineEvent: (cb: (event: PipelineEvent) => void) => () => void

      // ── Batch pipeline ──────────────────────────────────────────────────
      batch: {
        run:          (inputDir: string, outputDir: string) => Promise<{ ok: boolean; error?: string }>
        stop:         () => Promise<void>
        retryFailed:  (failedPaths: string[], outputDir: string) => Promise<{ ok: boolean; error?: string }>
        onFileStatus: (cb: (event: BatchFileEvent) => void) => () => void
      }

      // ── Config ──────────────────────────────────────────────────────────
      config: {
        getBatchFolders: () => Promise<{ inputDir: string | null; outputDir: string | null }>
        setBatchFolders: (dirs: { inputDir: string; outputDir: string }) => Promise<void>
      }

      // ── File dialogs ─────────────────────────────────────────────────────
      openPdfDialog:    () => Promise<string | null>
      openFolderDialog: () => Promise<string | null>
      saveExcel:        (filename: string, buffer: Buffer) => Promise<string | null>

      // ── Secrets ──────────────────────────────────────────────────────────
      secrets: {
        set:  (service: 'anthropic' | 'llamaparse', key: string) => Promise<void>
        get:  (service: 'anthropic' | 'llamaparse') => Promise<string | null>
        hasAll: () => Promise<boolean>
        test: (service: 'anthropic' | 'llamaparse') => Promise<{ ok: boolean; error?: string }>
      }
    }
  }
}

export const api = window.api
