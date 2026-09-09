import { describe, expect, it } from 'vitest'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { fusionLibrary } from './fusion-library'

const tool = (over: Partial<CatalogTool> = {}): CatalogTool =>
  ({
    guid: '28e01f4e-14bb-4807-a0cb-9ef2789d74ea',
    catalogNumber: 'TDMX0800',
    brand: 'WIDIA',
    vendor: 'Kennametal',
    form: 'bull nose end mill',
    toolType: 'endmill',
    geometry: { DC: 8, LCF: 19, OAL: 63, SFDM: 8, NOF: 4, RE: 1, LBH: 27 },
    productLink: 'https://example.com/TDMX0800',
    provenance: {},
    ...over,
  }) as unknown as CatalogTool

const holder = {
  guid: '973eaa5d-4474-46c8-aaac-d89dcefcaa0f',
  brand: 'Kennametal',
  catalogNumber: 'BT30ER16060M',
  noseDiameter: 28,
  noseLength: 20,
  bodyDiameter: 34,
  bodyLength: 15,
  flangeDiameter: 46,
  projection: 60,
  gaugeLength: 44,
} as unknown as Holder

const ids = (): (() => string) => {
  let at = 0
  return () => `00000000-0000-4000-8000-${String(++at).padStart(12, '0')}`
}

describe('the order list as a Fusion library', () => {
  it('writes a current Fusion tool and PreTool starting presets', () => {
    const { library } = fusionLibrary(
      [{ key: 'one', tool: tool(), holder, stickout: 31 }],
      { material: 'LowCSteel', maxRpm: 12000 },
      { nextGuid: ids() },
    )
    const first = library.data[0]!

    expect(library.version).toBe(33)
    expect(first.BMC).toBe('unspecified')
    expect(first.geometry).toMatchObject({
      CSP: false,
      HAND: true,
      LB: 31,
      assemblyGaugeLength: 75,
      'shoulder-length': 19,
      'shoulder-diameter': 8,
    })
    expect(first.holder).toMatchObject({
      type: 'holder',
      gaugeLength: 44,
      segments: [
        { height: 20, 'lower-diameter': 28, 'upper-diameter': 28 },
        { height: 15, 'lower-diameter': 34, 'upper-diameter': 34 },
        { height: 25, 'lower-diameter': 46, 'upper-diameter': 46 },
      ],
    })
    expect(first['start-values'].presets).toHaveLength(3)
    expect(first['start-values'].presets[0]).toMatchObject({
      name: 'LowCSteel_Adaptive_Rough',
      'tool-coolant': 'flood',
      'use-stepdown': true,
      'use-stepover': true,
    })
    expect(first['start-values'].presets.every((preset) => preset.n <= 12000)).toBe(true)
  })

  it('uses the catalog setup length for a tool with no holder', () => {
    const { library } = fusionLibrary(
      [{ key: 'one', tool: tool() }],
      { material: 'AluWrought', maxRpm: 12000 },
      { nextGuid: ids() },
    )

    expect(library.data[0]?.geometry).toMatchObject({ LB: 27, assemblyGaugeLength: 27 })
    expect(library.data[0]?.holder).toBeUndefined()
  })

  it('writes PreTool drilling and tapping presets when their Fusion geometry is complete', () => {
    const drill = tool({
      catalogNumber: 'DRILL',
      form: 'drill',
      toolType: 'drill',
      geometry: { DC: 6, LCF: 30, OAL: 70, SFDM: 6, NOF: 2, SIG: 118, LBH: 30 },
    })
    const tap = tool({
      catalogNumber: 'TAP',
      form: 'tap right hand',
      toolType: 'tap',
      geometry: { DC: 6, LCF: 18, OAL: 65, SFDM: 6, NOF: 3, TP: 1, LBH: 25 },
    })
    const { library } = fusionLibrary(
      [
        { key: 'drill', tool: drill },
        { key: 'tap', tool: tap },
      ],
      { material: 'StainlessSteel', maxRpm: 5000 },
      { nextGuid: ids() },
    )

    expect(library.data.map((each) => each['start-values'].presets[0]?.name)).toEqual([
      'StainlessSteel_Drill',
      'StainlessSteel_Tap',
    ])
    expect(
      library.data
        .flatMap((each) => each['start-values'].presets)
        .every((preset) => preset.n <= 5000),
    ).toBe(true)
  })

  it('makes every ordered assembly a separately identified Fusion tool', () => {
    const { library } = fusionLibrary(
      [
        { key: 'short', tool: tool(), stickout: 20 },
        { key: 'long', tool: tool(), holder, stickout: 31 },
      ],
      { material: 'StainlessSteel', maxRpm: 9000 },
      { nextGuid: ids() },
    )

    expect(library.data.map((each) => each.guid)).toHaveLength(2)
    expect(new Set(library.data.map((each) => each.guid)).size).toBe(2)
    expect(library.data.map((each) => each['post-process'].number)).toEqual([1, 2])
  })

  it('does not invent missing vendor geometry', () => {
    const { library, skipped } = fusionLibrary(
      [
        { key: 'unknown', tool: tool({ form: 'other' }) },
        { key: 'missing', tool: tool({ catalogNumber: 'MISS', geometry: { DC: 8 } }) },
      ],
      { material: 'AluWrought', maxRpm: 12000 },
      { nextGuid: ids() },
    )

    expect(library.data).toHaveLength(0)
    expect(skipped).toEqual([
      { catalogNumber: 'TDMX0800', reason: 'Fusion does not support the catalog form “other”' },
      { catalogNumber: 'MISS', reason: 'missing LCF, OAL, NOF, RE, SFDM, LBH (selected stickout)' },
    ])
  })

  it('does not generate CAM data without a positive spindle ceiling', () => {
    const result = fusionLibrary(
      [{ key: 'one', tool: tool() }],
      { material: 'AluWrought', maxRpm: 0 },
      { nextGuid: ids() },
    )

    expect(result.library.data).toEqual([])
    expect(result.skipped).toEqual([
      { catalogNumber: 'TDMX0800', reason: 'maximum spindle RPM must be greater than zero' },
    ])
  })

  it('exports a tool while honestly warning when its selected holder has no shape', () => {
    const bare = { ...holder, noseLength: null, bodyLength: null, projection: null } as Holder
    const result = fusionLibrary(
      [{ key: 'one', tool: tool(), holder: bare }],
      { material: 'AluWrought', maxRpm: 12000 },
      { nextGuid: ids() },
    )

    expect(result.library.data).toHaveLength(1)
    expect(result.library.data[0]?.holder).toBeUndefined()
    expect(result.holderWarnings[0]?.reason).toContain('no complete published Fusion shape')
  })
})
