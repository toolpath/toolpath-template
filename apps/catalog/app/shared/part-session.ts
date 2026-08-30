import { useSyncExternalStore } from 'react'
import type { PublicInspectionReport } from '@toolpath/part-contracts'

/**
 * The part somebody is working on, kept while they look at something else.
 *
 * Browsing to the catalog and back should not re-run an analysis, and it should
 * not ask for the part again. The report is held in memory for the life of the
 * tab — not `localStorage`, because a report is large, and not a store the
 * application persists, because a part is a session rather than a document.
 *
 * A reload does start over. That is the honest cost of holding it in memory,
 * and the alternative — writing a customer's geometry to browser storage — is
 * not one this application should take without being asked.
 */
export interface PartSession {
  readonly partId: string
  readonly jobId: string
  readonly report: PublicInspectionReport
}

let session: PartSession | null = null
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) {
    listener()
  }
}

export const rememberPart = (next: PartSession): void => {
  if (session?.partId === next.partId && session.jobId === next.jobId) {
    return
  }
  session = next
  emit()
}

export const forgetPart = (): void => {
  session = null
  emit()
}

/** The report for this exact part and job, if it is the one already loaded. */
export const recallPart = (partId: string, jobId: string): PartSession | null =>
  session && session.partId === partId && session.jobId === jobId ? session : null

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = (): PartSession | null => session

/** The part in play, so the header can offer a way back to it. */
export const usePartSession = (): PartSession | null =>
  useSyncExternalStore(subscribe, snapshot, () => null)

export const partHref = (part: PartSession): string =>
  `/parts/${encodeURIComponent(part.partId)}?job=${encodeURIComponent(part.jobId)}`
