export const scarperClerkSignInAppearance = {
  layout: {
    socialButtonsPlacement: 'top',
  },
  variables: {
    colorBackground: '#ffffff',
    colorInputBackground: '#f8fafc',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorPrimary: '#22c55e',
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
} as const
