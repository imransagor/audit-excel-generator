import Store from 'electron-store'

interface BatchConfig {
  inputDir?: string
  outputDir?: string
  processedFiles?: Record<string, string>   // pdfAbsPath → outputFilename
}

const store = new Store<BatchConfig>({ name: 'batch-config' })

export function getBatchFolders(): { inputDir: string | null; outputDir: string | null } {
  return {
    inputDir:  store.get('inputDir')  ?? null,
    outputDir: store.get('outputDir') ?? null,
  }
}

export function setBatchFolders(dirs: { inputDir: string; outputDir: string }): void {
  store.set('inputDir',  dirs.inputDir)
  store.set('outputDir', dirs.outputDir)
}

export function getProcessedFiles(): Record<string, string> {
  return store.get('processedFiles') ?? {}
}

export function setProcessedFile(pdfPath: string, outputFilename: string): void {
  store.set('processedFiles', { ...getProcessedFiles(), [pdfPath]: outputFilename })
}

export function clearProcessedFile(pdfPath: string): void {
  const { [pdfPath]: _, ...rest } = getProcessedFiles()
  store.set('processedFiles', rest)
}
