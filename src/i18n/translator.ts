import type {
  MessageTree,
  MessageValue,
  TranslateParams,
  UiLocale,
} from './types'
import { enMessages } from './messages/en'
import { zhMessages } from './messages/zh'

const PACKS: Record<UiLocale, MessageTree> = {
  en: enMessages,
  zh: zhMessages,
}

function resolvePath(tree: MessageTree, path: string): string | undefined {
  const parts = path.split('.')
  let node: MessageValue | undefined = tree
  for (const part of parts) {
    if (node == null || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(text: string, params?: TranslateParams): string {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = params[key]
    return val === undefined ? `{{${key}}}` : String(val)
  })
}

export function createTranslator(locale: UiLocale) {
  const tree = PACKS[locale] ?? PACKS.en
  const fallback = PACKS.en

  return function t(path: string, params?: TranslateParams): string {
    const raw = resolvePath(tree, path) ?? resolvePath(fallback, path) ?? path
    return interpolate(raw, params)
  }
}

