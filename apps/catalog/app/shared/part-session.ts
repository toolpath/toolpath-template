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
export interface PartSession extends PartRef {
  readonly report: PublicInspectionReport
}

/**
 * Which part is being worked on, without its analysis.
 *
 * The URL carries exactly this much — `/parts/:partId?job=:jobId` — so it is
 * what a page can still name after a reload has emptied the session above.
 */
export interface PartRef {
  readonly partId: string
  readonly jobId: string
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

/**
 * The part this page is on, **read off the URL before the session** (Paul,
 * 2026-09-09: "when I go from the order list to the parts page, it prompts me
 * to upload a new part. It should just go back to the part I was working on").
 *
 * The session holds the report and is memory-only, so a reload — or a dev
 * server's own reload — empties it while the URL still says which part the
 * order list belongs to. Reading the session alone made the header forget: the
 * *Part* tab fell back to `/parts`, which is the upload form, and a round trip
 * between the two pages a shop makes many times a job ended at a file picker.
 *
 * The URL wins because it is the page somebody is actually on. Where it names
 * no part — the upload page itself — the session is what is left to offer.
 */
export const openPart = (
  remembered: PartRef | null,
  partId: string | undefined,
  jobId: string | null,
): PartRef | null => (partId && jobId ? { partId, jobId } : remembered)

export const partHref = (part: PartRef): string =>
  `/parts/${encodeURIComponent(part.partId)}?job=${encodeURIComponent(part.jobId)}`

/** The same part's order list, which is its setup sheet read as a list. */
export const orderListHref = (part: PartRef): string =>
  `/parts/${encodeURIComponent(part.partId)}/order-list?job=${encodeURIComponent(part.jobId)}`
