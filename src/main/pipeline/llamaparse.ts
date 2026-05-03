import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { app } from 'electron'
import { mkdirSync, existsSync, writeFileSync } from 'fs'

const LLAMAPARSE_BASE = 'https://api.cloud.llamaindex.ai/api/parsing'
const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 60

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'llamaparse-cache')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(pdfBuffer: Buffer): string {
  return createHash('sha256').update(pdfBuffer).digest('hex')
}

async function uploadPdf(pdfBuffer: Buffer, apiKey: string): Promise<string> {
  const formData = new FormData()
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
  formData.append('file', blob, 'document.pdf')
  formData.append('output_type', 'markdown')

  const res = await fetch(`${LLAMAPARSE_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LlamaParse upload failed (${res.status}): ${text}`)
  }

  const json = await res.json() as { id: string }
  return json.id
}

async function pollJob(jobId: string, apiKey: string, onLog: (m: string) => void): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

    const res = await fetch(`${LLAMAPARSE_BASE}/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })

    if (!res.ok) throw new Error(`LlamaParse poll failed (${res.status})`)
    const json = await res.json() as { status: string; error?: string }

    if (json.status === 'SUCCESS') return
    if (json.status === 'ERROR') throw new Error(`LlamaParse job failed: ${json.error ?? 'unknown error'}`)

    onLog(`Parsing PDF... (${i + 1}/${MAX_POLLS}) status: ${json.status}`)
  }

  throw new Error('LlamaParse timed out after 3 minutes')
}

async function fetchMarkdown(jobId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${LLAMAPARSE_BASE}/job/${jobId}/result/markdown`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })

  if (!res.ok) throw new Error(`LlamaParse result fetch failed (${res.status})`)
  const json = await res.json() as { markdown: string }
  return json.markdown
}

export async function parsePdfToMarkdown(
  pdfPath: string,
  apiKey: string,
  onLog: (m: string) => void
): Promise<string> {
  const pdfBuffer = readFileSync(pdfPath)

  // Validate PDF magic bytes
  if (pdfBuffer.slice(0, 4).toString() !== '%PDF') {
    throw new Error('File does not appear to be a valid PDF')
  }

  // Check cache
  const key = cacheKey(pdfBuffer)
  const cachePath = join(cacheDir(), `${key}.md`)
  if (existsSync(cachePath)) {
    onLog('Using cached LlamaParse result (PDF unchanged)')
    return readFileSync(cachePath, 'utf-8')
  }

  onLog('Uploading PDF to LlamaParse...')
  const jobId = await uploadPdf(pdfBuffer, apiKey)
  onLog(`Job created: ${jobId}`)

  await pollJob(jobId, apiKey, onLog)
  onLog('Parsing complete, fetching markdown...')

  const markdown = await fetchMarkdown(jobId, apiKey)
  writeFileSync(cachePath, markdown, 'utf-8')
  onLog(`Markdown cached (${Math.round(markdown.length / 1024)} KB)`)

  return markdown
}
