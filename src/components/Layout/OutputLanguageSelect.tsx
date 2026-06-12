import { Flex, Select } from 'antd'
import type { OutputDetail } from '../../types/outputDetail'
import type { OutputLanguage } from '../../types/outputLanguage'
import { useI18n } from '../../contexts/I18nContext'
import {
  getLocalizedOutputDetailOptions,
  getLocalizedOutputLanguageOptions,
} from '../../i18n/outputOptions'
import { scarperSelectPopup } from '../common/scarperForm'
import './OutputLanguageSelect.css'

interface OutputLanguageSelectProps {
  language: OutputLanguage
  detail: OutputDetail
  onLanguageChange: (value: OutputLanguage) => void
  onDetailChange: (value: OutputDetail) => void
}

export function OutputLanguageSelect({
  language,
  detail,
  onLanguageChange,
  onDetailChange,
}: OutputLanguageSelectProps) {
  const { t } = useI18n()
  const languageOptions = getLocalizedOutputLanguageOptions(t)
  const detailOptions = getLocalizedOutputDetailOptions(t)

  return (
    <Flex className="lang-select-wrap" gap={10} align="center">
      <Select
        className="lang-select-control"
        size="middle"
        value={language}
        getPopupContainer={scarperSelectPopup}
        options={languageOptions.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
        onChange={onLanguageChange}
      />
      <Select
        className="lang-select-control"
        size="middle"
        value={detail}
        getPopupContainer={scarperSelectPopup}
        options={detailOptions.map((opt) => ({
          value: opt.value,
          label: opt.label,
        }))}
        onChange={onDetailChange}
      />
    </Flex>
  )
}
