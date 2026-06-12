import type { AppView } from '../types/appView'
import type { TranslateParams } from './types'

type TranslateFn = (path: string, params?: TranslateParams) => string

export interface TutorialStep {
  id: string
  phase: string
  title: string
  summary: string
  checklist: readonly string[]
  tip?: string
  navigate?: AppView
  navigateLabel?: string
}

function checklist(t: TranslateFn, stepId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    t(`tutorial.steps.${stepId}.checklist.${i}`),
  )
}

export function buildTutorialSteps(t: TranslateFn): readonly TutorialStep[] {
  return [
    {
      id: 'overview',
      phase: t('tutorial.phases.overview'),
      title: t('tutorial.steps.overview.title'),
      summary: t('tutorial.steps.overview.summary'),
      checklist: checklist(t, 'overview', 4),
    },
    {
      id: 'sign-in',
      phase: t('tutorial.phases.setup'),
      title: t('tutorial.steps.signIn.title'),
      summary: t('tutorial.steps.signIn.summary'),
      checklist: checklist(t, 'signIn', 3),
      tip: t('tutorial.steps.signIn.tip'),
      navigate: 'homepage',
      navigateLabel: t('tutorial.steps.signIn.navigate'),
    },
    {
      id: 'tools',
      phase: t('tutorial.phases.scrape'),
      title: t('tutorial.steps.tools.title'),
      summary: t('tutorial.steps.tools.summary'),
      checklist: checklist(t, 'tools', 3),
      navigate: 'tools',
      navigateLabel: t('tutorial.steps.tools.navigate'),
    },
    {
      id: 'scrape',
      phase: t('tutorial.phases.scrape'),
      title: t('tutorial.steps.scrape.title'),
      summary: t('tutorial.steps.scrape.summary'),
      checklist: checklist(t, 'scrape', 3),
      tip: t('tutorial.steps.scrape.tip'),
      navigate: 'scrape',
      navigateLabel: t('tutorial.steps.scrape.navigate'),
    },
    {
      id: 'scrape-upload',
      phase: t('tutorial.phases.scrape'),
      title: t('tutorial.steps.scrapeUpload.title'),
      summary: t('tutorial.steps.scrapeUpload.summary'),
      checklist: checklist(t, 'scrapeUpload', 3),
      navigate: 'scrape',
      navigateLabel: t('tutorial.steps.scrapeUpload.navigate'),
    },
    {
      id: 'project',
      phase: t('tutorial.phases.manage'),
      title: t('tutorial.steps.project.title'),
      summary: t('tutorial.steps.project.summary'),
      checklist: checklist(t, 'project', 3),
      navigate: 'project',
      navigateLabel: t('tutorial.steps.project.navigate'),
    },
    {
      id: 'findoc',
      phase: t('tutorial.phases.documents'),
      title: t('tutorial.steps.findoc.title'),
      summary: t('tutorial.steps.findoc.summary'),
      checklist: checklist(t, 'findoc', 3),
      navigate: 'findoc',
      navigateLabel: t('tutorial.steps.findoc.navigate'),
    },
    {
      id: 'rag',
      phase: t('tutorial.phases.documents'),
      title: t('tutorial.steps.rag.title'),
      summary: t('tutorial.steps.rag.summary'),
      checklist: checklist(t, 'rag', 3),
      navigate: 'rag-chat',
      navigateLabel: t('tutorial.steps.rag.navigate'),
    },
    {
      id: 'settings',
      phase: t('tutorial.phases.wrapUp'),
      title: t('tutorial.steps.settings.title'),
      summary: t('tutorial.steps.settings.summary'),
      checklist: checklist(t, 'settings', 3),
      tip: t('tutorial.steps.settings.tip'),
      navigate: 'settings',
      navigateLabel: t('tutorial.steps.settings.navigate'),
    },
    {
      id: 'done',
      phase: t('tutorial.phases.done'),
      title: t('tutorial.steps.done.title'),
      summary: t('tutorial.steps.done.summary'),
      checklist: checklist(t, 'done', 3),
    },
  ]
}

export function getTutorialPhases(steps: readonly TutorialStep[]): string[] {
  return [...new Set(steps.map((s) => s.phase))]
}
