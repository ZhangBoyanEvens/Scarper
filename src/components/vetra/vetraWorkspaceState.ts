import type { VetraCompanyPayload } from '../../services/vetraCompanyApi'
import { DEFAULT_ITTC_COMPANY_NAME, type VetraCompany } from './companiesData'
import { DEFAULT_COMPANY_INTRODUCTION } from './vetraEmailTemplate'

export const OPTIMISTIC_COMPANY_ID = '__optimistic__'

export function isOptimisticCompanyId(id: string): boolean {
  return id === OPTIMISTIC_COMPANY_ID
}

export function buildOptimisticCompanyWorkspace(): {
  companies: VetraCompany[]
  selectedId: string
  payloadById: Record<string, VetraCompanyPayload>
} {
  const payload: VetraCompanyPayload = {
    introduction: DEFAULT_COMPANY_INTRODUCTION,
  }

  return {
    companies: [{ id: OPTIMISTIC_COMPANY_ID, name: DEFAULT_ITTC_COMPANY_NAME }],
    selectedId: OPTIMISTIC_COMPANY_ID,
    payloadById: { [OPTIMISTIC_COMPANY_ID]: payload },
  }
}

export function buildEmptyCompanyWorkspace(): {
  companies: VetraCompany[]
  selectedId: string
  payloadById: Record<string, VetraCompanyPayload>
} {
  return {
    companies: [],
    selectedId: '',
    payloadById: {},
  }
}
