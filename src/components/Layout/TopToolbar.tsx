import { Col, Flex, Row, Typography } from 'antd'
import type { OutputDetail } from '../../types/outputDetail'
import type { OutputLanguage } from '../../types/outputLanguage'
import { useI18n } from '../../contexts/I18nContext'
import {
  getLocalizedOutputDetailLabel,
  getLocalizedOutputLanguageLabel,
} from '../../i18n/outputOptions'
import { OutputLanguageSelect } from './OutputLanguageSelect'
import { TextInputSection } from './TextInputSection'
import './TopToolbar.css'

const { Text } = Typography

interface TopToolbarProps {
  outputLanguage: OutputLanguage
  outputDetail: OutputDetail
  onOutputLanguageChange: (lang: OutputLanguage) => void
  onOutputDetailChange: (detail: OutputDetail) => void
}

export function TopToolbar({
  outputLanguage,
  outputDetail,
  onOutputLanguageChange,
  onOutputDetailChange,
}: TopToolbarProps) {
  const { t } = useI18n()
  const langLabel = getLocalizedOutputLanguageLabel(t, outputLanguage)
  const detailLabel = getLocalizedOutputDetailLabel(t, outputDetail)

  return (
    <header className="scrape-page__toolbar" aria-label={t('scrape.settings')}>
      <Row gutter={[16, 12]} align="middle">
        <Col xs={24} xl={14}>
          <TextInputSection layout="toolbar" />
        </Col>
        <Col xs={24} xl={10}>
          <Flex vertical gap={4} align="flex-end">
            <OutputLanguageSelect
              language={outputLanguage}
              detail={outputDetail}
              onLanguageChange={onOutputLanguageChange}
              onDetailChange={onOutputDetailChange}
            />
            <Text
              type="secondary"
              style={{ fontSize: 12 }}
              title={t('scrape.syncedSettings')}
            >
              {t('scrape.globalPreset', { lang: langLabel, detail: detailLabel })}
            </Text>
          </Flex>
        </Col>
      </Row>
    </header>
  )
}
