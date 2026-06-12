import type { VetraEmailTemplate } from '../components/vetra/vetraEmailTemplate'
import {
  assembleOutreachField,
  parseOutreachTemplateSegments,
  type OutreachTemplateSegment,
} from '../components/vetra/vetraEmailTemplate'
import { createChatCompletion } from './deepseekClient'
import type { OutputLanguage } from '../types/outputLanguage'
import {
  vetraOutputLanguageLabel,
  vetraOutreachMessageLanguageRule,
} from './vetraOutreachLanguage'
import type { VetraCollaborationOpportunity } from './vetraOutreachCollaboration'

const MAX_INTRO_CHARS = 16_000

const COLLAB_SLOT_HINT =
  /collab|partnership|partner|opportunit|synerg|cooper|alliance|joint|fit|pitch|value_prop|why_|hook|angle|proposal/i

const SYSTEM_PROMPT = `You are a B2B outreach email writer.

The template has three region types:
1. [locked/red] — preserved verbatim by the system; do NOT include in your JSON output.
2. [plain] — no highlight; adapt wording for context and output language while keeping meaning and tone.
3. [fill/yellow] {{slot}} — write personalized slot content.

Output ONLY valid JSON:
{
  "fills": {
    "<exact_slot_key>": "<slot text without braces>"
  },
  "plain_adaptations": {
    "<exact_plain_id>": "<adapted plain text>"
  }
}

Rules:
- Return a value for every listed [fill] slot key and every listed [plain] id.
- [fill] slots marked [collaboration] MUST use the selected collaboration opportunities.
- Other slots: personalize from From/To company profiles.
- [plain] segments: adapt naturally; do not copy verbatim unless output language is Original and text already fits.
- contact_name / recipient → To company; sender_name / sender → From company.
- Do not invent confidential facts.
- No markdown. Plain text only.
- No code fences, no extra keys.`

function buildSystemPrompt(outputLanguage: OutputLanguage): string {
  return `${SYSTEM_PROMPT}\n- ${vetraOutreachMessageLanguageRule(outputLanguage)}`
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function truncateIntro(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_INTRO_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_INTRO_CHARS)}\n\n[…truncated for length…]`
}

function isCollaborationSlot(segment: OutreachTemplateSegment, fieldText: string): boolean {
  if (segment.kind !== 'ai_slot') return false
  const idx = fieldText.indexOf(segment.raw)
  const line =
    idx >= 0
      ? fieldText.slice(fieldText.lastIndexOf('\n', idx - 1) + 1, fieldText.indexOf('\n', idx))
      : segment.content
  return COLLAB_SLOT_HINT.test(segment.content) || COLLAB_SLOT_HINT.test(line)
}

function describeSegments(
  segments: OutreachTemplateSegment[],
  fieldText: string,
): { slotLines: string[]; plainLines: string[]; lockedLines: string[] } {
  const slotLines: string[] = []
  const plainLines: string[] = []
  const lockedLines: string[] = []

  for (const segment of segments) {
    if (segment.kind === 'locked') {
      lockedLines.push(`- "${segment.content}" (preserved exactly — do not output)`)
    } else if (segment.kind === 'ai_slot') {
      const tag = isCollaborationSlot(segment, fieldText) ? ' [collaboration]' : ''
      slotLines.push(`- ${segment.content}${tag} (fill)`)
    } else if (segment.content.trim()) {
      plainLines.push(
        `- ${segment.id} (adapt): ${JSON.stringify(segment.content)}`,
      )
    }
  }

  return { slotLines, plainLines, lockedLines }
}

function parseGenerationResult(
  text: string,
  slotKeys: string[],
  plainIds: string[],
): { fills: Record<string, string>; plainAdaptations: Record<string, string> } {
  const cleaned = stripCodeFence(text)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    throw new Error('AI returned invalid outreach message')
  }

  const rawFills = parsed.fills
  const rawPlain = parsed.plain_adaptations

  const fills: Record<string, string> = {}
  const plainAdaptations: Record<string, string> = {}

  if (slotKeys.length > 0) {
    if (!rawFills || typeof rawFills !== 'object') {
      throw new Error('AI returned no slot fills')
    }
    for (const key of slotKeys) {
      const value = (rawFills as Record<string, unknown>)[key]
      const textValue = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
      if (!textValue) {
        throw new Error(`AI did not fill slot: ${key}`)
      }
      fills[key] = textValue
    }
  }

  if (plainIds.length > 0) {
    if (!rawPlain || typeof rawPlain !== 'object') {
      throw new Error('AI returned no plain adaptations')
    }
    for (const id of plainIds) {
      const value = (rawPlain as Record<string, unknown>)[id]
      const textValue = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
      if (!textValue) {
        throw new Error(`AI did not adapt plain segment: ${id}`)
      }
      plainAdaptations[id] = textValue
    }
  }

  return { fills, plainAdaptations }
}

export interface OutreachMessageResult {
  subject: string
  body: string
}

export async function generateOutreachMessage(input: {
  template: VetraEmailTemplate
  fromCompanyName: string
  toCompanyName: string
  fromIntroduction: string
  toIntroduction: string
  matchSummary: string
  selectedOpportunities: VetraCollaborationOpportunity[]
  outputLanguage: OutputLanguage
  signal?: AbortSignal
}): Promise<OutreachMessageResult> {
  const subjectText = input.template.subject.trim()
  const bodyText = input.template.body.trim()
  if (!subjectText && !bodyText) {
    throw new Error('Selected template is empty')
  }

  const subjectSegments = parseOutreachTemplateSegments(subjectText, 'subject')
  const bodySegments = parseOutreachTemplateSegments(bodyText, 'body')

  const slotKeys = [...subjectSegments, ...bodySegments]
    .filter((segment) => segment.kind === 'ai_slot')
    .map((segment) => segment.content)

  const plainIds = [...subjectSegments, ...bodySegments]
    .filter((segment) => segment.kind === 'plain' && segment.content.trim())
    .map((segment) => segment.id)

  if (slotKeys.length === 0 && plainIds.length === 0) {
    throw new Error(
      'Template has no {{AI slots}} or plain text to generate — add content in Templates first',
    )
  }

  if (input.selectedOpportunities.length === 0) {
    throw new Error('Select at least one collaboration opportunity')
  }

  const subjectDesc = describeSegments(subjectSegments, subjectText)
  const bodyDesc = describeSegments(bodySegments, bodyText)

  const opportunityLines = input.selectedOpportunities.map(
    (item, index) => `${index + 1}. ${item.title}\n   ${item.description}`,
  )

  const userContent = [
    `Required output language: ${vetraOutputLanguageLabel(input.outputLanguage)}`,
    '',
    `From: ${input.fromCompanyName.trim() || 'Sender'}`,
    '=== From introduction ===',
    truncateIntro(input.fromIntroduction) || '(empty)',
    '',
    `To: ${input.toCompanyName.trim() || 'Recipient'}`,
    '=== To introduction ===',
    truncateIntro(input.toIntroduction) || '(empty)',
    '',
    '=== Overall collaboration fit ===',
    input.matchSummary.trim() || '(not provided)',
    '',
    '=== Selected collaboration opportunities ===',
    opportunityLines.join('\n'),
    '',
    '=== Template subject ===',
    subjectText || '(empty)',
    ...(subjectDesc.lockedLines.length ? ['Locked (preserve):', ...subjectDesc.lockedLines] : []),
    ...(subjectDesc.plainLines.length ? ['Plain (adapt):', ...subjectDesc.plainLines] : []),
    ...(subjectDesc.slotLines.length ? ['Fill (yellow slots):', ...subjectDesc.slotLines] : []),
    '',
    '=== Template body ===',
    bodyText || '(empty)',
    ...(bodyDesc.lockedLines.length ? ['Locked (preserve):', ...bodyDesc.lockedLines] : []),
    ...(bodyDesc.plainLines.length ? ['Plain (adapt):', ...bodyDesc.plainLines] : []),
    ...(bodyDesc.slotLines.length ? ['Fill (yellow slots):', ...bodyDesc.slotLines] : []),
  ].join('\n')

  const response = await createChatCompletion(
    {
      messages: [
        { role: 'system', content: buildSystemPrompt(input.outputLanguage) },
        { role: 'user', content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    },
    input.signal,
  )

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('AI returned no outreach message')
  }

  const { fills, plainAdaptations } = parseGenerationResult(text, slotKeys, plainIds)

  return {
    subject: subjectSegments.length
      ? assembleOutreachField(subjectSegments, fills, plainAdaptations)
      : '',
    body: bodySegments.length
      ? assembleOutreachField(bodySegments, fills, plainAdaptations)
      : '',
  }
}
