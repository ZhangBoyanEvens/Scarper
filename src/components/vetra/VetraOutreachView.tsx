import { useEffect, useRef, useState } from 'react'
import { useAppSettings } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'
import {
  generateCollaborationAnalysis,
  type VetraCollaborationAnalysis,
} from '../../services/vetraOutreachCollaboration'
import { generateOutreachMessage } from '../../services/vetraOutreachMessage'
import type { OutputLanguage } from '../../types/outputLanguage'
import '../../styles/panel.css'
import '../../styles/scrollbar.css'
import '../Layout/TextInputSection.css'
import '../projects/ProjectPage.css'
import { GlowPanel } from '../Layout/GlowPanel'
import { VetraOutreachCollaborationPanel } from './VetraOutreachCollaborationPanel'
import { VetraOutreachNavbar } from './VetraOutreachNavbar'
import {
  useVetraCompanyWorkspaceContext,
  useVetraTemplateWorkspaceContext,
} from './VetraWorkspaceContext'
import './VetraOutreachView.css'

function resolveDefaultToCompanyId(
  companies: { id: string }[],
  fromCompanyId: string,
): string {
  if (companies.length === 0) return ''
  const alternative = companies.find((company) => company.id !== fromCompanyId)
  return alternative?.id ?? companies[0].id
}

export function VetraOutreachView() {
  const { t } = useI18n()
  const { settings } = useAppSettings()
  const companyWorkspace = useVetraCompanyWorkspaceContext()
  const templateWorkspace = useVetraTemplateWorkspaceContext()
  const { companies, selectedId: selectedCompanyListId, getPayload } = companyWorkspace
  const { templates, selectedId: selectedTemplateListId, getPayload: getTemplatePayload } =
    templateWorkspace

  const [fromCompanyId, setFromCompanyId] = useState(selectedCompanyListId)
  const [toCompanyId, setToCompanyId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState(selectedTemplateListId)
  const [outreachLanguage, setOutreachLanguage] = useState<OutputLanguage>(
    () => settings.outputLanguage,
  )
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [collaboration, setCollaboration] = useState<VetraCollaborationAnalysis | null>(
    null,
  )
  const [selectedOpportunityIndices, setSelectedOpportunityIndices] = useState<
    Set<number>
  >(() => new Set())
  const [generating, setGenerating] = useState(false)
  const [generatingMessage, setGeneratingMessage] = useState(false)
  const [collabError, setCollabError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [messageStatus, setMessageStatus] = useState<string | null>(null)
  const generateAbortRef = useRef<AbortController | null>(null)
  const messageAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!selectedCompanyListId) return
    setFromCompanyId((current) =>
      current && companies.some((company) => company.id === current)
        ? current
        : selectedCompanyListId,
    )
  }, [companies, selectedCompanyListId])

  useEffect(() => {
    if (companies.length === 0) {
      setToCompanyId('')
      return
    }
    setToCompanyId((current) =>
      current && companies.some((company) => company.id === current)
        ? current
        : resolveDefaultToCompanyId(companies, fromCompanyId),
    )
  }, [companies, fromCompanyId])

  useEffect(() => {
    if (!selectedTemplateListId) return
    setSelectedTemplateId((current) =>
      current && templates.some((template) => template.id === current)
        ? current
        : selectedTemplateListId,
    )
  }, [templates, selectedTemplateListId])

  useEffect(() => {
    setCollaboration(null)
    setCollabError(null)
    setSelectedOpportunityIndices(new Set())
  }, [fromCompanyId, toCompanyId, settings.outputLanguage])

  const toggleOpportunity = (index: number) => {
    setSelectedOpportunityIndices((current) => {
      const next = new Set(current)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort()
      messageAbortRef.current?.abort()
    }
  }, [])

  const fromCompany = companies.find((company) => company.id === fromCompanyId)
  const toCompany = companies.find((company) => company.id === toCompanyId)
  const isReady = Boolean(fromCompanyId && toCompanyId && selectedTemplateId)
  const canGenerateMessage =
    isReady &&
    collaboration !== null &&
    selectedOpportunityIndices.size > 0 &&
    !generatingMessage

  const handleGenerate = () => {
    if (!isReady || !fromCompany || !toCompany) {
      setStatusMessage(t('vetra.outreachView.selectFirst'))
      return
    }

    generateAbortRef.current?.abort()
    const controller = new AbortController()
    generateAbortRef.current = controller

    setGenerating(true)
    setCollabError(null)
    setStatusMessage(null)

    void (async () => {
      try {
        const analysis = await generateCollaborationAnalysis({
          fromCompanyName: fromCompany.name,
          toCompanyName: toCompany.name,
          fromIntroduction: getPayload(fromCompanyId).introduction,
          toIntroduction: getPayload(toCompanyId).introduction,
          outputLanguage: settings.outputLanguage,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setCollaboration(analysis)
        setSelectedOpportunityIndices(new Set())
      } catch (error) {
        if (controller.signal.aborted) return
        const message =
          error instanceof Error ? error.message : t('vetra.outreachView.collabFailed')
        setCollabError(message)
        setCollaboration(null)
      } finally {
        if (!controller.signal.aborted) {
          setGenerating(false)
        }
      }
    })()
  }

  const handleGenerateMessage = () => {
    if (!isReady || !fromCompany || !toCompany || !collaboration) {
      setMessageStatus(t('vetra.outreachView.selectForMessage'))
      return
    }
    if (selectedOpportunityIndices.size === 0) {
      setMessageStatus(t('vetra.outreachView.selectOpportunity'))
      return
    }

    const templatePayload = getTemplatePayload(selectedTemplateId)
    const selectedOpportunities = [...selectedOpportunityIndices]
      .sort((a, b) => a - b)
      .map((index) => collaboration.opportunities[index])
      .filter(Boolean)

    messageAbortRef.current?.abort()
    const controller = new AbortController()
    messageAbortRef.current = controller

    setGeneratingMessage(true)
    setMessageStatus(null)

    void (async () => {
      try {
        const message = await generateOutreachMessage({
          template: {
            subject: templatePayload.subject,
            body: templatePayload.body,
          },
          fromCompanyName: fromCompany.name,
          toCompanyName: toCompany.name,
          fromIntroduction: getPayload(fromCompanyId).introduction,
          toIntroduction: getPayload(toCompanyId).introduction,
          matchSummary: collaboration.matchSummary,
          selectedOpportunities,
          outputLanguage: outreachLanguage,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setDraftSubject(message.subject)
        setDraftBody(message.body)
      } catch (error) {
        if (controller.signal.aborted) return
        setMessageStatus(
          error instanceof Error ? error.message : t('vetra.outreachView.messageFailed'),
        )
      } finally {
        if (!controller.signal.aborted) {
          setGeneratingMessage(false)
        }
      }
    })()
  }

  return (
    <div className="vetra-outreach-view">
      <VetraOutreachNavbar
        companies={companies}
        fromCompanyId={fromCompanyId}
        toCompanyId={toCompanyId}
        onFromCompanyChange={setFromCompanyId}
        onToCompanyChange={setToCompanyId}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={setSelectedTemplateId}
        outreachLanguage={outreachLanguage}
        onOutreachLanguageChange={setOutreachLanguage}
      />

      <section className="vetra-outreach-body" aria-label={t('vetra.workspace.outreachAria')}>
        <VetraOutreachCollaborationPanel
          fromCompanyName={fromCompany?.name ?? ''}
          toCompanyName={toCompany?.name ?? ''}
          analysis={collaboration}
          selectedIndices={selectedOpportunityIndices}
          onToggleOpportunity={toggleOpportunity}
          onGenerate={handleGenerate}
          canGenerate={isReady}
          generating={generating}
          statusMessage={statusMessage}
          loading={generating}
          error={collabError}
        />

        <div className="vetra-outreach-body__panel">
          <GlowPanel
            title={t('vetra.outreach.message')}
            className="vetra-outreach-editor__panel"
            bodyClassName="panel-body--input"
          >
            <div className="vetra-outreach-editor">
              <label className="vetra-outreach-editor__subject-field" htmlFor="vetra-outreach-subject">
                <span className="vetra-outreach-editor__field-label">{t('vetra.outreachView.subject')}</span>
                <input
                  id="vetra-outreach-subject"
                  type="text"
                  className="vetra-outreach-editor__subject"
                  value={draftSubject}
                  placeholder={t('vetra.outreachView.subjectPh')}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraftSubject(event.target.value)
                    setMessageStatus(null)
                  }}
                />
              </label>

              <label className="vetra-outreach-editor__body-field" htmlFor="vetra-outreach-body">
                <span className="vetra-outreach-editor__field-label">{t('vetra.outreachView.body')}</span>
                <textarea
                  id="vetra-outreach-body"
                  className="vetra-outreach-editor__textarea scarper-scrollbar"
                  value={draftBody}
                  placeholder={t('vetra.outreachView.bodyPh')}
                  spellCheck={false}
                  onChange={(event) => {
                    setDraftBody(event.target.value)
                    setMessageStatus(null)
                  }}
                />
              </label>
            </div>
          </GlowPanel>

          <footer className="vetra-outreach-editor__actions">
            {messageStatus ? (
              <span className="text-input-status vetra-outreach-editor__status">
                {messageStatus}
              </span>
            ) : null}
            <button
              type="button"
              className="text-input-save"
              disabled={!canGenerateMessage}
              onClick={handleGenerateMessage}
            >
              {generatingMessage ? t('vetra.outreachView.generating') : t('vetra.outreachView.generate')}
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}
