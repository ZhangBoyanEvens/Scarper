import { ClerkProvider } from '@clerk/clerk-react'
import { AuthGate } from './components/auth/AuthGate'
import { AppNavbar } from './components/Layout/AppNavbar'
import { clerkPublishableKey, isClerkConfigured } from './config/clerk'
import { UserProfileProvider } from './contexts/UserProfileContext'
import { ScarperApp } from './ScarperApp'
import './App.css'

function AppShell() {
  if (!isClerkConfigured) {
    return (
      <div className="app">
        <ScarperApp />
      </div>
    )
  }

  return (
    <div className="app">
      <AuthGate>
        <UserProfileProvider>
          <AppNavbar />
          <ScarperApp />
        </UserProfileProvider>
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
