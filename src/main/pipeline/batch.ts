import { existsSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { parsePdfToMarkdown } from './llamaparse'
import { generateExcelCode } from './claude'
import { executeExcelCode } from './executor'
import type { BatchFileEvent } from '../types'

export interface StopSignal {
  stopped: boolean
}

// Backoff delays for successive retry attempts (ms)
const BACKOFF_MS = [30_000, 60_000, 120_000]

// Pause between files to spread API load across a long batch
const INTER_FILE_PAUSE_MS = 5_000

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Returns true for errors that are worth retrying (rate limits, server errors, network blips).
 * Returns false for permanent errors (bad PDF, content refusal, Python failure).
 */
function isTransient(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false

  // HTTP status errors from Anthropic SDK or LlamaParse (429 = rate limit, 5xx = server error)
  if ('status' in err) {
    const s = (err as { status: unknown }).status
    if (typeof s === 'number' && (s === 429 || s >= 500)) return true
  }

  // Node.js network errors
  if ('code' in err) {
    const c = (err as { code: unknown }).code
    if (
      typeof c === 'string' &&
      ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(c)
    ) return true
  }

  return false
}

/**
 * Run `fn` up to `maxAttempts` times, retrying only on transient errors.
 * Calls `onRetry` before each wait so the caller can emit a progress event.
 */
async function withRetry(
  fn: () => Promise<void>,
  maxAttempts: number,
  onRetry: (nextAttempt: number, waitMs: number, reason: string) => void
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn()
      return
    } catch (err) {
      if (attempt === maxAttempts || !isTransient(err)) throw err
      const waitMs = BACKOFF_MS[attempt - 1] ?? 120_000
      onRetry(attempt + 1, waitMs, (err as Error).message ?? String(err))
      await sleep(waitMs)
    }
  }
}

/**
 * Process a list of PDF files sequentially.
 * Skips files already recorded in the manifest whose output still exists.
 * Retries transient API/network errors up to 3 times with exponential backoff.
 * Inserts a 5 s pause between files to reduce rate-limit risk on large batches.
 */
export async function runBatch(
  pdfPaths: string[],
  outputDir: string,
  manifest: Record<string, string>,
  anthropicKey: string,
  llamaKey: string,
  onEvent: (e: BatchFileEvent) => void,
  onLog: (msg: string) => void,
  stopSignal: StopSignal,
  onManifestUpdate: (pdfPath: string, outputFilename: string) => void
): Promise<void> {
  const total = pdfPaths.length

  for (let i = 0; i < total; i++) {
    if (stopSignal.stopped) break

    const pdfPath = pdfPaths[i]
    const name    = basename(pdfPath)
    const current = i + 1

    // Skip if already processed and output file still exists
    const existing = manifest[pdfPath]
    if (existing && existsSync(join(outputDir, existing))) {
      onEvent({ path: pdfPath, name, status: 'skipped', outputFile: existing, current, total })
      continue
    }

    onEvent({ path: pdfPath, name, status: 'processing', current, total })
    onLog(`\n──────────────────────────────\n[${current}/${total}] Processing: ${name}\n`)

    let outputFile: string | undefined

    try {
      await withRetry(
        async () => {
          const markdown = await parsePdfToMarkdown(pdfPath, llamaKey, onLog)
          const code     = await generateExcelCode(markdown, anthropicKey, onLog)
          const results  = await executeExcelCode(code, onLog)
          const first    = results[0]
          writeFileSync(join(outputDir, first.filename), first.buffer)
          outputFile = first.filename
          onManifestUpdate(pdfPath, first.filename)
        },
        3,
        (nextAttempt, waitMs, reason) => {
          const secs = Math.round(waitMs / 1_000)
          const msg  = `Rate limited or server error — waiting ${secs}s (attempt ${nextAttempt}/3): ${reason}`
          onLog(`[RETRY] ${msg}`)
          onEvent({ path: pdfPath, name, status: 'retrying', message: msg, current, total })
        }
      )

      onLog(`[DONE] ${name} → ${outputFile}`)
      onEvent({ path: pdfPath, name, status: 'done', outputFile, current, total })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      onLog(`[FAILED] ${name}: ${error}`)
      onEvent({ path: pdfPath, name, status: 'failed', error, current, total })
    }

    // Inter-file pause — skip after the last file or if stopped
    if (i < total - 1 && !stopSignal.stopped) {
      onLog(`[BATCH] Pausing ${INTER_FILE_PAUSE_MS / 1_000}s before next file…`)
      await sleep(INTER_FILE_PAUSE_MS)
    }
  }

  const stopped = stopSignal.stopped
  onLog(stopped ? '\n[BATCH] Stopped by user.' : '\n[BATCH] All files processed.')
}
