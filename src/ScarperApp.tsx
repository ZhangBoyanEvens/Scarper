import { useCallback, useRef, useState } from 'react'
import { useUserProfileOptional } from './contexts/UserProfileContext'
import {
  DEFAULT_OUTPUT_DETAIL,
  DEFAULT_OUTPUT_LANGUAGE,
} from './components/Layout/OutputLanguageSelect'
import { ContentSections } from './components/Layout/ContentSections'
import { TopToolbar } from './components/Layout/TopToolbar'
import type { ResultsState } from './components/Results/ResultsPanel'
import { extractUrl } from './services/crawlerApi'
import { getSavedPrompt } from './storage/promptStorage'
import type { OutputDetail } from './types/outputDetail'
import type { OutputLanguage } from './types/outputLanguage'
import type { ExtractResponse } from './types/extraction'

export function ScarperApp() {
  const userProfile = useUserProfileOptional()
  const [resultsState, setResultsState] = useState<ResultsState>({
    kind: 'idle',
  })
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>(
    DEFAULT_OUTPUT_LANGUAGE,
  )
  const [outputDetail, setOutputDetail] = useState<OutputDetail>(
    DEFAULT_OUTPUT_DETAIL,
  )
  const abortRef = useRef<AbortController | null>(null)

  const handleSearch = useCallback(
    async (urls: string[]) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const processingPrompt = getSavedPrompt()
      const usingPrompt = Boolean(processingPrompt?.trim())
      const total = urls.length

      setResultsState({
        kind: 'loading',
        urls,
        completed: 0,
        total,
        usingPrompt,
      })

      const results: ExtractResponse[] = []

      try {
        for (let i = 0; i < urls.length; i++) {
          if (controller.signal.aborted) return

          const data = await extractUrl(urls[i], {
            processingPrompt,
            outputLanguage,
            outputDetail,
            signal: controller.signal,
          })
          results.push(data)

          setResultsState({
            kind: 'loading',
            urls,
            completed: i + 1,
            total,
            usingPrompt,
          })
        }

        if (controller.signal.aborted) return
        setResultsState({ kind: 'done', results })
        void userProfile?.refreshProfile()
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setResultsState({
          kind: 'error',
          message:
            err instanceof Error
              ? err.message
              : '无法连接抓取服务，请确认后端已启动',
        })
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
      }
    },
    [outputLanguage, outputDetail, userProfile],
  )

  return (
    <>
      <TopToolbar
        outputLanguage={outputLanguage}
        outputDetail={outputDetail}
        onOutputLanguageChange={setOutputLanguage}
        onOutputDetailChange={setOutputDetail}
        onSearch={(urls) => void handleSearch(urls)}
      />
      <main className="app-main">
        <ContentSections resultsState={resultsState} />
      </main>
    </>
  )
}
