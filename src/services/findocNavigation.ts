export interface FindocOpenRequest {
  projectId: string
  recordId: string
}

let pendingOpen: FindocOpenRequest | null = null

export function requestFindocOpen(request: FindocOpenRequest): void {
  pendingOpen = request
  window.dispatchEvent(
    new CustomEvent('scarper:findoc-open', { detail: request }),
  )
}

export function consumeFindocOpen(): FindocOpenRequest | null {
  const request = pendingOpen
  pendingOpen = null
  return request
}

export function peekFindocOpen(): FindocOpenRequest | null {
  return pendingOpen
}
