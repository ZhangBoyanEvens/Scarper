import type { VetraTemplatePayload } from '../../services/vetraTemplateApi'
import { DEFAULT_TEMPLATE_NAME, type VetraTemplate } from './templatesData'
import { DEFAULT_EMAIL_TEMPLATE } from './vetraEmailTemplate'

export const OPTIMISTIC_TEMPLATE_ID = '__optimistic_template__'

export function isOptimisticTemplateId(id: string): boolean {
  return id === OPTIMISTIC_TEMPLATE_ID
}

export function buildOptimisticTemplateWorkspace(): {
  templates: VetraTemplate[]
  selectedId: string
  payloadById: Record<string, VetraTemplatePayload>
} {
  const payload: VetraTemplatePayload = {
    subject: DEFAULT_EMAIL_TEMPLATE.subject,
    body: DEFAULT_EMAIL_TEMPLATE.body,
  }

  return {
    templates: [{ id: OPTIMISTIC_TEMPLATE_ID, name: DEFAULT_TEMPLATE_NAME }],
    selectedId: OPTIMISTIC_TEMPLATE_ID,
    payloadById: { [OPTIMISTIC_TEMPLATE_ID]: payload },
  }
}

export function buildEmptyTemplateWorkspace(): {
  templates: VetraTemplate[]
  selectedId: string
  payloadById: Record<string, VetraTemplatePayload>
} {
  return {
    templates: [],
    selectedId: '',
    payloadById: {},
  }
}
