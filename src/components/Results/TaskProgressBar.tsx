import { Progress, Space, Tag, Typography } from 'antd'
import { useI18n } from '../../contexts/I18nContext'

const { Text, Paragraph } = Typography

interface TaskProgressBarProps {
  progress: number
  stepLabel: string
  stepHint?: string
  taskIndex: number
  taskTotal: number
  currentUrl?: string
  usingPrompt?: boolean
}

export function TaskProgressBar({
  progress,
  stepLabel,
  stepHint,
  taskIndex,
  taskTotal,
  currentUrl,
  usingPrompt,
}: TaskProgressBarProps) {
  const { t } = useI18n()
  const clamped = Math.min(100, Math.max(0, progress))

  return (
    <div aria-busy="true" aria-live="polite">
      <Space wrap style={{ marginBottom: 12 }}>
        <Text strong>
          {t('scrape.progress.task', { index: taskIndex, total: taskTotal })}
        </Text>
        {usingPrompt ? (
          <Tag color="processing">{t('scrape.progress.promptApplied')}</Tag>
        ) : null}
      </Space>
      <Progress percent={clamped} status="active" showInfo={false} />
      <Paragraph style={{ margin: '12px 0 0', marginBottom: 0 }}>{stepLabel}</Paragraph>
      {stepHint ? (
        <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 13 }}>
          {stepHint}
        </Text>
      ) : null}
      {currentUrl ? (
        <Text
          type="secondary"
          style={{ display: 'block', marginTop: 6, fontSize: 12, wordBreak: 'break-all' }}
        >
          {currentUrl}
        </Text>
      ) : null}
    </div>
  )
}
