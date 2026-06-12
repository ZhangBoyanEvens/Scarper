import { AlignLeftOutlined } from '@ant-design/icons'
import { Button, Flex, Input, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useAppSettingsOptional } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'
import { loadSavedPrompt, savePromptToStorage } from '../../storage/promptStorage'
import { GlowPanel } from './GlowPanel'
import './TextInputSection.css'

const { Text } = Typography

export interface TextInputSectionProps {
  layout?: 'panel' | 'toolbar'
  placeholder?: string
  onPromptSaved?: (prompt: string) => void
}

export function TextInputSection({
  layout = 'panel',
  placeholder,
  onPromptSaved,
}: TextInputSectionProps) {
  const { t } = useI18n()
  const appSettings = useAppSettingsOptional()
  const [draft, setDraft] = useState('')
  const [savedPrompt, setSavedPrompt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const resolvedPlaceholder =
    placeholder ?? t('settings.workflow.promptPlaceholder')

  useEffect(() => {
    const fromSettings = appSettings?.settings.processingPrompt
    const stored = fromSettings ?? loadSavedPrompt()
    if (stored !== null) {
      setSavedPrompt(stored)
      setDraft(stored)
    }
    setLoaded(true)
  }, [appSettings?.settings.processingPrompt])

  const isDirty = savedPrompt === null ? draft.length > 0 : draft !== savedPrompt
  const canSave = loaded && draft.trim().length > 0 && isDirty

  const handleSave = useCallback(() => {
    const text = draft
    savePromptToStorage(text)
    appSettings?.setProcessingPrompt(text)
    setSavedPrompt(text)
    onPromptSaved?.(text)
  }, [appSettings, draft, onPromptSaved])

  const saveLabel =
    savedPrompt !== null && !isDirty
      ? t('common.saved')
      : savedPrompt !== null
        ? t('scrape.saveChanges')
        : t('common.save')

  if (layout === 'toolbar') {
    return (
      <Flex vertical gap={6} style={{ width: '100%' }}>
        <Flex gap={8} align="center" style={{ width: '100%' }}>
          <Input
            size="middle"
            prefix={<AlignLeftOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />}
            value={draft}
            placeholder={resolvedPlaceholder}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={() => {
              if (canSave) handleSave()
            }}
          />
          <Button type="primary" size="middle" disabled={!canSave} onClick={handleSave}>
            {saveLabel}
          </Button>
        </Flex>
        {savedPrompt !== null && isDirty ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('scrape.editedNotSaved')}
          </Text>
        ) : null}
      </Flex>
    )
  }

  return (
    <GlowPanel title={t('scrape.processingPrompt')} bodyClassName="panel-body--input">
      <div className="text-input-wrap">
        <Input.TextArea
          className="panel-textarea"
          value={draft}
          placeholder={resolvedPlaceholder}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="text-input-footer">
          {savedPrompt !== null && isDirty ? (
            <Text type="secondary" className="text-input-status">
              {t('scrape.editedNotSaved')}
            </Text>
          ) : null}
          <Button type="primary" size="middle" disabled={!canSave} onClick={handleSave}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </GlowPanel>
  )
}
