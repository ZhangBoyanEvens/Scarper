import { SignIn } from '@clerk/clerk-react'
import { scarperClerkSignInAppearance } from '../../config/clerkAppearance'
import { isClerkConfigured } from '../../config/clerk'

export function HomepageClerkSignIn() {
  if (!isClerkConfigured) return null

  return (
    <div className="homepage-auth" aria-label="登录">
      <SignIn
        routing="virtual"
        signUpUrl="#/sign-up"
        appearance={scarperClerkSignInAppearance}
      />
    </div>
  )
}
