import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { drawnAssembly } from './drawn-assembly'

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
