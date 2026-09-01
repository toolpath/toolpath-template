import { describe, expect, it } from 'vitest'
import type { CatalogTool, Gaps } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { highlightsFor, underBy } from './highlights'

const tool = (
  catalogNumber: string,
  geometry: Record<string, number>,
  form = 'flat end mill',
): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    brand: 'Kennametal',
    vendor: 'Kennametal',
    form,
    toolType: 'endmill',
    unitSystem: 'metric',
    geometry: { SFDM: geometry.DC ?? 6, OAL: 80, ...geometry },
    materialGroups: [],
    productLink: null,
    provenance: {},
  }) as unknown as CatalogTool

const pocket = (facts: Record<string, unknown> = {}): PartFeature =>
  ({
    featureTag: 'pocket-1',
    featureType: 'Pocket',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: {
      zMin: -12,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Pocket', cd: { ignore: { min: 10, max: 14 } }, ...facts },
    },
  }) as unknown as PartFeature

const room = (radial: number): Gaps =>
  ({ axial: null, radial: { part: 'nose', r: 14, z: 20, gap: radial, clears: true } }) as Gaps

const labels = (each: ReadonlyArray<{ label: string }>) => each.map((one) => one.label)

describe('what a tool is best for', () => {
  /**
   * Rigidity is not the length-to-diameter ratio. These two have the same
   * L/D — 4 — and the wider one deflects less by the ratio of the diameters,
   * so it is the stiff one. Reading the ratio would have called them equal.
   */
  it('reads stiffness as deflection, not as the ratio', () => {
    const thin = { tool: tool('THIN', { DC: 6 }), stickout: 24 }
    const fat = { tool: tool('FAT', { DC: 12 }), stickout: 48 }

    const found = highlightsFor([thin, fat], null)

    expect(labels(found[0]!)).not.toContain('stiffest')
    expect(labels(found[1]!)).toContain('stiffest')
  })

  /** A superlative is only worth saying when it is clear of the next one. */
  it('says nothing when the best barely beats the runner-up', () => {
    const a = { tool: tool('A', { DC: 10 }), gaps: room(2), stickout: 30 }
    const b = { tool: tool('B', { DC: 10 }), gaps: room(2.05), stickout: 30 }

    const found = highlightsFor([a, b], null)

    expect(found.flatMap(labels)).not.toContain('most clearance')
  })

  it('gives the room to the one that has clearly the most', () => {
    const a = { tool: tool('A', { DC: 10 }), gaps: room(2), stickout: 30 }
    const b = { tool: tool('B', { DC: 10 }), gaps: room(6), stickout: 30 }

    expect(labels(highlightsFor([a, b], null)[1]!)).toContain('most clearance')
  })

  /** A match is about the tool and the feature alone: no comparison, no threshold. */
  it('names a nose that is the floor’s own radius', () => {
    const exact = { tool: tool('BULL', { DC: 8, RE: 1.5 }, 'bull nose end mill') }
    const over = { tool: tool('OVER', { DC: 8, RE: 2 }, 'bull nose end mill') }
    const feature = pocket({ filletRadius: 1.5 })

    const found = highlightsFor([exact, over], feature, [feature])

    expect(labels(found[0]!)).toContain('matches the floor fillet')
    expect(labels(found[1]!)).not.toContain('matches the floor fillet')
  })

  it('names a tool that is the widest the feature admits', () => {
    const feature = pocket()
    const found = highlightsFor([{ tool: tool('TEN', { DC: 10 }) }], feature, [feature])

    expect(labels(found[0]!)).toContain('on size')
  })

  /** Two at most: a row wearing four badges says nothing. */
  it('carries no more than two', () => {
    const feature = pocket({ filletRadius: 1.5 })
    const one = {
      tool: tool('ONE', { DC: 10, RE: 1.5 }, 'bull nose end mill'),
      gaps: room(9),
      stickout: 20,
    }
    const two = {
      tool: tool('TWO', { DC: 4, RE: 0.2 }, 'bull nose end mill'),
      gaps: room(1),
      stickout: 40,
    }

    expect(highlightsFor([one, two], feature, [feature])[0]).toHaveLength(2)
  })

  /** How much smaller than it could be, which is the first thing anybody asks. */
  it('measures how far under the widest the feature admits', () => {
    const feature = pocket()

    expect(underBy(tool('A', { DC: 9.5 }), feature, [feature])).toBeCloseTo(0.5, 6)
    expect(underBy(tool('B', {}), feature, [feature])).toBeNull()
  })
})
