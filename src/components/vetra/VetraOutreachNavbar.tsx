import type { OutputLanguage } from '../../types/outputLanguage'
import { OUTPUT_LANGUAGE_OPTIONS } from '../../types/outputLanguage'
import { Select } from 'antd'
import { useI18n } from '../../contexts/I18nContext'
import { ScarperToolbarField } from '../common/ScarperToolbarField'
import { scarperSelectProps } from '../common/scarperForm'
import type { VetraCompany } from './companiesData'
import type { VetraTemplate } from './templatesData'
import './VetraOutreachNavbar.css'

interface VetraOutreachNavbarProps {
  companies: VetraCompany[]
  fromCompanyId: string
  toCompanyId: string
  onFromCompanyChange: (companyId: string) => void
  onToCompanyChange: (companyId: string) => void
  templates: VetraTemplate[]
  selectedTemplateId: string
  onTemplateChange: (templateId: string) => void
  outreachLanguage: OutputLanguage
  onOutreachLanguageChange: (language: OutputLanguage) => void
}

export function VetraOutreachNavbar({
  companies,
  fromCompanyId,
  toCompanyId,
  onFromCompanyChange,
  onToCompanyChange,
  templates,
  selectedTemplateId,
  onTemplateChange,
  outreachLanguage,
  onOutreachLanguageChange,
}: VetraOutreachNavbarProps) {
  const { t } = useI18n()

  const companyOptions =
    companies.length === 0
      ? [{ value: '', label: t('vetra.outreach.noCompanies'), disabled: true }]
      : companies.map((company) => ({
          value: company.id,
          label: company.name,
        }))

  const templateOptions =
    templates.length === 0
      ? [{ value: '', label: t('vetra.outreach.noTemplates'), disabled: true }]
      : templates.map((template) => ({
          value: template.id,
          label: template.name,
        }))

  return (
    <nav className="vetra-outreach-navbar" aria-label={t('vetra.outreachNav.aria')}>
      <div className="vetra-outreach-navbar__group">
        <span className="vetra-outreach-navbar__label">{t('vetra.outreachNav.company')}</span>
        <div className="vetra-outreach-navbar__company-row">
          <ScarperToolbarField label={t('vetra.outreach.from')}>
            <Select
              id="vetra-outreach-from"
              {...scarperSelectProps()}
              value={fromCompanyId || undefined}
              disabled={companies.length === 0}
              options={companyOptions}
              onChange={onFromCompanyChange}
            />
          </ScarperToolbarField>
          <span className="vetra-outreach-navbar__connector" aria-hidden="true">
            {t('vetra.outreachNav.toConnector')}
          </span>
          <ScarperToolbarField label={t('vetra.outreach.to')}>
            <Select
              id="vetra-outreach-to"
              {...scarperSelectProps()}
              value={toCompanyId || undefined}
              disabled={companies.length === 0}
              aria-label={t('vetra.outreachNav.toAria')}
              options={companyOptions}
              onChange={onToCompanyChange}
            />
          </ScarperToolbarField>
        </div>
      </div>

      <ScarperToolbarField label={t('vetra.nav.templates')}>
        <Select
          id="vetra-outreach-template"
          {...scarperSelectProps()}
          value={selectedTemplateId || undefined}
          disabled={templates.length === 0}
          options={templateOptions}
          onChange={onTemplateChange}
        />
      </ScarperToolbarField>

      <ScarperToolbarField label={t('vetra.outreach.language')}>
        <Select
          id="vetra-outreach-language"
          {...scarperSelectProps({ minWidth: 140, maxWidth: 200 })}
          value={outreachLanguage}
          options={OUTPUT_LANGUAGE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          onChange={onOutreachLanguageChange}
        />
      </ScarperToolbarField>
    </nav>
  )
}
