import { describe, expect, it } from 'vitest'
import { IngestError, ingest, type Scrape, type ScrapedFamily, type ScrapedTool } from './ingest.js'

const GUID = '11111111-1111-5111-8111-111111111101'

const tool = (over: Partial<ScrapedTool> = {}): ScrapedTool => ({
  guid: GUID,
  catalogNumber: 'TDMX0500',
  materialNumber: '6694846',
  kind: 'endmill',
  geometry: { DC: 5, LCF: 13, OAL: 57, NOF: 4, SFDM: 6 },
  materialGroups: ['P', 'M'],
  ...over,
})

const family = (over: Partial<ScrapedFamily> = {}): ScrapedFamily => ({
  id: 'vhm-endmills',
  name: 'Solid carbide end mills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  unit: 'millimeters',
  tools: [tool()],
  ...over,
})

const scrape = (over: Partial<Scrape> = {}): Scrape => ({
  builtAt: '2026-08-27',
  families: [family()],
  ...over,
})

describe('ingest', () => {
  it('carries a metric family through untouched, plus what the pipeline derives', () => {
    const { catalog } = ingest(scrape())

    expect(catalog.tools[0]?.geometry).toEqual({
      DC: 5,
      LCF: 13,
      OAL: 57,
      NOF: 4,
      SFDM: 6,
      LBH: 18,
      LD: 3.6,
    })
    expect(catalog.tools[0]?.provenance.LD).toBe('derived')
    expect(catalog.tools[0]?.unitSystem).toBe('metric')
  })

  /**
   * One basis past this point. An inch family that stayed in inches would
   * compare against a metric one and silently answer with the wrong tool.
   */
  it('converts an inch family’s lengths to millimetres', () => {
    const { catalog } = ingest(
      scrape({
        families: [
          family({
            unit: 'inches',
            tools: [tool({ geometry: { DC: 0.5, LCF: 1, NOF: 4 } })],
          }),
        ],
      }),
    )

    expect(catalog.tools[0]?.geometry.DC).toBeCloseTo(12.7, 9)
    expect(catalog.tools[0]?.geometry.LCF).toBeCloseTo(25.4, 9)
    expect(catalog.tools[0]?.unitSystem).toBe('inch')
  })

  it('never converts a count or an angle', () => {
    const { catalog } = ingest(
      scrape({
        families: [
          family({
            unit: 'inches',
            tools: [tool({ kind: 'drill', geometry: { NOF: 4, SIG: 140 } })],
          }),
        ],
      }),
    )

    expect(catalog.tools[0]?.geometry).toEqual({ NOF: 4, SIG: 140 })
  })

  /**
   * An inch tap's pitch is conventionally threads-per-inch — a reciprocal, not
   * a length — so converting it would produce a plausible wrong number.
   */
  it('drops thread pitch and says why, rather than converting it', () => {
    const { catalog, notes } = ingest(
      scrape({
        families: [family({ tools: [tool({ kind: 'tap', geometry: { DC: 6.35, TP: 20 } })] })],
      }),
    )

    expect(catalog.tools[0]?.geometry).toEqual({ DC: 6.35 })
    expect(notes).toEqual([
      expect.objectContaining({ code: 'TP', reason: expect.stringContaining('unit convention') }),
    ])
  })

  it('reports a non-numeric measurement instead of coercing it to zero', () => {
    const { catalog, notes } = ingest(
      scrape({ families: [family({ tools: [tool({ geometry: { DC: 5, RE: null } })] })] }),
    )

    expect(catalog.tools[0]?.geometry.RE).toBeUndefined()
    expect(notes[0]).toMatchObject({ code: 'RE' })
  })

  it('keeps material groups in ISO 513 order, whatever order they arrived in', () => {
    const { catalog } = ingest(
      scrape({ families: [family({ tools: [tool({ materialGroups: ['S', 'M', 'P'] })] })] }),
    )

    expect(catalog.tools[0]?.materialGroups).toEqual(['P', 'M', 'S'])
  })

  /** Empty means the vendor indexes this tool under no material, not "all". */
  it('leaves material groups empty when the vendor states none', () => {
    const { catalog } = ingest(
      scrape({ families: [family({ tools: [tool({ materialGroups: [] })] })] }),
    )

    expect(catalog.tools[0]?.materialGroups).toEqual([])
  })

  it('maps a kind it does not know to `other` rather than guessing', () => {
    const { catalog } = ingest(
      scrape({ families: [family({ tools: [tool({ kind: 'burnisher' })] })] }),
    )

    expect(catalog.tools[0]?.toolType).toBe('other')
  })

  /**
   * The guid is the join key. A scrape that lost it is not something to paper
   * over with a generated one, because the generated one would differ from the
   * scraper's and every downstream reference would miss.
   */
  it('refuses a tool whose guid the scraper did not mint', () => {
    expect(() =>
      ingest(scrape({ families: [family({ tools: [tool({ guid: 'TDMX0500' })] })] })),
    ).toThrow(IngestError)
  })

  it('refuses a family in a unit system it cannot place', () => {
    expect(() => ingest(scrape({ families: [family({ unit: 'furlongs' as never })] }))).toThrow(
      IngestError,
    )
  })

  it('refuses a scrape with nothing in it', () => {
    expect(() => ingest(scrape({ families: [] }))).toThrow(IngestError)
  })

  it('stamps the producer’s build date and counts each family', () => {
    const { catalog } = ingest(scrape({ builtAt: '2026-09-01' }))

    expect(catalog.builtAt).toBe('2026-09-01')
    expect(catalog.families[0]?.toolCount).toBe(1)
    expect(catalog.version).toBe(4)
  })
})

describe('a form the vendor states', () => {
  /**
   * Harvey's keyseat cutters are `kind: 'endmill'` with a corner radius of
   * zero, which derives as a flat end mill — a 22 mm cutter with 1.6 mm of
   * flute offered to finish a pocket floor (Paul, 2026-09-01). The vendor's
   * own page title says what it is, and a stated form beats a derived one.
   */
  it('keeps a stated form over the one the geometry would derive', () => {
    const { catalog } = ingest(
      scrape({
        families: [
          family({
            tools: [
              tool({
                form: 'slot mill',
                geometry: { DC: 22.2, LCF: 1.57, OAL: 77.8, NOF: 12, SFDM: 12.7, RE: 0 },
              }),
            ],
          }),
        ],
      }),
    )

    expect(catalog.tools[0]?.form).toBe('slot mill')
    expect(catalog.tools[0]?.provenance.form).toBe('vendor-stated')
  })

  it('derives the form as before where none is stated', () => {
    const { catalog } = ingest(scrape())

    expect(catalog.tools[0]?.form).toBe('flat end mill')
    // Assumed, not stated: no corner radius is published, so a square end is
    // the reading rather than the vendor's word.
    expect(catalog.tools[0]?.provenance.form).toBe('assumed')
  })

  /** A word this catalog does not speak is reported, not written in. */
  it('reports a form it does not know and derives one instead', () => {
    const { catalog, notes } = ingest(
      scrape({ families: [family({ tools: [tool({ form: 'woodruff cutter' })] })] }),
    )

    expect(catalog.tools[0]?.form).toBe('flat end mill')
    expect(notes.map((each) => each.code)).toContain('form')
  })
})

describe('ingesting toolholding', () => {
  const holder = {
    guid: '44444444-4444-5444-8444-444444444401',
    catalogNumber: 'BT30ER16060M',
    familyId: 'bt30-holders',
    brand: 'Kennametal',
    vendor: 'Kennametal',
    unit: 'millimeters' as const,
    taper: 'BT30',
    clamping: 'collet',
    gaugeLength: 60,
    colletSeries: 'ER16',
  }

  const collet = {
    guid: '55555555-5555-5555-8555-555555555501',
    catalogNumber: 'ER16-6',
    familyId: 'er16-collets',
    brand: 'Kennametal',
    vendor: 'Kennametal',
    unit: 'millimeters' as const,
    series: 'ER16',
    clampMin: 5,
    clampMax: 6,
    clampLength: 18,
  }

  it('carries holders and collets into the catalog', () => {
    const { catalog } = ingest(scrape({ holders: [holder], collets: [collet] }))

    expect(catalog.holders).toHaveLength(1)
    expect(catalog.collets[0]?.series).toBe('ER16')
  })

  it('converts an inch holder’s lengths to millimetres', () => {
    const { catalog } = ingest(
      scrape({
        holders: [
          { ...holder, unit: 'inches', clamping: 'shrink', colletSeries: null, boreDiameter: 0.25 },
        ],
      }),
    )

    expect(catalog.holders[0]?.boreDiameter).toBeCloseTo(6.35, 9)
  })

  /** A collet holder that names no series cannot be matched to any collet. */
  it('refuses a collet holder with no series', () => {
    expect(() => ingest(scrape({ holders: [{ ...holder, colletSeries: null }] }))).toThrow(
      IngestError,
    )
  })

  it('refuses a bore holder that states no bore', () => {
    expect(() =>
      ingest(scrape({ holders: [{ ...holder, clamping: 'shrink', colletSeries: null }] })),
    ).toThrow(IngestError)
  })

  it('refuses a clamping style it cannot place', () => {
    expect(() => ingest(scrape({ holders: [{ ...holder, clamping: 'magnet' }] }))).toThrow(
      IngestError,
    )
  })

  it('refuses a collet whose range is backwards', () => {
    expect(() => ingest(scrape({ collets: [{ ...collet, clampMin: 8, clampMax: 6 }] }))).toThrow(
      IngestError,
    )
  })

  /** Toolholding shares the tools' guid space; a reused guid is a corrupt dataset. */
  it('refuses a holder reusing a tool’s guid', () => {
    expect(() => ingest(scrape({ holders: [{ ...holder, guid: GUID }] }))).toThrow(/guid/i)
  })

  it('leaves both empty when the scrape carries no toolholding', () => {
    const { catalog } = ingest(scrape())

    expect(catalog.holders).toEqual([])
    expect(catalog.collets).toEqual([])
  })
})
