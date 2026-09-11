import {
  AEM_BRANDS,
  familyBrand,
  type BoundToolholding,
  type ToolRecord,
} from '@toolpath/tool-scraper'
import { boundFamilies, boundToolholding } from '@toolpath/tool-scraper/registry'
import { describe, expect, it } from 'vitest'

import { statedForm } from './forms.js'
import {
  familyTitle,
  holdingReachable,
  needsCadPass,
  reachable,
  sharedDescription,
  threadSystemOf,
} from './scrape.js'

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
const holding = [...boundToolholding()]

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

  /**
   * The scraper's own tag vocabulary, which is a thread standard rather than a
   * unit system: `Thread System` is refused upstream unless it is exactly
   * `metric` or `inch`. Spelling it in catalog 9's unit words instead is what
   * silently emptied all three Kennametal tap families — see `threadSystemOf`.
   */
  it('reads the system the id names, in the tag the scrape carries', () => {
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

describe('which toolholding families this package can actually scrape', () => {
  /**
   * The counterpart of the cutting-tool check above, and it demands the same
   * empty answer — as of 2026-09-10, when the scraper began stating a
   * `familyCode` on a toolholding family and `KENNAMETAL_HOLDING_CODES` came
   * out of `scrape.ts`. Until then this held a list: seven Kennametal holder
   * families were declared upstream with no AEM code typed out here, and the
   * code could not be derived, because Kennametal's category pages build their
   * family lists in the browser.
   *
   * **A family arriving here is a regression, not a note.** Either it landed
   * upstream with no target wired, or a target stopped resolving — both worth
   * knowing while the scrape is being set up rather than after a run has
   * quietly missed them. That is not hypothetical: eleven REGO-FIX collet
   * families sat unreachable through every scrape until 2026-09-08, because
   * nothing asked this question.
   */
  it('reaches every toolholding family the scraper declares', () => {
    expect(holding.length).toBeGreaterThan(20)

    const refused = holding
      .map(([name, family]) => [name, holdingReachable(name, family)] as const)
      .filter(([, reason]) => reason !== null)
      .map(([name, reason]) => `${name}: ${String(reason)}`)

    expect(refused).toEqual([])
  })

  /**
   * The refusal still has to be reachable, or the check above passes because
   * nothing can fail rather than because everything resolves. A real family
   * with the one fact removed is the smallest way to ask.
   */
  it('answers before a request, naming the brand and the family', () => {
    const entry = holding.find(([, family]) => familyBrand(family) === 'kennametal')

    expect(entry).toBeDefined()
    const [name, family] = entry as [string, BoundToolholding]

    expect(holdingReachable(name, { ...family, familyCode: undefined })).toBe(
      `kennametal declares no scrape target for ${name}`,
    )
  })
})

describe('which toolholding families need the CAD pass', () => {
  /**
   * The pass is one paced request per row on top of the family scrape, so which
   * families take it is a cost as well as a rule — and it is checked against the
   * live table rather than a fixture for the reason every rule in this file is.
   *
   * **Kennametal holders and nothing else**, today. MariTool and REGO-FIX
   * publish a model link on the page their holders come from, so a second pass
   * would spend a request per row to overwrite a URL the record already has.
   */
  it('asks it of every Kennametal holder family', () => {
    const kennametalHolders = holding.filter(
      ([, family]) => familyBrand(family) === 'kennametal' && family.kind === 'holder',
    )

    expect(kennametalHolders.length).toBeGreaterThan(100)
    expect(kennametalHolders.every(([, family]) => needsCadPass(family))).toBe(true)
  })

  /**
   * A collet is held rather than drawn — nothing measures one and `drawable`
   * never asks it for a silhouette — so the 443 requests are the whole cost of
   * a column with no reader.
   */
  it('asks it of no collet family, and of no other brand', () => {
    const asked = holding
      .filter(([, family]) => needsCadPass(family))
      .map(([, family]) => `${familyBrand(family)} ${family.kind}`)

    expect([...new Set(asked)]).toEqual(['kennametal holder'])
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

/**
 * That both ways of making a thread are reachable at all.
 *
 * The shim this block used to check is gone: `@toolpath/tool-scraper` 2.4.0
 * states `threadMethod` on a tap record and `scrapeOne` carries it straight
 * through, so the field's type is the compiler's to pin and the carry-through
 * is `ingest.test.ts`'s. What neither can see is the **table**: a `form tap`
 * hole is answered from EMUGE's `FG02`, the only forming-tap family any of
 * these vendors reaches, and losing it upstream would quietly go back to
 * offering cutting taps for a rolled thread with nothing saying so.
 */
describe('the taps this package scrapes state how they make a thread', () => {
  const taps = families.filter(([, family]) => family.kind === 'tap')

  it('states a method on every tap family', () => {
    expect(taps.length).toBeGreaterThan(0)
    expect(
      taps.filter(([, family]) => family.threadMethod === undefined).map(([csvName]) => csvName),
    ).toEqual([])
  })

  it('reaches a forming family as well as a cutting one', () => {
    expect([...new Set(taps.map(([, family]) => family.threadMethod))].sort()).toEqual([
      'cutting',
      'forming',
    ])
  })
})
