import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '../../contexts/I18nContext'
import { analyzeTemplateStructure } from '../../services/findocTemplateAnalysis'

import {

  clearTemplateDraft,

  deleteCustomTemplate,

  duplicateBuiltinAsCustom,

  isBuiltinTemplate,

  listFindocTemplates,

  peekTemplateDraft,

  saveCustomTemplate,

} from '../../services/findocTemplateService'

import type { FindocTemplate } from '../../types/findocTemplate'

import '../Layout/OutputLanguageSelect.css'

import '../Layout/TextInputSection.css'

import '../projects/ProjectPage.css'

import '../../styles/scrollbar.css'

import './FinDocTemplateSetupPage.css'



export function FinDocTemplateSetupPage() {
  const { t } = useI18n()

  const [templates, setTemplates] = useState<FindocTemplate[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [name, setName] = useState('')

  const [content, setContent] = useState('')

  const [saving, setSaving] = useState(false)

  const [analyzing, setAnalyzing] = useState(false)

  const [contentBeforeAnalysis, setContentBeforeAnalysis] = useState<string | null>(

    null,

  )

  const [status, setStatus] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const analysisAbortRef = useRef<AbortController | null>(null)



  const clearAnalysisSnapshot = () => setContentBeforeAnalysis(null)



  const editingBuiltin = selectedId ? isBuiltinTemplate(selectedId) : false

  const isNew = selectedId === null



  const refreshTemplates = useCallback(async () => {

    const list = await listFindocTemplates()

    setTemplates(list)

  }, [])



  useEffect(() => {

    void refreshTemplates()

    const onChanged = () => void refreshTemplates()

    window.addEventListener('scarper:findoc-templates-changed', onChanged)

    return () =>

      window.removeEventListener('scarper:findoc-templates-changed', onChanged)

  }, [refreshTemplates])



  useEffect(() => {

    const draft = peekTemplateDraft()

    if (draft.trim()) {

      setSelectedId(null)

      setName('')

      setContent(draft)

      setStatus(t('findocTemplates.loadedDraft'))

    }

  }, [t])



  useEffect(() => {

    return () => {

      analysisAbortRef.current?.abort()

    }

  }, [])



  const loadTemplate = (template: FindocTemplate) => {

    setSelectedId(template.id)

    setName(template.name)

    setContent(template.content)

    clearAnalysisSnapshot()

    setStatus(null)

  }



  const handleNew = () => {

    setSelectedId(null)

    setName('')

    setContent('')

    clearAnalysisSnapshot()

    setStatus(null)

  }



  const handleSave = async () => {

    const trimmedName = name.trim()

    if (!trimmedName) {

      setStatus(t('findocTemplates.enterName'))

      return

    }

    if (editingBuiltin) {

      setStatus(t('findocTemplates.readOnlyBuiltin'))

      return

    }



    setSaving(true)

    setStatus(null)

    try {

      const saved = await saveCustomTemplate({

        id: isNew ? undefined : selectedId ?? undefined,

        name: trimmedName,

        content,

      })

      setSelectedId(saved.id)

      clearTemplateDraft()

      clearAnalysisSnapshot()

      void refreshTemplates()

      setStatus(t('findocTemplates.saved'))

    } catch (err) {

      setStatus(err instanceof Error ? err.message : t('findocTemplates.saveFailed'))

    } finally {

      setSaving(false)

    }

  }



  const handleDuplicate = async () => {

    if (!selectedId || !editingBuiltin) return

    setSaving(true)

    setStatus(null)

    try {

      const copyName = name.trim()
        ? `${name.trim()}${t('findocTemplates.copySuffix')}`
        : undefined

      const saved = await duplicateBuiltinAsCustom(selectedId, copyName)

      loadTemplate(saved)

      void refreshTemplates()

      setStatus(t('findocTemplates.savedCopy'))

    } catch (err) {

      setStatus(err instanceof Error ? err.message : t('findocTemplates.saveCopyFailed'))

    } finally {

      setSaving(false)

    }

  }



  const handleAiAnalysis = async () => {

    const trimmed = content.trim()

    if (!trimmed) {

      setStatus(t('findocTemplates.pasteFirst'))

      return

    }

    if (editingBuiltin) return



    analysisAbortRef.current?.abort()

    const controller = new AbortController()

    analysisAbortRef.current = controller



    setAnalyzing(true)

    setStatus(t('findocTemplates.aiAnalyzing'))



    const snapshot = content



    try {

      const result = await analyzeTemplateStructure(trimmed, controller.signal)

      setContentBeforeAnalysis(snapshot)

      setContent(result)

      setStatus(t('findocTemplates.analysisComplete'))

    } catch (err) {

      if (err instanceof Error && err.name === 'AbortError') return

      setStatus(err instanceof Error ? err.message : t('findocTemplates.analysisFailed'))

    } finally {

      setAnalyzing(false)

      if (analysisAbortRef.current === controller) {

        analysisAbortRef.current = null

      }

    }

  }



  const handleCancelAnalysis = () => {

    if (contentBeforeAnalysis === null) return

    setContent(contentBeforeAnalysis)

    clearAnalysisSnapshot()

    setStatus(t('findocTemplates.restored'))

  }



  const handleDelete = async (templateId?: string, templateName?: string) => {

    const id = templateId ?? selectedId

    const label = templateName ?? name

    if (!id || isBuiltinTemplate(id) || (templateId == null && isNew)) return

    if (!window.confirm(t('findocTemplates.deleteConfirm', { name: label }))) return



    setDeletingId(id)

    setStatus(null)

    try {

      await deleteCustomTemplate(id)

      if (selectedId === id) {

        handleNew()

      }

      void refreshTemplates()

      setStatus(t('findocTemplates.deleted'))

    } catch (err) {

      setStatus(err instanceof Error ? err.message : t('findocTemplates.deleteFailed'))

    } finally {

      setDeletingId(null)

    }

  }



  return (

    <main className="app-main findoc-template-setup-page">

      <div className="findoc-template-setup-shell">
        <section className="findoc-template-setup-workspace" aria-label={t('findocTemplates.managementAria')}>

          <aside

            className="findoc-template-setup-list-pane"

            aria-label={t('findocTemplates.listAria')}

          >

            <div className="findoc-template-setup-list__head">

              <span className="findoc-template-setup-list__title">{t('findocTemplates.title')}</span>

              <button

                type="button"

                className="findoc-template-setup-new-btn project-btn project-btn--primary"

                onClick={handleNew}

              >

                {t('findocTemplates.new')}

              </button>

            </div>

            <ul className="findoc-template-setup-list scarper-scrollbar">

              {templates.map((template) => {

                const active = template.id === selectedId

                const builtin = template.source === 'builtin'

                const deleting = deletingId === template.id

                return (

                  <li key={template.id}>

                    <div
                      className={`findoc-template-setup-list__row${active ? ' is-active' : ''}${deleting ? ' is-disabled' : ''}`}
                      role="button"
                      tabIndex={deleting ? -1 : 0}
                      onClick={() => {
                        if (!deleting) loadTemplate(template)
                      }}
                      onKeyDown={(event) => {
                        if (deleting) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          loadTemplate(template)
                        }
                      }}
                    >

                      <div className="findoc-template-setup-list__item">

                        <span className="findoc-template-setup-list__name">

                          {template.name}

                        </span>

                        <span className="findoc-template-setup-list__meta">

                          {builtin ? t('findocTemplates.builtIn') : t('findocTemplates.custom')}

                        </span>

                      </div>

                      {!builtin ? (

                        <button

                          type="button"

                          className="findoc-template-setup-list__delete"

                          aria-label={t('findocTemplates.deleteAria', { name: template.name })}

                          disabled={deleting || saving || analyzing}

                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDelete(template.id, template.name)
                          }}

                        >

                          ×

                        </button>

                      ) : null}

                    </div>

                  </li>

                )

              })}

            </ul>

          </aside>



          <div className="findoc-template-setup-editor-pane" aria-label={t('findocTemplates.editorAria')}>

            <section className="findoc-template-setup-toolbar">

              <label className="findoc-template-setup-field">

                <span className="findoc-template-setup-field__label">{t('findocTemplates.nameLabel')}</span>

                <input

                  type="text"

                  className="findoc-template-setup-input"

                  value={name}

                  placeholder={t('findocTemplates.namePlaceholder')}

                  maxLength={80}

                  readOnly={editingBuiltin}

                  onChange={(e) => {

                    setName(e.target.value)

                    setStatus(null)

                  }}

                />

              </label>

              {editingBuiltin ? (

                <span className="findoc-template-setup-hint">{t('findocTemplates.builtInReadOnly')}</span>

              ) : isNew ? (

                <span className="findoc-template-setup-hint">{t('findocTemplates.newTemplate')}</span>

              ) : (

                <span className="findoc-template-setup-hint">{t('findocTemplates.editingCustom')}</span>

              )}

            </section>



            <section className="findoc-template-setup-editor" aria-label={t('findocTemplates.contentAria')}>

              <textarea

                className="findoc-template-setup-textarea scarper-scrollbar scarper-scrollbar--editor"

                value={content}

                readOnly={editingBuiltin}

                placeholder={t('findocTemplates.contentPlaceholderLong')}

                onChange={(e) => {

                  setContent(e.target.value)

                  setStatus(null)

                }}

              />

            </section>



            <footer className="findoc-pane-footer findoc-template-setup-footer">

              {status ? (

                <span className="findoc-pane-footer__status" role="status">

                  {status}

                </span>

              ) : null}

              <div className="findoc-pane-footer__actions">

                {editingBuiltin ? (

                  <button

                    type="button"

                    className="text-input-save"

                    disabled={saving}

                    onClick={handleDuplicate}

                  >

                    {t('findocTemplates.saveAsCopy')}

                  </button>

                ) : (

                  <>

                    {!isNew && (

                      <button

                        type="button"

                        className="project-btn project-btn--ghost"

                        disabled={saving || analyzing || deletingId !== null}

                        onClick={() => void handleDelete()}

                      >

                        {t('findocTemplates.delete')}

                      </button>

                    )}

                    <button

                      type="button"

                      className="project-btn project-btn--ghost findoc-template-setup-ai-btn"

                      disabled={

                        saving || analyzing || !content.trim() || contentBeforeAnalysis !== null

                      }

                      onClick={() => void handleAiAnalysis()}

                    >

                      {analyzing ? t('findocTemplates.analyzing') : t('findocTemplates.aiAnalysis')}

                    </button>

                    {contentBeforeAnalysis !== null ? (

                      <button

                        type="button"

                        className="project-btn project-btn--ghost"

                        disabled={saving || analyzing}

                        onClick={handleCancelAnalysis}

                      >

                        {t('common.cancel')}

                      </button>

                    ) : null}

                    <button

                      type="button"

                      className="text-input-save"

                      disabled={saving || analyzing}

                      onClick={handleSave}

                    >

                      {saving ? t('findocTemplates.saving') : t('findocTemplates.save')}

                    </button>

                  </>

                )}

              </div>

            </footer>

          </div>

        </section>

      </div>

    </main>

  )

}


