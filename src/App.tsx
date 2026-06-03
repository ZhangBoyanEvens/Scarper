import { ClerkProvider } from '@clerk/clerk-react'
import { AuthGate } from './components/auth/AuthGate'
import { AppLayout } from './AppLayout'
import { clerkPublishableKey, isClerkConfigured } from './config/clerk'
import { AppSettingsProvider } from './contexts/AppSettingsContext'
import { ScrapeSessionProvider } from './contexts/ScrapeSessionContext'
import { UserProfileProvider } from './contexts/UserProfileContext'
import './App.css'

function AppShell() {
  if (!isClerkConfigured) {
    return (
      <div className="app">
        <AppSettingsProvider>
          <ScrapeSessionProvider>
            <AppLayout />
          </ScrapeSessionProvider>
        </AppSettingsProvider>
      </div>
    )
  }

  return (
    <div className="app">
      <AuthGate>
        <AppSettingsProvider>
          <ScrapeSessionProvider>
            <UserProfileProvider>
              <AppLayout />
            </UserProfileProvider>
          </ScrapeSessionProvider>
        </AppSettingsProvider>
      </AuthGate>
    </div>
  )
}

function App() {
  if (!isClerkConfigured) {
    return <AppShell />
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey!}>
      <AppShell />
    </ClerkProvider>
  )
}

export default App
