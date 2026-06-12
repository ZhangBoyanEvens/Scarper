import { SignIn } from '@clerk/clerk-react'
import { scarperClerkSignInAppearance } from '../../config/clerkAppearance'
import { isClerkConfigured } from '../../config/clerk'

export function HomepageClerkSignIn() {
  if (!isClerkConfigured) return null

  return (
    <div className="homepage-auth" aria-label="Sign in">
      <SignIn
        routing="virtual"
        signUpUrl="#/sign-up"
        appearance={scarperClerkSignInAppearance}
      />
    </div>
  )
}
