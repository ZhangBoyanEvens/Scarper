import type { FindocTemplate } from '../types/findocTemplate'
import {
  deleteNeonFindocTemplate,
  fetchNeonFindocTemplates,
  isFindocTemplateDbPreferred,
  saveNeonFindocTemplate,
} from './findocTemplateApi'

const CUSTOM_STORAGE_KEY = 'scarper.findoc.templates.custom'
const DRAFT_STORAGE_KEY = 'scarper.findoc.template-draft'

/** 内置模板 */
const BUILTIN_TEMPLATES: FindocTemplate[] = [
  {
    id: 'blank',
    name: 'Blank document',
    content: '',
    source: 'builtin',
  },
  {
    id: 'financial-summary',
    name: 'Financial summary',
    content: `### 标题
财务摘要报告

### 摘要
报告期间、主体与核心结论概述。

### 要点
• 收入与成本变动
• 现金流与流动性
• 主要风险与后续行动

### 正文
在此填写详细财务分析、同比环比说明及数据来源。`,
    source: 'builtin',
  },
  {
    id: 'monthly-reconciliation',
    name: 'Monthly reconciliation',
    content: `### 标题
月度对账记录

### 摘要
对账月份、账户范围与总体差异说明。

### 要点
• 期初余额
• 本期发生额
• 期末余额与差异项

### 正文
| 项目 | 账面金额 | 外部金额 | 差异 | 备注 |
|------|----------|----------|------|------|
|      |          |          |      |      |`,
    source: 'builtin',
  },
]

function readCustomTemplates(): FindocTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FindocTemplate[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          typeof t.content === 'string',
      )
      .map((t) => ({ ...t, source: 'custom' as const }))
  } catch {
    return []
  }
}

function writeCustomTemplates(templates: FindocTemplate[]): void {
  localStorage.setItem(
    CUSTOM_STORAGE_KEY,
    JSON.stringify(
      templates.map(({ id, name, content }) => ({ id, name, content })),
    ),
  )
}

function replaceCustomTemplates(templates: FindocTemplate[]): void {
  writeCustomTemplates(templates.map((t) => ({ ...t, source: 'custom' })))
}

export function notifyFindocTemplatesChanged(): void {
  window.dispatchEvent(new Event('scarper:findoc-templates-changed'))
}

export function isBuiltinTemplate(id: string): boolean {
  return BUILTIN_TEMPLATES.some((t) => t.id === id)
}

export function peekFindocTemplates(): FindocTemplate[] {
  return [...BUILTIN_TEMPLATES, ...readCustomTemplates()]
}

export async function listFindocTemplates(): Promise<FindocTemplate[]> {
  const localCustom = readCustomTemplates()

  if (!isFindocTemplateDbPreferred()) {
    return [...BUILTIN_TEMPLATES, ...localCustom]
  }

  try {
    const remoteCustom = await fetchNeonFindocTemplates()
    replaceCustomTemplates(remoteCustom)
    return [...BUILTIN_TEMPLATES, ...remoteCustom]
  } catch (e) {
    if (e instanceof Error && e.name === 'NeonAuthError') {
      return [...BUILTIN_TEMPLATES, ...localCustom]
    }
    if (
      e instanceof Error &&
      (e.name === 'NeonNotConfiguredError' || e.message.includes('503'))
    ) {
      return [...BUILTIN_TEMPLATES, ...localCustom]
    }
    if (localCustom.length > 0) {
      return [...BUILTIN_TEMPLATES, ...localCustom]
    }
    throw e
  }
}

export function getFindocTemplateContent(id: string): string {
  return peekFindocTemplates().find((t) => t.id === id)?.content ?? ''
}

export function peekTemplateDraft(): string {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearTemplateDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function saveCustomTemplateLocal(input: {
  id?: string
  name: string
  content: string
}): FindocTemplate {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Enter a template name')
  }

  const custom = readCustomTemplates()
  const now = Date.now()
  const existingIndex =
    input.id && !isBuiltinTemplate(input.id)
      ? custom.findIndex((t) => t.id === input.id)
      : -1

  const saved: FindocTemplate = {
    id:
      existingIndex >= 0
        ? custom[existingIndex].id
        : `custom-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    content: input.content,
    source: 'custom',
  }

  if (existingIndex >= 0) {
    custom[existingIndex] = saved
  } else {
    custom.unshift(saved)
  }

  writeCustomTemplates(custom)
  notifyFindocTemplatesChanged()
  return saved
}

export async function saveCustomTemplate(input: {
  id?: string
  name: string
  content: string
}): Promise<FindocTemplate> {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Enter a template name')
  }

  if (isFindocTemplateDbPreferred()) {
    try {
      const saved = await saveNeonFindocTemplate({
        id: input.id && !isBuiltinTemplate(input.id) ? input.id : undefined,
        name,
        content: input.content,
      })
      const custom = readCustomTemplates()
      const idx = custom.findIndex((t) => t.id === saved.id)
      if (idx >= 0) {
        custom[idx] = saved
      } else {
        custom.unshift(saved)
      }
      replaceCustomTemplates(custom)
      notifyFindocTemplatesChanged()
      return saved
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === 'NeonNotConfiguredError' || e.message.includes('503'))
      ) {
        return saveCustomTemplateLocal(input)
      }
      throw e
    }
  }

  return saveCustomTemplateLocal(input)
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  if (isBuiltinTemplate(id)) {
    throw new Error('Built-in templates cannot be deleted')
  }

  if (isFindocTemplateDbPreferred()) {
    try {
      await deleteNeonFindocTemplate(id)
    } catch (e) {
      if (
        !(e instanceof Error && (e.message.includes('404') || e.name === 'NeonNotConfiguredError'))
      ) {
        throw e
      }
    }
  }

  const next = readCustomTemplates().filter((t) => t.id !== id)
  writeCustomTemplates(next)
  notifyFindocTemplatesChanged()
}

export async function duplicateBuiltinAsCustom(
  id: string,
  nameOverride?: string,
): Promise<FindocTemplate> {
  const source = BUILTIN_TEMPLATES.find((t) => t.id === id)
  if (!source) {
    throw new Error('Template not found')
  }
  return saveCustomTemplate({
    name: nameOverride?.trim() || `${source.name} copy`,
    content: source.content,
  })
}
