import { createChatCompletion } from './deepseekClient'
import type { OutputLanguage } from '../types/outputLanguage'
import {
  vetraCollaborationLanguageRule,
  vetraOutputLanguageLabel,
} from './vetraOutreachLanguage'

const MAX_INTRO_CHARS = 24_000

export interface VetraCollaborationOpportunity {
  title: string
  description: string
}

export interface VetraCollaborationAnalysis {
  matchScore: number
  matchSummary: string
  opportunities: VetraCollaborationOpportunity[]
}

const SYSTEM_PROMPT = `You are a B2B partnership strategist.

Given two company profiles (From = sender / our side, To = target partner), assess strategic fit and suggest collaboration angles.

Output ONLY valid JSON with this exact shape:
{
  "match_score": <integer 0-100>,
  "match_summary": "<1-2 sentences on overall collaboration fit>",
  "opportunities": [
    {
      "title": "<short opportunity label>",
      "description": "<exactly two sentences; keep wording general and high-level, not overly specific>"
    }
  ]
}

Rules:
- Provide exactly 10 opportunities in the opportunities array.
- Each description must be exactly two sentences, broad and plausible, not hyper-specific product names unless clearly stated in the profiles.
- Base reasoning on company introductions, industry, products/services, and business direction implied in the text.
- match_score reflects complementary capabilities, market overlap, and realistic partnership potential.
- Do not invent precise revenue figures, signed deals, or confidential facts.
- No markdown, no code fences, no extra keys.`

function buildSystemPrompt(outputLanguage: OutputLanguage): string {
  return `${SYSTEM_PROMPT}\n- ${vetraCollaborationLanguageRule(outputLanguage)}`
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

function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(100, Math.round(num)))
}

function normalizeOpportunities(raw: unknown): VetraCollaborationOpportunity[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const title = String(record.title ?? '').trim()
      const description = String(record.description ?? '').trim()
      if (!title || !description) return null
      return { title, description }
    })
    .filter((item): item is VetraCollaborationOpportunity => item !== null)
    .slice(0, 10)
}

function parseAnalysis(text: string): VetraCollaborationAnalysis {
  const cleaned = stripCodeFence(text)
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    throw new Error('AI returned invalid collaboration analysis')
  }

  const opportunities = normalizeOpportunities(parsed.opportunities)
  if (opportunities.length === 0) {
    throw new Error('AI returned no collaboration opportunities')
  }

  return {
    matchScore: clampScore(parsed.match_score),
    matchSummary: String(parsed.match_summary ?? '').trim(),
    opportunities,
  }
}

export async function generateCollaborationAnalysis(input: {
  fromCompanyName: string
  toCompanyName: string
  fromIntroduction: string
  toIntroduction: string
  outputLanguage: OutputLanguage
  signal?: AbortSignal
}): Promise<VetraCollaborationAnalysis> {
  const fromIntro = truncateIntro(input.fromIntroduction)
  const toIntro = truncateIntro(input.toIntroduction)

  if (!fromIntro.trim() || !toIntro.trim()) {
    throw new Error('Both companies need an introduction before generating')
  }

  const response = await createChatCompletion(
    {
      messages: [
        { role: 'system', content: buildSystemPrompt(input.outputLanguage) },
        {
          role: 'user',
          content: [
            `Required output language: ${vetraOutputLanguageLabel(input.outputLanguage)}`,
            '',
            `From company: ${input.fromCompanyName.trim() || 'Company A'}`,
            '=== From introduction ===',
            fromIntro,
            '',
            `To company: ${input.toCompanyName.trim() || 'Company B'}`,
            '=== To introduction ===',
            toIntro,
          ].join('\n'),
        },
      ],
      temperature: 0.35,
      max_tokens: 4096,
    },
    input.signal,
  )

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('AI returned no collaboration analysis')
  }

  return parseAnalysis(text)
}
