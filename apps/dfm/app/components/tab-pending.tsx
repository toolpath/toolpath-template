/**
 * What stands in the panel while a tab's code is being fetched.
 *
 * Rules and Directions are loaded on the press that opens them, so there is a
 * moment — one network round trip, once per session — where the panel exists
 * and its contents do not. This fills it.
 *
 * Deliberately quiet: no spinner, no skeleton rows. The wait is short enough
 * that a spinner is a flash rather than an answer, and skeleton rows would
 * promise a shape this does not know. It says which tab is coming, which is
 * the one thing somebody who just pressed it does not need to be told twice.
 */
export const TabPending = ({ label }: { label: string }) => (
  <aside
    aria-busy="true"
    aria-live="polite"
    className="flex size-full min-h-0 items-start justify-center bg-ground p-4"
  >
    <p className="text-sm text-ink-dim">Opening {label}…</p>
  </aside>
)
