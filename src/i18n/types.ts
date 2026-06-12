export type UiLocale = 'en' | 'zh'

export type MessageValue = string | MessageTree
export type MessageTree = { [key: string]: MessageValue }

export type TranslateParams = Record<string, string | number>
