import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { CompanyData } from '../types'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 64000

function loadSystemPrompt(): string {
  // Works in both dev (cwd = project root) and packaged (resources next to app)
  try {
    return readFileSync(join(process.resourcesPath ?? '', 'prompts/system.md'), 'utf-8')
  } catch {
    return readFileSync(join(__dirname, '../../prompts/system.md'), 'utf-8')
  }
}

const TOOL_NAME = 'submit_financial_data'

const TOOL_SCHEMA: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Submit the fully structured financial data extracted from the markdown. Call this once per company per fiscal year.',
  input_schema: {
    type: 'object',
    properties: {
      company: {
        type: 'object',
        properties: {
          legalName: { type: 'string' },
          nameStem: { type: 'string', description: 'First two words of legal name, e.g. "Aman Agro"' },
          fiscalYear: { type: 'integer', description: 'e.g. 2023' },
          periodDescription: { type: 'string', description: 'e.g. "Financial Statements for the year ended 30 June 2023"' }
        },
        required: ['legalName', 'nameStem', 'fiscalYear', 'periodDescription']
      },
      audit: {
        type: 'object',
        properties: {
          firm: { type: 'string' },
          reportDate: { type: 'string' },
          signatory: { type: 'string' },
          enrollment: { type: 'string' },
          dvc: { type: 'string' }
        },
        required: ['firm', 'reportDate', 'signatory']
      },
      accounts: {
        type: 'array',
        description: 'Ordered list of rows for the Accounts sheet',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['header', 'leaf', 'subtotal', 'computed'] },
            label: { type: 'string' },
            note: { type: 'string' },
            current: { type: 'number', description: 'For leaf rows: current year value' },
            prior: { type: 'number', description: 'For leaf rows: prior year value' },
            indent: { type: 'integer', description: 'Indent level 0-4 for leaf rows' },
            sumOf: {
              type: 'array',
              description: 'For subtotal rows: ranges to sum',
              items: {
                type: 'object',
                properties: {
                  col: { type: 'string', enum: ['current', 'prior'] },
                  from: { type: 'integer', description: 'Excel row number start' },
                  to: { type: 'integer', description: 'Excel row number end' }
                },
                required: ['col', 'from', 'to']
              }
            },
            formula: { type: 'string', description: 'For computed rows: column-agnostic formula using C column, e.g. "C15+C21"' },
            isBold: { type: 'boolean' },
            isDoubleBorder: { type: 'boolean' }
          },
          required: ['kind', 'label']
        }
      },
      narrative: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string' },
            content: { type: 'string' }
          },
          required: ['section', 'content']
        }
      },
      validation: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            check: { type: 'string' },
            expectedRef: {
              type: 'object',
              properties: {
                row: { type: 'integer' },
                col: { type: 'string', enum: ['C', 'D'] }
              },
              required: ['row', 'col']
            },
            computedRef: {
              type: 'object',
              properties: {
                row: { type: 'integer' },
                col: { type: 'string', enum: ['C', 'D'] }
              },
              required: ['row', 'col']
            },
            note: { type: 'string' }
          },
          required: ['check', 'expectedRef', 'computedRef']
        }
      }
    },
    required: ['company', 'audit', 'accounts', 'narrative', 'validation']
  }
}

export async function extractFinancialData(
  markdown: string,
  apiKey: string,
  onLog: (text: string) => void
): Promise<CompanyData[]> {
  const client = new Anthropic({ apiKey })
  const systemPrompt = loadSystemPrompt()

  onLog('Sending markdown to Claude for analysis...')

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: `Please extract all financial data from the following audited financial statement markdown and call the submit_financial_data tool with the structured result.\n\n---\n\n${markdown}`
      }
    ]
  })

  const results: CompanyData[] = []

  // Stream text chunks to the log terminal
  stream.on('text', (text) => {
    onLog(text)
  })

  const finalMessage = await stream.finalMessage()

  for (const block of finalMessage.content) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME) {
      const raw = block.input as Record<string, unknown>
      // Log a structural summary so we can spot undefined/null fields
      onLog(`\n[DEBUG] Tool response keys: ${Object.keys(raw).join(', ')}`)
      onLog(`[DEBUG] accounts: ${Array.isArray(raw.accounts) ? raw.accounts.length + ' rows' : String(raw.accounts)}`)
      onLog(`[DEBUG] narrative: ${Array.isArray(raw.narrative) ? raw.narrative.length + ' rows' : String(raw.narrative)}`)
      onLog(`[DEBUG] validation: ${Array.isArray(raw.validation) ? raw.validation.length + ' rows' : String(raw.validation)}`)
      if (Array.isArray(raw.accounts)) {
        const bad = (raw.accounts as Record<string, unknown>[]).filter(r => !r.kind || !r.label)
        if (bad.length) onLog(`[DEBUG] accounts rows missing kind/label: ${bad.length}`)
        const badLeaf = (raw.accounts as Record<string, unknown>[]).filter(r => r.kind === 'leaf' && (r.current === undefined || r.prior === undefined))
        if (badLeaf.length) onLog(`[DEBUG] leaf rows missing current/prior: ${badLeaf.length} — sample: ${JSON.stringify(badLeaf[0])}`)
      }
      results.push(raw as unknown as CompanyData)
    }
  }

  if (results.length === 0) {
    throw new Error('Claude did not return structured financial data. Check the log for details.')
  }

  onLog(`\nExtracted ${results.length} company-year dataset(s).`)
  return results
}
