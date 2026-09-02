import { describe, expect, it } from 'vitest'

import { loadBanana, saveBanana } from './banana'

/**
 * Furniture, so it is remembered — the same reasoning as the wheel's zoom
 * target and the scene aids, and tested the same way.
 *
 * Off by default matters more here than it looks: this is the one piece of
 * scene furniture that is a joke, and a part that arrives with a banana beside
 * it unasked reads as a bug in somebody else's demo.
 */
const store = (value?: string) => ({
  getItem: () => value ?? null,
  setItem: () => undefined,
})

describe('whether the banana is standing beside the part', () => {
  it('is away until somebody asks for it', () => {
    expect(loadBanana(store())).toBe(false)
    expect(loadBanana(null)).toBe(false)
  })

  it('remembers being asked for', () => {
    expect(loadBanana(store('on'))).toBe(true)
  })

  /*
   * Written as `on`/`off` and read as "is it exactly `on`", so anything else is
   * away rather than something. Worth pinning because the pair is asymmetric:
   * a truthiness test here would read the stored `off` as yes.
   */
  it('reads a stored no as no, not as something stored', () => {
    expect(loadBanana(store('off'))).toBe(false)
  })

  it('ignores anything it does not recognise', () => {
    expect(loadBanana(store('yes'))).toBe(false)
  })

  it('round-trips both ways through what it writes', () => {
    for (const shown of [true, false]) {
      let written: string | null = null
      saveBanana({ setItem: (_key, value) => (written = value) }, shown)

      expect(loadBanana({ getItem: () => written })).toBe(shown)
    }
  })

  it('survives having no storage', () => {
    expect(() => saveBanana(null, true)).not.toThrow()
  })
})
