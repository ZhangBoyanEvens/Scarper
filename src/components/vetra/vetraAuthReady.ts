import { isClerkConfigured } from '../../config/clerk'
import { resolveAuthToken } from '../../services/authToken'

/** Clerk token may be ready before Vetra mounts — probe token on subscribe. */
export function subscribeVetraAuthReady(onReady: () => void): () => void {
  if (!isClerkConfigured) {
    onReady()
    return () => {}
  }

  const markReady = () => onReady()
  window.addEventListener('scarper:auth-token-ready', markReady)
  void resolveAuthToken().then((token) => {
    if (token) markReady()
  })

  return () => window.removeEventListener('scarper:auth-token-ready', markReady)
}
