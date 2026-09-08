import { useCallback, useState } from 'react'

/**
 * Shapes of the page being tried out, each one somebody can switch off.
 *
 * **A flag is a way back, not a setting.** The assembly tree replaces how a
 * feature's tools are chosen — the tree beside the table, the holder and collet
 * tables, the stack drawn on the right — and it replaces enough of the page at
 * once that "put it back the way it was" has to be one press rather than a
 * revert (Paul, 2026-09-07: "make this a feature flag, as I may want to roll
 * back").
 *
 * Kept in this browser under one key, so a flag survives a reload and belongs
 * to the person who set it rather than to the deployment.
 */
export type Flag = 'assemblyTree'

/**
 * On by default: the flag exists to be turned *off* after a look, so a build
 * that opens on the old page would need the same press to see the new one and
 * the trial would never happen.
 */
export const FLAG_DEFAULTS: Readonly<Record<Flag, boolean>> = { assemblyTree: true }

export const FLAG_LABELS: Readonly<Record<Flag, string>> = { assemblyTree: 'Tool tree' }

const KEY = 'tool-catalog.flags'

export const readFlags = (storage: Pick<Storage, 'getItem'> | null): Record<Flag, boolean> => {
  const raw = storage?.getItem(KEY)
  if (!raw) {
    return { ...FLAG_DEFAULTS }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...FLAG_DEFAULTS }
    }
    const held = parsed as Partial<Record<Flag, unknown>>
    const flags = { ...FLAG_DEFAULTS }
    for (const flag of Object.keys(FLAG_DEFAULTS) as Array<Flag>) {
      if (typeof held[flag] === 'boolean') {
        flags[flag] = held[flag]
      }
    }
    return flags
  } catch {
    // Unreadable storage is not an application error: the defaults stand.
    return { ...FLAG_DEFAULTS }
  }
}

export const writeFlags = (
  storage: Pick<Storage, 'setItem'> | null,
  flags: Readonly<Record<Flag, boolean>>,
): void => {
  storage?.setItem(KEY, JSON.stringify(flags))
}

/**
 * One flag, and the way to flip it.
 *
 * **Read before the first paint, unlike the sheet and the feature list.** Those
 * read storage in an effect because a value read during render is a hydration
 * mismatch on a server-rendered page; this catalog is `ssr: false`, so there is
 * no server render to mismatch — and a flag read afterwards would draw the page
 * one way and then the other, which is the one thing a switch between two
 * shapes must not do. A browser with no storage at all reads as the defaults.
 */
export const useFlag = (flag: Flag): [boolean, (on: boolean) => void] => {
  const [on, setOn] = useState(() => readFlags(globalThis.localStorage ?? null)[flag])

  const set = useCallback(
    (next: boolean) => {
      setOn(next)
      const storage = globalThis.localStorage ?? null
      writeFlags(storage, { ...readFlags(storage), [flag]: next })
    },
    [flag],
  )

  return [on, set]
}
