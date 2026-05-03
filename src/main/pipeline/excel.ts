import ExcelJS from 'exceljs'
import type { CompanyData, AccountRow, LeafRow, SubtotalRow, ComputedRow, NarrativeRow, ValidationRow } from '../types'

const NUMBER_FMT = '#,##0;(#,##0)'
const THIN: ExcelJS.BorderStyle = 'thin'
const DOUBLE: ExcelJS.BorderStyle = 'double'
const MEDIUM: ExcelJS.BorderStyle = 'medium'

function sheetName(stem: string, fy: number, section: 'Accounts' | 'Narrative' | 'Validation'): string {
  const candidate = `${stem} FY${fy} ${section}`
  if (candidate.length <= 31) return candidate
  const compact = stem.replace(' ', '')
  const short = `${compact} FY${fy} ${section}`
  return short.length <= 31 ? short : short.substring(0, 31)
}

function bold(cell: ExcelJS.Cell): void {
  cell.font = { bold: true }
}

function applyTopBorder(row: ExcelJS.Row, style: ExcelJS.BorderStyle, cols: number): void {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c)
    cell.border = { ...(cell.border || {}), top: { style } }
  }
}

function buildAccountsSheet(ws: ExcelJS.Worksheet, data: CompanyData): void {
  ws.columns = [
    { key: 'particulars', width: 55 },
    { key: 'notes', width: 10 },
    { key: 'current', width: 22 },
    { key: 'prior', width: 22 }
  ]

  // Header rows 1–4
  const r1 = ws.addRow([data.company.legalName ?? ''])
  ws.mergeCells(`A1:D1`)
  r1.getCell(1).font = { bold: true, size: 13 }
  r1.getCell(1).alignment = { horizontal: 'center' }

  const r2 = ws.addRow([data.company.periodDescription ?? ''])
  ws.mergeCells(`A2:D2`)
  r2.getCell(1).alignment = { horizontal: 'center' }

  const r3 = ws.addRow([`Auditor: ${data.audit?.firm ?? ''}`])
  ws.mergeCells(`A3:D3`)
  r3.getCell(1).alignment = { horizontal: 'center' }

  const sigLine = [
    `Report date: ${data.audit?.reportDate ?? ''}`,
    `Signed by: ${data.audit?.signatory ?? ''}`,
    data.audit?.enrollment ? `ICAB Enroll No. ${data.audit.enrollment}` : null,
    data.audit?.dvc ? `DVC No.: ${data.audit.dvc}` : null
  ].filter(Boolean).join(' | ')
  const r4 = ws.addRow([sigLine])
  ws.mergeCells(`A4:D4`)
  r4.getCell(1).alignment = { horizontal: 'center' }
  r4.getCell(1).font = { size: 9 }

  // Blank separator
  ws.addRow([])

  // Column headers (row 6)
  const hdr = ws.addRow(['Particulars', 'Notes', `30 Jun ${data.company.fiscalYear} (Tk.)`, `30 Jun ${data.company.fiscalYear - 1} (Tk.)`])
  hdr.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }
    cell.border = { bottom: { style: THIN }, top: { style: THIN } }
    cell.alignment = { horizontal: 'center', wrapText: true }
  })
  hdr.getCell(1).alignment = { horizontal: 'left' }

  // Data rows start at Excel row 7
  const DATA_START = 7

  for (let rowIdx = 0; rowIdx < data.accounts.length; rowIdx++) {
    const row = data.accounts[rowIdx]
    const excelRowNum = ws.rowCount + 1

    try {

    if (row.kind === 'header') {
      const r = ws.addRow([row.label ?? ''])
      ws.mergeCells(`A${excelRowNum}:D${excelRowNum}`)
      r.getCell(1).font = { bold: true, underline: true }
      continue
    }

    if (row.kind === 'leaf') {
      const lr = row as LeafRow
      const indent = '  '.repeat(lr.indent || 0)
      const r = ws.addRow([`${indent}${lr.label ?? ''}`, lr.note ?? '', lr.current ?? 0, lr.prior ?? 0])
      r.getCell(3).numFmt = NUMBER_FMT
      r.getCell(4).numFmt = NUMBER_FMT
      continue
    }

    if (row.kind === 'subtotal') {
      const sr = row as SubtotalRow
      const indent = '  '.repeat(sr.indent || 0)

      // Build formulas from sumOf ranges
      const currentFormula = buildSumFormula(sr.sumOf ?? [], 'C')
      const priorFormula = buildSumFormula(sr.sumOf ?? [], 'D')

      const r = ws.addRow([`${indent}${sr.label ?? ''}`, sr.note ?? '', { formula: currentFormula }, { formula: priorFormula }])
      r.getCell(1).font = { bold: true }
      r.getCell(3).numFmt = NUMBER_FMT
      r.getCell(4).numFmt = NUMBER_FMT

      const borderStyle = sr.isDoubleBorder ? DOUBLE : THIN
      applyTopBorder(r, borderStyle, 4)
      if (sr.isDoubleBorder) {
        r.getCell(3).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE } }
        r.getCell(4).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE } }
      }
      continue
    }

    if (row.kind === 'computed') {
      const cr = row as ComputedRow
      const indent = '  '.repeat(cr.indent || 0)

      // formula is column-agnostic like "C15+C21" — we use it as-is for col C
      // and substitute D for col D
      const currentFormula = cr.formula ?? '0'
      const priorFormula = (cr.formula ?? '0').replace(/C(\d+)/g, 'D$1')

      const r = ws.addRow([`${indent}${cr.label ?? ''}`, cr.note ?? '', { formula: currentFormula }, { formula: priorFormula }])
      r.getCell(1).font = { bold: true }
      r.getCell(3).numFmt = NUMBER_FMT
      r.getCell(4).numFmt = NUMBER_FMT

      if (cr.isDoubleBorder) {
        r.getCell(3).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE } }
        r.getCell(4).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE } }
      } else if (cr.isBold) {
        applyTopBorder(r, THIN, 4)
      }
      continue
    }

    } catch (e) {
      throw new Error(`accounts row ${rowIdx} (kind=${row?.kind}, label=${JSON.stringify(row?.label)}): ${(e as Error).message}`)
    }
  }

  // Freeze pane below header
  ws.views = [{ state: 'frozen', ySplit: 6 }]
  void DATA_START
}

function buildSumFormula(
  sumOf: SubtotalRow['sumOf'],
  targetCol: 'C' | 'D'
): string {
  const srcCol = targetCol === 'C' ? 'current' : 'prior'
  const ranges = sumOf
    .filter((s) => s.col === srcCol)
    .map((s) => `${targetCol}${s.from}:${targetCol}${s.to}`)
  if (ranges.length === 0) return '0'
  if (ranges.length === 1) return `SUM(${ranges[0]})`
  return `SUM(${ranges.join(',')})`
}

function buildNarrativeSheet(ws: ExcelJS.Worksheet, rows: NarrativeRow[], company: CompanyData['company']): void {
  ws.columns = [
    { key: 'section', width: 40 },
    { key: 'content', width: 100 }
  ]

  const hdr = ws.addRow(['Section', 'Content'])
  hdr.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }
    cell.border = { bottom: { style: THIN }, top: { style: THIN } }
  })

  for (const row of rows) {
    const content = row.content ?? ''
    const r = ws.addRow([row.section ?? '', content])
    r.getCell(1).font = { bold: true }
    r.getCell(2).alignment = { wrapText: true }
    r.height = Math.min(400, Math.max(15, Math.ceil(content.length / 120) * 15))
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }]
  void company
}

function buildValidationSheet(
  ws: ExcelJS.Worksheet,
  rows: ValidationRow[],
  company: CompanyData['company'],
  accountsSheetName: string
): void {
  ws.columns = [
    { key: 'check', width: 65 },
    { key: 'expected', width: 22 },
    { key: 'computed', width: 22 },
    { key: 'status', width: 14 },
    { key: 'note', width: 35 }
  ]

  const titleRow = ws.addRow([`${company.legalName} — Validation Checks`])
  ws.mergeCells(`A1:E1`)
  titleRow.getCell(1).font = { bold: true, size: 12 }

  const periodRow = ws.addRow([company.periodDescription])
  ws.mergeCells(`A2:E2`)
  periodRow.getCell(1).font = { italic: true }

  ws.addRow([])

  const hdr = ws.addRow(['Check', 'Expected', 'Computed', 'Status', 'Note'])
  hdr.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }
    cell.border = { bottom: { style: THIN }, top: { style: THIN } }
  })

  const sheetRef = `'${accountsSheetName}'`

  for (const [i, row] of rows.entries()) {
    const excelRow = 5 + i
    const eRef = row.expectedRef
    const cRef = row.computedRef

    // Skip rows where Claude didn't supply cell references — write as plain text
    if (!eRef?.col || !eRef?.row || !cRef?.col || !cRef?.row) {
      ws.addRow([row.check ?? '', 'N/A', 'N/A', 'N/A', row.note ?? ''])
      continue
    }

    const expectedFormula = `${sheetRef}!${eRef.col}${eRef.row}`
    const computedFormula = `${sheetRef}!${cRef.col}${cRef.row}`
    const statusFormula = `IF(ROUND(B${excelRow}-C${excelRow},0)=0,"OK","MISMATCH")`

    const r = ws.addRow([
      row.check ?? '',
      { formula: expectedFormula },
      { formula: computedFormula },
      { formula: statusFormula },
      row.note ?? ''
    ])

    r.getCell(2).numFmt = NUMBER_FMT
    r.getCell(3).numFmt = NUMBER_FMT

    // Conditional styling for Status cell — we set it as a formula, colour will show in Excel
    r.getCell(4).alignment = { horizontal: 'center' }
  }

  ws.views = [{ state: 'frozen', ySplit: 4 }]
}

export async function buildWorkbook(data: CompanyData): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Audit Excel Generator'
  wb.created = new Date()

  const stem = data.company.nameStem
  const fy = data.company.fiscalYear

  const accName = sheetName(stem, fy, 'Accounts')
  const narName = sheetName(stem, fy, 'Narrative')
  const valName = sheetName(stem, fy, 'Validation')

  const wsAcc = wb.addWorksheet(accName, { pageSetup: { orientation: 'landscape' } })
  const wsNar = wb.addWorksheet(narName)
  const wsVal = wb.addWorksheet(valName)

  try {
    buildAccountsSheet(wsAcc, { ...data, accounts: data.accounts ?? [] })
  } catch (e) {
    throw new Error(`Accounts sheet failed at row ${wsAcc.rowCount}: ${(e as Error).message}`)
  }

  try {
    buildNarrativeSheet(wsNar, data.narrative ?? [], data.company)
  } catch (e) {
    throw new Error(`Narrative sheet failed at row ${wsNar.rowCount}: ${(e as Error).message}`)
  }

  try {
    buildValidationSheet(wsVal, data.validation ?? [], data.company, accName)
  } catch (e) {
    throw new Error(`Validation sheet failed at row ${wsVal.rowCount}: ${(e as Error).message}`)
  }

  let buffer: Buffer
  try {
    buffer = await wb.xlsx.writeBuffer() as Buffer
  } catch (e) {
    throw new Error(`ExcelJS writeBuffer failed: ${(e as Error).message}\nStack: ${(e as Error).stack}`)
  }

  const filename = `${stem ?? 'Company'} Audited ${fy ?? 'YYYY'}.xlsx`

  return { buffer, filename }
}
