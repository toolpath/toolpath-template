// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { THEMES, THEME_SCRIPT, applyTheme, loadTheme, saveTheme } from './theme'

/**
 * Light or dark, and the one preference that cannot wait for React.
 *
 * The others — the unit, the paint mode, the grid — are read after mount,
 * because being a frame late costs nothing. The theme cannot be: the class has
 * to be on `<html>` before the first paint or a dark page flashes white on
 * every load. That is why {@link THEME_SCRIPT} exists at all, and why it is the
 * half of this file worth testing hardest.
 */
const store = (value?: string) => ({
  getItem: () => value ?? null,
  setItem: () => undefined,
})

describe('which theme is being read', () => {
  it('is dark until somebody says otherwise', () => {
    expect(loadTheme(store())).toBe('dark')
    expect(loadTheme(null)).toBe('dark')
  })

  it('remembers the other one', () => {
    expect(loadTheme(store('light'))).toBe('light')
  })

  // A stored value this release does not offer is not a licence to invent one.
  // The same reasoning as the wheel's zoom target, and the same fallback.
  it('ignores anything it does not recognise', () => {
    expect(loadTheme(store('sepia'))).toBe('dark')
  })

  it('writes what it is given', () => {
    const written: Array<string> = []
    saveTheme({ setItem: (_key, value) => written.push(value) }, 'light')

    expect(written).toEqual(['light'])
  })

  it('survives having no storage', () => {
    expect(() => saveTheme(null, 'light')).not.toThrow()
  })
})

describe('putting the choice on the document', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
  })

  it('carries the class the stylesheet reads', () => {
    applyTheme(document.documentElement, 'dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    applyTheme(document.documentElement, 'light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  /*
   * `color-scheme` as well as the class. It is what tells the browser which way
   * to draw a scrollbar, a form control and the canvas behind the page, none of
   * which the stylesheet reaches — so a theme that sets only the class is a
   * light page with dark scrollbars.
   */
  it('tells the browser too, not only the stylesheet', () => {
    applyTheme(document.documentElement, 'light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    applyTheme(document.documentElement, 'dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('does nothing without a root, because the server has none', () => {
    expect(() => applyTheme(null, 'light')).not.toThrow()
  })
})

/**
 * The inlined script, actually run.
 *
 * It is a hand-written string wrapped in `try{}catch(e){}`, which means every
 * way it can be wrong is silent: a syntax error, a renamed key, a class that
 * does not match the stylesheet. It throws, the catch swallows it, and the page
 * loads in whatever the markup already said — so the failure looks like "the
 * theme was not remembered this once" rather than "the script never ran".
 *
 * Running it here is the only place that distinction can be made.
 */
describe('the script that runs before the first paint', () => {
  const run = () => {
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
    new Function(THEME_SCRIPT)()
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('parses, which the try/catch around it would otherwise hide', () => {
    expect(() => new Function(THEME_SCRIPT)).not.toThrow()
  })

  it('reads the same key the app writes', () => {
    // Not the literal string: whatever `saveTheme` chose, which is the pairing
    // that actually has to hold.
    saveTheme(localStorage, 'light')
    run()

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('leaves the page dark when nothing was stored', () => {
    run()

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  /*
   * The drift this file exists to catch. `applyTheme` and the script say the
   * same thing twice, in two languages, and nothing makes them agree — so they
   * are compared against each other rather than against a hardcoded 'dark'.
   */
  it('agrees with applyTheme, for every theme there is', () => {
    for (const theme of THEMES) {
      saveTheme(localStorage, theme)
      run()
      const fromScript = {
        dark: document.documentElement.classList.contains('dark'),
        scheme: document.documentElement.style.colorScheme,
      }

      document.documentElement.className = ''
      document.documentElement.style.colorScheme = ''
      applyTheme(document.documentElement, loadTheme(localStorage))

      expect(fromScript).toEqual({
        dark: document.documentElement.classList.contains('dark'),
        scheme: document.documentElement.style.colorScheme,
      })
    }
  })

  it('survives a browser that refuses storage, rather than blocking the paint', () => {
    // Private mode and a locked-down profile both throw on `getItem`. The catch
    // is load-bearing here, which is the one case it should be.
    const denied = () => {
      throw new Error('denied')
    }
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { configurable: true, get: denied })

    expect(() => new Function(THEME_SCRIPT)()).not.toThrow()

    if (original) {
      Object.defineProperty(window, 'localStorage', original)
    }
  })
})
