import { describe, expect, test } from 'vitest'
import { loadShowAids, saveShowAids } from './scene-aids'

const store = (value?: string) => {
  const items = new Map(value === undefined ? [] : [['part-viewer:scene-aids', value]])
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, next: string) => void items.set(key, next),
  }
}

describe('the grid and triad preference', () => {
  test('leaves them off until somebody asks for them', () => {
    expect(loadShowAids(store())).toBe(false)
    expect(loadShowAids(null)).toBe(false)
    expect(loadShowAids(store('nonsense'))).toBe(false)
  })

  test('remembers the choice, in both directions', () => {
    const storage = store()
    saveShowAids(storage, false)
    expect(loadShowAids(storage)).toBe(false)
    saveShowAids(storage, true)
    expect(loadShowAids(storage)).toBe(true)
  })
})
