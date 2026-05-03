import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { openPdfDialog, saveExcelDialog } from './ipc/files'
import { setApiKey, getApiKey, hasAllKeys } from './ipc/secrets'
import { parsePdfToMarkdown } from './pipeline/llamaparse'
import { extractFinancialData } from './pipeline/claude'
import { buildWorkbook } from './pipeline/excel'
import type { PipelineEvent } from './types'

let mainWindow: BrowserWindow | null = null

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
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

function emit(event: PipelineEvent): void {
  mainWindow?.webContents.send('pipeline:event', event)
}

ipcMain.handle('pipeline:run', async (_e, pdfPath: string) => {
  try {
    const anthropicKey = getApiKey('anthropic')
    const llamaKey = getApiKey('llamaparse')
    if (!anthropicKey || !llamaKey) throw new Error('API keys not configured')

    emit({ stage: 'parsing', message: 'Starting PDF parsing...' })
    const markdown = await parsePdfToMarkdown(pdfPath, llamaKey, (msg) => {
      emit({ stage: 'parsing', message: msg })
    })

    emit({ stage: 'ai', message: 'Sending to Claude AI...' })
    const datasets = await extractFinancialData(markdown, anthropicKey, (msg) => {
      emit({ stage: 'ai', message: msg })
    })

    emit({ stage: 'generating', message: 'Building Excel workbook...' })
    const results: Array<{ filename: string; buffer: Buffer; validationMismatches: number }> = []

    for (const data of datasets) {
      const { buffer, filename } = await buildWorkbook(data)
      const mismatches = data.validation.length
      results.push({ filename, buffer, validationMismatches: mismatches })
    }

    // Return first result; multi-company support via repeated calls
    const first = results[0]
    emit({ stage: 'done', message: `Done! ${first.filename} ready.` })

    return {
      ok: true,
      filename: first.filename,
      buffer: first.buffer,
      validationMismatches: first.validationMismatches
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    emit({ stage: 'error', message: msg })
    return { ok: false, error: msg }
  }
})

ipcMain.handle('dialog:openPdf', async () => {
  if (!mainWindow) return null
  return openPdfDialog(mainWindow)
})

ipcMain.handle('dialog:saveExcel', async (_e, filename: string, buffer: Buffer) => {
  if (!mainWindow) return null
  return saveExcelDialog(mainWindow, filename, buffer)
})

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

// ── App Lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
