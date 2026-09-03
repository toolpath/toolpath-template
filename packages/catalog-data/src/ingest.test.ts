import { describe, expect, it } from 'vitest'

import { CATALOG_VERSION } from './types.js'
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
      LBH: 15,
      LD: 3,
    })
    expect(catalog.tools[0]?.provenance.LD).toBe('derived')
    expect(catalog.tools[0]?.unitSystem).toBe('millimeters')
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
    expect(catalog.tools[0]?.unitSystem).toBe('inches')
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

  /**
   * The cast is the point of the test, not a way around the type.
   *
   * `ScrapedTool` takes its geometry from `ToolRecord`, so a producer calling
   * `ingest` in the same process cannot put a `null` in one. This arrives as a
   * file on disk — a stale store, an older scraper, a hand-edit — and a file is
   * a boundary the type system does not reach across. The runtime guard is what
   * holds there, and this is what proves it still does.
   */
  it('reports a non-numeric measurement instead of coercing it to zero', () => {
    const onDisk = { DC: 5, RE: null } as unknown as ScrapedTool['geometry']
    const { catalog, notes } = ingest(
      scrape({ families: [family({ tools: [tool({ geometry: onDisk })] })] }),
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
  it('leaves material groups empty when the vendor rates it for nothing', () => {
    const { catalog } = ingest(
      scrape({ families: [family({ tools: [tool({ materialGroups: [] })] })] }),
    )

    expect(catalog.tools[0]?.materialGroups).toEqual([])
  })

  /**
   * The distinction catalog version 5 exists for.
   *
   * This read `scraped.materialGroups ?? []`, so a tool nobody rated arrived
   * indistinguishable from one the vendor rates for nothing. Every Harvey
   * record is the first — its material index is published per part, where a
   * scrape cannot reach it — so the collapse put a rating nobody made on
   * 12,773 tools.
   */
  it('keeps “nobody said” apart from “rated for nothing”', () => {
    const said = ingest(
      scrape({ families: [family({ tools: [tool({ materialGroups: [] })] })] }),
    ).catalog
    const silent = ingest(
      scrape({ families: [family({ tools: [tool({ materialGroups: null })] })] }),
    ).catalog

    expect(said.tools[0]?.materialGroups).toEqual([])
    expect(silent.tools[0]?.materialGroups).toBeNull()
  })

  /** A store written before the scraper carried the field at all. */
  it('reads an absent list as “nobody said”, not as an empty rating', () => {
    const { catalog } = ingest(
      scrape({ families: [family({ tools: [tool({ materialGroups: undefined })] })] }),
    )

    expect(catalog.tools[0]?.materialGroups).toBeNull()
  })

  /** Cast for the same reason as the geometry above: this is a file, not a call. */
  it('maps a kind it does not know to `other` rather than guessing', () => {
    const onDisk = 'burnisher' as unknown as ScrapedTool['kind']
    const { catalog } = ingest(scrape({ families: [family({ tools: [tool({ kind: onDisk })] })] }))

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
    expect(catalog.version).toBe(CATALOG_VERSION)
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

describe('the vendor’s product line', () => {
  it('reaches the catalog as the vendor stated it', () => {
    const { catalog } = ingest(
      scrape({ families: [family({ tools: [tool({ productLine: 'GOdrill™' })] })] }),
    )
    expect(catalog.tools[0]?.productLine).toBe('GOdrill™')
  })

  /**
   * Both silences are one. A vendor that names no line says `null`, and a
   * store written before `@toolpath/tool-scraper` recorded one says nothing at
   * all — neither is a name, and the catalog is not the place to tell them
   * apart, because there is nothing a reader could do differently.
   */
  it('is null where the vendor names none, and where the store predates the field', () => {
    const { catalog } = ingest(
      scrape({
        families: [
          family({
            tools: [
              tool({ productLine: null }),
              tool({ guid: '11111111-1111-5111-8111-111111111102' }),
            ],
          }),
        ],
      }),
    )
    expect(catalog.tools.map((each) => each.productLine)).toEqual([null, null])
  })
})

describe('one part the vendor published under two of its own facets', () => {
  const OTHER = '11111111-1111-5111-8111-111111111102'

  const bothWays = (): Scrape =>
    scrape({
      families: [
        family({
          id: 'end-mills-inch',
          unit: 'inches',
          tools: [tool({ geometry: { DC: 0.5, LCF: 1, NOF: 4 } })],
        }),
        family({
          id: 'end-mills-mm',
          unit: 'millimeters',
          tools: [tool({ geometry: { DC: 12.7, LCF: 25.4, NOF: 4 } })],
        }),
      ],
    })

  /**
   * EMUGE splits its end mill category by a unit facet and 750 parts carry
   * both values. Two catalog tools sharing a join key is what `buildCatalog`
   * refuses, and the millimetre listing is the one that is not a conversion.
   */
  it('is one tool, and it is the millimetre listing', () => {
    const { catalog } = ingest(bothWays())

    expect(catalog.tools).toHaveLength(1)
    expect(catalog.tools[0]?.familyId).toBe('end-mills-mm')
    expect(catalog.tools[0]?.unitSystem).toBe('millimeters')
  })

  /** Reported, never silent: the pair is a fact about the vendor's table. */
  it('says which listing it dropped and why', () => {
    const { notes } = ingest(bothWays())
    const note = notes.find((each) => each.code === 'guid')

    expect(note?.familyId).toBe('end-mills-inch')
    expect(note?.reason).toContain('kept the metric listing')
  })

  /**
   * A guid is `uuid5` under the brand's namespace, so a wrong seed is every
   * one of that vendor's guids. Two different parts sharing one still fails.
   */
  it('does not cover for a guid two different parts share', () => {
    expect(() =>
      ingest(
        scrape({
          families: [
            family({ id: 'one', tools: [tool({ catalogNumber: 'TDMX0500' })] }),
            family({ id: 'two', tools: [tool({ catalogNumber: 'TDMX0800' })] }),
          ],
        }),
      ),
    ).toThrow(/Duplicate tool guid/)
  })

  it('leaves an ordinary two-family scrape alone', () => {
    const { catalog, notes } = ingest(
      scrape({
        families: [
          family({ id: 'one', tools: [tool()] }),
          family({ id: 'two', tools: [tool({ guid: OTHER })] }),
        ],
      }),
    )

    expect(catalog.tools).toHaveLength(2)
    expect(notes.filter((each) => each.code === 'guid')).toEqual([])
  })
})
