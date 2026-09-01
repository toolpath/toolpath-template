import { useEffect, useState } from 'react'

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

export const useTheme = (): [Theme, (next: Theme) => void] => {
  const [theme, setTheme] = useState<Theme>('dark')

  // After mount, not during render: the first paint is the build's, and the
  // pre-paint script in `root.tsx` has already put the stored theme on the
  // document by the time this runs.
  useEffect(() => {
    setTheme(readTheme(globalThis.localStorage ?? null))
  }, [])

  const choose = (next: Theme) => {
    setTheme(next)
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next)
    if (typeof document !== 'undefined') {
      applyTheme(document.documentElement, next)
    }
  }

  return [theme, choose]
}
