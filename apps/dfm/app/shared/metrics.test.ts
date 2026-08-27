import { describe, expect, test } from 'vitest'
import type { PartFeature } from './contracts'
import { METRICS, metricFormula, metricSources, partContext, readMetrics } from './metrics'
import { measurements } from './measurements'

/**
 * The metrics are arithmetic over the Engine's datasheet, so what these pin is
 * the arithmetic and the silence: a field the Engine never reported has to come
 * back `null` rather than as a number somebody's rule will then band.
 */

const hole = (facts: Record<string, unknown> = {}, sheet: Record<string, unknown> = {}) =>
  ({
    featureTag: 'hole-1',
    featureType: 'blind_hole',
    regionIdxs: [0],
    machiningDirection: { x: 0, y: 0, z: 1 },
    axis: { x: 0, y: 0, z: 1 },
    datasheet: {
      facts: { kind: 'Hole', diameter: 6.35, ...facts },
      zMax: 0,
      zMin: -25.4,
      extendedZMax: 0,
      extendedZMin: -25.4,
      ...sheet,
    },
  }) as unknown as PartFeature

describe('readMetrics', () => {
  test('works a drilling L/D out of the reach and the bore', () => {
    // 25.4 deep in a 6.35 bore is 4:1, which is where a standard drill starts
    // wanting a peck cycle.
    expect(readMetrics(hole()).drillingLD).toBeCloseTo(4, 6)
    expect(readMetrics(hole()).holeDiameter).toBeCloseTo(6.35, 6)
  })

  test('says nothing about a measurement the Engine never reported', () => {
    const bare = readMetrics(hole({ diameter: undefined }))

    // Not zero, and not a guess. A rule reading this has to stand down.
    expect(bare.holeDiameter).toBe(null)
    expect(bare.drillingLD).toBe(null)
  })

  test('gives a feature with no datasheet at all a full set of nulls', () => {
    const bare = { ...hole(), datasheet: null } as PartFeature

    expect(Object.values(readMetrics(bare)).every((value) => value === null)).toBe(true)
  })

  test('reads chamfer angles in the API’s degree unit', () => {
    const inDegrees = hole({ kind: 'Chamfer', bevel: { angleDeg: 45 } })

    expect(readMetrics(inDegrees).chamferAngle).toBeCloseTo(45, 4)
  })

  test('uses the highest extended bound for features cut from the same direction', () => {
    const older = hole()
    const context = partContext([
      older,
      { ...older, datasheet: { ...older.datasheet, extendedZMax: 10 } } as PartFeature,
    ])

    // The reach is measured from the highest surface the Engine attributed to
    // this direction, which is not the top of the stock — the reason these read
    // large on an older report.
    expect(readMetrics(older, context).depthBelowPartTop).toBeCloseTo(35.4, 6)
  })
})

describe('showing the working', () => {
  test('every metric names the fields it read and what they held', () => {
    const readings = metricSources('drillingLD', hole())

    expect(readings.length).toBeGreaterThan(0)
    expect(readings.every((reading) => typeof reading.path === 'string')).toBe(true)
    expect(readings.some((reading) => reading.value !== null)).toBe(true)
  })

  test('says so plainly when the feature has no datasheet', () => {
    const bare = { ...hole(), datasheet: null } as PartFeature

    expect(metricSources('drillingLD', bare)).toEqual([
      { path: 'datasheet', value: null, note: 'this feature has none' },
    ])
  })

  test('explains every number it does produce', () => {
    const measured = readMetrics(hole({ cd: { ignore: { min: 3.175 } } }))
    const feature = hole({ cd: { ignore: { min: 3.175 } } })

    // A number a shop cannot trace is one they have to take on faith, which is
    // the whole argument for showing the Engine's own measurements. Either
    // arithmetic or the field it came straight off counts as an explanation —
    // a hole diameter *is* `facts.diameter`, and there is nothing to derive. A
    // metric that stayed quiet needs neither.
    const unexplained = METRICS.filter(
      (metric) =>
        measured[metric.id] !== null && !metricFormula(metric.id, feature) && !metric.field,
    )

    expect(unexplained.map((metric) => metric.id)).toEqual([])
  })
})

/**
 * The differential pass.
 *
 * `measurements.ts` reads the same datasheet for the detail panel, and until
 * one of the two goes they have to agree. Where they do not, one of them is
 * wrong about the Engine — which is worth knowing before either is deleted.
 */
describe('the two readers of the datasheet agree', () => {
  const feature = hole(
    { cd: { ignore: { min: 3.175 } }, filletRadius: 1.5 },
    { wallishArea: 400, floorishArea: 100 },
  )
  const report = { features: [feature], regions: [] }

  const rowValue = (key: string) => {
    const row = measurements({
      feature,
      features: report.features,
      regions: report.regions as never,
      unit: 'mm',
    }).find((each) => each.key === key)
    return row ? Number.parseFloat(row.value) : null
  }

  const metrics = readMetrics(feature, partContext(report.features))

  test.each([
    ['depthBelowTop', 'depthBelowPartTop'],
    ['featureDepth', 'depth'],
    ['maxTool', 'requiredCutter'],
    ['minRadius', 'minRadius'],
    ['bevelAngle', 'chamferAngle'],
    ['diameter', 'holeDiameter'],
    ['floorFillet', 'floorFilletRadius'],
    ['area', 'surfaceArea'],
    ['walls', 'wallArea'],
    ['floors', 'floorArea'],
  ] as const)('%s matches %s', (row, metric) => {
    const shown = rowValue(row)
    const measured = metrics[metric]

    if (shown === null && measured === null) {
      return
    }
    expect(measured).not.toBe(null)
    expect(shown).toBeCloseTo(measured as number, 2)
  })

  test('the L/D shown is the one for a hole, which is drilled rather than milled', () => {
    expect(rowValue('ld')).toBeCloseTo(metrics.drillingLD as number, 2)
  })
})

describe('a corner radius is not a cutter', () => {
  const feature = (featureType: string, facts: Record<string, unknown>) =>
    ({
      featureTag: 'f-1',
      featureType: 'undercut_filleted_tslot',
      regionIdxs: [0],
      machiningDirection: { x: 1, y: 0, z: 0 },
      axis: { x: 1, y: 0, z: 0 },
      datasheet: {
        featureType,
        facts: { kind: 'Tslot', ...facts },
        zMax: 0,
        zMin: -11.8,
        partZMax: 0,
      },
    }) as unknown as PartFeature

  test('stands the milling metrics down when no band is reported', () => {
    // `terminalCornerRadius` reports the floor blend on every feature looked at
    // so far, so doubling it said a 0.01 in fillet demanded a 0.02 in cutter —
    // which put this T-slot's milling L/D at 23:1.
    const metrics = readMetrics(
      feature('UndercutFilletedTslot', { cd: { terminalCornerRadius: 0.254 } }),
    )

    expect(metrics.requiredCutter).toBe(null)
    expect(metrics.minRadius).toBe(null)
    expect(metrics.millingLD).toBe(null)
  })

  test('says so where the working is shown', () => {
    const [reading] = metricSources(
      'requiredCutter',
      feature('UndercutFilletedTslot', { cd: { terminalCornerRadius: 0.254 } }),
    )

    expect(reading?.value).toBe(null)
    expect(reading?.note).toContain('no cutter band reported')
  })

  test('reads the band wherever one is reported, whatever the type', () => {
    const metrics = readMetrics(
      feature('UndercutFilletedTslot', {
        cd: { ignore: { min: 6.35 }, terminalCornerRadius: 0.254 },
      }),
    )

    expect(metrics.requiredCutter).toBeCloseTo(6.35, 6)
    expect(metrics.minRadius).toBeCloseTo(3.175, 6)
  })
})

describe('which reach ratio a hole gets', () => {
  const hole = (facts: Record<string, unknown>) =>
    ({
      featureTag: 'hole-1',
      featureType: 'blind_hole',
      regionIdxs: [0],
      machiningDirection: { x: 0, y: 0, z: 1 },
      axis: { x: 0, y: 0, z: 1 },
      datasheet: {
        facts: { kind: 'Hole', diameter: 6.35, cd: { ignore: { min: 6.35 } }, ...facts },
        zMax: 0,
        zMin: -25.4,
        extendedZMax: 0,
        extendedZMin: -25.4,
      },
    }) as unknown as PartFeature

  test('a flat bottom is milled, so the milling reach applies', () => {
    // 180° is a flat bottom, and a flat bottom is not something a drill leaves.
    const metrics = readMetrics(hole({ fullConeDeg: 180 }))

    expect(metrics.millingLD).toBeCloseTo(4, 6)
    expect(metrics.drillingLD).toBeCloseTo(4, 6)
  })

  test('a pointed bottom is drilled, so the milling reach says nothing', () => {
    const metrics = readMetrics(hole({ fullConeDeg: 118 }))

    expect(metrics.millingLD).toBe(null)
    expect(metrics.drillingLD).toBeCloseTo(4, 6)
  })

  test('a hole that reports no point angle is left to the drill', () => {
    // Claiming it is milled would be inventing the one fact this turns on.
    expect(readMetrics(hole({})).millingLD).toBe(null)
  })

  test('says which way it read the hole, where the working is shown', () => {
    const [reading] = metricSources('millingLD', hole({ fullConeDeg: 118 }))

    expect(reading?.note).toContain('drilled, not milled')
  })

  test('leaves everything an endmill makes alone', () => {
    const pocket = {
      ...hole({}),
      featureType: 'pocket',
      datasheet: {
        facts: { kind: 'Pocket', cd: { ignore: { min: 6.35 } } },
        zMax: 0,
        zMin: -25.4,
        extendedZMax: 0,
        extendedZMin: -25.4,
      },
    } as unknown as PartFeature

    expect(readMetrics(pocket).millingLD).toBeCloseTo(4, 6)
  })
})

describe('the part sizes a shop takes', () => {
  /*
   * One number for two bounds. Too big and too small are both "not a part we
   * take", so the metric answers *how far outside* and zero means it fits.
   *
   * Matched largest against largest, because the part is turned to suit: what
   * matters is whether its three sides can be lined up with the shop's, not how
   * it happened to be drawn. Every box below is written out of order for that
   * reason.
   */
  const size = (box: Array<number>, machine?: Parameters<typeof partContext>[2]) =>
    readMetrics(hole(), partContext([hole()], box, machine)).partOverMachine

  const MACHINE = { max: { x: 30, y: 16, z: 20 }, min: { x: 10, y: 8, z: 4 } }

  test('says nothing at all until a shop has said', () => {
    // Not zero. Nobody has stated a limit, so there is nothing to be outside
    // of, and a rule reading this has to stand down rather than pass the part.
    expect(size([40, 20, 25])).toBeNull()
    expect(size([40, 20, 25], {})).toBeNull()
  })

  test('fits a part inside both ends', () => {
    expect(size([25, 14, 10], MACHINE)).toBe(0)
  })

  test('measures how far the biggest side is past the largest taken', () => {
    // 36 against a 30 machine, once the sides are matched largest to largest.
    expect(size([36, 14, 10], MACHINE)).toBe(6)
  })

  test('measures how far the smallest side falls short of the smallest taken', () => {
    // 1 against a floor of 4 on the shortest side.
    expect(size([25, 14, 1], MACHINE)).toBe(3)
  })

  test('turns the part to suit rather than reading it as drawn', () => {
    // Drawn 10 × 30 × 14, which fits a 30 × 16 × 20 machine turned round. Read
    // axis for axis it would be 14 past on the first side and refuse a part the
    // shop can hold.
    expect(size([10, 30, 14], MACHINE)).toBe(0)
  })

  test('reports the worst of the two ends, not their sum', () => {
    // 6 past at the top and 3 short at the bottom is a part that is 6 out.
    expect(size([36, 14, 1], MACHINE)).toBe(6)
  })

  test('judges one end where only one was given', () => {
    // A shop that only cares about the big end says so and the small end
    // judges nothing — rather than judging against zero and passing everything.
    expect(size([2, 2, 2], { max: MACHINE.max })).toBe(0)
    expect(size([2, 2, 2], { min: MACHINE.min })).toBe(8)
    expect(size([40, 20, 25], { min: MACHINE.min })).toBe(0)
  })

  test('says what it compared against, or that nothing was set', () => {
    const said = (machine?: Parameters<typeof partContext>[2]) =>
      metricSources('partOverMachine', hole(), partContext([hole()], [25, 14, 10], machine))[0]
        ?.note

    expect(said(MACHINE)).toContain('10 × 8 × 4 mm to 30 × 16 × 20 mm')
    expect(said({ max: MACHINE.max })).toContain('largest of 30 × 16 × 20 mm')
    expect(said({ min: MACHINE.min })).toContain('smallest of 10 × 8 × 4 mm')
    expect(said()).toContain('no part sizes have been set')
  })
})
