import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { holeGroups } from './hole-mode'
import { holePlan } from './hole-plan'
import { threadNamed } from './threads'

const hole = (featureTag: string, diameter: number, depth: number): PartFeature =>
  ({
    featureTag,
    featureType: 'BlindHole',
    machiningDirection: { x: 0, y: 0, z: 1 },
    // A face of its own: two readings that share one are the same physical hole.
    regionIdxs: [[...featureTag].reduce((sum, letter) => sum + letter.charCodeAt(0), 0)],
    datasheet: {
      zMin: -depth,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Hole', diameter, fullConeDeg: 140 },
    },
  }) as unknown as PartFeature

const tool = (
  catalogNumber: string,
  geometry: Record<string, number>,
  form = 'drill',
): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    brand: 'Kennametal',
    vendor: 'Kennametal',
    form,
    toolType: form === 'drill' ? 'drill' : 'endmill',
    unitSystem: 'metric',
    geometry: { SFDM: geometry.DC ?? 6, OAL: 80, ...geometry },
    materialGroups: [],
    productLink: null,
    provenance: {},
  }) as unknown as CatalogTool

const drill = tool('D5', { DC: 5, LCF: 30, LD: 3, SIG: 140 })
const mill = tool('E4', { DC: 4, LCF: 30, LD: 3 }, 'flat end mill')

describe('the plan for a part read as holes', () => {
  const features = [hole('a', 5, 12), hole('b', 5, 12), hole('c', 8, 20)]
  const groups = holeGroups(features)

  it('gives every size its own row, in the order the groups came', () => {
    const plan = holePlan(groups, {}, [drill, mill], features)

    expect(plan.map((row) => row.group.diameter)).toEqual([5, 8])
    expect(plan[0]?.group.features).toHaveLength(2)
  })

  it('offers the drills that make the size', () => {
    const plan = holePlan(groups, {}, [drill, mill], features)

    expect(plan[0]?.drills.map((each) => each.tool.catalogNumber)).toEqual(['D5'])
    expect(plan[0]?.interpolated).toBe(false)
  })

  /**
   * "No tool" is worse information than "not a drill" — but a mill standing in
   * the drill's place says the wrong thing, so the mills are their own list
   * beside an empty drill cell (Paul, 2026-09-01).
   */
  it('offers end mills where nothing drills the size, and keeps them apart', () => {
    const plan = holePlan(groups, {}, [mill], features)

    expect(plan[0]?.drills).toEqual([])
    expect(plan[0]?.endMills.map((each) => each.tool.catalogNumber)).toEqual(['E4'])
    expect(plan[0]?.interpolated).toBe(true)
  })

  /** A tool that is neither is not judged at all: this is the hole question. */
  it('judges hole tools, not the whole catalog', () => {
    const face = tool('F50', { DC: 50, LCF: 4, LD: 0.1 }, 'face mill')
    const plan = holePlan(groups, {}, [drill, face], features)

    expect(plan[0]?.drills.map((each) => each.tool.catalogNumber)).toEqual(['D5'])
    expect(plan[0]?.endMills).toEqual([])
  })

  /** The filters are the source of truth: nothing offered, nothing planned. */
  it('plans nothing for a size the filters left no tool for', () => {
    const plan = holePlan(groups, {}, [], features)

    expect(plan[0]?.drills).toEqual([])
    expect(plan[0]?.endMills).toEqual([])
    expect(plan[0]?.interpolated).toBe(false)
  })

  /**
   * A threaded group is drilled at the **tap drill**, so a ⌀5 hole marked M6
   * wants the ⌀5 drill for its own size — and a ⌀4.2 group marked M5 wants a
   * ⌀4.2, not the ⌀4.2 the model happens to draw.
   */
  it('judges a threaded group against its tap drill', () => {
    const wide = tool('D6', { DC: 6, LCF: 30, LD: 3, SIG: 140 })
    const nominal = holeGroups([hole('n', 6, 12)])
    const plan = holePlan(
      nominal,
      { [nominal[0]!.key]: { mode: 'cut tap', spec: threadNamed('M6×1')! } },
      [drill, wide],
      [hole('n', 6, 12)],
    )

    // Drilled at 5, so the ⌀5 fits and the ⌀6 is over the tap drill.
    expect(plan[0]?.drills.map((each) => each.tool.catalogNumber)).toEqual(['D5'])
  })

  /**
   * A form tap starts from a bigger hole than a cut tap — four tenths on an
   * M6 — so the same group asks for a different drill in each mode.
   */
  it('drills the size the group’s own mode starts from', () => {
    const big = tool('D55', { DC: 5.5, LCF: 30, LD: 3, SIG: 140 })
    const six = holeGroups([hole('n', 6, 12)])
    const forms = holePlan(
      six,
      { [six[0]!.key]: { mode: 'form tap', spec: threadNamed('M6×1')! } },
      [drill, big],
      [hole('n', 6, 12)],
    )

    expect(forms[0]?.drills.map((each) => each.tool.catalogNumber)).toContain('D55')
  })

  it('offers the taps for a threaded group and none for a plain one', () => {
    const tap = tool('T6', { DC: 6, LCF: 20 }, 'tap right hand')
    const threaded = holePlan(
      groups,
      { [groups[0]!.key]: { mode: 'cut tap', spec: threadNamed('M6×1')! } },
      [drill, tap],
      features,
    )

    expect(threaded[0]?.makers.map((each) => each.catalogNumber)).toEqual(['T6'])
    expect(threaded[1]?.makers).toEqual([])
  })
})

describe('a threaded group is drilled, not milled', () => {
  const features = [hole('a', 5, 12)]
  const groups = holeGroups(features)

  /**
   * The fallback to a mill is for a plain hole, where "not a drill" beats "no
   * tool". A thread needs the hole at size before the tap goes near it (Paul,
   * 2026-08-31: "when a hole is threaded, we DON'T show endmills").
   */
  it('offers nothing rather than a mill when no drill fits', () => {
    const threaded = holePlan(
      groups,
      { [groups[0]!.key]: { mode: 'cut tap', spec: threadNamed('M6×1')! } },
      [mill],
      features,
    )

    expect(threaded[0]?.drills).toEqual([])
    expect(threaded[0]?.interpolated).toBe(false)
  })

  /** And the same group, left plain, is still offered the mill it can get. */
  it('still offers end mills for a plain hole', () => {
    const plain = holePlan(groups, {}, [mill], features)

    expect(plain[0]?.endMills.map((each) => each.tool.catalogNumber)).toEqual(['E4'])
    expect(plain[0]?.interpolated).toBe(true)
  })
})
