import { describe, expect, it } from 'vitest'
import type { PublicInspectionReport } from './contracts'
import { duration, partSummary, pluralLabel, typeLabel } from './part-summary'

const PZ = { x: 0, y: 0, z: 1 }
const NY = { x: 0, y: -1, z: 0 }

const feature = (type: string, direction = PZ) => ({
  featureId: type,
  featureTag: `${type}-${direction.z}`,
  featureType: type,
  regionIdxs: [0],
  machiningDirection: direction,
  axis: null,
})

const report = {
  features: [feature('wall'), feature('wall', NY), feature('blind_hole'), feature('boss')],
  regions: [{ idx: 0 }, { idx: 1 }],
  candidateDirections: [PZ, NY],
  meshTriangleCount: 59844,
  meshPointCount: 29894,
  downloadMs: 92,
  recognitionMs: 40000,
  enrichmentMs: 2160,
  totalMs: 42780,
} as unknown as PublicInspectionReport

describe('partSummary', () => {
  it('counts the geometry the report describes', () => {
    const summary = partSummary(report)

    expect(summary).toMatchObject({ features: 4, regions: 2, triangles: 59844, points: 29894 })
  })

  it('counts the features cut from each way up', () => {
    expect(partSummary(report).directions).toEqual([
      { index: 0, label: '+Z', features: 3 },
      { index: 1, label: '−Y', features: 1 },
    ])
  })

  it('counts how many of each type come from the direction being held', () => {
    const summary = partSummary(report, 1)

    // Held against the total, so "61 walls, 20 of them from −Z" is one line
    // rather than two lists to compare.
    expect(summary.types.map((entry) => [entry.label, entry.features, entry.inDirection])).toEqual([
      ['Wall', 2, 1],
      ['Blind hole', 1, 0],
      ['Boss', 1, 0],
    ])
  })

  it('counts nothing against no question', () => {
    // A column equal to the one beside it is a column nobody reads.
    for (const entry of partSummary(report).types) {
      expect(entry.inDirection).toBeNull()
    }
  })

  it('lists the feature types commonest first', () => {
    // The long tail of one-off types is the part nobody scans; at the top it
    // buries what the part is made of.
    expect(partSummary(report).types.map((entry) => entry.label)).toEqual([
      'Wall',
      'Blind hole',
      'Boss',
    ])
  })

  it('sums the analysis phases the API reports separately', () => {
    // Recognition and enrichment were one number once; adding them keeps this
    // meaning what it always meant rather than reading zero on a newer report.
    expect(partSummary(report).timing.analysis).toBe(42160)
  })

  it('keeps a direction no feature is cut from', () => {
    const unused = { ...report, features: [feature('wall')] } as unknown as PublicInspectionReport

    // A way up nothing uses is still a way up the part can be held.
    expect(partSummary(unused).directions[1]).toEqual({ index: 1, label: '−Y', features: 0 })
  })
})

describe('duration', () => {
  it('stays in milliseconds until they stop being readable', () => {
    expect(duration(92)).toBe('92 ms')
    expect(duration(42780)).toBe('42.78 s')
  })
})

describe('naming a feature type', () => {
  it('reads as a noun phrase rather than a heading', () => {
    // A column of title-cased types reads as a list of headings, and the
    // mapping panel names a reading the same way this list does.
    expect(typeLabel('through_hole')).toBe('Through hole')
    expect(typeLabel('undercut_filleted_tslot')).toBe('Undercut filleted tslot')
    expect(typeLabel('Wall')).toBe('Wall')
    // camelCase is left alone: the Engine reports both spellings depending on
    // kernel version, and splitting one of them renames types across a page.
    expect(typeLabel('BlindHole')).toBe('BlindHole')
  })
})

describe('the same label, said of several', () => {
  it('says a row of sixteen as sixteen', () => {
    // A singular in front of a count makes the reader correct it themselves.
    expect(pluralLabel(typeLabel('blind_hole'))).toBe('Blind holes')
    expect(pluralLabel(typeLabel('pocket'))).toBe('Pockets')
  })

  it('takes -es after a sibilant, which is where the regular rule earns its keep', () => {
    expect(pluralLabel('Boss')).toBe('Bosses')
    expect(pluralLabel('Notch')).toBe('Notches')
  })

  it('works on the datasheet heading, which is title-cased', () => {
    expect(pluralLabel('Blind Hole')).toBe('Blind Holes')
  })
})
