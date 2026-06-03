import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { streamChatCompletion } from '../../services/deepseekClient'
import type { ChatRole } from '../../types/deepseek'
import {
  augmentUserMessageForEdit,
  buildEditorSystemPrompt,
  extractEditProposal,
  stripEditBlockForChat,
  userWantsEditorChange,
} from '../../utils/dashboardEditProposal'
import type { DashboardRagCorpus } from '../../utils/dashboardRag'
import {
  augmentUserMessageForQa,
  buildDashboardSystemPrompt,
  userWantsDocumentQa,
} from '../../utils/dashboardRag'
import '../../styles/panel.css'
import '../../styles/scrollbar.css'
import './DashboardChatDrawer.css'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  editPending?: boolean
}

export interface DashboardChatDrawerProps {
  editorContext?: string
  contextHint?: string
  ragCorpus?: DashboardRagCorpus | null
  ragLoading?: boolean
  /** 用户划选的正文片段 */
  selectionContext?: string
  /** dashboard：改稿+问答；rag：仅问答 */
  variant?: 'dashboard' | 'rag'
  onProposeEdit?: (proposal: {
    revision: string
    note: string
    originalText: string
  }) => void
}

function nextId(): string {
  return crypto.randomUUID()
}

export function DashboardChatDrawer({
  editorContext = '',
  contextHint = '',
  ragCorpus = null,
  ragLoading = false,
  selectionContext = '',
  variant = 'dashboard',
  onProposeEdit,
}: DashboardChatDrawerProps) {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const panelId = useId()

  const editorContextRef = useRef(editorContext)
  const messagesRef = useRef(messages)
  const ragCorpusRef = useRef(ragCorpus)
  const editSessionRef = useRef(false)
  const selectionRef = useRef(selectionContext)
  const isRagOnly = variant === 'rag'

  const ui = isRagOnly
    ? {
        drawerLabel: 'RAG chat assistant',
        tabExpand: 'Expand RAG chat',
        tabCollapse: 'Collapse RAG chat',
        title: 'RAG Chat',
        hintSelection: ' · selection active',
        hintLoading: ' · loading corpus…',
        hintBase: 'Answers grounded in Task database',
        empty: (
          <>
            Highlight text on the left, then ask — AI prioritizes the selection; otherwise uses the full Task corpus.
            <br />
            e.g. &quot;What revenue does this mention?&quot; · &quot;Summarize the selected paragraph&quot;
          </>
        ),
        thinking: 'Thinking…',
        placeholder: 'Ask about the document/data (optionally with a left-side selection)…',
        clear: 'Clear',
        stop: 'Stop',
        send: 'Send',
        chatFailed: 'Chat request failed',
      }
    : {
        drawerLabel: 'AI 对话助手',
        tabExpand: '展开 AI 助手',
        tabCollapse: '收起 AI 助手',
        title: 'AI 助手',
        hintSelection: ' · 已选中文本',
        hintLoading: ' · 加载库…',
        hintBase: '改稿标黄采纳 · 问答仅依据数据库',
        empty: (
          <>
            改稿：「把第二段改得更正式」「再详细一点」→ 标黄预览后采纳。
            <br />
            问答：「这家公司有哪些项目？」→ 仅根据当前 Task 数据库回答；未涉及则明确说明。
          </>
        ),
        thinking: '思考中…',
        placeholder: '改稿或提问文档/数据（问答严格依据数据库）…',
        clear: '清空',
        stop: '停止',
        send: '发送',
        chatFailed: '对话请求失败',
      }

  useEffect(() => {
    editorContextRef.current = editorContext
  }, [editorContext])

  useEffect(() => {
    selectionRef.current = selectionContext
  }, [selectionContext])

  useEffect(() => {
    ragCorpusRef.current = ragCorpus
  }, [ragCorpus])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streaming, scrollToBottom])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const finalizeAssistantMessage = useCallback(
    (assistantId: string, rawContent: string) => {
      const proposal = extractEditProposal(rawContent)
      if (proposal && onProposeEdit) {
        editSessionRef.current = true
        onProposeEdit({
          revision: proposal.revision,
          note: proposal.note ?? '已根据你的要求生成修改预览',
          originalText: editorContextRef.current,
        })
        const chatText =
          stripEditBlockForChat(rawContent) ||
          proposal.note ||
          '已在左侧编辑器标黄显示修改，请确认后点击「采纳」。'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: chatText,
                  editPending: true,
                }
              : m,
          ),
        )
        return
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: rawContent } : m,
        ),
      )
    },
    [onProposeEdit],
  )

  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || streaming) return

    const wantsEdit =
      !isRagOnly &&
      Boolean(onProposeEdit) &&
      (userWantsEditorChange(text) || editSessionRef.current)
    const qaMode = isRagOnly
      ? true
      : !wantsEdit && userWantsDocumentQa(text)
    if (wantsEdit) editSessionRef.current = true

    let userContent = text
    if (wantsEdit) {
      userContent = augmentUserMessageForEdit(text, {
        continuing: editSessionRef.current && !userWantsEditorChange(text),
      })
    } else if (qaMode) {
      userContent = augmentUserMessageForQa(text)
    }

    const userMsg: UiMessage = { id: nextId(), role: 'user', content: text }
    const assistantId = nextId()

    const editorPrompt = buildEditorSystemPrompt(
      editorContextRef.current,
      contextHint,
      { editSession: editSessionRef.current },
    )
    const systemContent = buildDashboardSystemPrompt(editorPrompt, {
      editorContext: editorContextRef.current,
      contextHint,
      editSession: editSessionRef.current,
      ragCorpus: ragCorpusRef.current,
      userQuery: text,
      qaMode,
      selectionContext: selectionRef.current,
    })

    const history = messagesRef.current.filter((m) => !m.error)
    const apiMessages: Array<{ role: ChatRole; content: string }> = [
      {
        role: 'system',
        content: systemContent,
      },
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ]

    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setStreaming(true)
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ])

    const controller = new AbortController()
    abortRef.current = controller

    let accumulated = ''

    try {
      await streamChatCompletion(
        { messages: apiMessages, temperature: qaMode ? 0.15 : 0.35 },
        (chunk) => {
          accumulated += chunk
          const display = stripEditBlockForChat(accumulated)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content:
                      display ||
                      (accumulated.includes('scarper-edit')
                        ? '正在生成修改预览…'
                        : accumulated),
                  }
                : m,
            ),
          )
        },
        controller.signal,
      )
      finalizeAssistantMessage(assistantId, accumulated)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      const msg = e instanceof Error ? e.message : ui.chatFailed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: msg,
                error: true,
              }
            : m,
        ),
      )
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setStreaming(false)
    }
  }, [streaming, contextHint, finalizeAssistantMessage, draft, isRagOnly, ui.chatFailed])

  const handleClear = useCallback(() => {
    handleStop()
    setMessages([])
    setDraft('')
    editSessionRef.current = false
  }, [handleStop])

  const onComposeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <aside className="dashboard-chat-drawer" aria-label={ui.drawerLabel}>
      <button
        type="button"
        className={`dashboard-chat-tab${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        title={open ? ui.tabCollapse : ui.tabExpand}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="dashboard-chat-tab__icon"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="M14 8l-4 4 4 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="dashboard-chat-tab__label">AI</span>
      </button>

      <div
        id={panelId}
        className={`dashboard-chat-panel${open ? ' is-open' : ''}`}
        hidden={!open}
      >
        <div className="panel-shell dashboard-chat-panel__shell">
          <div className="panel-inner dashboard-chat-panel__inner">
            <header className="dashboard-chat-head">
              <h3>{ui.title}</h3>
              <span className="dashboard-chat-head__hint">
                {isRagOnly
                  ? `${ui.hintBase}${selectionContext.trim() ? ui.hintSelection : ''}${ragLoading ? ui.hintLoading : ''}`
                  : `${ui.hintBase}${ragLoading ? ui.hintLoading : ''}`}
              </span>
            </header>

            <div
              ref={listRef}
              className="dashboard-chat-messages scarper-scrollbar"
              role="log"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <p className="dashboard-chat-empty">{ui.empty}</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`dashboard-chat-bubble dashboard-chat-bubble--${m.error ? 'error' : m.role}${
                      streaming &&
                      m.role === 'assistant' &&
                      !m.content &&
                      !m.error
                        ? ' dashboard-chat-bubble--typing'
                        : ''
                    }${m.editPending ? ' dashboard-chat-bubble--edit' : ''}`}
                  >
                    {m.content ||
                      (m.role === 'assistant' && streaming
                        ? ui.thinking
                        : '')}
                  </div>
                ))
              )}
            </div>

            <footer className="dashboard-chat-compose">
              <textarea
                className="dashboard-chat-input"
                value={draft}
                placeholder={ui.placeholder}
                disabled={streaming}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposeKeyDown}
              />
              <div className="dashboard-chat-compose__actions">
                <button
                  type="button"
                  className="project-btn project-btn--ghost"
                  disabled={messages.length === 0 && !streaming}
                  onClick={handleClear}
                >
                  {ui.clear}
                </button>
                {streaming ? (
                  <button
                    type="button"
                    className="project-btn project-btn--ghost"
                    onClick={handleStop}
                  >
                    {ui.stop}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-input-save"
                  disabled={!draft.trim() || streaming}
                  onClick={() => void handleSend()}
                >
                  {ui.send}
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </aside>
  )
}
