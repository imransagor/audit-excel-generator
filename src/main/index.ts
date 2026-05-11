import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { readdirSync } from 'fs'
import { execFile } from 'child_process'
import { is } from '@electron-toolkit/utils'
import { openPdfDialog, saveExcelDialog, openFolderDialog } from './ipc/files'
import { setApiKey, getApiKey, hasAllKeys } from './ipc/secrets'
import {
  getBatchFolders, setBatchFolders,
  getProcessedFiles, setProcessedFile, clearProcessedFile
} from './ipc/config'
import { parsePdfToMarkdown } from './pipeline/llamaparse'
import { generateExcelCode } from './pipeline/claude'
import { executeExcelCode } from './pipeline/executor'
import { runBatch } from './pipeline/batch'
import type { PipelineEvent, BatchFileEvent } from './types'

let mainWindow: BrowserWindow | null = null

// Holds the stop signal for any currently running batch — set by batch:stop
let currentStopSignal: { stopped: boolean } | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    title: 'Audit Excel Generator',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emitPipeline(event: PipelineEvent): void {
  mainWindow?.webContents.send('pipeline:event', event)
}

function emitBatchFile(event: BatchFileEvent): void {
  mainWindow?.webContents.send('batch:fileStatus', event)
}

// ── Single-file pipeline ──────────────────────────────────────────────────────

ipcMain.handle('pipeline:run', async (_e, pdfPath: string) => {
  try {
    const anthropicKey = getApiKey('anthropic')
    const llamaKey     = getApiKey('llamaparse')
    if (!anthropicKey || !llamaKey) throw new Error('API keys not configured')

    emitPipeline({ stage: 'parsing', message: 'Starting PDF parsing…' })
    const markdown = await parsePdfToMarkdown(pdfPath, llamaKey, (msg) => {
      emitPipeline({ stage: 'parsing', message: msg })
    })

    emitPipeline({ stage: 'ai', message: 'Sending to Claude AI…' })
    const code = await generateExcelCode(markdown, anthropicKey, (msg) => {
      emitPipeline({ stage: 'ai', message: msg })
    })

    emitPipeline({ stage: 'generating', message: 'Executing generated workbook code…' })
    const results = await executeExcelCode(code, (msg) => {
      emitPipeline({ stage: 'generating', message: msg })
    })

    if (results.length > 1) {
      emitPipeline({ stage: 'generating', message: `Note: ${results.length} workbooks generated — returning first (${results[0].filename}).` })
    }

    const first = results[0]
    emitPipeline({ stage: 'done', message: `Done! ${first.filename} ready.` })

    return { ok: true, filename: first.filename, buffer: first.buffer, validationMismatches: 0 }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    emitPipeline({ stage: 'error', message: msg })
    return { ok: false, error: msg }
  }
})

// ── Batch pipeline ────────────────────────────────────────────────────────────

ipcMain.handle('batch:run', async (_e, inputDir: string, outputDir: string) => {
  try {
    const anthropicKey = getApiKey('anthropic')
    const llamaKey     = getApiKey('llamaparse')
    if (!anthropicKey || !llamaKey) throw new Error('API keys not configured')

    const pdfPaths = readdirSync(inputDir)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => join(inputDir, f))

    if (pdfPaths.length === 0) return { ok: false, error: 'No PDF files found in the Input folder.' }

    const manifest    = getProcessedFiles()
    const stopSignal  = { stopped: false }
    currentStopSignal = stopSignal

    await runBatch(
      pdfPaths,
      outputDir,
      manifest,
      anthropicKey,
      llamaKey,
      emitBatchFile,
      (msg) => emitBatchFile({ path: '', name: '', status: 'processing', message: msg, current: 0, total: 0 }),
      stopSignal,
      (pdfPath, outputFilename) => setProcessedFile(pdfPath, outputFilename)
    )

    currentStopSignal = null
    return { ok: true }
  } catch (err) {
    currentStopSignal = null
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
})

ipcMain.handle('batch:stop', () => {
  if (currentStopSignal) currentStopSignal.stopped = true
})

ipcMain.handle('batch:retryFailed', async (_e, failedPaths: string[], outputDir: string) => {
  try {
    const anthropicKey = getApiKey('anthropic')
    const llamaKey     = getApiKey('llamaparse')
    if (!anthropicKey || !llamaKey) throw new Error('API keys not configured')

    // Clear manifest entries so these files are treated as unprocessed
    for (const p of failedPaths) clearProcessedFile(p)

    const manifest    = getProcessedFiles()
    const stopSignal  = { stopped: false }
    currentStopSignal = stopSignal

    await runBatch(
      failedPaths,
      outputDir,
      manifest,
      anthropicKey,
      llamaKey,
      emitBatchFile,
      (msg) => emitBatchFile({ path: '', name: '', status: 'processing', message: msg, current: 0, total: 0 }),
      stopSignal,
      (pdfPath, outputFilename) => setProcessedFile(pdfPath, outputFilename)
    )

    currentStopSignal = null
    return { ok: true }
  } catch (err) {
    currentStopSignal = null
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── Config ────────────────────────────────────────────────────────────────────

ipcMain.handle('config:getBatchFolders', () => getBatchFolders())

ipcMain.handle('config:setBatchFolders', (_e, dirs: { inputDir: string; outputDir: string }) => {
  setBatchFolders(dirs)
})

// ── File dialogs ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openPdf', async () => {
  if (!mainWindow) return null
  return openPdfDialog(mainWindow)
})

ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null
  return openFolderDialog(mainWindow)
})

ipcMain.handle('dialog:saveExcel', async (_e, filename: string, buffer: Buffer) => {
  if (!mainWindow) return null
  return saveExcelDialog(mainWindow, filename, buffer)
})

// ── Secrets ───────────────────────────────────────────────────────────────────

ipcMain.handle('secrets:set', (_e, service: 'anthropic' | 'llamaparse', key: string) => {
  setApiKey(service, key)
})

ipcMain.handle('secrets:get', (_e, service: 'anthropic' | 'llamaparse') => {
  const key = getApiKey(service)
  return key ? '••••••••' : null
})

ipcMain.handle('secrets:hasAll', () => hasAllKeys())

ipcMain.handle('secrets:test', async (_e, service: 'anthropic' | 'llamaparse') => {
  const key = getApiKey(service)
  if (!key) return { ok: false, error: 'No key stored' }

  try {
    if (service === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey: key })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }]
      })
    } else {
      const res = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
        method: 'OPTIONS',
        headers: { Authorization: `Bearer ${key}` }
      })
      if (res.status >= 500) throw new Error(`Server error ${res.status}`)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── Python prerequisite check ─────────────────────────────────────────────────

function checkPython(): Promise<{ ok: boolean; detail?: string }> {
  return new Promise(resolve => {
    execFile('python', ['--version'], { timeout: 8000, windowsHide: true }, (err) => {
      if (err) {
        resolve({
          ok: false,
          detail:
            'Python 3 was not found on this machine.\n\n' +
            'Please install Python 3 from https://python.org/downloads/ and\n' +
            'then run:  pip install openpyxl\n\n' +
            'Make sure to tick "Add Python to PATH" during installation.'
        })
        return
      }
      execFile('python', ['-c', 'import openpyxl'], { timeout: 8000, windowsHide: true }, (err2) => {
        if (err2) {
          resolve({
            ok: false,
            detail: 'Python was found but the openpyxl package is missing.\n\nPlease run:\n  pip install openpyxl'
          })
        } else {
          resolve({ ok: true })
        }
      })
    })
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const py = await checkPython()
  if (!py.ok) {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Python Setup Required',
      message: 'Missing Python dependency',
      detail: py.detail,
      buttons: ['Open python.org', 'Continue Anyway'],
      defaultId: 0
    })
    if (response === 0) shell.openExternal('https://www.python.org/downloads/')
  }

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
