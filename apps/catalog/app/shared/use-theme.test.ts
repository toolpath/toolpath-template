import { describe, expect, it } from 'vitest'
import { applyTheme, readTheme, THEME_STORAGE_KEY } from './use-theme'

const store = (held: Record<string, string> = {}) => ({
  getItem: (key: string) => held[key] ?? null,
})

describe('the theme this browser is in', () => {
  /** Dark is what the application was drawn for, so it is what nothing means. */
  it('is dark unless light was asked for', () => {
    expect(readTheme(store())).toBe('dark')
    expect(readTheme(null)).toBe('dark')
    expect(readTheme(store({ [THEME_STORAGE_KEY]: 'nonsense' }))).toBe('dark')
    expect(readTheme(store({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light')
  })

  /**
   * One class is the whole switch: `@toolpath/ui` keys its `dark:` variant off
   * it, and `styles.css` hangs the flipped zinc ramp on it.
   */
  it('is put on the document as one class', () => {
    const root = document.createElement('html')

    applyTheme(root, 'light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')

    applyTheme(root, 'dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })
})
