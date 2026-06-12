import type { OutputLanguage } from '../types/outputLanguage'
import { outputLanguageInstruction } from '../types/outputLanguage'

export function vetraOutputLanguageLabel(lang: OutputLanguage): string {
  return outputLanguageInstruction(lang)
}

/** Collaboration fit follows the app default output language. */
export function vetraCollaborationLanguageRule(lang: OutputLanguage): string {
  switch (lang) {
    case 'en':
      return 'CRITICAL: Write match_summary, every opportunity title, and every description in English only.'
    case 'zh':
      return 'CRITICAL: Write match_summary, every opportunity title, and every description in Simplified Chinese (简体中文) only. Do not use English except proper nouns or brand names.'
    case 'original':
      return 'Use the same language as the company profiles (prefer the To company profile language if they differ).'
  }
}

/** Outreach message slot fills and plain adaptations follow the navbar outreach language. */
export function vetraOutreachMessageLanguageRule(lang: OutputLanguage): string {
  switch (lang) {
    case 'en':
      return 'CRITICAL: Write all [fill] slots and [plain] adaptations in English. [locked] regions are preserved separately — never translate them.'
    case 'zh':
      return 'CRITICAL: Write all [fill] slots and [plain] adaptations in Simplified Chinese (简体中文). [locked] regions are preserved separately — never translate them.'
    case 'original':
      return 'Keep [plain] and [fill] in the same language as their surrounding template text. [locked] regions stay exactly as written.'
  }
}
