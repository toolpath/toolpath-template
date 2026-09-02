import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import {
  canBeHeld,
  describeGrade,
  holdable,
  holderOptions,
  policyOf,
  thresholdsFrom,
} from './holder-choice'

const tool: CatalogTool = {
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  productLine: null,
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}

const holder = (guid: string, noseDiameter: number, over: Partial<Holder> = {}): Holder => ({
  guid,
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: guid,
  materialNumber: null,
  taper: 'BT30',
  contact: 'taper',
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'PG6',
  boreDiameter: null,
  noseDiameter,
  noseLength: 30,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
  ...over,
})

const collet: Collet = {
  guid: 'c',
  familyId: 'pg6',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'PG 6 / 6',
  materialNumber: null,
  series: 'PG6',
  clampMin: 6,
  clampMax: 6,
  clampLength: null,
  productLink: null,
  provenance: {},
}

/** A pocket 12 deep at the cut; a boss 8 mm out standing 30 above the floor. */
const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }
const thresholds = { good: 1 / 3, least: 1 / 4, leastStickout: 0, step: { inch: 0, metric: 0 } }
const room = { radial: 0.5, axial: 0.5 }

describe('the holders that work, pulled out to what the feature needs', () => {
  it('stands the tool out to the flutes plus what the holder needs, and recommends the first that works', () => {
    // A slim 8 mm nose stands 1.5 out from the cut (with the room): 12 tall
    // there, plus the room — under the flutes, so the flutes decide. A 20 mm
    // nose stands 7.5 out, over the boss: 30 tall, plus the room — and 30.5
    // out of 57 leaves under half, but over a third: good.
    const options = holderOptions(
      tool,
      [holder('wide', 20), holder('slim', 8)],
      [collet],
      {},
      curve,
      room,
      thresholds,
    )
    // Both work, so the order is `holdersFor`'s — the same series and gauge,
    // then by catalog number — and the first that works is recommended.
    expect(
      options.map((each) => [each.holder.guid, each.required, each.stickout, each.grade]),
    ).toEqual([
      ['slim', 12.5, 13, 'good'],
      ['wide', 30.5, 30.5, 'good'],
    ])
    expect(options[0]?.recommended).toBe(true)
    expect(options.every((each) => each.clears === true)).toBe(true)
  })

  /** Standing out far enough to clear can leave too little in the holder: graded, listed last, never recommended. */
  it('grades a stack that clears only by holding too little, and lists it last', () => {
    const short = { ...tool, geometry: { ...tool.geometry, OAL: 38 } }
    const options = holderOptions(
      short,
      [holder('wide', 20), holder('slim', 8)],
      [collet],
      {},
      curve,
      room,
      thresholds,
    )
    const rounded = (value: number | null) =>
      value === null ? null : Math.round(value * 100) / 100
    expect(options.map((each) => [each.holder.guid, rounded(each.stickout), each.grade])).toEqual([
      ['slim', 13, 'good'],
      // Wanted 30.5; the tool allows 2/3 of 38 = 25.33, and at that the nose collides.
      ['wide', 25.33, 'bad'],
    ])
    expect(options[1]?.clears).toBe(false)
    expect(describeGrade(options[1]!)).toContain('collides')
    expect(describeGrade(options[0]!)).toBe('')
    expect(options.some((each) => each.recommended)).toBe(true)
    expect(options[1]?.recommended).toBe(false)
  })

  it('recommends nothing when every stack is bad', () => {
    const stubby = { ...tool, geometry: { ...tool.geometry, OAL: 20, LCF: 13 } }
    const options = holderOptions(
      stubby,
      [holder('wide', 20)],
      [collet],
      {},
      curve,
      room,
      thresholds,
    )
    expect(options[0]?.grade).toBe('bad')
    expect(options.some((each) => each.recommended)).toBe(false)
  })

  /** Without a reach curve nothing can be checked; the stack is drawn at the flutes and graded by hold alone. */
  it('grades by hold alone when there is no curve to sweep', () => {
    const options = holderOptions(tool, [holder('wide', 20)], [collet], {}, null, room, thresholds)
    expect(options[0]).toMatchObject({ required: null, stickout: 13, clears: null, grade: 'good' })
  })

  /**
   * MariTool publishes 233 ER chucks and the crib holds no ER collet, so the
   * gate that keeps an ER16 chuck out of the list is a purchase order rather
   * than anything about this tool. It is offered, last, and says why.
   */
  it('offers a chuck whose series the crib stocks none of, last and never recommended', () => {
    const options = holderOptions(
      tool,
      [
        holder('er16', 20, { colletSeries: 'ER16', catalogNumber: 'BT30-ER16-60' }),
        holder('pg', 20),
      ],
      [collet],
      {},
      curve,
      room,
      thresholds,
    )
    expect(options.map((each) => [each.holder.guid, each.unstocked, each.recommended])).toEqual([
      ['pg', false, true],
      ['er16', true, false],
    ])
    expect(describeGrade(options[1]!)).toBe('the crib stocks no ER16 collet')
    // It grips nothing as it stands, so it must not make the tool holdable.
    expect(canBeHeld([options[1]!])).toBe(false)
    expect(canBeHeld(options)).toBe(true)
  })

  /** A loose bound, and the only job it has: a 20 mm shank is not offered an ER16 chuck. */
  it('keeps an unstocked chuck out where the shank is over the series size', () => {
    const wide = { ...tool, geometry: { ...tool.geometry, DC: 20, SFDM: 20 } }
    const options = holderOptions(
      wide,
      [holder('er16', 30, { colletSeries: 'ER16' }), holder('er32', 30, { colletSeries: 'ER32' })],
      [collet],
      {},
      null,
      room,
      thresholds,
    )
    expect(options.map((each) => each.holder.guid)).toEqual(['er32'])
  })

  it('respects the holder filters', () => {
    const options = holderOptions(
      tool,
      [holder('bt', 20), holder('hsk', 20, { taper: 'HSK63A' })],
      [collet],
      { taper: ['HSK63A'] },
      curve,
      room,
      thresholds,
    )
    expect(options.map((each) => each.holder.guid)).toEqual(['hsk'])
  })
})

describe('the sheet’s thresholds', () => {
  /** Paul's numbers (2026-08-30): a third held is good, a quarter the least; half an inch out at least, on an eighth of an inch or 3 mm. */
  it('read the hold shares and the stickout settings off the knobs', () => {
    const sheet = thresholdsFrom()
    expect(sheet).toEqual({
      good: 0.33,
      least: 0.25,
      leastStickout: 12.7,
      step: { inch: 3.175, metric: 3 },
    })
    expect(policyOf(sheet)).toEqual({
      heldShare: 0.33,
      least: 12.7,
      step: { inch: 3.175, metric: 3 },
    })
  })

  it('sets the recommended stack out on the sheet’s step, and says the range beside it', () => {
    const [option] = holderOptions(
      tool,
      [holder('narrow', 10)],
      [collet],
      {},
      null,
      room,
      thresholdsFrom(),
    )
    // 13 mm of flute under a half-inch floor: the 3 mm step nearest 12.7 that is not under 13 is 15.
    expect(option?.stickout).toBe(15)
    expect(option?.range).toEqual({ min: 13, max: 57 * (1 - 0.33) })
  })
})

describe('the range beside the stickout', () => {
  /**
   * A wall 20 mm above the floor from 2 mm out: the nose of a ⌀10 holder on a
   * ⌀6 tool stands 2 mm past the edge (2.5 with the room) and needs 20.5 mm
   * of stickout. The tool's flutes are 13 — but a range starting at 13
   * collides for its first 7.5 mm, so the range starts where the holder
   * clears (Paul, 2026-08-30).
   */
  it('starts where the holder clears, not at the flutes', () => {
    const wall = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 20] }
    const [option] = holderOptions(
      tool,
      [holder('narrow', 10)],
      [collet],
      {},
      wall,
      room,
      thresholds,
    )
    expect(option?.required).toBeCloseTo(20.5, 6)
    expect(option?.range?.min).toBeCloseTo(20.5, 6)
    expect(option?.range?.max).toBeCloseTo(38, 6)
    expect(option?.stickout).toBe(20.5)
  })

  it('says when the holder needs more than the tool allows', () => {
    const deep = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 50] }
    const [option] = holderOptions(
      tool,
      [holder('narrow', 10)],
      [collet],
      {},
      deep,
      room,
      thresholds,
    )
    expect(option?.range?.min).toBeCloseTo(50.5, 6)
    expect(option?.range?.max).toBeCloseTo(38, 6)
    expect(option?.grade).toBe('bad')
  })
})

describe('whether the crib can hold a tool at all', () => {
  /** Paul's rule: no holder that grips, clears and keeps hold — not shown. A medium hold still counts. */
  it('needs one option that is not bad', () => {
    const [good] = holderOptions(tool, [holder('narrow', 10)], [collet], {}, null, room, thresholds)
    expect(canBeHeld([good!])).toBe(true)
    expect(canBeHeld([{ ...good!, grade: 'medium' }])).toBe(true)
    expect(canBeHeld([{ ...good!, grade: 'bad' }])).toBe(false)
    expect(canBeHeld([])).toBe(false)
  })
})

describe('holdable, asked without building every option', () => {
  /** The same answer as canBeHeld over holderOptions: a holder that grips, clears and keeps hold — or none. */
  it('agrees with the full options, clearing and colliding', () => {
    const clear = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 20] }
    const deep = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 50] }
    for (const curve of [null, clear, deep]) {
      const options = holderOptions(
        tool,
        [holder('narrow', 10)],
        [collet],
        {},
        curve,
        room,
        thresholds,
      )
      expect(holdable(tool, [holder('narrow', 10)], [collet], {}, curve, room, thresholds)).toBe(
        canBeHeld(options),
      )
    }
    expect(holdable(tool, [], [collet], {}, null, room, thresholds)).toBe(false)
  })
})
