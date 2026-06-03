import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ResultsState } from '../components/Results/ResultsPanel'
import { EXTRACTION_DONE_LABEL, EXTRACTION_STEPS } from '../constants/extractionSteps'
import {
  DEFAULT_TASK_TIMEOUT_SEC,
  taskTimeoutMs,
} from '../config/timeouts'
import { extractUrlWithProgress } from '../services/extractWithProgress'
import {
  combineTokenUsage,
  mergeIntegrateSources,
} from '../services/mergeIntegrateApi'
import { getSavedPrompt } from '../storage/promptStorage'
import type { ExtractResponse } from '../types/extraction'
import { isExtractSuccess } from '../types/extraction'
import { useAppSettings } from './AppSettingsContext'
import { useUserProfileOptional } from './UserProfileContext'

interface ScrapeSessionContextValue {
  resultsState: ResultsState
  isRunning: boolean
  taskTimeoutSec: number
  handleSearch: (
    urls: string[],
    options?: { aiIntegrate?: boolean },
  ) => void
  handleResultChange: (index: number, item: ExtractResponse) => void
  cancelRun: () => void
}

const ScrapeSessionContext = createContext<ScrapeSessionContextValue | null>(
  null,
)

export function ScrapeSessionProvider({ children }: { children: ReactNode }) {
  const userProfile = useUserProfileOptional()
  const {
    settings: { outputLanguage, outputDetail, ui, scrape },
  } = useAppSettings()
  const [resultsState, setResultsState] = useState<ResultsState>({
    kind: 'idle',
  })
  const abortRef = useRef<AbortController | null>(null)

  const timeoutMs = taskTimeoutMs(scrape.taskTimeoutSec)

  const isRunning = resultsState.kind === 'loading'

  const cancelRun = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const handleSearch = useCallback(
    async (urls: string[], searchOptions?: { aiIntegrate?: boolean }) => {
      const aiIntegrate = Boolean(
        searchOptions?.aiIntegrate && urls.length > 1,
      )
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      let didTimeout = false
      let taskTimeoutId: number | null = null

      const clearTaskTimeout = () => {
        if (taskTimeoutId !== null) {
          window.clearTimeout(taskTimeoutId)
          taskTimeoutId = null
        }
      }

      const scheduleTaskTimeout = () => {
        clearTaskTimeout()
        taskTimeoutId = window.setTimeout(() => {
          didTimeout = true
          controller.abort()
        }, timeoutMs)
      }

      const processingPrompt = getSavedPrompt()
      const usingPrompt = Boolean(processingPrompt?.trim())
      const total = urls.length
      const timeoutSec = Math.round(timeoutMs / 1000)

      const initialStep = EXTRACTION_STEPS[0]
      setResultsState({
        kind: 'loading',
        urls,
        completed: 0,
        total,
        usingPrompt,
        currentUrl: urls[0] ?? '',
        stepLabel: initialStep.label,
        stepHint: initialStep.hint,
        progress: 0,
      })

      const results: ExtractResponse[] = []

      const overallProgress = (completed: number, urlProgress: number) =>
        Math.round(((completed + urlProgress / 100) / total) * 100)

      const taskStepLabel = (index: number, innerLabel: string) => {
        if (total <= 1) return innerLabel
        const prefix = `Task ${index + 1}/${total}`
        if (innerLabel === EXTRACTION_DONE_LABEL) {
          return index + 1 < total
            ? `${prefix}: this item done`
            : `${prefix}: all done`
        }
        return `${prefix} · ${innerLabel}`
      }

      try {
        for (let i = 0; i < urls.length; i++) {
          if (controller.signal.aborted) break

          const currentUrl = urls[i]
          scheduleTaskTimeout()

          setResultsState({
            kind: 'loading',
            urls,
            completed: i,
            total,
            usingPrompt,
            currentUrl,
            stepLabel:
              total > 1
                ? `Processing task ${i + 1}/${total}…`
                : initialStep.label,
            stepHint: initialStep.hint,
            progress: overallProgress(i, 0),
          })

          const data = await extractUrlWithProgress(currentUrl, {
            processingPrompt,
            outputLanguage,
            outputDetail,
            signal: controller.signal,
            onProgress: (stepLabel, urlProgress, stepHint) => {
              setResultsState({
                kind: 'loading',
                urls,
                completed: i,
                total,
                usingPrompt,
                currentUrl,
                stepLabel: taskStepLabel(i, stepLabel),
                stepHint: ui.showProgressHints ? stepHint : undefined,
                progress: overallProgress(i, urlProgress),
              })
            },
          })
          results.push(data)
          clearTaskTimeout()

          const hasMore = i + 1 < urls.length
          setResultsState({
            kind: 'loading',
            urls,
            completed: i + 1,
            total,
            usingPrompt,
            currentUrl: hasMore ? urls[i + 1] : currentUrl,
            stepLabel: hasMore
              ? `Task ${i + 1}/${total} done — starting next…`
              : 'All tasks complete',
            stepHint: undefined,
            progress: overallProgress(i + 1, 0),
          })
        }

        clearTaskTimeout()

        if (controller.signal.aborted) {
          if (results.length > 0) {
            setResultsState({ kind: 'done', results })
            void userProfile?.refreshProfile()
            return
          }
          if (didTimeout) {
            setResultsState({
              kind: 'error',
              message: `Task timed out (${timeoutSec}s). Adjust the limit in Settings or use fewer links`,
            })
          }
          return
        }

        let finalResults = results

        if (aiIntegrate) {
          const successes = results.filter(isExtractSuccess)
          const failures = results.filter((r) => !isExtractSuccess(r))
          if (failures.length > 0) {
            finalResults = results
          } else if (successes.length >= 2) {
            setResultsState({
              kind: 'loading',
              urls,
              completed: total,
              total,
              usingPrompt,
              currentUrl: urls[urls.length - 1] ?? '',
              stepLabel: 'AI merging…',
              stepHint: `Merging ${successes.length} pages into one result`,
              progress: 95,
            })
            scheduleTaskTimeout()
            try {
              const merged = await mergeIntegrateSources({
                sources: successes.map((s) => ({
                  url: s.url,
                  title: s.title,
                  summary: s.summary,
                  key_points: s.key_points,
                  content: s.content,
                  detected_language: s.detected_language,
                })),
                processingPrompt,
                outputLanguage,
                outputDetail,
                signal: controller.signal,
              })
              clearTaskTimeout()
              const perTaskUsage = successes
                .map((s) => s.token_usage)
                .filter(Boolean) as NonNullable<
                (typeof successes)[0]['token_usage']
              >[]
              const combined = combineTokenUsage(
                perTaskUsage,
                merged.token_usage ?? null,
              )
              finalResults = [
                { ...merged, token_usage: combined },
                ...failures,
              ]
            } catch (mergeErr) {
              clearTaskTimeout()
              if ((mergeErr as Error).name === 'AbortError') {
                if (results.length > 0) {
                  setResultsState({ kind: 'done', results })
                  void userProfile?.refreshProfile()
                }
                return
              }
              setResultsState({
                kind: 'error',
                message:
                  mergeErr instanceof Error
                    ? mergeErr.message
                    : 'AI merge failed',
              })
              return
            }
          }
        }

        setResultsState({ kind: 'done', results: finalResults })
        void userProfile?.refreshProfile()
      } catch (err) {
        clearTaskTimeout()
        if ((err as Error).name === 'AbortError') {
          if (results.length > 0) {
            setResultsState({ kind: 'done', results })
            void userProfile?.refreshProfile()
            return
          }
          if (didTimeout) {
            setResultsState({
              kind: 'error',
              message: `Task timed out (${timeoutSec}s). Adjust the limit in Settings or use fewer links`,
            })
          }
          return
        }
        if (results.length > 0) {
          setResultsState({ kind: 'done', results })
          void userProfile?.refreshProfile()
          return
        }
        setResultsState({
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Cannot reach scrape service — confirm the backend is running',
        })
      } finally {
        clearTaskTimeout()
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    [
      outputLanguage,
      outputDetail,
      ui.showProgressHints,
      userProfile,
      timeoutMs,
    ],
  )

  const handleResultChange = useCallback(
    (index: number, item: ExtractResponse) => {
      setResultsState((prev) => {
        if (prev.kind !== 'done') return prev
        const next = [...prev.results]
        next[index] = item
        return { kind: 'done', results: next }
      })
    },
    [],
  )

  const value = useMemo(
    () => ({
      resultsState,
      isRunning,
      taskTimeoutSec: scrape.taskTimeoutSec,
      handleSearch: (urls: string[], options?: { aiIntegrate?: boolean }) => {
        void handleSearch(urls, options)
      },
      handleResultChange,
      cancelRun,
    }),
    [
      resultsState,
      isRunning,
      scrape.taskTimeoutSec,
      handleSearch,
      handleResultChange,
      cancelRun,
    ],
  )

  return (
    <ScrapeSessionContext.Provider value={value}>
      {children}
    </ScrapeSessionContext.Provider>
  )
}

export function useScrapeSession() {
  const ctx = useContext(ScrapeSessionContext)
  if (!ctx) {
    throw new Error('useScrapeSession must be used within ScrapeSessionProvider')
  }
  return ctx
}

export function useScrapeSessionOptional() {
  return useContext(ScrapeSessionContext)
}

export { DEFAULT_TASK_TIMEOUT_SEC }
