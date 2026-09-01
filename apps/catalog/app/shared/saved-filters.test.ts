import { describe, expect, it } from 'vitest'
import { EMPTY_QUERY } from './filter'
import { read, withFilter, withoutFilter, type SavedFilter } from './saved-filters'

const KEY = 'tool-catalog.saved-filters'

const storage = (value: string | null) => ({
  getItem: (key: string) => (key === KEY ? value : null),
})

const stocked: SavedFilter = { name: 'What we stock', query: EMPTY_QUERY }

describe('reading what a browser kept', () => {
  it('reads back what was written', () => {
    expect(read(storage(JSON.stringify([stocked])))).toEqual([stocked])
  })

  it('is empty with no storage and with nothing stored', () => {
    expect(read(null)).toEqual([])
    expect(read(storage(null))).toEqual([])
  })

  /** One unreadable entry must not lose the ones beside it. */
  it('drops an entry it cannot read and keeps the rest', () => {
    const raw = JSON.stringify([stocked, { name: 'no query' }, { query: {} }, null, 'text'])

    expect(read(storage(raw))).toEqual([stocked])
  })

  /**
   * `typeof null === 'object'`, so a null query passed the check and reached
   * the panel as a query — where every read of it throws.
   */
  it('drops an entry whose query is null', () => {
    expect(read(storage(JSON.stringify([{ name: 'broken', query: null }])))).toEqual([])
  })

  it('is empty for a value that is not JSON, or not a list', () => {
    expect(read(storage('{'))).toEqual([])
    expect(read(storage('{"name":"one"}'))).toEqual([])
  })
})

describe('keeping and forgetting', () => {
  it('replaces a filter saved under a name that exists', () => {
    const renamed = {
      name: 'What we stock',
      query: { ...EMPTY_QUERY, terms: { brand: ['Harvey Tool'] } },
    }

    expect(withFilter([stocked], renamed)).toEqual([renamed])
  })

  it('forgets by name and leaves the others', () => {
    const taps = { name: 'Taps', query: EMPTY_QUERY }

    expect(withoutFilter([stocked, taps], 'Taps')).toEqual([stocked])
    expect(withoutFilter([stocked], 'Nothing')).toEqual([stocked])
  })
})
