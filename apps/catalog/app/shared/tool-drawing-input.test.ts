import type { CatalogTool, Holder, HolderProfile, ToolForm } from '@toolpath/catalog-data'
import { assemblyOutline, isHolderProfile } from '@toolpath/tool-drawing/geometry'
import { describe, expect, it } from 'vitest'
import {
  ALL_FORMS,
  DRAWABLE_FORMS,
  UNDRAWABLE_FORMS,
  canDraw,
  toViewerAssembly,
  toViewerHolder,
  toViewerHolderProfile,
  toViewerTool,
} from './tool-drawing-input'

const tool = (over: Partial<CatalogTool> = {}): CatalogTool => ({
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, RE: 1, SIG: 118 },
  materialGroups: ['P'],
  productLine: 'KenCut™ FF',
  productLink: null,
  provenance: { DC: 'vendor-stated', LCF: 'vendor-stated', RE: 'derived' },
  ...over,
})

const holder: Holder = {
  guid: 'h',
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'BT 30 / PG 6 x 050',
  materialNumber: null,
  taper: 'BT30',
  contact: 'face',
  clamping: 'collet',
  gaugeLength: 50,
  colletSeries: 'PG6',
  boreDiameter: null,
  noseDiameter: 10,
  noseLength: 12,
  bodyDiameter: 30,
  bodyLength: 20,
  projection: 35,
  flangeDiameter: 46,
  colletProtrusion: 2,
  productLink: null,
  cadModelUrl: null,
  provenance: { noseDiameter: 'vendor-stated', colletProtrusion: 'derived' },
}

describe('a catalog tool as drawing input', () => {
  it('carries the vendor geometry through under the field names the scraper gave it', () => {
    const viewer = toViewerTool(tool())

    // The rule this whole file exists to hold: no renaming on the way through.
    expect(viewer.geometry).toEqual({ DC: 6, LCF: 13, OAL: 57, SFDM: 6, RE: 1, SIG: 118 })
    expect(viewer.provenance).toEqual({ DC: 'vendor-stated', LCF: 'vendor-stated', RE: 'derived' })
  })

  it('is labelled by what a shop orders, and named by what the tool is', () => {
    const viewer = toViewerTool(tool({ form: 'ball end mill', catalogNumber: 'BV3160617' }))

    expect(viewer.label).toBe('BV3160617')
    expect(viewer.form).toBe('ball end mill')
  })

  it('takes only the drawn dimensions of a holder, not its whole record', () => {
    expect(toViewerHolder(holder)).toEqual({
      noseDiameter: 10,
      noseLength: 12,
      bodyDiameter: 30,
      bodyLength: 20,
      projection: 35,
      flangeDiameter: 46,
      gaugeLength: 50,
      colletSeries: 'PG6',
      colletProtrusion: 2,
      provenance: { noseDiameter: 'vendor-stated', colletProtrusion: 'derived' },
    })
  })

  it('draws a bare tool when nothing has been picked to hold it', () => {
    const viewer = toViewerAssembly({ tool: tool(), holder: null, stickout: null })

    expect(viewer.holder).toBeNull()
    expect(viewer.stickout).toBeNull()
    expect(assemblyOutline(viewer)?.segments.map((each) => each.part)).toEqual([
      'tip',
      'flutes',
      'shank',
    ])
  })

  it('draws the holder above the tool at the stickout it was given', () => {
    const outline = assemblyOutline(toViewerAssembly({ tool: tool(), holder, stickout: 19 }))
    const parts = new Set(outline?.segments.map((each) => each.part))

    // Which parts appear, not how many segments each takes: how a holder is cut
    // into segments is the package's business, and pinning it here would make
    // this adapter test fail for a change it knows nothing about.
    expect(parts).toEqual(new Set(['tip', 'flutes', 'shank', 'collet', 'nose', 'body', 'flange']))
    // The ⌀46 flange is the widest thing drawn, and it can only have arrived
    // through the adapter's `flangeDiameter`.
    expect(outline?.radius).toBe(23)
  })
})

/**
 * The declared classification, checked against the package that does the work.
 *
 * `DRAWABLE_FORMS` and `UNDRAWABLE_FORMS` are this application's belief about
 * what `@toolpath/tool-drawing` can draw, and a belief nobody checks is worth
 * nothing. So every form in the catalog's vocabulary is put through the real
 * `assemblyOutline` with geometry generous enough for any generator to use, and
 * the answer has to match the list.
 *
 * This is the sensor that fires when the package's generator list changes
 * underneath us in either direction — a form gaining a generator, or losing one.
 */
const probe = (form: ToolForm): CatalogTool =>
  tool({
    form,
    // Enough for every generator at once: a diameter, a flute length, a corner
    // radius and a point angle. A form that draws nothing from this draws
    // nothing from anything.
    geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, RE: 1, SIG: 118 },
  })

describe('which forms the drawing package can draw', () => {
  it('classifies every form the catalog can produce, exactly once', () => {
    const unclassified = ALL_FORMS.filter(
      (form) => !DRAWABLE_FORMS.has(form) && !UNDRAWABLE_FORMS.has(form),
    )
    const both = ALL_FORMS.filter((form) => DRAWABLE_FORMS.has(form) && UNDRAWABLE_FORMS.has(form))

    expect({ unclassified, both }).toEqual({ unclassified: [], both: [] })
    expect(DRAWABLE_FORMS.size + UNDRAWABLE_FORMS.size).toBe(ALL_FORMS.length)
  })

  it('draws every form it says it can', () => {
    const silent = ALL_FORMS.filter(
      (form) =>
        canDraw(form) &&
        assemblyOutline(toViewerAssembly({ tool: probe(form), holder: null, stickout: null })) ===
          null,
    )

    expect(silent).toEqual([])
  })

  it('draws nothing for a form it says it cannot, rather than a plausible cylinder', () => {
    const invented = ALL_FORMS.filter(
      (form) =>
        !canDraw(form) &&
        assemblyOutline(toViewerAssembly({ tool: probe(form), holder: null, stickout: null })) !==
          null,
    )

    expect(invented).toEqual([])
  })

  it('says nothing rather than something wrong when a form is unknown to both', () => {
    // Not a `ToolForm`, and that is the case being covered: whatever an
    // upstream change starts producing, the package draws no shape for it.
    const outline = assemblyOutline(
      toViewerAssembly({
        tool: tool({ form: 'gear hob' as ToolForm }),
        holder: null,
        stickout: null,
      }),
    )

    expect(outline).toBeNull()
  })
})

const profile: HolderProfile = {
  guid: 'h',
  catalogNumber: 'BT 30 / PG 6 x 050',
  datum: 'gage-line',
  points: [
    [-48.4, 8.8],
    [0, 15.875],
    [0, 23],
    [16, 23],
    [16, 15],
    [50, 5],
    [50, 0],
  ],
  complete: true,
  shortfallMm: null,
}

describe('a measured holder as drawing input', () => {
  it('hands the package a profile rather than a parametric holder', () => {
    const viewer = toViewerAssembly({ tool: tool(), holder, stickout: 20 }, profile)

    expect(viewer.holder).not.toBeNull()
    expect(isHolderProfile(viewer.holder!)).toBe(true)
  })

  it('stays parametric when this holder has not been measured', () => {
    const viewer = toViewerAssembly({ tool: tool(), holder, stickout: 20 })

    expect(viewer.holder).not.toBeNull()
    expect(isHolderProfile(viewer.holder!)).toBe(false)
  })

  /**
   * The vertices are passed through, never resampled or reduced. Reducing a
   * measured silhouette to a nose and a body throws away the only reason to
   * measure it, which is the rule the package's own type states.
   */
  it('passes the silhouette through vertex for vertex', () => {
    expect(toViewerHolderProfile(holder, profile).points).toEqual(profile.points.slice(1))
  })

  /**
   * What the spindle swallows is not drawn: the taper above the gage line is
   * cut off rather than scaled into the frame beside the tool.
   */
  it('cuts the profile off at the gage line', () => {
    const points = toViewerHolderProfile(holder, profile).points

    expect(points.every(([z]) => z >= 0)).toBe(true)
    expect(points[0]).toEqual([0, 15.875])
  })

  /**
   * A measurement of a bare holder cannot state what a seated collet does, so
   * the two collet facts still come off the vendor's table.
   */
  it('keeps the collet facts, which the vendor states and the model cannot', () => {
    const viewer = toViewerHolderProfile(holder, profile)

    expect(viewer.colletSeries).toBe('PG6')
    expect(viewer.colletProtrusion).toBe(2)
  })

  it('marks the silhouette as the vendors, because the model measured is theirs', () => {
    expect(toViewerHolderProfile(holder, profile).provenance).toMatchObject({
      points: 'vendor-stated',
      noseDiameter: 'vendor-stated',
      colletProtrusion: 'derived',
    })
  })

  /**
   * A profile the drawing package can turn into an outline. Without this the
   * adapter could be handing over a shape that compiles and draws nothing.
   */
  it('produces an outline the package can draw', () => {
    const outline = assemblyOutline(
      toViewerAssembly({ tool: tool(), holder, stickout: 20 }, profile),
    )

    expect(outline).not.toBeNull()
  })
})
