import { describe, expect, it } from 'vitest'
import { EMPTY_QUERY } from './filter'
import { HOLDING_AXES, splitHolding } from './holding'

describe('holding is a filter, but not a filter on a tool', () => {
  /**
   * `filterTools` excludes anything whose key it cannot find on a tool. A taper
   * is a holder's, not a cutter's, so leaving it in the query it reads is the
   * same shape of bug as `?job=` — every tool excluded, and a silently empty
   * list.
   */
  it('takes the holding keys out of the query the tools answer', () => {
    const query = {
      ...EMPTY_QUERY,
      terms: { toolType: ['drill'], taper: ['BT30'], colletSeries: ['ER16'] },
    }

    const { tools, holding } = splitHolding(query)

    expect(tools.terms).toEqual({ toolType: ['drill'] })
    expect(holding).toEqual({ taper: 'BT30', colletSeries: 'ER16' })
  })

  it('asks nothing of the crib when nothing was chosen', () => {
    expect(splitHolding(EMPTY_QUERY).holding).toEqual({ taper: null, colletSeries: null })
  })

  /** Everything else about the query — text, ranges — goes through untouched. */
  it('leaves the rest of the query alone', () => {
    const query = { ...EMPTY_QUERY, text: 'TDMX', ranges: { DC: { max: 6 } } }

    expect(splitHolding(query).tools).toEqual(query)
  })

  it('names the axes it owns', () => {
    expect([...HOLDING_AXES]).toEqual(['taper', 'colletSeries'])
  })
})
