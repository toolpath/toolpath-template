import { describe, expect, it } from 'vitest'
import { FLAG_DEFAULTS, readFlags, writeFlags } from './flags'

const store = (held: string | null = null) => {
  const kept = new Map<string, string>()
  if (held !== null) {
    kept.set('tool-catalog.flags', held)
  }
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => kept.set(key, value),
  }
}

describe('flags kept in the browser', () => {
  it('reads the defaults where nothing has been set', () => {
    expect(readFlags(store())).toEqual(FLAG_DEFAULTS)
  })

  /** The whole point: a shape that ships on has to be switchable off. */
  it('reads a flag somebody turned off', () => {
    expect(readFlags(store('{"assemblyTree":false}')).assemblyTree).toBe(false)
  })

  it('keeps what was written', () => {
    const storage = store()
    writeFlags(storage, { ...FLAG_DEFAULTS, assemblyTree: false })
    expect(readFlags(storage).assemblyTree).toBe(false)
  })

  it('reads unreadable storage as the defaults rather than throwing', () => {
    expect(readFlags(store('not json'))).toEqual(FLAG_DEFAULTS)
  })

  /**
   * A flag stored as something other than a boolean is somebody else's key or a
   * shape that has moved on; the default stands rather than a truthy string.
   */
  it('ignores a value that is not a boolean', () => {
    expect(readFlags(store('{"assemblyTree":"yes"}'))).toEqual(FLAG_DEFAULTS)
  })

  it('reads no storage at all as the defaults', () => {
    expect(readFlags(null)).toEqual(FLAG_DEFAULTS)
  })
})
