import { AEM_BRANDS, familyBrand, type ToolRecord } from '@toolpath/tool-scraper'
import { boundFamilies } from '@toolpath/tool-scraper/registry'
import { describe, expect, it } from 'vitest'

import { statedForm } from './forms.js'
import { familyTitle, reachable, sharedDescription, threadSystemOf } from './scrape.js'

/**
 * The rules this package holds *about* the scraper's family table.
 *
 * Each one is knowledge the scraper does not state and something here has to
 * supply. That is a fine place for it to live and a terrible place for it to
 * rot: the table upstream gains families, and a rule written against the
 * families that existed when it was written goes quietly wrong on the next
 * one — a tap scraped under the wrong thread system, a keyseat cutter entering
 * the catalog as a flat end mill.
 *
 * So each rule is checked against the **whole live table** rather than against
 * a fixture. These fail when the scraper is upgraded and a rule no longer
 * covers what it claims to, which is the only moment anyone can act on it.
 */

const families = [...boundFamilies()]

describe('the family table this package scrapes', () => {
  it('has families to check, so a silent empty table cannot pass every test below', () => {
    expect(families.length).toBeGreaterThan(10)
  })
})

describe('a tap family states its thread system in its id', () => {
  /**
   * The scraper refuses to default a thread system — its two readers once
   * defaulted in opposite directions and produced a silent unit mix — and its
   * family table declares no fact for it. The id is the only thing that states
   * it, so every tap family's id has to.
   *
   * **Every AEM tap family**, which is the scope the rule actually has.
   * `Thread System` is a constant column supplied to Kennametal's variant-table
   * request; it is a property of that transport and not of taps. `rowsFor` asks
   * for it on the AEM path and nowhere else.
   *
   * EMUGE proved the distinction twice. It arrived upstream on 2026-09-01 with
   * the family id `taps`, which states neither system, and failed here; scoping
   * to reachable families deferred that, and publishing its adapter in 2.0.0
   * made it fail again. The vendor's own family table gives the answer:
   * *"Drilling and tapping have no such facet and no such split — every drill
   * and every tap, including a `#4-40 UNC` one, is published in millimetres …
   * there is no per-row thread system to read, because the vendor states one
   * system for all of them."* An EMUGE tap family declares a `unit` instead,
   * which is why it needs nothing from this rule.
   *
   * So the sensor is narrowed to what it governs rather than softened: a sixth
   * vendor on the AEM transport still fails here until its ids state a system.
   */
  it('every tap family on the AEM transport', () => {
    const taps = families.filter(
      ([, family]) =>
        family.kind === 'tap' &&
        (AEM_BRANDS as ReadonlyArray<string>).includes(familyBrand(family)),
    )
    expect(taps.length).toBeGreaterThan(0)

    const silent = taps
      .filter(([, family]) => threadSystemOf(family.id) === null)
      .map(([name]) => name)

    expect(silent).toEqual([])
  })

  it('reads the system the id names', () => {
    expect(threadSystemOf('khsst-hand-metric-plug')).toBe('metric')
    expect(threadSystemOf('khsst-spiral-point-plug-inch')).toBe('inch')
  })

  it('refuses an id that names both or neither, rather than guessing one', () => {
    expect(threadSystemOf('metric-inch-plug')).toBeNull()
    expect(threadSystemOf('spiral-point-plug')).toBeNull()
  })
})

describe('a keyseat cutter is not a flat end mill', () => {
  /**
   * Harvey files its keyseat families under `kind: 'endmill'` because the
   * scraper has no finer kind. Ingested on the kind alone they come out as flat
   * end mills with a corner radius of zero — which is how a 22 mm cutter with
   * 1.6 mm of flute and twelve teeth was offered to finish a pocket floor
   * (Paul, 2026-09-01).
   *
   * `statedForm` matches them on the scraper's own family id. A 53rd keyseat
   * family fails here rather than in the catalog.
   */
  it('every family the scraper ids as a keyseat has a stated form', () => {
    const keyseats = families.filter(([, family]) => family.id.startsWith('keyseat-'))
    expect(keyseats.length).toBeGreaterThan(0)

    const unnamed = keyseats
      .filter(([, family]) => statedForm(familyBrand(family), family.id) === null)
      .map(([name]) => name)

    expect(unnamed).toEqual([])
  })

  it('says nothing about a family whose form the geometry can derive', () => {
    expect(statedForm('kennametal', 'gomill-pro-square-4fl-plain-inch')).toBeNull()
    expect(statedForm('destinytool', 'end-mills-inch')).toBeNull()
  })
})

describe('which families this package can actually scrape', () => {
  /**
   * Every one, as of `@toolpath/tool-scraper` 2.0.0.
   *
   * This test used to assert the opposite for Harvey — that `reachable` gave a
   * reason mentioning `PRODUCT_PAGES` — because the page table built into
   * `dist`, shipped in the tarball, and was reachable through no subpath. That
   * assertion was written to fail the day the export landed, so that the skip
   * could not outlive the gap it was written for. It landed, this failed, and
   * the skip came out.
   *
   * Kept in the stronger form: a cutting-tool family the scraper declares and
   * this package cannot fetch is now a fault, not a fact of life. A new vendor
   * upstream fails here until somebody wires its transport in — which is the
   * moment to do it, rather than after a scrape has quietly missed it.
   */
  it('can fetch every cutting-tool family the scraper declares', () => {
    expect(families.length).toBeGreaterThan(60)

    const refused = families.flatMap(([name, family]) => {
      const why = reachable(name, family)
      return why === null ? [] : [`${name}: ${why}`]
    })

    expect(refused).toEqual([])
  })

  it('drives all five cutting-tool vendors', () => {
    const brands = new Set(families.map(([, family]) => familyBrand(family)))

    expect([...brands].sort()).toEqual(['destinytool', 'emuge', 'harvey', 'kennametal', 'widia'])
  })

  it('covers drills, taps and end mills', () => {
    const kinds = new Set(
      families
        .filter(([name, family]) => reachable(name, family) === null)
        .map(([, family]) => family.kind),
    )

    expect([...kinds].sort()).toEqual(['drill', 'endmill', 'tap'])
  })
})

describe('the vendor’s own name for a family', () => {
  /**
   * Kennametal and WIDIA state it in the `h1` above the variants table, and
   * the scraper tags every row with it. Constant down the whole table, so the
   * first row is the whole answer.
   */
  it('is read off the family-title column the scrape tagged the rows with', () => {
    expect(
      familyTitle([{ 'Family Title': 'KenCut™ FF • Square End • Inch', 'Catalog Number': 'x' }]),
    ).toBe('KenCut™ FF • Square End • Inch')
  })

  it('is null where the vendor’s table carries no such column', () => {
    expect(familyTitle([{ 'Catalog Number': 'x' }])).toBeNull()
    expect(familyTitle([])).toBeNull()
  })

  /**
   * An empty cell is not a name. Without this the family would be called `''`
   * and the catalog would show a card with no heading — worse than the id it
   * falls back to.
   */
  it('is null where the column is there and empty', () => {
    expect(familyTitle([{ 'Family Title': '   ' }])).toBeNull()
  })
})

describe('the name a vendor states once for a whole family', () => {
  const record = (description: string): ToolRecord => ({ description }) as unknown as ToolRecord

  /**
   * Harvey publishes a title per product page and no per-part text, so every
   * record of one of its families carries that family's name. Without this all
   * 52 are called `harvey endmill 004`.
   */
  it('is the description every record shares', () => {
    expect(sharedDescription([record('Square End Mills'), record('Square End Mills')])).toBe(
      'Square End Mills',
    )
  })

  /**
   * A description that differs down the table is a fact about a part. Naming
   * the family after the first row's would be this package writing the
   * vendor's catalogue — Destiny Tool's vary per part, and it gets nothing.
   */
  it('is nothing where the descriptions differ', () => {
    expect(sharedDescription([record('1/4" 3FL'), record('1/2" 3FL')])).toBeNull()
  })

  /** Kennametal publishes no description. Shared, and still not a name. */
  it('is nothing where the vendor publishes none', () => {
    expect(sharedDescription([record(''), record('')])).toBeNull()
    expect(sharedDescription([])).toBeNull()
  })
})
