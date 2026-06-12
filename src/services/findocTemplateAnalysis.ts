import { createChatCompletion } from './deepseekClient'

const SYSTEM_PROMPT = `You are a FinDoc template structure analyzer. The user will provide a full sample article.

Your task: extract and output a structural template. Remove all substantive content unrelated to structure; keep only reusable writing structure.

Preserve these structural elements:
1. Sentence patterns: typical phrasing, paragraph openers/transitions/closers (use placeholders or brief descriptions)
2. Length: approximate word or sentence counts per section
3. Grammar: tense, voice, person, and related notes
4. Tone: formal, objective, conclusion-led, etc.

Remove: company names, people, dates, numbers, events, opinions, industry specifics.

Output format:
- Output template body only; no analysis preamble or closing remarks
- Use English
- If the source has hierarchy, use ### Title, ### Summary, ### Key points, ### Body (aligned with FinDoc built-in templates)
- Use [placeholder] for variable content, e.g. [Report title], [Key conclusion]
- Add a final section ### Structure notes with a short list covering sentence patterns, length, grammar, and tone
- Do not wrap output in markdown code fences`

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

export async function analyzeTemplateStructure(
  article: string,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = article.trim()
  if (!trimmed) {
    throw new Error('Paste or enter an article first')
  }

  const response = await createChatCompletion(
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: trimmed },
      ],
      temperature: 0.2,
    },
    signal,
  )

  const text = response.choices[0]?.message?.content?.trim()
  if (!text) {
    throw new Error('AI returned no usable result')
  }

  return stripCodeFence(text)
}
