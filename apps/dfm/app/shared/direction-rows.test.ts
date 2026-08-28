import { describe, expect, it } from 'vitest'

import type { PartReport } from './contracts'
import { directionRows } from './direction-rows'
import { testPart } from './test-part'

const cube = testPart()

describe('what each direction reaches, before anything is planned', () => {
  it('gives one row per candidate direction the Engine reported', () => {
    expect(directionRows(cube)).toHaveLength(cube.candidateDirections.length)
  })

  it('counts a region once however many of that directions features cover it', () => {
    // The same de-duplication coverage uses. Two readings of one face from the
    // same way up have reached one face.
    for (const row of directionRows(cube)) {
      expect(row.regions).toBeLessThanOrEqual(cube.regions.length)
      expect(row.share).toBeLessThanOrEqual(1)
    }
  })

  it('attributes every feature to exactly one direction on this part', () => {
    const rows = directionRows(cube)
    const counted = rows.reduce((total, row) => total + row.features, 0)

    expect(counted).toBe(cube.features.length)
  })

  it('names each direction the way the rest of the app names it', () => {
    // +Z here and "(0.00, 0.00, 1.00)" in the panel beside it would read as two
    // different directions.
    expect(directionRows(cube).map((row) => row.label)).toEqual(['+Z', '−Z', '+Y', '−Y'])
  })

  it('reads nothing for a part with no regions', () => {
    const bare = { ...cube, regions: [], features: [] } as unknown as PartReport

    for (const row of directionRows(bare)) {
      expect(row.share).toBe(0)
      expect(row.features).toBe(0)
    }
  })
})
