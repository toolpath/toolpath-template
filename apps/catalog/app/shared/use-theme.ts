import { useEffect, useSyncExternalStore } from 'react'

/**
 * Light or dark, in this browser.
 *
 * **The palette flips; the classes do not.** Every colour in this application
 * is written as a `zinc` step, and the zinc ramp is a set of custom properties
 * in `@toolpath/ui`'s theme — so light mode is that ramp read the other way
 * round, declared once in `styles.css`, rather than a `dark:` variant on each
 * of the five hundred places a colour is used (Paul, 2026-08-31: "we need to
 * get light mode going").
 *
 * Dark stays the default: it is what the application was drawn for, and a shop
 * that has not said otherwise gets what it had yesterday.
 */
export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'tool-catalog.theme'

/** What is stored, or dark where nothing readable is. */
export const readTheme = (storage: Pick<Storage, 'getItem'> | null): Theme =>
  storage?.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'

/**
 * Put a theme on the document.
 *
 * `@toolpath/ui` keys its own `dark:` variant off the `dark` class, so that
 * class is the single switch: the ramp, the package's primitives and the
 * browser's own form controls all follow it.
 */
export const applyTheme = (root: HTMLElement, theme: Theme): void => {
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

/**
 * Everyone reading the theme has to read the **same** theme.
 *
 * Each `useTheme` used to hold its own `useState`, so the switch in the header
 * updated the header and nothing else — which is invisible while every colour
 * is a `zinc` step the ramp flips underneath, and very visible the moment
 * something states a colour of its own. The 2D drawing does: it stayed on its
 * dark sheet in light mode (Paul, 2026-09-01). One store, and every consumer
 * subscribes to it.
 */
const listeners = new Set<() => void>()
let current: Theme = 'dark'

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * What the document is already showing, where anything has said.
 *
 * `root.tsx` applies the stored theme pre-paint, and {@link applyTheme} sets
 * `color-scheme` as it does — so that property is how a page says "the theme
 * has been applied to me". Without it (a test's bare document, a page that
 * never ran the script) there is nothing to read and storage is the answer.
 */
const onTheDocument = (): Theme | null => {
  if (typeof document === 'undefined' || document.documentElement.style.colorScheme === '') {
    return null
  }
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export const useTheme = (): [Theme, (next: Theme) => void] => {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    // The server has no document and no storage: dark, which is the default.
    () => 'dark' as Theme,
  )

  // After mount, not during render: the first paint is the build's, and the
  // pre-paint script in `root.tsx` has already put the stored theme on the
  // document by the time this runs.
  useEffect(() => {
    const settled = onTheDocument() ?? readTheme(globalThis.localStorage ?? null)
    if (settled !== current) {
      current = settled
      for (const listener of listeners) {
        listener()
      }
    }
  }, [])

  const choose = (next: Theme) => {
    current = next
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next)
    if (typeof document !== 'undefined') {
      applyTheme(document.documentElement, next)
    }
    for (const listener of listeners) {
      listener()
    }
  }

  return [theme, choose]
}
