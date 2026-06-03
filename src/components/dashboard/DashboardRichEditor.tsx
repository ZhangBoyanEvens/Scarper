import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  forwardRef,
} from 'react'
import {
  parseDashboardDocument,
  serializeDashboardDocument,
  type DashboardArticle,
} from '../../utils/dashboardDocument'
import { scrollTextareaToIndex } from '../../utils/documentFind'
import '../Results/ResultCard.css'
import './DashboardRichEditor.css'

export interface DashboardEditorHandle {
  focusMatch: (start: number, length: number) => void
}

interface DashboardRichEditorProps {
  text: string
  disabled?: boolean
  placeholder?: string
  onTextChange: (value: string) => void
}

function patchArticle(
  articles: DashboardArticle[],
  id: string,
  patch: Partial<DashboardArticle>,
): DashboardArticle[] {
  return articles.map((a) => (a.id === id ? { ...a, ...patch } : a))
}

function ArticleBlock({
  article,
  index,
  disabled,
  onPatch,
  fieldRefs,
}: {
  article: DashboardArticle
  index: number
  disabled: boolean
  onPatch: (id: string, patch: Partial<DashboardArticle>) => void
  fieldRefs: React.MutableRefObject<Map<string, HTMLTextAreaElement | null>>
}) {
  const reg = (field: string) => (el: HTMLTextAreaElement | null) => {
    fieldRefs.current.set(`${article.id}:${field}`, el)
  }

  const pointsText = article.keyPoints.join('\n')

  return (
    <article className="result-card dashboard-doc-article">
      {article.url ? (
        <>
          <span className="result-card-badge">来源 {index + 1}</span>
          <section className="dashboard-doc-field dashboard-doc-field--title-block">
            <textarea
              ref={reg('title')}
              className="dashboard-doc-input dashboard-doc-input--title"
              value={article.title}
              placeholder="标题"
              disabled={disabled}
              rows={1}
              onChange={(e) => onPatch(article.id, { title: e.target.value })}
            />
          </section>
          <p className="results-meta">
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.url}
            </a>
          </p>
        </>
      ) : (
        <textarea
          ref={reg('title')}
          className="dashboard-doc-input dashboard-doc-input--title dashboard-doc-input--solo-title"
          value={article.title}
          placeholder="文档标题（可选）"
          disabled={disabled}
          rows={1}
          onChange={(e) => onPatch(article.id, { title: e.target.value })}
        />
      )}

      {(article.url || article.summary) && (
        <section className="dashboard-doc-field">
          <h4>摘要</h4>
          <textarea
            ref={reg('summary')}
            className="dashboard-doc-input dashboard-doc-input--summary"
            value={article.summary}
            placeholder="摘要"
            disabled={disabled}
            rows={2}
            onChange={(e) => onPatch(article.id, { summary: e.target.value })}
          />
        </section>
      )}

      {(article.url || article.keyPoints.length > 0) && (
        <section className="dashboard-doc-field">
          <h4>要点</h4>
          <textarea
            ref={reg('points')}
            className="dashboard-doc-input dashboard-doc-input--points"
            value={pointsText}
            placeholder="每行一条要点"
            disabled={disabled}
            rows={Math.max(2, article.keyPoints.length)}
            onChange={(e) => {
              const keyPoints = e.target.value
                .split('\n')
                .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
                .filter(Boolean)
              onPatch(article.id, { keyPoints })
            }}
          />
        </section>
      )}

      <section className="dashboard-doc-field">
        {article.url ? <h4>正文</h4> : null}
        <textarea
          ref={reg('body')}
          className="dashboard-doc-input dashboard-doc-input--body"
          value={article.body}
          placeholder={article.url ? '正文内容' : placeholderFallback}
          disabled={disabled}
          rows={Math.max(8, article.body.split('\n').length + 1)}
          onChange={(e) => onPatch(article.id, { body: e.target.value })}
        />
      </section>
    </article>
  )
}

const placeholderFallback = '在此编辑文档内容…'

export const DashboardRichEditor = forwardRef<
  DashboardEditorHandle,
  DashboardRichEditorProps
>(function DashboardRichEditor(
  { text, disabled = false, placeholder, onTextChange },
  ref,
) {
  const articles = useMemo(() => parseDashboardDocument(text), [text])
  const fieldRefs = useRef<Map<string, HTMLTextAreaElement | null>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)

  const emit = useCallback(
    (next: DashboardArticle[]) => {
      onTextChange(serializeDashboardDocument(next, { labeled: true }))
    },
    [onTextChange],
  )

  const handlePatch = useCallback(
    (id: string, patch: Partial<DashboardArticle>) => {
      emit(patchArticle(articles, id, patch))
    },
    [articles, emit],
  )

  useImperativeHandle(
    ref,
    () => ({
      focusMatch(start: number, length: number) {
        const serialized = serializeDashboardDocument(articles, {
          labeled: true,
        })
        if (start < 0 || start >= serialized.length) return

        const fields: Array<{
          key: string
          slice: string
        }> = []

        for (const a of articles) {
          if (a.title) fields.push({ key: `${a.id}:title`, slice: a.title })
          if (a.summary)
            fields.push({ key: `${a.id}:summary`, slice: a.summary })
          if (a.keyPoints.length) {
            fields.push({
              key: `${a.id}:points`,
              slice: a.keyPoints.map((p) => `• ${p}`).join('\n'),
            })
          }
          if (a.body) fields.push({ key: `${a.id}:body`, slice: a.body })
        }

        for (const { key, slice } of fields) {
          if (!slice) continue
          let from = 0
          while (from < serialized.length) {
            const idx = serialized.indexOf(slice, from)
            if (idx === -1) break
            const end = idx + slice.length
            if (start >= idx && start < end) {
              const el = fieldRefs.current.get(key)
              if (el) {
                scrollTextareaToIndex(el, start - idx, length)
                el.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }
              return
            }
            from = idx + 1
          }
        }

        const bodyEl = fieldRefs.current.get(`${articles[0]?.id}:body`)
        if (bodyEl) {
          const local = Math.min(start, bodyEl.value.length)
          scrollTextareaToIndex(bodyEl, local, length)
        }
      },
    }),
    [articles],
  )

  useEffect(() => {
    fieldRefs.current.clear()
  }, [text])

  const empty = !text.trim()

  return (
    <div
      ref={scrollRef}
      className="dashboard-doc-editor scarper-scrollbar scarper-scrollbar--editor"
    >
      {empty && !disabled ? (
        <p className="dashboard-doc-empty">{placeholder ?? placeholderFallback}</p>
      ) : null}
      {articles.map((article, i) => (
        <ArticleBlock
          key={article.id}
          article={article}
          index={i}
          disabled={disabled}
          fieldRefs={fieldRefs}
          onPatch={handlePatch}
        />
      ))}
    </div>
  )
})
