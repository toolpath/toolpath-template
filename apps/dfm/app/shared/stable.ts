import { useLayoutEffect, useMemo, useRef } from 'react'

/**
 * A bag of callbacks, as a panel is handed one.
 *
 * `never` in the parameter position is what makes the bag accept callbacks of
 * every shape: a parameter list is contravariant, so `never` is the one thing
 * assignable to all of them. The stable object is cast back to `T`, so call
 * sites keep their real signatures.
 */
type Callbacks = Record<string, (...args: Array<never>) => unknown>

/**
 * The same functions, render after render, still doing the current thing.
 *
 * `PartInspector` holds thirty-odd pieces of state, and a panel drawn from it
 * used to re-render on every one of them — including the two that only the
 * *part* cares about. Hovering a row in a face list sets `hoveredFace`, which
 * feeds the viewer's paint layers and nothing else, and the mapping panel,
 * the setups panel and the rules panel all re-rendered anyway, twice per row
 * the pointer crossed.
 *
 * `memo` is the fix for that and it cannot work on its own here: every handler
 * on the page is an arrow function rebuilt each render, so a memoised panel
 * compares its props, finds fifteen new function identities, and re-renders
 * regardless. This gives those handlers one identity for the life of the page
 * without freezing what they do — the returned functions forward to whichever
 * version rendered last.
 *
 * **The keys are read once.** Call it with an object literal, which is how the
 * key set stays fixed; a bag whose keys vary by render would silently keep the
 * first render's set.
 *
 * The current bag is stored in a layout effect rather than during render, so a
 * render React starts and throws away cannot leave its handlers behind. Every
 * caller here is a user event, which cannot run before layout effects have
 * flushed.
 */
export const useStable = <T extends Callbacks>(callbacks: T): T => {
  const latest = useRef(callbacks)

  useLayoutEffect(() => {
    latest.current = callbacks
  })

  const keys = useRef<Array<string> | null>(null)
  keys.current ??= Object.keys(callbacks)

  return useMemo(
    () =>
      Object.fromEntries(
        (keys.current ?? []).map((key) => [
          key,
          (...args: Array<unknown>) =>
            (latest.current[key] as (...passed: Array<unknown>) => unknown)(...args),
        ]),
      ) as unknown as T,
    [],
  )
}
