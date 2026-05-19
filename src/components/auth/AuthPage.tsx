import { SignIn } from '@clerk/clerk-react'
import { BrandMark } from '../Brand/BrandMark'
import './AuthPage.css'

export function AuthPage() {
  return (
    <div className="auth-page">
      <div className="auth-page-bg" aria-hidden="true">
        <div className="auth-page-bg-gradient" />
        <div className="auth-page-bg-orb auth-page-bg-orb--1" />
        <div className="auth-page-bg-orb auth-page-bg-orb--2" />
        <div className="auth-page-bg-orb auth-page-bg-orb--3" />
      </div>
      <div className="auth-page-content">
        <div className="auth-page-card">
          <div className="auth-page-brand">
            <BrandMark size="lg" />
          </div>
          <div className="auth-clerk-wrap">
            <SignIn
              routing="hash"
              signUpUrl="#/sign-up"
              appearance={{
                layout: {
                  socialButtonsPlacement: 'top',
                },
                variables: {
                  colorBackground: '#ffffff',
                  colorInputBackground: '#f8fafc',
                  colorText: '#0f172a',
                  colorTextSecondary: '#64748b',
                  colorPrimary: '#7c3aed',
                  colorInputText: '#0f172a',
                  borderRadius: '12px',
                },
                elements: {
                  rootBox: 'auth-clerk-root',
                  cardBox: 'auth-clerk-card-box',
                  card: 'auth-clerk-card',
                  headerTitle: 'auth-clerk-title',
                  headerSubtitle: 'auth-clerk-subtitle',
                  formButtonPrimary: 'auth-clerk-btn',
                  formFieldInput: 'auth-clerk-input',
                  footerActionLink: 'auth-clerk-link',
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
