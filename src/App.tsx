import { ClerkProvider } from '@clerk/clerk-react'
import { AuthGate } from './components/auth/AuthGate'
import { AppLayout } from './AppLayout'
import { clerkPublishableKey, isClerkConfigured } from './config/clerk'
import { AppSettingsProvider } from './contexts/AppSettingsContext'
import { ScrapeSessionProvider } from './contexts/ScrapeSessionContext'
import { UserProfileProvider } from './contexts/UserProfileContext'
import { AntdProvider } from './providers/AntdProvider'
import './App.css'

function AppShell() {
  const body = (
    <AntdProvider>
      <ScrapeSessionProvider>
        {isClerkConfigured ? (
          <UserProfileProvider>
            <AppLayout />
          </UserProfileProvider>
        ) : (
          <AppLayout />
        )}
      </ScrapeSessionProvider>
    </AntdProvider>
  )

  if (!isClerkConfigured) {
    return (
      <div className="app">
        <AppSettingsProvider>{body}</AppSettingsProvider>
      </div>
    )
  }

  return (
    <div className="app">
      <AuthGate>
        <AppSettingsProvider>{body}</AppSettingsProvider>
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
