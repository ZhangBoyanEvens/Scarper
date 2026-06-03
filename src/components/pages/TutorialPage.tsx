import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppView } from '../../types/appView'
import { GlowPanel } from '../Layout/GlowPanel'
import {
  TUTORIAL_PHASES,
  TUTORIAL_STEPS,
  type TutorialStep,
} from '../tutorial/tutorialSteps'
import './TutorialPage.css'

const STORAGE_KEY = 'scarper_tutorial_step_index'

export interface TutorialPageProps {
  onBackHome?: () => void
  onNavigate?: (view: AppView) => void
}

function readSavedIndex(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw == null) return 0
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n < 0 || n >= TUTORIAL_STEPS.length) return 0
    return n
  } catch {
    return 0
  }
}

export function TutorialPage({ onBackHome, onNavigate }: TutorialPageProps) {
  const [index, setIndex] = useState(readSavedIndex)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const step = TUTORIAL_STEPS[index]
  const isFirst = index === 0
  const isLast = index === TUTORIAL_STEPS.length - 1

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, String(index))
    } catch {
      /* ignore */
    }
  }, [index])

  const phaseProgress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>()
    for (const p of TUTORIAL_PHASES) {
      map.set(p, { done: 0, total: 0 })
    }
    TUTORIAL_STEPS.forEach((s, i) => {
      const entry = map.get(s.phase)!
      entry.total += 1
      if (i < index) entry.done += 1
      else if (i === index) entry.done += 0.5
    })
    return map
  }, [index])

  const toggleCheck = useCallback((item: string) => {
    const key = `${step.id}::${item}`
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [step.id])

  const isItemChecked = (item: string) =>
    Boolean(checked[`${step.id}::${item}`])

  const checkedCount = step.checklist.filter(isItemChecked).length
  const allChecked =
    step.checklist.length === 0 || checkedCount === step.checklist.length

  const goTo = (view: AppView) => onNavigate?.(view)

  const handleNext = () => {
    if (!isLast) setIndex((i) => i + 1)
  }

  const handlePrev = () => {
    if (!isFirst) setIndex((i) => i - 1)
  }

  const handleJump = (i: number) => setIndex(i)

  const handleReset = () => {
    setIndex(0)
    setChecked({})
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const backButton = onBackHome ? (
    <button
      type="button"
      className="tutorial-back-btn"
      onClick={onBackHome}
    >
      ← Homepage
    </button>
  ) : null

  return (
    <main className="app-main page-view tutorial-page">
      <div className="page-view-inner tutorial-layout">
        <aside className="tutorial-rail" aria-label="教程步骤">
          <p className="tutorial-rail__label">流程引导</p>
          <ol className="tutorial-rail__list">
            {TUTORIAL_STEPS.map((s, i) => {
              const state =
                i < index ? 'done' : i === index ? 'current' : 'upcoming'
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`tutorial-rail__item tutorial-rail__item--${state}`}
                    aria-current={i === index ? 'step' : undefined}
                    onClick={() => handleJump(i)}
                  >
                    <span className="tutorial-rail__index">{i + 1}</span>
                    <span className="tutorial-rail__text">
                      <span className="tutorial-rail__phase">{s.phase}</span>
                      <span className="tutorial-rail__title">{s.title}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>

        <GlowPanel
          title="Tutorial"
          headerAction={backButton}
          bodyClassName="tutorial-body"
          className="tutorial-panel"
        >
          <TutorialStepView
            step={step}
            index={index}
            total={TUTORIAL_STEPS.length}
            phaseProgress={phaseProgress}
            checkedCount={checkedCount}
            allChecked={allChecked}
            isItemChecked={isItemChecked}
            onToggleCheck={toggleCheck}
          />

          <footer className="tutorial-footer">
            <div className="tutorial-footer__left">
              <button
                type="button"
                className="tutorial-btn tutorial-btn--ghost"
                disabled={isFirst}
                onClick={handlePrev}
              >
                上一步
              </button>
              {!isLast && (
                <button
                  type="button"
                  className="tutorial-btn tutorial-btn--primary"
                  onClick={handleNext}
                >
                  {allChecked ? '下一步' : '下一步（可先跳过勾选）'}
                </button>
              )}
              {isLast && (
                <button
                  type="button"
                  className="tutorial-btn tutorial-btn--primary"
                  onClick={onBackHome}
                >
                  返回 Homepage
                </button>
              )}
            </div>
            <div className="tutorial-footer__right">
              {step.navigate && onNavigate && step.navigateLabel && (
                <button
                  type="button"
                  className="tutorial-btn tutorial-btn--accent"
                  onClick={() => goTo(step.navigate!)}
                >
                  {step.navigateLabel}
                </button>
              )}
              <button
                type="button"
                className="tutorial-btn tutorial-btn--ghost"
                onClick={handleReset}
              >
                从头开始
              </button>
            </div>
          </footer>
        </GlowPanel>
      </div>
    </main>
  )
}

interface TutorialStepViewProps {
  step: TutorialStep
  index: number
  total: number
  phaseProgress: Map<string, { done: number; total: number }>
  checkedCount: number
  allChecked: boolean
  isItemChecked: (item: string) => boolean
  onToggleCheck: (item: string) => void
}

function TutorialStepView({
  step,
  index,
  total,
  phaseProgress,
  checkedCount,
  allChecked,
  isItemChecked,
  onToggleCheck,
}: TutorialStepViewProps) {
  const progressPct = Math.round(((index + 1) / total) * 100)

  return (
    <div className="tutorial-step-view">
      <div
        className="tutorial-progress"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`教程进度 ${progressPct}%`}
      >
        <div
          className="tutorial-progress__bar"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="tutorial-step-header">
        <span className="tutorial-step-header__phase">{step.phase}</span>
        <span className="tutorial-step-header__count">
          第 {index + 1} / {total} 步
        </span>
      </div>

      <h3 className="tutorial-step-header__title">{step.title}</h3>
      <p className="tutorial-step-header__summary">{step.summary}</p>

      {index === 0 && (
        <div className="tutorial-flow" aria-label="工作流示意">
          <FlowNode label="Homepage" highlight />
          <FlowArrow />
          <FlowNode label="Scrape" />
          <FlowArrow />
          <FlowNode label="Project" />
          <FlowArrow />
          <FlowNode label="Dashboard" />
          <FlowArrow />
          <FlowNode label="FinDoc / RAG" />
        </div>
      )}

      <div className="tutorial-phases">
        {TUTORIAL_PHASES.map((phase) => {
          const { done, total: t } = phaseProgress.get(phase) ?? {
            done: 0,
            total: 1,
          }
          const pct = t > 0 ? Math.min(100, Math.round((done / t) * 100)) : 0
          return (
            <div key={phase} className="tutorial-phase-chip">
              <span className="tutorial-phase-chip__name">{phase}</span>
              <span
                className="tutorial-phase-chip__bar"
                style={{ width: `${pct}%` }}
              />
            </div>
          )
        })}
      </div>

      <section className="tutorial-checklist" aria-labelledby="tutorial-check-heading">
        <div className="tutorial-checklist__head">
          <h4 id="tutorial-check-heading" className="tutorial-checklist__title">
            本步操作清单
          </h4>
          <span
            className={`tutorial-checklist__status${allChecked ? ' tutorial-checklist__status--done' : ''}`}
          >
            {checkedCount}/{step.checklist.length}
          </span>
        </div>
        <ul className="tutorial-checklist__list">
          {step.checklist.map((item) => {
            const id = `check-${step.id}-${item.slice(0, 12)}`
            const on = isItemChecked(item)
            return (
              <li key={item}>
                <label className="tutorial-check" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggleCheck(item)}
                  />
                  <span className="tutorial-check__box" aria-hidden />
                  <span className="tutorial-check__text">{item}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      {step.tip && (
        <p className="tutorial-tip">
          <strong>提示：</strong>
          {step.tip}
        </p>
      )}

      {step.navigate && step.navigateLabel && (
        <p className="tutorial-try">
          准备好后点击底部「{step.navigateLabel}」在真实页面中操作，完成后返回本页继续下一步。
        </p>
      )}
    </div>
  )
}

function FlowNode({
  label,
  highlight,
}: {
  label: string
  highlight?: boolean
}) {
  return (
    <span
      className={`tutorial-flow__node${highlight ? ' tutorial-flow__node--hi' : ''}`}
    >
      {label}
    </span>
  )
}

function FlowArrow() {
  return <span className="tutorial-flow__arrow" aria-hidden>→</span>
}
