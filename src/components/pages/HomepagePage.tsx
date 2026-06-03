import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { AHoleEffect } from '../homepage/AHoleEffect'
import { HomepageClerkSignIn } from '../homepage/HomepageClerkSignIn'
import { HomepageStartButton } from '../homepage/HomepageStartButton'
import { HomepageTutorialButton } from '../homepage/HomepageTutorialButton'
import { isClerkConfigured } from '../../config/clerk'
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
  const handleStart = () => {
    onStart?.()
  }

  const handleTutorial = () => {
    onTutorial?.()
  }

  return (
    <main className="app-main homepage-page">
      <div className="homepage-shell">
        <section className="homepage-stage" aria-hidden>
          <div className="homepage-stage__viz">
            <AHoleEffect />
          </div>
        </section>
        <aside className="homepage-side" aria-label="登录与品牌">
          <div className="homepage-side__content">
            <h1 className="homepage-title">SCARPER</h1>
            {isClerkConfigured ? (
              <>
                <SignedOut>
                  <HomepageClerkSignIn />
                </SignedOut>
                <SignedIn>
                  <HomepageSignedInActions
                    onStart={handleStart}
                    onTutorial={handleTutorial}
                  />
                </SignedIn>
              </>
            ) : (
              <HomepageSignedInActions
                onStart={handleStart}
                onTutorial={handleTutorial}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
