import { describe, expect, it } from 'vitest'
import { loadUnit, saveUnit } from '@toolpath/ui'

import { UNIT_STORAGE_KEY } from './use-unit'

const store = () => {
  const held = new Map<string, string>()
  return {
    held,
    storage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
    },
  }
}

/**
 * The preference moved out of this application into `@toolpath/ui`, which takes
 * the key instead of naming one. What must not move is the key itself or what
 * the old value under it means: both are already in people's browsers.
 */
describe('the unit this application remembers', () => {
  it('is still keyed where it has always been', () => {
    expect(UNIT_STORAGE_KEY).toBe('part-viewer.unit')
  })

  it('reads a browser that stored the old spelling as inches', () => {
    const { storage } = store()
    storage.setItem(UNIT_STORAGE_KEY, 'in')

    expect(loadUnit(storage, UNIT_STORAGE_KEY)).toBe('inches')
  })

  it('round-trips the current spelling', () => {
    const { storage } = store()

    expect(loadUnit(storage, UNIT_STORAGE_KEY)).toBe('millimeters')
    saveUnit(storage, UNIT_STORAGE_KEY, 'inches')
    expect(loadUnit(storage, UNIT_STORAGE_KEY)).toBe('inches')
  })

  it('keeps the catalog’s preference out of this one', () => {
    const { storage } = store()
    saveUnit(storage, 'tool-catalog.unit', 'inches')

    expect(loadUnit(storage, UNIT_STORAGE_KEY)).toBe('millimeters')
  })
})
