import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  FIELDS,
  SHEET,
  defaultsFor,
  featureKey,
  parseCondition,
  parseSheet,
  readingsFor,
} from './feature-defaults'

/**
 * Every member of the kernel's `FeatureType` enum, v0.6.1.
 *
 * Listed here rather than imported because the enum lives in the kernel's
 * own package: this is the sheet's contract with the API, and a kernel that
 * adds a type is a row somebody has to write.
 */
const KERNEL_FEATURE_TYPES = [
  'ThroughHole',
  'BlindHole',
  'ThroughPocket',
  'Pocket',
  'OpenPocket',
  'Profile',
  'Boss',
  'Face',
  'Sink',
  'Chamfer',
  'Fillet',
  'ContourSurface',
  'FilletedPocket',
  'Thread',
  'FilletedOpenPocket',
  'FilletedBlindHole',
  'Wall',
  'SlantedFace',
  'InnerFillet',
  'OuterFillet',
  'SyntheticHole',
  'FilletedBoss',
  'UndercutTslot',
  'UndercutDovetail',
  'UndercutFilletedTslot',
  'BackSink',
  'BackChamfer',
  'UndercutWall',
  'USlot',
  'UndercutFilletedDovetail',
  'TaperedThroughHole',
  'ThreadedBlindHole',
  'ThreadedThroughHole',
]

const HEADER = 'feature,when,show,tool types,flutes,brand,holder,collet,notes'

const feature = (
  featureType: string,
  facts: Record<string, unknown> = {},
  sheet: Record<string, unknown> = {},
): PartFeature =>
  ({
    featureTag: featureType,
    featureType,
    regionIdxs: [],
    machiningDirection: { x: 0, y: 0, z: 1 },
    datasheet: { facts, ...sheet },
  }) as unknown as PartFeature

describe('the committed sheet', () => {
  it('parses with nothing to report', () => {
    expect(SHEET.problems).toEqual([])
  })

  /** A kernel type with no row is a feature the panel has nothing to say about. */
  it('has a row that always applies for every feature type the kernel reports', () => {
    const plain = new Set(
      SHEET.rows.filter((row) => row.when === '').map((row) => featureKey(row.feature)),
    )
    const missing = KERNEL_FEATURE_TYPES.filter((type) => !plain.has(featureKey(type)))

    expect(missing).toEqual([])
  })

  it('names no feature the kernel does not have', () => {
    const known = new Set(KERNEL_FEATURE_TYPES.map(featureKey))
    const unknown = SHEET.rows
      .map((row) => row.feature)
      .filter((name) => !known.has(featureKey(name)))

    expect(unknown).toEqual([])
  })

  /** The first matching row wins, so a plain row above a conditional one hides it for ever. */
  it('puts every conditional row before the plain row for its feature', () => {
    const seenPlain = new Set<string>()
    const hidden: Array<string> = []
    for (const row of SHEET.rows) {
      const key = featureKey(row.feature)
      if (row.when === '') {
        seenPlain.add(key)
      } else if (seenPlain.has(key)) {
        hidden.push(`${row.feature} when ${row.when}`)
      }
    }

    expect(hidden).toEqual([])
  })

  it('offers at least one tool type on every row', () => {
    expect(
      SHEET.rows.filter((row) => row.toolTypes.length === 0).map((row) => row.feature),
    ).toEqual([])
  })
})

describe('reading the sheet', () => {
  it('reads lists in priority order and trims what people type', () => {
    const { rows, problems } = parseSheet(
      `${HEADER}\nPocket,, feature depth ; L/D , flat end mill; bull nose end mill ,>= 4,Kennametal; WIDIA,BT30,ER16,note`,
    )

    expect(problems).toEqual([])
    expect(rows[0]).toMatchObject({
      show: ['feature depth', 'L/D'],
      toolTypes: ['flat end mill', 'bull nose end mill'],
      flutes: '>= 4',
      brand: ['Kennametal', 'WIDIA'],
      holder: 'BT30',
      collet: 'ER16',
    })
  })

  /** A row with a problem is dropped whole: a filter from a mistyped field is a filter nobody can see. */
  it('names the line and the mistake, and drops the row', () => {
    const { rows, problems } = parseSheet(
      `${HEADER}\nPocket,,feature depht,flat end mill,,,,,\nPocket,,feature depth,flat endmill,,,,,\nPocket,,feature depth,flat end mill,lots,,,,`,
    )

    expect(rows).toEqual([])
    expect(problems.map((each) => each.line)).toEqual([2, 3, 4])
    expect(problems[0]?.message).toContain('"feature depht" is not a field')
    expect(problems[1]?.message).toContain('"flat endmill" is not a tool type')
    expect(problems[2]?.message).toContain('"lots" is not a flutes rule')
  })

  it('refuses a sheet whose header has lost a column', () => {
    const { problems } = parseSheet('feature,show\nPocket,feature depth')

    expect(problems[0]?.message).toContain('missing a "when" column')
  })

  it('matches a feature by name however it is written', () => {
    expect(featureKey('FilletedOpenPocket')).toBe(featureKey('filleted_open_pocket'))
    expect(featureKey('U Slot')).toBe(featureKey('USlot'))
  })
})

describe('conditions', () => {
  const sheetOf = (facts: Record<string, unknown>) => ({
    facts,
    curve: null,
    zMin: -10,
    zMax: 0,
    top: 0,
  })

  it('knows the named ones', () => {
    const filleted = parseCondition('filleted')
    const flat = parseCondition('flat bottom')
    if ('error' in filleted || 'error' in flat) {
      throw new Error('should parse')
    }

    expect(filleted.condition(sheetOf({ filletRadius: 1 }))).toBe(true)
    expect(filleted.condition(sheetOf({ filletRadius: 0 }))).toBe(false)
    expect(flat.condition(sheetOf({ fullConeDeg: 180 }))).toBe(true)
    expect(flat.condition(sheetOf({ fullConeDeg: 118 }))).toBe(false)
  })

  it('compares any numeric field, and joins with and', () => {
    const parsed = parseCondition('tip angle < 180 and feature depth >= 10')
    if ('error' in parsed) {
      throw new Error(parsed.error)
    }

    expect(parsed.condition(sheetOf({ fullConeDeg: 118 }))).toBe(true)
    expect(parsed.condition(sheetOf({ fullConeDeg: 180 }))).toBe(false)
  })

  it('says what it could not read', () => {
    const parsed = parseCondition('deepish')

    expect('error' in parsed && parsed.error).toContain('"deepish" is not a condition')
  })
})

describe('what a feature gets', () => {
  it('takes the first row whose condition holds', () => {
    const { rows } = parseSheet(
      `${HEADER}\nBlindHole,flat bottom,feature depth,flat end mill,,,,,\nBlindHole,,feature depth,drill,,,,,`,
    )

    expect(defaultsFor(feature('BlindHole', { fullConeDeg: 180 }), [], rows)?.toolTypes).toEqual([
      'flat end mill',
    ])
    expect(defaultsFor(feature('blind_hole', { fullConeDeg: 118 }), [], rows)?.toolTypes).toEqual([
      'drill',
    ])
  })

  it('reads each shown field off the datasheet, in the sheet’s order, leaving out what is not stated', () => {
    const hole = feature(
      'ThroughHole',
      { kind: 'Hole', diameter: 6, maxDrillDiameter: 6, fullConeDeg: 118 },
      { zMax: 0, zMin: -12, extendedZMax: 0 },
    )
    const readings = readingsFor(
      hole,
      [hole],
      ['L/D', 'largest drill diameter', 'floor fillet radius', 'tip angle'],
    )

    expect(readings.map((each) => [each.name, each.value])).toEqual([
      ['L/D', 2],
      ['largest drill diameter', 6],
      ['tip angle', 118],
    ])
  })

  it('reads a sink’s cone as its outer and pilot circles', () => {
    const sink = feature('Sink', {
      kind: 'Chamfer',
      bevel: { angleDeg: 45, countersink: { innerRadius: 2, outerRadius: 5 } },
    })

    expect(
      readingsFor(
        sink,
        [sink],
        ['chamfer angle', 'largest tool diameter', 'smallest tool diameter'],
      ).map((each) => each.value),
    ).toEqual([45, 10, 4])
  })

  /** Every field the guide lists is one the reader knows, or the guide is lying. */
  it('has a reader for every field the sheet may name', () => {
    for (const name of Object.keys(FIELDS)) {
      expect(typeof FIELDS[name]?.read).toBe('function')
    }
  })
})
