import type { OutputLanguage } from '../../types/outputLanguage'
import { OUTPUT_LANGUAGE_OPTIONS } from '../../types/outputLanguage'
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

function CompanySelect({
  id,
  value,
  companies,
  disabled,
  ariaLabel,
  onChange,
}: {
  id: string
  value: string
  companies: VetraCompany[]
  disabled?: boolean
  ariaLabel?: string
  onChange: (companyId: string) => void
}) {
  return (
    <select
      id={id}
      className="vetra-outreach-navbar__select"
      value={value}
      disabled={disabled || companies.length === 0}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    >
      {companies.length === 0 ? (
        <option value="">No companies</option>
      ) : (
        companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))
      )}
    </select>
  )
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
  return (
    <nav className="vetra-outreach-navbar" aria-label="Outreach context">
      <div className="vetra-outreach-navbar__group">
        <span className="vetra-outreach-navbar__label">Company</span>
        <div className="vetra-outreach-navbar__company-row">
          <label className="vetra-outreach-navbar__subfield" htmlFor="vetra-outreach-from">
            <span className="vetra-outreach-navbar__sublabel">From</span>
            <CompanySelect
              id="vetra-outreach-from"
              value={fromCompanyId}
              companies={companies}
              onChange={onFromCompanyChange}
            />
          </label>
          <span className="vetra-outreach-navbar__connector" aria-hidden="true">
            to
          </span>
          <label className="vetra-outreach-navbar__subfield" htmlFor="vetra-outreach-to">
            <CompanySelect
              id="vetra-outreach-to"
              value={toCompanyId}
              companies={companies}
              ariaLabel="To company"
              onChange={onToCompanyChange}
            />
          </label>
        </div>
      </div>

      <label className="vetra-outreach-navbar__field" htmlFor="vetra-outreach-template">
        <span className="vetra-outreach-navbar__label">Template</span>
        <select
          id="vetra-outreach-template"
          className="vetra-outreach-navbar__select"
          value={selectedTemplateId}
          disabled={templates.length === 0}
          onChange={(event) => onTemplateChange(event.target.value)}
        >
          {templates.length === 0 ? (
            <option value="">No templates</option>
          ) : (
            templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="vetra-outreach-navbar__field" htmlFor="vetra-outreach-language">
        <span className="vetra-outreach-navbar__label">Outreach language</span>
        <select
          id="vetra-outreach-language"
          className="vetra-outreach-navbar__select vetra-outreach-navbar__select--language"
          value={outreachLanguage}
          onChange={(event) =>
            onOutreachLanguageChange(event.target.value as OutputLanguage)
          }
        >
          {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}
