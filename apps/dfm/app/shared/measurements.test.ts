import { describe, expect, it } from 'vitest'
import type { PartFeature } from './contracts'
import type { UnitSystem } from '@toolpath/tool-support'
import { measurements, partTop, stripMeasurements } from './measurements'
import { METRIC_BY_ID, partContext, readMetrics, sharpCorner } from './metrics'
import { evaluateFeature, scoreFeature } from './rules'
import { DEFAULT_RULES } from './rule-presets'
import type { FeatureDatasheet } from '@toolpath/api'

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

const rowsFor = (
  subject: PartFeature,
  others: Array<PartFeature> = [],
  unit: UnitSystem = 'millimeters',
) => measurements({ feature: subject, features: [subject, ...others], regions, unit })

const valueOf = (subject: PartFeature, key: string, others: Array<PartFeature> = []) =>
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
    for (const row of rowsFor(subject)) {
      expect(row.from).not.toBe('')
    }
  })
})

describe('the unit it is read in', () => {
  it('converts every length and area, and keeps the arithmetic in millimetres', () => {
    const subject = feature({ datasheet: { zMax: 8.89, zMin: 0, wallishArea: 806.45 } })
    const inches = rowsFor(subject, [], 'inches')

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

    for (const row of stripMeasurements(rows)) {
      expect(rows).toContain(row)
    }
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
    return measurements({ feature: one, features: [one], regions: [], unit: 'millimeters' })
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
    const rows = measurements({
      feature: subject,
      features: [subject],
      regions: [],
      unit: 'inches',
    })
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

describe('the corner nothing can cut', () => {
  /*
   * `Sharp internal corners` asks **the widest cutter that fits**, and the
   * question it asks of it is a threshold rather than a test for zero.
   *
   * Zero is the Engine saying no tool fits at all, which is plainly a sharp
   * corner — but so is a band of two tenths of a millimetre, because nobody
   * owns that cutter and nobody would run it if they did. Paul's line: anything
   * needing a 0.01 in tool is effectively a sharp corner. Where exactly that
   * falls is a shop's to draw, so the rule draws it and the metric stays a
   * plain report of the band.
   */
  const widest = METRIC_BY_ID.get('minCutterDiameter')!
  const band = (min: number | undefined) =>
    ({ facts: { cd: { ignore: min === undefined ? {} : { min, max: 9 } } } }) as never

  it('reports the band as stated, zero and all', () => {
    expect(widest.read(band(0), {} as never)).toBe(0)
    expect(widest.read(band(6.6), {} as never)).toBe(6.6)
  })

  // Absent is silence, not a refusal — a rule with a floor must not fire on a
  // feature nobody measured.
  it('says nothing where the band is absent', () => {
    expect(widest.read(band(undefined), {} as never)).toBeNull()
    expect(widest.read({ facts: {} } as never, {} as never)).toBeNull()
  })

  /*
   * The rule's own line, in the units the model works in. A tenth of a
   * millimetre is under it and a 1/8 in cutter is well clear, which is the
   * whole of what this number has to get right.
   */
  it('draws the line at a cutter nobody holds', () => {
    const rule = DEFAULT_RULES.find((each) => each.id === 'sharp-corners')

    expect(rule?.type).toBe('flag')
    expect(rule).toMatchObject({ op: '≤', against: 0.254, raises: 'no go' })
  })

  // The boolean the app read for months. Kept, because where the Engine states
  // it, it is the Engine's own answer — it is only ever reported on `Three`.
  it('still reads hasSharpCorner where the Engine states one', () => {
    const stated = (hasSharpCorner: boolean) =>
      ({ facts: { kind: 'Three', hasSharpCorner } }) as unknown as FeatureDatasheet

    expect(sharpCorner(stated(true))).toBe(true)
    expect(sharpCorner(stated(false))).toBe(false)
    expect(sharpCorner({ facts: { kind: 'Pocket' } } as unknown as FeatureDatasheet)).toBeNull()
  })
})

describe('a feature no tool fits', () => {
  /*
   * Paul's, off a `Wall` whose `facts.cd.ignore.min` is 0.
   *
   * The reach-against-cutter ratio of a feature no tool fits is not unknown —
   * it is **unbounded**, which is the worst answer there is. The panel showed
   * nothing at all: `cutterFromBand` skips a band reported as zero, because a
   * zero-width cutter cannot be divided by, and where every band was zero it
   * answered `null`. Null reads as "the Engine did not say", so every rule
   * taking a ratio against the cutter went quiet on exactly the features that
   * most deserve one.
   */
  const milling = METRIC_BY_ID.get('millingLD')!
  const wall = (min: number) =>
    ({
      facts: { kind: 'Wall', cd: { ignore: { min, max: null } } },
      zMin: 22.987,
      zMax: 27.94,
    }) as never

  it('reads an unbounded ratio where no cutter fits', () => {
    expect(milling.read(wall(0), { partTopZ: 27.94 } as never)).toBe(Number.POSITIVE_INFINITY)
  })

  it('still reads an ordinary ratio where one does', () => {
    expect(milling.read(wall(5), { partTopZ: 27.94 } as never)).toBeCloseTo(4.953 / 5, 3)
  })

  // Unbounded is past the last limit of every scale, so the rule lands on its
  // worst band rather than saying nothing.
  it('lands past the last limit of the rule that reads it', () => {
    const rule = DEFAULT_RULES.find((each) => each.id === 'milling-ld')

    expect(rule?.type).toBe('threshold')
    expect(Number.POSITIVE_INFINITY > ((rule as { noGo?: number }).noGo ?? 0)).toBe(true)
  })

  // Absent is still absent: a band nobody reported is silence, not a refusal.
  it('says nothing where no band was reported at all', () => {
    expect(
      milling.read({ facts: { kind: 'Wall', cd: {} } } as never, { partTopZ: 1 } as never),
    ).toBeNull()
  })
})

describe('a wall no tool fits, end to end', () => {
  /*
   * Paul's Wall, field for field off the datasheet panel. Every cutter band
   * reported and every one of them zero — the Engine saying plainly that
   * nothing cuts this — and it scored **93, easy**, because the only rule that
   * spoke was the one about depth.
   *
   * Three separate things had to be wrong at once, and each was defensible on
   * its own:
   *
   * 1. `cutterFromBand` skipped a band of zero, so the cutter read as absent.
   * 2. `ratio` answered `null` for a zero divisor, so the L/D read as absent.
   * 3. `evaluateRule` threw away a non-finite value as unmeasured, so even
   *    once the first two said `Infinity` no rule would band it.
   *
   * And the audience of `Sharp internal corners` was cavities and profiles, so
   * the one rule named for this could not see a wall.
   */
  const wall = {
    featureTag: 'a45d8c',
    featureType: 'Wall',
    machiningDirection: { x: 0, y: 0, z: -1 },
    regionIdxs: [0],
    datasheet: {
      zMin: 22.987,
      zMax: 27.94,
      extendedZMin: 22.987,
      extendedZMax: 27.94,
      hasFloor: false,
      hasWall: true,
      facts: {
        kind: 'Wall',
        cd: {
          ignore: { min: 0, max: null },
          deviate: { min: 0, max: null },
          effectiveAdaptive: { min: 0, max: null },
          terminalCornerRadius: 0,
        },
      },
    },
  } as never

  it('reads the reach against no cutter as unbounded', () => {
    expect(readMetrics(wall, partContext([wall])).millingLD).toBe(Number.POSITIVE_INFINITY)
  })

  it('is refused, and says which rules refused it', () => {
    const verdict = evaluateFeature(DEFAULT_RULES, wall, partContext([wall]))

    expect(verdict.band).toBe('no go')
    expect(verdict.results.map((result) => result.rule.id)).toContain('milling-ld')
    expect(verdict.results.map((result) => result.rule.id)).toContain('sharp-corners')
  })

  // It scored 93 out of 100 before this. The number matters less than the
  // direction, but a wall nothing can cut should not be in the top decile.
  it('scores like the problem it is', () => {
    const score = scoreFeature(evaluateFeature(DEFAULT_RULES, wall, partContext([wall])))

    expect(score).not.toBeNull()
    expect(score!).toBeLessThan(0.4)
  })
})

describe('reading a field off whatever reports it', () => {
  /*
   * F69's shape, found a second time. `hasSharpCorner` was read only off
   * `Three` facts and went silent on every other family, and the rule that
   * needed it said nothing for months. `filletRadius` had the same allow-list —
   * `Boss | Dovetail | Hole | Pocket | Three` — so an outer fillet reporting a
   * blend under any other kind was a measurement nobody could rule on.
   *
   * The Engine's kinds are an open set the kernel adds to, so a list of them
   * goes out of date without anything failing. Asking whether the field is
   * there cannot.
   */
  const radius = METRIC_BY_ID.get('floorFilletRadius')!
  const sheet = (facts: unknown) => facts as never

  it('reads a blend off a kind no list would have named', () => {
    expect(
      radius.read(sheet({ facts: { kind: 'SomethingNew', filletRadius: 1.524 } }), {} as never),
    ).toBe(1.524)
  })

  it('still says nothing where there is no blend to read', () => {
    expect(radius.read(sheet({ facts: { kind: 'Wall' } }), {} as never)).toBeNull()
    // Zero is a flat floor meeting a wall square, not a tiny radius — the
    // metric stands down and the rule with it.
    expect(
      radius.read(sheet({ facts: { kind: 'Pocket', filletRadius: 0 } }), {} as never),
    ).toBeNull()
  })

  it('reads a stated sharp corner off any family that states one', () => {
    expect(sharpCorner(sheet({ facts: { kind: 'SomethingNew', hasSharpCorner: true } }))).toBe(true)
    expect(sharpCorner(sheet({ facts: { kind: 'Pocket' } }))).toBeNull()
  })
})

describe('a measurement carries the other unit too', () => {
  /*
   * Shops read in one unit and buy tooling in the other, and the sum between
   * them is exactly the kind somebody gets wrong once and trusts afterwards.
   * 25.4 mm is 1.000 in, so a conversion out by any factor shows in the number
   * rather than in the last decimal.
   */
  // 25.4 deep, which is 1.000 in exactly.
  const pocket = feature({ datasheet: { zMax: 0, zMin: -25.4 } })
  const rows = (unit: UnitSystem) => rowsFor(pocket, [], unit)

  it('reads a length both ways round', () => {
    const inMm = rows('millimeters').find((row) => row.key === 'featureDepth')
    const inInches = rows('inches').find((row) => row.key === 'featureDepth')

    expect(inMm?.value).toBe('25.40 mm')
    expect(inMm?.alt).toBe('1.000 in')
    // And the other way, so neither is the special case.
    expect(inInches?.value).toBe('1.000 in')
    expect(inInches?.alt).toBe('25.40 mm')
  })

  it('says nothing on a row that does not convert', () => {
    // A ratio and a count of faces are the same number in either unit, and a
    // second reading of them would be noise dressed as precision.
    const faces = rows('millimeters').find((row) => row.key === 'faces')

    expect(faces?.alt).toBeUndefined()
  })
})
