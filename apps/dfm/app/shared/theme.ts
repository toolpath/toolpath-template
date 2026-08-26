export const THEMES = ['dark', 'light'] as const

export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'part-viewer:theme'

/**
 * Light or dark, and dark until somebody says otherwise.
 *
 * Dark is the default because this is a page somebody has open beside a machine
 * for an hour at a time, and because the model window is dark whatever else is:
 * a light shell around it is a choice, not the resting state.
 *
 * Kept beside the unit, the paint mode and the grid, and for the same reason —
 * it belongs to the person rather than to the part.
 */
export const loadTheme = (storage: Pick<Storage, 'getItem'> | null): Theme =>
  storage?.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'

export const saveTheme = (storage: Pick<Storage, 'setItem'> | null, theme: Theme): void => {
  storage?.setItem(STORAGE_KEY, theme)
}

/**
 * Put the choice on the document, which is where every rule reads it.
 *
 * `color-scheme` as well as the class: it is what tells the browser which way
 * to draw a scrollbar, a form control and the canvas behind the page, none of
 * which a stylesheet reaches.
 */
export const applyTheme = (
  root: { classList: DOMTokenList; style: CSSStyleDeclaration } | null,
  theme: Theme,
): void => {
  if (!root) return

  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

/**
 * The same thing, as a string, to run before the first paint.
 *
 * Inlined in `<head>`: React cannot help here, because the class has to be on
 * `<html>` before anything is drawn. Reading it after mount is a white flash on
 * a dark theme, every load — the same reason the unit is read after mount but
 * the theme cannot be.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==='light'?'light':'dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t}catch(e){}`
