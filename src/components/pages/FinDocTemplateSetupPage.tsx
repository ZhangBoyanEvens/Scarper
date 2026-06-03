import { useCallback, useEffect, useRef, useState } from 'react'

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



export interface FinDocTemplateSetupPageProps {

  onBack?: () => void

}



export function FinDocTemplateSetupPage({ onBack }: FinDocTemplateSetupPageProps) {

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

      setStatus('Loaded draft from FinDoc output')

    }

  }, [])



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

      setStatus('Enter a template name')

      return

    }

    if (editingBuiltin) {

      setStatus('Built-in templates are read-only — use Save as copy')

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

      setStatus('Template saved to library')

    } catch (err) {

      setStatus(err instanceof Error ? err.message : 'Save failed')

    } finally {

      setSaving(false)

    }

  }



  const handleDuplicate = async () => {

    if (!selectedId || !editingBuiltin) return

    setSaving(true)

    setStatus(null)

    try {

      const copyName = name.trim() ? `${name.trim()} copy` : undefined

      const saved = await duplicateBuiltinAsCustom(selectedId, copyName)

      loadTemplate(saved)

      void refreshTemplates()

      setStatus('Saved as custom template')

    } catch (err) {

      setStatus(err instanceof Error ? err.message : 'Save as copy failed')

    } finally {

      setSaving(false)

    }

  }



  const handleAiAnalysis = async () => {

    const trimmed = content.trim()

    if (!trimmed) {

      setStatus('Paste or enter an article first')

      return

    }

    if (editingBuiltin) return



    analysisAbortRef.current?.abort()

    const controller = new AbortController()

    analysisAbortRef.current = controller



    setAnalyzing(true)

    setStatus('AI analyzing structure…')



    const snapshot = content



    try {

      const result = await analyzeTemplateStructure(trimmed, controller.signal)

      setContentBeforeAnalysis(snapshot)

      setContent(result)

      setStatus('Analysis complete — click Save to keep, or Cancel to restore')

    } catch (err) {

      if (err instanceof Error && err.name === 'AbortError') return

      setStatus(err instanceof Error ? err.message : 'AI analysis failed')

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

    setStatus('Restored content from before analysis')

  }



  const handleDelete = async (templateId?: string, templateName?: string) => {

    const id = templateId ?? selectedId

    const label = templateName ?? name

    if (!id || isBuiltinTemplate(id) || (templateId == null && isNew)) return

    if (!window.confirm(`Delete template “${label}”?`)) return



    setDeletingId(id)

    setStatus(null)

    try {

      await deleteCustomTemplate(id)

      if (selectedId === id) {

        handleNew()

      }

      void refreshTemplates()

      setStatus('Template deleted')

    } catch (err) {

      setStatus(err instanceof Error ? err.message : 'Delete failed')

    } finally {

      setDeletingId(null)

    }

  }



  return (

    <main className="app-main findoc-template-setup-page">

      <div className="findoc-template-setup-shell">

        <header className="findoc-template-setup-head">

          <div className="findoc-template-setup-head__row">

            <h2 className="findoc-template-setup-head__title">Template Setup</h2>

            {onBack ? (

              <button

                type="button"

                className="findoc-template-setup-back"

                onClick={onBack}

              >

                ← FinDoc

              </button>

            ) : null}

          </div>

        </header>



        <section className="findoc-template-setup-workspace" aria-label="Template management">

          <aside

            className="findoc-template-setup-list-pane"

            aria-label="Template list"

          >

            <div className="findoc-template-setup-list__head">

              <span className="findoc-template-setup-list__title">Templates</span>

              <button

                type="button"

                className="findoc-template-setup-new-btn project-btn project-btn--primary"

                onClick={handleNew}

              >

                New

              </button>

            </div>

            <ul className="findoc-template-setup-list scarper-scrollbar">

              {templates.map((template) => {

                const active = template.id === selectedId

                const builtin = template.source === 'builtin'

                const deleting = deletingId === template.id

                return (

                  <li key={template.id}>

                    <div className="findoc-template-setup-list__row">

                      <button

                        type="button"

                        className={`findoc-template-setup-list__item${active ? ' is-active' : ''}`}

                        disabled={deleting}

                        onClick={() => loadTemplate(template)}

                      >

                        <span className="findoc-template-setup-list__name">

                          {template.name}

                        </span>

                        <span className="findoc-template-setup-list__meta">

                          {builtin ? 'Built-in' : 'Custom'}

                        </span>

                      </button>

                      {!builtin ? (

                        <button

                          type="button"

                          className="findoc-template-setup-list__delete"

                          aria-label={`Delete ${template.name}`}

                          disabled={deleting || saving || analyzing}

                          onClick={() => void handleDelete(template.id, template.name)}

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



          <div className="findoc-template-setup-editor-pane" aria-label="Template editor">

            <section className="findoc-template-setup-toolbar">

              <label className="findoc-template-setup-field">

                <span className="findoc-template-setup-field__label">Name</span>

                <input

                  type="text"

                  className="findoc-template-setup-input"

                  value={name}

                  placeholder="Template name"

                  maxLength={80}

                  readOnly={editingBuiltin}

                  onChange={(e) => {

                    setName(e.target.value)

                    setStatus(null)

                  }}

                />

              </label>

              {editingBuiltin ? (

                <span className="findoc-template-setup-hint">Built-in template (read-only)</span>

              ) : isNew ? (

                <span className="findoc-template-setup-hint">New template</span>

              ) : (

                <span className="findoc-template-setup-hint">Editing custom template</span>

              )}

            </section>



            <section className="findoc-template-setup-editor" aria-label="Template content">

              <textarea

                className="findoc-template-setup-textarea scarper-scrollbar scarper-scrollbar--editor"

                value={content}

                readOnly={editingBuiltin}

                placeholder="Paste a sample article and click AI Analysis to extract structure; or write ### Title / Summary / Key points / Body sections directly…"

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

                    Save as copy

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

                        Delete

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

                      {analyzing ? 'Analyzing…' : 'AI Analysis'}

                    </button>

                    {contentBeforeAnalysis !== null ? (

                      <button

                        type="button"

                        className="project-btn project-btn--ghost"

                        disabled={saving || analyzing}

                        onClick={handleCancelAnalysis}

                      >

                        Cancel

                      </button>

                    ) : null}

                    <button

                      type="button"

                      className="text-input-save"

                      disabled={saving || analyzing}

                      onClick={handleSave}

                    >

                      {saving ? 'Saving…' : 'Save'}

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


