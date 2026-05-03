import { dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'

export async function openPdfDialog(win: BrowserWindow): Promise<string | null> {
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Audited Financial Statement PDF',
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export async function saveExcelDialog(
  win: BrowserWindow,
  suggestedName: string,
  buffer: Buffer
): Promise<string | null> {
  const result = await dialog.showSaveDialog(win, {
    title: 'Save Excel File',
    defaultPath: suggestedName,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
  })

  if (result.canceled || !result.filePath) return null

  writeFileSync(result.filePath, buffer)
  return result.filePath
}
