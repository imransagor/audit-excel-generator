export type AccountRowKind = 'header' | 'leaf' | 'subtotal' | 'computed'

export interface HeaderRow {
  kind: 'header'
  label: string
}

export interface LeafRow {
  kind: 'leaf'
  label: string
  note?: string
  current: number
  prior: number
  indent: number
}

export interface SubtotalRow {
  kind: 'subtotal'
  label: string
  note?: string
  sumOf: Array<{ col: 'current' | 'prior'; from: number; to: number }>
  indent?: number
  isBold?: boolean
  isDoubleBorder?: boolean
}

export interface ComputedRow {
  kind: 'computed'
  label: string
  note?: string
  formula: string
  indent?: number
  isBold?: boolean
  isDoubleBorder?: boolean
}

export type AccountRow = HeaderRow | LeafRow | SubtotalRow | ComputedRow

export interface NarrativeRow {
  section: string
  content: string
}

export interface ValidationRow {
  check: string
  expectedRef: { row: number; col: 'C' | 'D' }
  computedRef: { row: number; col: 'C' | 'D' }
  note?: string
}

export interface AuditInfo {
  firm: string
  reportDate: string
  signatory: string
  enrollment?: string
  dvc?: string
}

export interface CompanyInfo {
  legalName: string
  nameStem: string
  fiscalYear: number
  periodDescription: string
}

export interface CompanyData {
  company: CompanyInfo
  audit: AuditInfo
  accounts: AccountRow[]
  narrative: NarrativeRow[]
  validation: ValidationRow[]
}

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
