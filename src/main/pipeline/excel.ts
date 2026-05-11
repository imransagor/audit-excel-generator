import ExcelJS from 'exceljs'
import type {
  CompanyData, LeafRow, SubtotalRow, ComputedRow, LabelComponent,
  NarrativeRow, ValidationRow, AccountRow
} from '../types'

const NUMBER_FMT = '#,##0;(#,##0)'
const THIN: ExcelJS.BorderStyle = 'thin'
const DOUBLE: ExcelJS.BorderStyle = 'double'

// Color palette
const HEADER_BLUE  = 'FFD9E1F2'
const PERIOD_BLUE  = 'FFEEF3FB'
const GRAY_HDR     = 'FFD3D3D3'
const OK_BG        = 'FFC6EFCE'
const OK_FG        = 'FF375623'
const MISMATCH_BG  = 'FFFFC7CE'
const MISMATCH_FG  = 'FF9C0006'
const VAL_HDR_BG   = 'FF4472C4'
const VAL_HDR_FG   = 'FFFFFFFF'

// Row in the Accounts sheet where data begins (rows 1–6 are header/info)
const DATA_START_ROW = 7

// ── Label map helpers ────────────────────────────────────────────────────────

/** Build a map of normalised label → 0-based accounts[] index. */
function buildLabelMap(accounts: AccountRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < accounts.length; i++) {
    const key = normalise(accounts[i].label)
    // First occurrence wins (face-statement totals come before note sections)
    if (!map.has(key)) map.set(key, i)
  }
  return map
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[''`]/g, "'").trim()
}

function lookupIdx(labelMap: Map<string, number>, ...candidates: string[]): number | null {
  for (const c of candidates) {
    const v = labelMap.get(normalise(c))
    if (v !== undefined) return v
  }
  return null
}

// ── Formula builders ─────────────────────────────────────────────────────────

/** Build SUM formula from sumLabels (label-based, preferred). */
function resolveSumLabels(labels: string[], labelMap: Map<string, number>, col: 'C' | 'D'): string {
  const refs = labels
    .map(l => {
      const idx = lookupIdx(labelMap, l)
      return idx !== null ? `${col}${idx + DATA_START_ROW}` : null
    })
    .filter((r): r is string => r !== null)
  if (refs.length === 0) return '0'
  return `SUM(${refs.join(',')})`
}

/** Build SUM formula from sumOf (0-based index ranges, fallback). */
function buildSumFormula(sumOf: NonNullable<SubtotalRow['sumOf']>, col: 'C' | 'D'): string {
  const srcCol = col === 'C' ? 'current' : 'prior'
  const ranges = sumOf
    .filter(s => s.col === srcCol)
    .map(s => `${col}${s.from + DATA_START_ROW}:${col}${s.to + DATA_START_ROW}`)
  if (ranges.length === 0) return '0'
  return ranges.length === 1 ? `SUM(${ranges[0]})` : `SUM(${ranges.join(',')})`
}

/** Build formula from labelComponents (label-based, preferred for computed rows). */
function resolveLabelComponents(
  components: LabelComponent[],
  labelMap: Map<string, number>,
  col: 'C' | 'D'
): string {
  const parts: string[] = []
  for (const c of components) {
    const idx = lookupIdx(labelMap, c.labelRef)
    if (idx === null) continue
    const ref = `${col}${idx + DATA_START_ROW}`
    parts.push(c.op === '-' ? `-${ref}` : `+${ref}`)
  }
  if (parts.length === 0) return '0'
  // Drop the leading '+' if first op is addition
  return parts.join('').replace(/^\+/, '')
}

// ── Auto-validation generator ────────────────────────────────────────────────

/**
 * Generate standard validation checks directly from the accounts structure.
 * This runs regardless of what Claude produces, guaranteeing core checks always exist.
 */
function generateAutoValidation(accounts: AccountRow[]): ValidationRow[] {
  const lm = buildLabelMap(accounts)
  const out: ValidationRow[] = []

  function check(description: string, expectedLabels: string[], computedLabels: string[], col: 'C' | 'D' = 'C'): void {
    const eIdx = lookupIdx(lm, ...expectedLabels)
    const cIdx = lookupIdx(lm, ...computedLabels)
    if (eIdx !== null && cIdx !== null && eIdx !== cIdx) {
      out.push({ check: description, expectedRef: { row: eIdx, col }, computedRef: { row: cIdx, col } })
    }
  }

  // ── Balance Sheet ────────────────────────────────────────────────────────
  const TOTAL_ASSETS = ['Total Assets', 'TOTAL ASSETS', 'Total Asset']
  const TOTAL_EQL = [
    'Total Equity and Liabilities', 'Total Equity & Liabilities',
    'Total Liabilities and Equity', 'Total Liabilities & Equity',
    'TOTAL EQUITY AND LIABILITIES'
  ]
  check('Balance Sheet: Total Assets = Total Equity & Liabilities [Current Year]',  TOTAL_ASSETS, TOTAL_EQL, 'C')
  check('Balance Sheet: Total Assets = Total Equity & Liabilities [Prior Year]',    TOTAL_ASSETS, TOTAL_EQL, 'D')

  const NCA = ['Total Non-Current Assets', 'Total Non-current Assets', 'Total Fixed Assets']
  const CA  = ['Total Current Assets', 'TOTAL CURRENT ASSETS']
  check('Total Non-Current Assets subtotal [Current]', NCA, NCA, 'C')
  check('Total Current Assets subtotal [Current]',     CA,  CA,  'C')

  const TE  = ["Total Shareholders' Equity", "Total Shareholders' equity", 'Total Equity', "Total Stockholders' Equity"]
  const NCL = ['Total Non-Current Liabilities', 'Total Non-current Liabilities']
  const CL  = ['Total Current Liabilities', 'TOTAL CURRENT LIABILITIES']
  check("Total Shareholders' Equity subtotal [Current]",      TE,  TE,  'C')
  check('Total Non-Current Liabilities subtotal [Current]',   NCL, NCL, 'C')
  check('Total Current Liabilities subtotal [Current]',       CL,  CL,  'C')

  // ── Income Statement ─────────────────────────────────────────────────────
  const GP   = ['Gross Profit', 'GROSS PROFIT']
  const OP   = ['Operating Profit', 'Profit from Operations', 'EBIT', 'Operating Income']
  const PBT  = ['Profit Before Tax', 'PBT', 'Profit/(Loss) Before Tax', 'Net Profit Before Tax']
  const PAT  = ['Profit After Tax', 'PAT', 'Net Profit After Tax', 'Net Profit', 'Profit for the Year']

  check('Gross Profit = Revenue − Cost of Sales [Current]', GP,  GP,  'C')
  check('Operating Profit [Current]',                        OP,  OP,  'C')
  check('Profit Before Tax [Current]',                       PBT, PBT, 'C')
  check('Profit After Tax [Current]',                        PAT, PAT, 'C')

  // ── Cash Flow ────────────────────────────────────────────────────────────
  const OCF     = ['Net Cash from Operating Activities', 'Net Cash Generated from Operating Activities', 'Cash from Operations']
  const ICF     = ['Net Cash from Investing Activities', 'Net Cash Used in Investing Activities']
  const FCF     = ['Net Cash from Financing Activities', 'Net Cash from/(Used in) Financing Activities']
  const CLOSECASH = ['Closing Cash and Cash Equivalents', 'Cash and Cash Equivalents at End of Year',
                     'Cash at End of Year', 'Closing Balance']
  check('Net Cash from Operating Activities [Current]',  OCF,       OCF,       'C')
  check('Net Cash from Investing Activities [Current]',  ICF,       ICF,       'C')
  check('Net Cash from Financing Activities [Current]',  FCF,       FCF,       'C')
  check('Closing Cash and Cash Equivalents [Current]',   CLOSECASH, CLOSECASH, 'C')

  // ── Note roll-ups: every subtotal/computed row vs its label pair ─────────
  // (Self-check: if the row formula is correct, expected == computed == same row. Skip those.)
  // Instead, check balance-sheet face lines vs their note totals using note column.
  for (let i = 0; i < accounts.length; i++) {
    const r = accounts[i]
    if (r.kind !== 'leaf') continue
    const note = (r as LeafRow).note
    if (!note) continue
    // Look for a note-section total with similar label
    const noteTotal = `Total ${r.label}` // e.g., "Total Inventories"
    const noteTotalIdx = lookupIdx(lm, noteTotal)
    if (noteTotalIdx !== null && noteTotalIdx !== i) {
      out.push({
        check: `Cross-reference: ${r.label} (face) = Note total`,
        expectedRef: { row: i,           col: 'C' },
        computedRef: { row: noteTotalIdx, col: 'C' }
      })
    }
  }

  // ── PPE special check ────────────────────────────────────────────────────
  const WDV        = ['Net Book Value', 'WDV', 'Written Down Value', 'Carrying Amount', 'Total WDV']
  const GROSS_COST = ['Gross Cost', 'Total Cost', 'Cost Total']
  const ACCUM_DEP  = ['Accumulated Depreciation', 'Total Accumulated Depreciation']
  const wdvIdx  = lookupIdx(lm, ...WDV)
  const costIdx = lookupIdx(lm, ...GROSS_COST)
  const depIdx  = lookupIdx(lm, ...ACCUM_DEP)
  if (wdvIdx !== null && costIdx !== null && depIdx !== null) {
    out.push({
      check: 'PPE: WDV = Gross Cost − Accumulated Depreciation [Current]',
      expectedRef: { row: wdvIdx,  col: 'C' },
      computedRef: { row: costIdx, col: 'C' },
      note: `Verify: C${wdvIdx + DATA_START_ROW} = C${costIdx + DATA_START_ROW} − C${depIdx + DATA_START_ROW}`
    })
  }

  return out
}

// ── Sheet builders ───────────────────────────────────────────────────────────

function sheetName(stem: string, fy: number, section: 'Accounts' | 'Narrative' | 'Validation'): string {
  const candidate = `${stem} FY${fy} ${section}`
  if (candidate.length <= 31) return candidate
  const compact = stem.replace(' ', '')
  const short = `${compact} FY${fy} ${section}`
  return short.length <= 31 ? short : short.substring(0, 31)
}

function allBorders(cell: ExcelJS.Cell, side: ExcelJS.BorderStyle = THIN): void {
  cell.border = { top: { style: side }, bottom: { style: side }, left: { style: side }, right: { style: side } }
}

function applyTopBorder(row: ExcelJS.Row, style: ExcelJS.BorderStyle, cols: number): void {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c)
    cell.border = { ...(cell.border ?? {}), top: { style } }
  }
}

function numRight(cell: ExcelJS.Cell): void {
  cell.numFmt = NUMBER_FMT
  cell.alignment = { horizontal: 'right' }
}

function buildAccountsSheet(ws: ExcelJS.Worksheet, data: CompanyData): void {
  ws.columns = [
    { key: 'particulars', width: 55 },
    { key: 'notes',       width: 10 },
    { key: 'current',     width: 22 },
    { key: 'prior',       width: 22 }
  ]

  // ── Header rows ──────────────────────────────────────────────────────────
  const r1 = ws.addRow([data.company.legalName ?? ''])
  ws.mergeCells('A1:D1')
  r1.height = 22
  Object.assign(r1.getCell(1), {
    font:      { bold: true, size: 13, color: { argb: 'FF1F3864' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BLUE } }
  })

  const r2 = ws.addRow([data.company.periodDescription ?? ''])
  ws.mergeCells('A2:D2')
  r2.height = 16
  Object.assign(r2.getCell(1), {
    font:      { bold: true, size: 10 },
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: PERIOD_BLUE } }
  })

  const r3 = ws.addRow([`Auditor: ${data.audit?.firm ?? ''}`])
  ws.mergeCells('A3:D3')
  r3.getCell(1).alignment = { horizontal: 'center' }

  const sigLine = [
    `Report date: ${data.audit?.reportDate ?? ''}`,
    `Signed by: ${data.audit?.signatory ?? ''}`,
    data.audit?.enrollment ? `ICAB Enroll No. ${data.audit.enrollment}` : null,
    data.audit?.dvc        ? `DVC No.: ${data.audit.dvc}`               : null
  ].filter(Boolean).join(' | ')
  const r4 = ws.addRow([sigLine])
  ws.mergeCells('A4:D4')
  Object.assign(r4.getCell(1), { font: { size: 9 }, alignment: { horizontal: 'center' } })

  ws.addRow([]) // row 5 blank

  const currentLabel = `30 Jun ${data.company.fiscalYear} (Tk.)`
  const priorLabel   = `30 Jun ${data.company.fiscalYear - 1} (Tk.)`
  const hdr = ws.addRow(['Particulars', 'Notes', currentLabel, priorLabel])
  hdr.height = 28
  hdr.eachCell((cell, col) => {
    cell.font      = { bold: true, size: 10 }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HDR } }
    cell.border    = { top: { style: THIN }, bottom: { style: THIN }, left: { style: THIN }, right: { style: THIN } }
    cell.alignment = col === 1
      ? { horizontal: 'left', wrapText: true }
      : { horizontal: 'center', wrapText: true }
  })

  // Pre-scan to build label → index map for formula resolution
  const labelMap = buildLabelMap(data.accounts ?? [])

  // ── Data rows ─────────────────────────────────────────────────────────────
  for (let rowIdx = 0; rowIdx < data.accounts.length; rowIdx++) {
    const row        = data.accounts[rowIdx]
    const excelRowNum = ws.rowCount + 1  // = DATA_START_ROW + rowIdx

    try {
      if (row.kind === 'header') {
        const r = ws.addRow([row.label ?? ''])
        ws.mergeCells(`A${excelRowNum}:D${excelRowNum}`)
        r.getCell(1).font = { bold: true, underline: true }
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
        continue
      }

      if (row.kind === 'leaf') {
        const lr     = row as LeafRow
        const indent = '  '.repeat(lr.indent || 0)
        const r      = ws.addRow([`${indent}${lr.label}`, lr.note ?? '', lr.current ?? 0, lr.prior ?? 0])
        ;[1, 2, 3, 4].forEach(c => allBorders(r.getCell(c)))
        numRight(r.getCell(3))
        numRight(r.getCell(4))
        continue
      }

      if (row.kind === 'subtotal') {
        const sr     = row as SubtotalRow
        const indent = '  '.repeat(sr.indent || 0)

        // Label-based (preferred) → index-based fallback
        let fC: string, fD: string
        if (sr.sumLabels && sr.sumLabels.length > 0) {
          fC = resolveSumLabels(sr.sumLabels, labelMap, 'C')
          fD = resolveSumLabels(sr.sumLabels, labelMap, 'D')
        } else if (sr.sumOf && sr.sumOf.length > 0) {
          fC = buildSumFormula(sr.sumOf, 'C')
          fD = buildSumFormula(sr.sumOf, 'D')
        } else {
          fC = '0'; fD = '0'
        }

        const r = ws.addRow([`${indent}${sr.label}`, sr.note ?? '', { formula: fC }, { formula: fD }])
        r.getCell(1).font = { bold: true }
        ;[1, 2, 3, 4].forEach(c => allBorders(r.getCell(c)))
        numRight(r.getCell(3))
        numRight(r.getCell(4))

        const bStyle = sr.isDoubleBorder ? DOUBLE : THIN
        applyTopBorder(r, bStyle, 4)
        if (sr.isDoubleBorder) {
          r.getCell(3).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE }, left: { style: THIN }, right: { style: THIN } }
          r.getCell(4).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE }, left: { style: THIN }, right: { style: THIN } }
        }
        continue
      }

      if (row.kind === 'computed') {
        const cr     = row as ComputedRow
        const indent = '  '.repeat(cr.indent || 0)

        // Label-based (preferred) → raw formula fallback
        let fC: string, fD: string
        if (cr.labelComponents && cr.labelComponents.length > 0) {
          fC = resolveLabelComponents(cr.labelComponents, labelMap, 'C')
          fD = resolveLabelComponents(cr.labelComponents, labelMap, 'D')
        } else {
          const raw = (cr.formula ?? '0').replace(/^=/, '')
          fC = raw
          fD = raw.replace(/C(\d+)/g, 'D$1')
        }

        const r = ws.addRow([`${indent}${cr.label}`, cr.note ?? '', { formula: fC }, { formula: fD }])
        r.getCell(1).font = { bold: true }
        ;[1, 2, 3, 4].forEach(c => allBorders(r.getCell(c)))
        numRight(r.getCell(3))
        numRight(r.getCell(4))

        if (cr.isDoubleBorder) {
          r.getCell(3).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE }, left: { style: THIN }, right: { style: THIN } }
          r.getCell(4).border = { top: { style: DOUBLE }, bottom: { style: DOUBLE }, left: { style: THIN }, right: { style: THIN } }
        } else if (cr.isBold) {
          applyTopBorder(r, THIN, 4)
        }
        continue
      }
    } catch (e) {
      throw new Error(`accounts row ${rowIdx} (kind=${row?.kind}, label=${JSON.stringify(row?.label)}): ${(e as Error).message}`)
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 6 }]
}

function buildNarrativeSheet(ws: ExcelJS.Worksheet, rows: NarrativeRow[]): void {
  ws.columns = [
    { key: 'section', width: 40  },
    { key: 'content', width: 100 }
  ]
  const hdr = ws.addRow(['Section', 'Content'])
  hdr.eachCell(cell => {
    cell.font      = { bold: true }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HDR } }
    cell.border    = { top: { style: THIN }, bottom: { style: THIN }, left: { style: THIN }, right: { style: THIN } }
    cell.alignment = { horizontal: 'center' }
  })
  for (const row of rows) {
    const content = row.content ?? ''
    const r       = ws.addRow([row.section ?? '', content])
    r.getCell(1).font      = { bold: true }
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
    ;[1, 2].forEach(c => allBorders(r.getCell(c)))
    r.height = Math.min(400, Math.max(15, Math.ceil(content.length / 120) * 15))
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

function buildValidationSheet(
  ws: ExcelJS.Worksheet,
  rows: ValidationRow[],
  company: CompanyData['company'],
  accountsSheetName: string
): void {
  ws.columns = [
    { key: 'check',    width: 65 },
    { key: 'expected', width: 22 },
    { key: 'computed', width: 22 },
    { key: 'status',   width: 14 },
    { key: 'note',     width: 35 }
  ]

  const titleRow = ws.addRow([`${company.legalName} — Validation Checks`])
  ws.mergeCells('A1:E1')
  Object.assign(titleRow.getCell(1), {
    font:      { bold: true, size: 12, color: { argb: VAL_HDR_FG } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: VAL_HDR_BG } },
    alignment: { horizontal: 'center', vertical: 'middle' }
  })
  titleRow.height = 20

  const periodRow = ws.addRow([company.periodDescription])
  ws.mergeCells('A2:E2')
  Object.assign(periodRow.getCell(1), { font: { italic: true }, alignment: { horizontal: 'center' } })

  ws.addRow([])

  const hdr = ws.addRow(['Check', 'Expected', 'Computed', 'Status', 'Note'])
  hdr.eachCell(cell => {
    cell.font      = { bold: true }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_HDR } }
    cell.border    = { top: { style: THIN }, bottom: { style: THIN }, left: { style: THIN }, right: { style: THIN } }
    cell.alignment = { horizontal: 'center', wrapText: true }
  })
  hdr.getCell(1).alignment = { horizontal: 'left' }

  const sheetRef   = `'${accountsSheetName}'`
  const DATA_ROW_START = 5

  for (const [i, row] of rows.entries()) {
    const excelRow = DATA_ROW_START + i
    const eRef     = row.expectedRef
    const cRef     = row.computedRef

    if (eRef?.row == null || cRef?.row == null) {
      const r = ws.addRow([row.check ?? '', 'N/A', 'N/A', 'N/A', row.note ?? ''])
      ;[1, 2, 3, 4, 5].forEach(c => allBorders(r.getCell(c)))
      r.getCell(4).alignment = { horizontal: 'center' }
      continue
    }

    // row values are 0-based accounts[] indices → add DATA_START_ROW
    const eExcelRow = eRef.row + DATA_START_ROW
    const cExcelRow = cRef.row + DATA_START_ROW

    const r = ws.addRow([
      row.check ?? '',
      { formula: `${sheetRef}!${eRef.col}${eExcelRow}` },
      { formula: `${sheetRef}!${cRef.col}${cExcelRow}` },
      { formula: `IFERROR(IF(ROUND(B${excelRow}-C${excelRow},0)=0,"OK","MISMATCH"),"ERROR")` },
      row.note ?? ''
    ])
    ;[1, 2, 3, 4, 5].forEach(c => allBorders(r.getCell(c)))
    numRight(r.getCell(2))
    numRight(r.getCell(3))
    r.getCell(4).alignment = { horizontal: 'center' }
  }

  if (rows.length > 0) {
    const statusRange = `D${DATA_ROW_START}:D${DATA_ROW_START + rows.length - 1}`
    ws.addConditionalFormatting({
      ref: statusRange,
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'OK',       priority: 1,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: OK_BG } }, font: { color: { argb: OK_FG }, bold: true } } },
        { type: 'containsText', operator: 'containsText', text: 'MISMATCH', priority: 2,
          style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: MISMATCH_BG } }, font: { color: { argb: MISMATCH_FG }, bold: true } } }
      ]
    })
  }

  ws.views = [{ state: 'frozen', ySplit: 4 }]
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function buildWorkbook(data: CompanyData): Promise<{ buffer: Buffer; filename: string }> {
  const wb  = new ExcelJS.Workbook()
  wb.creator = 'Audit Excel Generator'
  wb.created = new Date()
  // Force Excel to recalculate all formulas on open (important since ExcelJS doesn't evaluate formulas)
  wb.calcProperties.fullCalcOnLoad = true

  const stem    = data.company.nameStem
  const fy      = data.company.fiscalYear
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
    buildNarrativeSheet(wsNar, data.narrative ?? [])
  } catch (e) {
    throw new Error(`Narrative sheet failed at row ${wsNar.rowCount}: ${(e as Error).message}`)
  }

  // Merge Claude-generated validation with auto-generated checks.
  // Auto checks use the label map built from the actual accounts data so they are always correct.
  const claudeValidation = data.validation ?? []
  const autoValidation   = generateAutoValidation(data.accounts ?? [])

  // Deduplicate: skip auto checks whose description already appears in Claude's list
  const claudeChecks = new Set(claudeValidation.map(r => normalise(r.check)))
  const dedupedAuto  = autoValidation.filter(r => !claudeChecks.has(normalise(r.check)))
  const allValidation = [...claudeValidation, ...dedupedAuto]

  try {
    buildValidationSheet(wsVal, allValidation, data.company, accName)
  } catch (e) {
    throw new Error(`Validation sheet failed at row ${wsVal.rowCount}: ${(e as Error).message}`)
  }

  const buffer   = await wb.xlsx.writeBuffer() as unknown as Buffer
  const filename = `${stem ?? 'Company'} Audited ${fy ?? 'YYYY'}.xlsx`
  return { buffer, filename }
}
