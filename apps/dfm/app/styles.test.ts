import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The stylesheet's two contracts with the rest of the app.
 *
 * Neither is visible in a component and neither is caught by rendering one, so
 * they are pinned here against the file itself.
 */
const css = readFileSync('app/styles.css', 'utf8')

describe('the resets sit in a layer', () => {
  /*
   * `button, input { font: inherit }` sat outside every cascade layer, and an
   * unlayered rule beats a layered one whatever the specificity — so every font
   * utility Tailwind generated for a button lost to it silently. The classes
   * were in the markup, the rules were in the stylesheet, and nothing happened:
   * `text-3xs font-mono` on the size reading rendered 16px Open Sans.
   */
  it('resets fonts inside @layer base, where a utility can still win', () => {
    const layered = css.indexOf('@layer base')

    expect(layered).toBeGreaterThan(-1)
    expect(css.slice(layered)).toContain('font: inherit')
    expect(css.slice(0, layered)).not.toContain('font: inherit')
  })
})

describe('every role is defined in both themes', () => {
  /*
   * A role defined in one theme and not the other is a colour that silently
   * keeps the other theme's value — which is how a panel stays near-black on a
   * white page. Cheaper to compare the two blocks than to find that by eye.
   */
  const rolesIn = (selector: string) => {
    const at = css.indexOf(selector)
    const block = css.slice(at, css.indexOf('}', at))

    return new Set([...block.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]))
  }

  it('names the same roles under :root and .dark', () => {
    const light = rolesIn(':root {')
    const dark = rolesIn('.dark {')

    expect(light.size).toBeGreaterThan(10)
    expect([...light].filter((role) => !dark.has(role) && role !== '--color-scheme')).toEqual([])
    expect([...dark].filter((role) => !light.has(role))).toEqual([])
  })
})
