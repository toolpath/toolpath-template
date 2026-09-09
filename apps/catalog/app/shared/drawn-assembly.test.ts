import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { belowHolder, drawnAssembly } from './drawn-assembly'

const tool: CatalogTool = {
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  productLine: null,
  threadMethod: null,
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}
const holder: Holder = {
  guid: 'h',
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'h',
  materialNumber: null,
  taper: 'BT30',
  contact: 'taper',
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'PG6',
  boreDiameter: null,
  noseDiameter: 10,
  noseLength: 30,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
}
const collet: Collet = {
  guid: 'c',
  familyId: 'pg6',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'PG 6 Ø 6',
  materialNumber: null,
  series: 'PG6',
  clampMin: 6,
  clampMax: 6,
  clampLength: null,
  productLink: null,
  provenance: {},
}
const thresholds = {
  good: 1 / 3,
  least: 1 / 4,
  leastStickout: 0,
  step: { inches: 0, millimeters: 0 },
}
const room = { radial: 0.5, axial: 0.5 }

describe('the drawn assembly', () => {
  it('is the tool alone until a holder is picked', () => {
    const drawn = drawnAssembly(
      tool,
      { holder: null, collet: null, stickout: null },
      null,
      room,
      thresholds,
      [holder],
      [collet],
    )
    expect(drawn.assembly).toBeNull()
    expect(drawn.limits?.min).toBe(13)
  })

  /** A wall 20 mm up from 2 mm out: the ⌀10 nose needs 20.5 mm; the stack stands out that far, and clears. */
  it('stands the stack out to what the holder needs, and sweeps it', () => {
    const wall = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 20] }
    const drawn = drawnAssembly(
      tool,
      { holder: 'h', collet: 'c', stickout: null },
      wall,
      room,
      thresholds,
      [holder],
      [collet],
    )
    expect(drawn.required).toBeCloseTo(20.5, 6)
    expect(drawn.stickout).toBeCloseTo(20.5, 6)
    expect(drawn.assembly?.holder.guid).toBe('h')
    expect(drawn.collisions).toEqual([])
    expect(drawn.band).toBe('good')
  })

  /**
   * **A holder with no collet picked is still drawn with one.**
   *
   * The panel used to build its assembly inline with `collet: null` hardcoded,
   * which was cosmetic while it drew the tool against nothing; the moment a
   * reach curve reached it, `clearance()` was being asked about a stack the
   * shop had not picked. Two callers depend on this resolution now
   * (`components/drawing-card.tsx` and `components/tool-details.tsx`), so it
   * gets a test of its own rather than riding along on the cases above.
   */
  it('fits the first collet the holder takes when none was picked', () => {
    const drawn = drawnAssembly(
      tool,
      { holder: 'h', collet: null, stickout: null },
      null,
      room,
      thresholds,
      [holder],
      [collet],
    )
    expect(drawn.collet?.guid).toBe('c')
    expect(drawn.assembly?.collet?.guid).toBe('c')
  })

  /** And a holder that needs none is drawn with none, rather than the first that grips. */
  it('leaves a bore holder colletless', () => {
    const bore = { ...holder, guid: 'b', clamping: 'bore' as const, colletSeries: null }
    const drawn = drawnAssembly(
      tool,
      { holder: 'b', collet: null, stickout: null },
      null,
      room,
      thresholds,
      [bore],
      [collet],
    )
    expect(drawn.collet).toBeNull()
    expect(drawn.assembly?.holder.guid).toBe('b')
  })

  it('holds a picked stickout inside the tool’s range, and reports what then collides', () => {
    const wall = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 20] }
    const drawn = drawnAssembly(
      tool,
      { holder: 'h', collet: 'c', stickout: 5 },
      wall,
      room,
      thresholds,
      [holder],
      [collet],
    )
    expect(drawn.stickout).toBe(13)
    expect(drawn.collisions.map((each) => each.part)).toContain('nose')
  })
})

/**
 * **The list's column is about the stack, not about the tool** (Paul,
 * 2026-09-08: "we can plainly see that more of the tool is beneath the
 * holder"). `geometry.LBH` is `stickout.ts`'s same function asked with no
 * holder and no feature, and the table printed it beside a panel drawing the
 * tool three times further out.
 */
describe('the length below the holder, for the list', () => {
  const wall = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 20] }

  it('says nothing while nothing holds the tool', () => {
    expect(
      belowHolder(tool, { holder: null, collet: null }, wall, room, thresholds, [collet]),
    ).toBeNull()
  })

  /** The number the drawing is drawn at and the panel prints — one derivation. */
  it('is what the stack has to stand out to clear the part', () => {
    const below = belowHolder(tool, { holder, collet }, wall, room, thresholds, [collet])
    const drawn = drawnAssembly(
      tool,
      { holder: 'h', collet: 'c', stickout: null },
      wall,
      room,
      thresholds,
      [holder],
      [collet],
    )

    expect(below?.length).toBeCloseTo(20.5, 6)
    expect(below?.length).toBe(drawn.stickout)
    // Longer than the tool's own setup length, which is what the column used to print.
    expect(below?.length).toBeGreaterThan(13)
    expect(below?.overLimit).toBe(false)
  })

  /**
   * A tool too short to be set out that far is the other half of the answer:
   * two lengths somebody can act on, rather than a number that quietly fits.
   */
  it('says what it needs and what it holds when the tool cannot reach', () => {
    const deep = { horizontalOffset: [0, 2, 30], verticalOffset: [0, 0, 60] }
    const below = belowHolder(tool, { holder, collet }, deep, room, thresholds, [collet])

    expect(below?.overLimit).toBe(true)
    expect(below?.needs).toBeGreaterThan(below?.most ?? 0)
    expect(below?.most).not.toBeNull()
  })
})
