import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

const MODEL = 'claude-opus-4-7'
const MAX_TOKENS = 64000

// Cache so repeated calls (batch mode) don't re-read disk every time
let _systemPromptCache: string | null = null
function loadSystemPrompt(): string {
  if (_systemPromptCache) return _systemPromptCache
  try {
    _systemPromptCache = readFileSync(join(process.resourcesPath ?? '', 'prompts/system.md'), 'utf-8')
  } catch {
    _systemPromptCache = readFileSync(join(__dirname, '../../prompts/system.md'), 'utf-8')
  }
  return _systemPromptCache
}

function extractCode(text: string): string {
  // Strip markdown fences if Claude added them despite instructions
  const fenceRe = /```(?:python|py|javascript|js|typescript|ts)?\s*\n([\s\S]*?)\n```/g
  const blocks: string[] = []
  let match: RegExpExecArray | null
  while ((match = fenceRe.exec(text)) !== null) {
    blocks.push(match[1].trim())
  }
  if (blocks.length > 0) return blocks.join('\n\n')
  return text.trim()
}

/**
 * Send the LlamaParse markdown to Claude and stream back the
 * Python/openpyxl script that builds the workbook(s).
 */
export async function generateExcelCode(
  markdown: string,
  apiKey: string,
  onLog: (text: string) => void
): Promise<string> {
  const client       = new Anthropic({ apiKey })
  const systemPrompt = loadSystemPrompt()

  onLog('Sending to Claude — generating Python/openpyxl workbook script…\n')

  const stream = client.messages.stream({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type:          'text',
        text:          systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ] as Parameters<typeof client.messages.stream>[0]['system'],
    messages: [
      {
        role: 'user',
        content:
          'Convert the following audited financial statement markdown into a complete Excel workbook ' +
          'by writing the Python/openpyxl script exactly as described in the system prompt.\n\n' +
          '---\n\n' +
          markdown,
      },
    ],
  })

  // Stream text directly into a single string — avoids keeping a chunks array
  let fullText = ''
  stream.on('text', (text) => {
    fullText += text
    onLog(text)
  })

  const finalMsg = await stream.finalMessage()
  onLog(
    `\n[Claude done] Input: ${finalMsg.usage.input_tokens.toLocaleString()} tokens · ` +
    `Output: ${finalMsg.usage.output_tokens.toLocaleString()} tokens\n`
  )

  return extractCode(fullText)
}
