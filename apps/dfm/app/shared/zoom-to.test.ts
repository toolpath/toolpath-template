import { describe, expect, it } from 'vitest'

import { loadZoomTo, saveZoomTo } from './zoom-to'

/**
 * A preference, so it is remembered — the same reasoning as the paint mode and
 * the scene aids. Somebody picks how the wheel behaves once; having to pick it
 * again on the next part turns a preference into a chore.
 */
describe('what the wheel zooms toward', () => {
  const store = (value?: string) => ({
    getItem: () => value ?? null,
    setItem: () => undefined,
  })

  it('zooms to the cursor when nothing has been said', () => {
    // What Fusion does, and what most people reach for.
    expect(loadZoomTo(store())).toBe('cursor')
    expect(loadZoomTo(null)).toBe('cursor')
  })

  it('remembers the other one', () => {
    expect(loadZoomTo(store('centre'))).toBe('centre')
  })

  // A value this release does not offer is not a licence to invent one: it
  // falls back to the default rather than reaching the viewer as nonsense.
  it('ignores anything it does not recognise', () => {
    expect(loadZoomTo(store('somewhere-else'))).toBe('cursor')
  })

  it('writes what it is given', () => {
    const written: string[] = []
    saveZoomTo({ setItem: (_key, value) => written.push(value) }, 'centre')

    expect(written).toEqual(['centre'])
  })
})
