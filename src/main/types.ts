export interface PipelineEvent {
  stage: 'upload' | 'parsing' | 'ai' | 'generating' | 'done' | 'error'
  message: string
  progress?: number
}

export interface PipelineResult {
  ok: true
  buffer: Buffer
  filename: string
  validationMismatches: number
}

export interface PipelineError {
  ok: false
  error: string
  stage: PipelineEvent['stage']
}

// ── Batch processing ──────────────────────────────────────────────────────────

export type BatchFileStatus = 'pending' | 'processing' | 'retrying' | 'done' | 'skipped' | 'failed'

export interface BatchFileEvent {
  path: string
  name: string
  status: BatchFileStatus
  /** Human-readable status detail (e.g. retry countdown message) */
  message?: string
  outputFile?: string
  error?: string
  current: number   // 1-based index of this file in the batch
  total: number
}
