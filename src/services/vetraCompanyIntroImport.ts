import { createChatCompletion } from './deepseekClient'

const MAX_TASK_CHARS = 48_000

const SYSTEM_PROMPT = `You are a B2B company profile writer for sales outreach.

The user provides research content collected from web scraping / project Tasks about a target company.

Write a structured company introduction with these sections (use exact ## headings):

## Company Overview
## Industry & Market Position
## Products & Services
## Technology & Capabilities
## Key Highlights
## Partnership Value

Rules:
- Output ONLY the introduction body. No JSON, no preamble, no code fences.
- Under each section, write detailed bullet points or short paragraphs grounded in the source material.
- Wrap phrases that should be AI-rewritten per outreach contact in {{double_braces}} with snake_case keys (e.g. {{company_overview}}, {{highlight_1}}).
- Keep section headings as plain ## lines; separate sections with a blank line.
- Do not invent facts not supported by the source. If data is missing for a section, add a concise placeholder line with an appropriate {{slot}}.
- Write in English unless the user message asks for another language.
- Key Highlights must be a bullet list with at least 3 items when source data allows.`

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

export async function generateCompanyIntroFromTask(
  taskText: string,
  options: { companyName?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const trimmed = taskText.trim()
  if (!trimmed) {
    throw new Error('Selected Task has no content to import')
  }

  const source = trimmed.length > MAX_TASK_CHARS
    ? `${trimmed.slice(0, MAX_TASK_CHARS)}\n\n[…truncated for length…]`
    : trimmed

  const companyHint = options.companyName?.trim()
    ? `Target company profile name: ${options.companyName.trim()}\n\n`
    : ''

  const response = await createChatCompletion(
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${companyHint}=== Task research content ===\n${source}`,
        },
      ],
      temperature: 0.25,
      max_tokens: 4096,
    },
    options.signal,
  )

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('AI returned no usable introduction')
  }

  return stripCodeFence(text)
}
