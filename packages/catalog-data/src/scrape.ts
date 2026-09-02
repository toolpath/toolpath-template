import {
  AEM_BRANDS,
  BRANDS,
  FAMILY_TITLE_COLUMN,
  REQUEST_DELAY_MS,
  familyBrand,
  pause,
  productLink,
  type AemBrandName,
  type BoundFamily,
  type BrandName,
  type Fetcher,
  type ScrapeResult,
  type ScrapedRow,
  type ToolRecord,
  type UnitSystem,
  type Warn,
} from '@toolpath/tool-scraper'
import { SCRAPE_TARGETS } from '@toolpath/tool-scraper/families/emuge'
import { PRODUCT_PAGES } from '@toolpath/tool-scraper/families/harvey'
import { boundFamilies, toRecords } from '@toolpath/tool-scraper/registry'
import { scrapeEndMills } from '@toolpath/tool-scraper/vendors/destinytool'
import { scrapeCategory, type EmugeTarget } from '@toolpath/tool-scraper/vendors/emuge'
import { scrapeProduct } from '@toolpath/tool-scraper/vendors/harvey'
import { addThreadPitch, scrapeFamily } from '@toolpath/tool-scraper/vendors/kennametal'

import { statedForm } from './forms.js'
import type { ScrapedFamily, ScrapedTool } from './ingest.js'

/**
 * Running the vendors' scrapers, and handing their records to the ingest.
 *
 * ## Why this is a module and not a script
 *
 * It was `scripts/scrape.mjs`: 269 lines that resolved `@toolpath/tool-scraper`
 * out of `process.env.TOOLPATH_SCRAPER` and dynamic-imported eleven modules
 * from a sibling checkout's `dist/`. Every one of them was `any`, so a rename
 * upstream was not a build failure but an `undefined is not a function` partway
 * through a thirteen-thousand-part scrape. And a `scripts` directory inside a
 * package is outside `LINTED` in `eslint.config.js` — `eslint --print-config`
 * on that file resolves **zero rules** — so the module holding more vendor
 * knowledge than any other in this repository was the one no rule applied to.
 *
 * The scraper is published now, so it is an ordinary dependency and this is
 * ordinary source. `scripts/scrape.mjs` keeps only what needs `fs`: argument
 * parsing, writing, and the progress column.
 *
 * ## Cutting tools only
 *
 * Drills, taps and end mills — the three `ToolKind`s the scraper mints records
 * for. **Toolholding is deliberately not here.** No toolholding family carries
 * a column map or a record mapper, so there is no record seam to take a handoff
 * at, and the vendors' own column labels have to be read by `src/vendors/`
 * instead. That is a stopgap by construction and it is untouched by this
 * module; see `docs/TOOL-SCRAPER-REFACTOR.md` § step 6.
 *
 * ## It does not touch the filesystem
 *
 * Every family is handed to `onFamily` as it finishes, so the caller writes it
 * before the next one starts. That is what makes a scrape resumable: the old
 * script logged a failed family and wrote its single output file at the end, so
 * one 404 in the last minute cost every family that had already succeeded.
 */

/** Where a family got to, in the caller's own words rather than a log line. */
export type Outcome = 'scraped' | 'skipped' | 'failed'

/** One family's result, whatever became of it. */
export interface FamilyOutcome {
  /** The scraper's own key for the family — `godrill_3xd_metric.csv`. */
  readonly csvName: string
  /** The same, as the catalog ids it: no extension. */
  readonly id: string
  readonly outcome: Outcome
  /** Present exactly when the outcome is `scraped`. */
  readonly family?: ScrapedFamily
  /** Why it was skipped, or how it failed. */
  readonly reason?: string
  /**
   * Rows the vendor published that no record was made from.
   *
   * Reported rather than logged: a family that silently maps four rows in five
   * is the failure this number exists to catch, and a caller must see it.
   */
  readonly unmapped?: number
}

export interface ScrapeOptions {
  readonly fetcher: Fetcher
  /** Called as each family finishes, so the caller can write it and print. */
  readonly onFamily: (outcome: FamilyOutcome) => void | Promise<void>
  /**
   * Families to leave alone, and why in the caller's own words.
   *
   * A reason rather than a boolean because the caller has more than one, and
   * the receipt states it: "already in the store" and "not the family --only
   * named" are different facts, and a run that reported the first for the
   * second put a false statement in the file that exists to be trusted.
   */
  readonly skip?: (csvName: string) => string | null
  /** Where the vendors' own data earns a warning. */
  readonly warn?: Warn
}

export class ScrapeError extends Error {}

/**
 * A tap family's thread system, from the family id that states it.
 *
 * The scraper refuses to default this — its two readers once defaulted in
 * opposite directions and produced a silent unit mix — and its family table
 * declares no thread-system fact, so the answer has to come from somewhere.
 * The id states it: `khsst_hand_metric_plug`, `spiral_point_metric_plug`,
 * `khsst_spiral_point_plug_inch`.
 *
 * A family whose id says neither, or both, returns `null` and fails by name.
 * `scrape.test.ts` runs this over every `tap` family **on the AEM transport**,
 * so that failure lands at `pnpm test` rather than partway through a scrape.
 * Scoped there because that is the only transport deriving a thread system
 * from an id: EMUGE's `emuge_taps` is a tap whose id states neither, and it is
 * scraped by category and never asks this.
 */
export const threadSystemOf = (familyId: string): 'metric' | 'inch' | null => {
  const metric = /(^|-)metric(-|$)/.test(familyId)
  const inch = /(^|-)inch(-|$)/.test(familyId)
  if (metric === inch) {
    return null
  }
  return metric ? 'metric' : 'inch'
}

/**
 * EMUGE's targets, by CSV name.
 *
 * `SCRAPE_TARGETS` is declared `as const`, so its type is the four keys it has
 * rather than a record — reading it with a `string` is a type error, and this
 * is the one place that widens it. Harvey's `PRODUCT_PAGES` declares itself a
 * `Record<string, string>` and needs no equivalent.
 */
const targetFor = (csvName: string): EmugeTarget | undefined =>
  (SCRAPE_TARGETS as Readonly<Record<string, EmugeTarget>>)[csvName]

/**
 * The families this module can scrape, and the ones it has to pass over.
 *
 * Every vendor needs one thing to be fetchable, and they keep it in different
 * places: Kennametal and WIDIA in the family's own `familyCode`, Destiny Tool
 * nowhere because its target is a fixed endpoint, and Harvey and EMUGE in a
 * sibling table keyed by the same CSV name — a product-page path and a
 * category-plus-facet respectively. Neither fits `FamilyDefinition`, which has
 * no word for either and should not grow one for a single vendor.
 *
 * Both sibling tables were unreachable until `@toolpath/tool-scraper` 2.0.0
 * published `./families/harvey` and `./families/emuge`; before that this
 * returned a reason for all 52 Harvey families, and the only way to reach them
 * was to deep-import a `dist/` path, which is what this module exists not to do.
 *
 * What is left is a family declared in one table and not its sibling, which is
 * a fault upstream and is named as one.
 */
export const reachable = (csvName: string, family: BoundFamily): string | null => {
  const brand = familyBrand(family)

  if (brand === 'destinytool') {
    return null
  }
  if (brand === 'harvey') {
    return PRODUCT_PAGES[csvName] === undefined ? 'no Harvey product page is declared for it' : null
  }
  if (brand === 'emuge') {
    return targetFor(csvName) === undefined ? 'no EMUGE scrape target is declared for it' : null
  }
  if (!aemBrand(brand)) {
    return `no cutting-tool scraper reachable from this package drives ${brand}`
  }
  if (family.familyCode === undefined) {
    return 'the family declares no familyCode, and only Destiny Tool is scraped without one'
  }
  return null
}

/**
 * Whether a brand is one of the two the AEM variant-table scraper serves.
 *
 * `scrapeFamily` takes an `AemBrandName` and not a `BrandName`, which is the
 * scraper being precise rather than awkward: Kennametal and WIDIA are one
 * storefront, and the other three vendors are nothing like it.
 */
const aemBrand = (brand: BrandName): brand is AemBrandName =>
  AEM_BRANDS.some((each) => each === brand)

/**
 * A family's declared unit, refused rather than defaulted where it has none.
 *
 * Harvey and EMUGE both need one to choose every `_mm`/`_in` suffix, and a
 * default would put a whole family's dimensions in the wrong system without
 * anything reading wrong.
 */
const unitOf = (csvName: string, family: BoundFamily): UnitSystem => {
  if (family.unit === undefined) {
    throw new ScrapeError(`family ${csvName} declares no unit`)
  }
  return family.unit
}

/**
 * Kennametal and WIDIA are asked for the family page as well as its table.
 *
 * **A second request per family, and it buys the two names this catalog had
 * none of.** The variants table states no product line and no family name —
 * the vendor puts both in the `h1` above it, which is a different AEM resource
 * — so without this a Kennametal family is called `godrill 3xd metric`, its id
 * with the underscores taken out, and every one of its tools has a `null`
 * product line. Thirteen extra requests across the whole run, paced by the
 * scraper's own delay.
 */
const AEM_TITLE = { familyTitle: true } as const

/** One family's rows, by whichever of the vendors' scrapers owns it. */
const rowsFor = async (
  fetcher: Fetcher,
  csvName: string,
  family: BoundFamily,
  warn?: Warn,
): Promise<ScrapeResult> => {
  const brand = familyBrand(family)

  if (brand === 'destinytool') {
    return scrapeEndMills(fetcher)
  }

  if (brand === 'harvey') {
    // One product page per family, and the page's own matrix explodes into one
    // row per orderable part. `reachable` refused a family with no page.
    const page = PRODUCT_PAGES[csvName] ?? ''
    return scrapeProduct(fetcher, page, { unit: unitOf(csvName, family), warn })
  }

  if (brand === 'emuge') {
    // A category, optionally narrowed by one of the vendor's own facets. This
    // scrape paces itself between every request it makes, unlike Harvey's, so
    // the delay between families in `scrapeCuttingTools` is all it needs.
    const target = targetFor(csvName)
    if (target === undefined) {
      throw new ScrapeError(`no EMUGE scrape target is declared for ${csvName}`)
    }
    return scrapeCategory(fetcher, target, { unit: unitOf(csvName, family), warn })
  }

  if (!aemBrand(brand)) {
    throw new ScrapeError(`no cutting-tool scraper reachable from this package drives ${brand}`)
  }

  // Never undefined: `reachable` refused an AEM family without one.
  const code = family.familyCode ?? ''

  if (family.kind === 'tap') {
    const system = threadSystemOf(family.id)
    if (system === null) {
      throw new ScrapeError(`family id ${family.id} states neither metric nor inch`)
    }
    // `Thread Pitch` is derived from `D1-TDZ` rather than published, which is
    // why the scraper's CLI has a separate command for it. The annotator
    // composes here, with no CSV in between.
    return addThreadPitch(
      await scrapeFamily(fetcher, code, brand, [['Thread System', system]], AEM_TITLE),
    )
  }

  return scrapeFamily(fetcher, code, brand, [], AEM_TITLE)
}

/**
 * The vendor's own name for the family, where the scrape carried one.
 *
 * Constant down the whole table — that is what makes it the *family's* title
 * and not a part's description — so the first row is the whole answer, and a
 * table that carries no such column has none rather than an empty one.
 *
 * Only Kennametal and WIDIA write it today, off the `h1` of the family page
 * {@link AEM_TITLE} asks for. It is read here rather than off a `ToolRecord`
 * because a record has no field for it and should not: the title names a group
 * of parts, and only its leading segment — the product line — is a fact about
 * any one of them.
 */
export const familyTitle = (rows: ReadonlyArray<ScrapedRow>): string | null => {
  const stated = rows[0]?.[FAMILY_TITLE_COLUMN]?.trim() ?? ''
  return stated === '' ? null : stated
}

/**
 * The one description every record in the family shares, where there is one.
 *
 * Harvey is why this exists. It publishes a title for a whole product page and
 * no per-part text, so `ToolRecord.description` is that family's name on every
 * one of its records — the scraper says so outright. Without this, all 52
 * Harvey families are called `harvey endmill 004`, which is a scrape's own key
 * and not a name anybody can pick a family by.
 *
 * **Shared is the test, and it is what keeps this honest.** A description that
 * differs down the table is a fact about a part, and naming the family after
 * the first row's would be this package writing a vendor's catalogue: Destiny
 * Tool's descriptions vary per part and it correctly gets nothing here.
 * Kennametal publishes no description at all — `''` on every record, which is
 * shared and is still not a name — so the empty string is refused too.
 */
export const sharedDescription = (records: ReadonlyArray<ToolRecord>): string | null => {
  const first = records[0]?.description.trim() ?? ''
  if (first === '') {
    return null
  }
  return records.every((record) => record.description.trim() === first) ? first : null
}

/**
 * One family, scraped and mapped onto the handoff.
 *
 * The mapping is the scraper's own: `toRecords` checks the scrape's header
 * against the family's column map before it maps a single row, so a re-scrape
 * whose part-number column was renamed fails by name instead of minting every
 * guid off an empty string.
 */
export const scrapeOne = async (
  fetcher: Fetcher,
  csvName: string,
  family: BoundFamily,
  warn?: Warn,
): Promise<{ family: ScrapedFamily; unmapped: number }> => {
  const brand = familyBrand(family)
  const scrape = await rowsFor(fetcher, csvName, family, warn)
  const records = toRecords(csvName, scrape, warn === undefined ? {} : { warn })
  const form = statedForm(brand, family.id)

  const tools: ReadonlyArray<ScrapedTool> = records.map((record) => ({
    guid: record.guid,
    catalogNumber: record.catalogNumber,
    materialNumber: record.materialNumber,
    kind: record.kind,
    ...(form === null ? {} : { form }),
    geometry: record.geometry,
    materialGroups: record.materialGroups,
    productLine: record.productLine,
    productLink: productLink(record.brand, record.materialNumber),
  }))

  const id = csvName.replace(/\.csv$/, '')

  return {
    family: {
      id,
      name: familyTitle(scrape.rows) ?? sharedDescription(records) ?? id.replaceAll('_', ' '),
      brand: BRANDS[brand].vendor,
      vendor: BRANDS[brand].vendor,
      unit: family.unit ?? records[0]?.unit ?? 'millimeters',
      source: scrape.source,
      tools,
    },
    unmapped: scrape.rows.length - tools.length,
  }
}

/**
 * Every cutting-tool family the scraper declares, one at a time.
 *
 * Paced by the scraper's own `REQUEST_DELAY_MS` between families, which is the
 * courtesy the vendors' catalogs are owed and the reason a full run is an
 * afternoon rather than a burst.
 */
export const scrapeCuttingTools = async (options: ScrapeOptions): Promise<void> => {
  for (const [csvName, family] of boundFamilies()) {
    const id = csvName.replace(/\.csv$/, '')

    const asked = options.skip?.(csvName) ?? null
    if (asked !== null) {
      await options.onFamily({ csvName, id, outcome: 'skipped', reason: asked })
      continue
    }

    const unreachable = reachable(csvName, family)
    if (unreachable !== null) {
      await options.onFamily({ csvName, id, outcome: 'skipped', reason: unreachable })
      continue
    }

    try {
      const { family: scraped, unmapped } = await scrapeOne(
        options.fetcher,
        csvName,
        family,
        options.warn,
      )
      await options.onFamily({ csvName, id, outcome: 'scraped', family: scraped, unmapped })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await options.onFamily({ csvName, id, outcome: 'failed', reason })
    }

    await pause(REQUEST_DELAY_MS)
  }
}
