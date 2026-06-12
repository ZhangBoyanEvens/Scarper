import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { AHoleEffect } from '../homepage/AHoleEffect'
import { HomepageClerkSignIn } from '../homepage/HomepageClerkSignIn'
import { HomepageStartButton } from '../homepage/HomepageStartButton'
import { HomepageTutorialButton } from '../homepage/HomepageTutorialButton'
import { isClerkConfigured } from '../../config/clerk'
import { useI18n } from '../../contexts/I18nContext'
import './HomepagePage.css'

export interface HomepagePageProps {
  onStart?: () => void
  onTutorial?: () => void
}

function HomepageSignedInActions({
  onStart,
  onTutorial,
}: {
  onStart: () => void
  onTutorial: () => void
}) {
  return (
    <div className="homepage-side__action-center">
      <div className="homepage-side__actions">
        <HomepageStartButton onClick={onStart} />
        <HomepageTutorialButton onClick={onTutorial} />
      </div>
    </div>
  )
}

export function HomepagePage({ onStart, onTutorial }: HomepagePageProps) {
  const { t } = useI18n()
  return (
    <main className="app-main homepage-page">
      <div className="homepage-shell">
        <section className="homepage-stage" aria-hidden>
          <div className="homepage-stage__viz">
            <AHoleEffect />
          </div>
        </section>
        <aside className="homepage-side" aria-label={t('homepage.signInBrand')}>
          <div className="homepage-side__content">
            <h1 className="homepage-title">{t('homepage.brand')}</h1>
            {isClerkConfigured ? (
              <>
                <SignedOut>
                  <HomepageClerkSignIn />
                </SignedOut>
                <SignedIn>
                  <HomepageSignedInActions
                    onStart={() => onStart?.()}
                    onTutorial={() => onTutorial?.()}
                  />
                </SignedIn>
              </>
            ) : (
              <HomepageSignedInActions
                onStart={() => onStart?.()}
                onTutorial={() => onTutorial?.()}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
