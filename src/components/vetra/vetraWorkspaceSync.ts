export async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function fetchWithEmptyRetry<T>(
  fetch: () => Promise<T[]>,
  expectedMinCount: number,
  retries = 2,
): Promise<T[]> {
  let records = await fetch()
  if (records.length > 0 || expectedMinCount === 0) {
    return records
  }

  for (let attempt = 0; attempt < retries; attempt += 1) {
    await delay(600 * (attempt + 1))
    records = await fetch()
    if (records.length > 0) {
      return records
    }
  }

  return records
}

/** Avoid replacing a populated local/cache snapshot with an empty server list. */
export function canApplyServerRecords(
  serverCount: number,
  protectedCount: number,
): boolean {
  if (protectedCount === 0) return true
  return serverCount > 0
}

export function protectedRecordCount(
  cachedCount: number,
  localCount: number,
): number {
  return Math.max(cachedCount, localCount)
}

export function shouldSkipSyncApply(
  serverCount: number,
  protectedCount: number,
  mutationChanged: boolean,
): boolean {
  if (mutationChanged) return true
  return !canApplyServerRecords(serverCount, protectedCount)
}
