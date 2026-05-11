import { spawn } from 'child_process'
import { writeFileSync, readdirSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export interface ExcelResult {
  buffer: Buffer
  filename: string
}

// Python imports pre-injected at the top of every generated script
const PREAMBLE = `\
import openpyxl
from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.formatting.rule import Rule
from openpyxl.utils import get_column_letter
import os

`

/**
 * Execute Claude-generated Python/openpyxl code.
 *
 * Injects PREAMBLE + __output_dir, runs the script via Python subprocess,
 * and returns every .xlsx file the script wrote to __output_dir.
 */
export async function executeExcelCode(
  code: string,
  onLog: (msg: string) => void
): Promise<ExcelResult[]> {
  // UUID avoids collision when two runs start in the same millisecond
  const tmpDir = join(tmpdir(), `excel-gen-${randomUUID()}`)
  const outDir = join(tmpDir, 'out')
  mkdirSync(outDir, { recursive: true })

  const scriptPath = join(tmpDir, 'script.py')
  // JSON.stringify produces a properly-escaped Python string literal for any path
  const fullScript = PREAMBLE + `__output_dir = ${JSON.stringify(outDir)}\n\n` + code
  writeFileSync(scriptPath, fullScript, 'utf-8')

  onLog('Running Python script…\n')

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python', [scriptPath], {
        windowsHide: true,
        env: process.env,
      })

      proc.stdout.on('data', (chunk: Buffer) => onLog(chunk.toString()))
      proc.stderr.on('data', (chunk: Buffer) => onLog(chunk.toString()))

      proc.on('error', (err) =>
        reject(new Error(`Failed to start Python: ${err.message}. Is Python installed and on PATH?`))
      )
      proc.on('close', (exitCode) =>
        exitCode === 0
          ? resolve()
          : reject(new Error(`Python exited with code ${exitCode}. See the log above for details.`))
      )
    })

    const files = readdirSync(outDir).filter((f) => f.endsWith('.xlsx'))
    if (files.length === 0) {
      throw new Error(
        'Python script completed but produced no .xlsx files. ' +
        'The script must call wb.save(os.path.join(__output_dir, "filename.xlsx")).'
      )
    }

    return files.map((filename) => ({
      filename,
      buffer: readFileSync(join(outDir, filename)),
    }))
  } finally {
    // Always clean up temp dir, even if an error was thrown
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}
