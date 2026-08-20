import { describe, expect, it } from 'vitest'
import type { PartFeature } from './contracts'
import { measurements, partTop, stripMeasurements } from './measurements'

/**
 * The datasheet is dozens of fields under the Engine's own names. These are the
 * handful of questions anybody actually asks of one, and the arithmetic that
 * turns the fields into them.
 */

const PZ = { x: 0, y: 0, z: 1 }
const NY = { x: 0, y: -1, z: 0 }

type FeatureFixture = Omit<Partial<PartFeature>, 'datasheet'> & { datasheet?: unknown }

const fixtureDatasheet = (value: unknown) => {
  const sheet = (value ?? {}) as Record<string, unknown>
  const factOverrides = (sheet.facts ?? {}) as Record<string, unknown>
  const { facts: _facts, ...sheetFields } = sheet
  const zMin = typeof sheet.zMin === 'number' ? sheet.zMin : 0
  const zMax = typeof sheet.zMax === 'number' ? sheet.zMax : 0

  return {
    featureType: 'Pocket',
    zMin,
    zMax,
    extendedZMin: typeof sheet.extendedZMin === 'number' ? sheet.extendedZMin : zMin,
    extendedZMax: typeof sheet.extendedZMax === 'number' ? sheet.extendedZMax : zMax,
    radialStockToLeave: 0,
    axialStockToLeave: 0,
    toleranceBand: { atolIgnore: 0, atolDeviate: 0, atolMax: 0 },
    hasFloor: false,
    hasWall: false,
    floorishArea: 0,
    wallishArea: 0,
    facts: {
      kind: 'Pocket',
      cd: {
        ignore: { min: 0, max: 0 },
        deviate: { min: 0, max: 0 },
        effectiveAdaptive: { min: 0, max: 0 },
        terminalCornerRadius: 0,
      },
      maxBottomDiameter: 0,
      filletRadius: 0,
      filletHeight: 0,
      ...factOverrides,
    },
    ...sheetFields,
  } as never
}

const feature = (over: FeatureFixture): PartFeature => {
  const { datasheet, ...rest } = over

  return {
    featureId: 'id',
    featureTag: 'tag',
    featureType: 'pocket',
    regionIdxs: [1],
    machiningDirection: PZ,
    axis: null,
    datasheet:
      datasheet === undefined || datasheet === null ? datasheet : fixtureDatasheet(datasheet),
    ...rest,
  } as PartFeature
}

const regions = [
  { idx: 1, shapeKind: 'Plane' },
  { idx: 2, shapeKind: 'Cylinder' },
  { idx: 3, shapeKind: 'Cylinder' },
]

const rowsFor = (subject: PartFeature, others: PartFeature[] = [], unit: 'mm' | 'in' = 'mm') =>
  measurements({ feature: subject, features: [subject, ...others], regions, unit })

const valueOf = (subject: PartFeature, key: string, others: PartFeature[] = []) =>
  rowsFor(subject, others).find((row) => row.key === key)?.value

describe('partTop', () => {
  it('is the highest zMax of everything cut the same way up', () => {
    const subject = feature({ datasheet: { zMax: 10, zMin: 4 } })
    const taller = feature({ datasheet: { zMax: 25, zMin: 0 } })

    // The report carries no part top, so this stands in for it.
    expect(partTop([subject, taller], subject)).toBe(25)
  })

  it('ignores features cut from another direction', () => {
    const subject = feature({ datasheet: { zMax: 10, zMin: 4 } })
    const sideways = feature({ machiningDirection: NY, datasheet: { zMax: 99, zMin: 0 } })

    // A tall feature reached from the side says nothing about how far a tool
    // travels coming down from above.
    expect(partTop([subject, sideways], subject)).toBe(10)
  })

  it('is null when nothing cut that way reports a depth', () => {
    expect(partTop([feature({ datasheet: null })], feature({ datasheet: null }))).toBeNull()
  })
})

describe('measurements', () => {
  it('reads depth from the part top rather than from the feature', () => {
    const subject = feature({ datasheet: { zMax: 10, zMin: 4 } })
    const taller = feature({ datasheet: { zMax: 25, zMin: 0 } })

    expect(valueOf(subject, 'depthBelowTop', [taller])).toBe('21.00 mm')
    // Its own extent is a different question, and both are worth having.
    expect(valueOf(subject, 'featureDepth', [taller])).toBe('6.00 mm')
  })

  it('uses feature bounds rather than the extended approach range for depth', () => {
    const subject = feature({ datasheet: { extendedZMax: 12, zMax: 10, extendedZMin: 2, zMin: 4 } })

    expect(valueOf(subject, 'featureDepth')).toBe('6.00 mm')
  })

  it('reads the terminal tool off the band every feature carries', () => {
    // The bottom of the band, not the top: anything wider stops short of the
    // tightest corner. The per-kind fields are richer, but a hole is the only
    // kind that has them, and a pocket showing no tool at all is why this row
    // exists.
    const subject = feature({
      datasheet: { facts: { kind: 'Pocket', cd: { ignore: { min: 6, max: 16 } } } },
    })

    expect(valueOf(subject, 'maxTool')).toBe('6.00 mm')
  })

  it('splits surface area into walls and floors, since the Engine does', () => {
    const subject = feature({ datasheet: { wallishArea: 40, floorishArea: 60 } })
    const rows = rowsFor(subject)

    expect(rows.find((row) => row.key === 'area')?.value).toBe('100.00 mm²')
    expect(rows.find((row) => row.key === 'walls')?.value).toBe('40.00 mm²')
    expect(rows.find((row) => row.key === 'floors')?.value).toBe('60.00 mm²')
  })

  it('counts faces by the shape the Engine gave them', () => {
    const subject = feature({ regionIdxs: [1, 2, 3] })

    expect(valueOf(subject, 'faces')).toBe('2 × Cylinder, 1 × Plane')
  })

  it('measures a hole against its bore and a pocket against its cutter', () => {
    const hole = feature({
      datasheet: { zMax: 10, zMin: 0, facts: { kind: 'Hole', diameter: 5 } },
    })
    const pocket = feature({
      datasheet: { zMax: 10, zMin: 0, facts: { kind: 'Pocket', cd: { ignore: { min: 4 } } } },
    })

    // Nothing wider than the bore goes in it, so a hole is judged on diameter.
    expect(rowsFor(hole).find((row) => row.key === 'ld')?.label).toBe('Drilling L/D')
    expect(valueOf(hole, 'ld')).toBe('2.00')
    expect(rowsFor(pocket).find((row) => row.key === 'ld')?.label).toBe('Milling L/D')
  })

  /**
   * A row left out rather than shown empty: "—" against a field the Engine
   * never reports for this type reads as a measurement that failed, and a wall
   * carries almost none of them.
   */
  it('leaves out what this feature type does not report', () => {
    const wall = feature({ featureType: 'wall', datasheet: null })
    const keys = rowsFor(wall).map((row) => row.key)

    expect(keys).toEqual(['faces'])
  })

  it('says where every number came from', () => {
    const subject = feature({ datasheet: { zMax: 10, zMin: 4, wallishArea: 1 } })

    // A number a shop cannot trace is one they have to take on faith.
    for (const row of rowsFor(subject)) expect(row.from).not.toBe('')
  })
})

describe('the unit it is read in', () => {
  it('converts every length and area, and keeps the arithmetic in millimetres', () => {
    const subject = feature({ datasheet: { zMax: 8.89, zMin: 0, wallishArea: 806.45 } })
    const inches = rowsFor(subject, [], 'in')

    // The Engine reports millimetres; the conversion happens where it is shown.
    expect(inches.find((row) => row.key === 'featureDepth')?.value).toBe('0.350 in')
    expect(inches.find((row) => row.key === 'walls')?.value).toBe('1.250 in²')
  })
})

describe('stripMeasurements', () => {
  it('picks the numbers a tool is chosen with, in a fixed order', () => {
    const subject = feature({
      datasheet: { zMax: 10, zMin: 4, wallishArea: 1, floorishArea: 1 },
    })

    const strip = stripMeasurements(rowsFor(subject))
    expect(strip.map((row) => row.key)).toEqual(['depthBelowTop', 'featureDepth', 'area'])
  })

  it('is a selection from the same rows the table shows, so the two agree', () => {
    const subject = feature({ datasheet: { zMax: 10, zMin: 4 } })
    const rows = rowsFor(subject)

    for (const row of stripMeasurements(rows)) expect(rows).toContain(row)
  })
})

describe('the tools a feature admits', () => {
  const feature = (facts: Record<string, unknown>) =>
    ({
      featureTag: 'f-1',
      featureType: 'blind_hole',
      regionIdxs: [0],
      machiningDirection: { x: 0, y: 0, z: 1 },
      datasheet: { facts: { kind: 'Hole', ...facts }, zMax: 0, zMin: -10, partZMax: 0 },
    }) as never

  const rows = (facts: Record<string, unknown>) => {
    const one = feature(facts)
    return measurements({ feature: one, features: [one], regions: [], unit: 'mm' })
  }

  it('states the drill and the endmill separately, as the Engine does', () => {
    // Which of the two a shop reaches for is the difference between one plunge
    // and a helix, so neither stands in for the other.
    const shown = rows({ maxDrillDiameter: 6.35, maxEndmillDiameter: 10 })

    expect(shown.find((row) => row.key === 'maxDrill')?.value).toContain('6.35')
    expect(shown.find((row) => row.key === 'maxEndmill')?.value).toContain('10.00')
  })

  it('states what gets into an undercut, which is not what fits once there', () => {
    const shown = rows({ kind: 'Tslot', maxEntryCd: 3.175 })

    expect(shown.find((row) => row.key === 'entryCutter')?.from).toBe('facts.maxEntryCd')
    expect(shown.find((row) => row.key === 'entryCutter')?.value).toContain('3.17')
  })

  it('leaves a row out rather than showing a tool the Engine never named', () => {
    // A dash against a field this type never reports reads as a measurement
    // that failed.
    const shown = rows({})

    expect(shown.some((row) => ['maxDrill', 'maxEndmill', 'entryCutter'].includes(row.key))).toBe(
      false,
    )
  })
})

describe('a chamfer says what angle it is', () => {
  const chamfer = (facts: Record<string, unknown>) =>
    ({
      featureTag: 'chamfer-1',
      featureType: 'chamfer',
      regionIdxs: [0],
      machiningDirection: { x: 0, y: 0, z: -1 },
      datasheet: { facts: { kind: 'Chamfer', ...facts }, zMax: 0, zMin: -0.18, partZMax: 0 },
    }) as never

  const angleOf = (subject: never) => {
    const rows = measurements({ feature: subject, features: [subject], regions: [], unit: 'in' })
    return rows.find((row) => row.key === 'bevelAngle')
  }

  it('reads it where the Engine puts it', () => {
    // Under `bevel`, which is why the panel showed no angle while the rule
    // judging chamfer angles read one off the same datasheet.
    expect(angleOf(chamfer({ bevel: { angleDeg: 56 } }))?.value).toBe('56.0°')
  })

  it('says nothing where the Engine reported no angle', () => {
    expect(angleOf(chamfer({}))).toBeUndefined()
  })
})
