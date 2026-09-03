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
  type BoundToolholding,
  type BrandName,
  type ColletRecord,
  type HolderRecord,
  IncompletePartError,
  buildProfiles,
  layersToProfile,
  taperDesignation,
  PROFILES_VERSION as SCRAPER_PROFILES_VERSION,
  type HolderProfile as ScrapedHolderProfile,
  type MeasuredHolder,
  type ProfilesDocument,
  type Fetcher,
  type ScrapeResult,
  type ScrapedRow,
  type ToolRecord,
  type UnitSystem,
  type Warn,
} from '@toolpath/tool-scraper'
import { SCRAPE_TARGETS } from '@toolpath/tool-scraper/families/emuge'
import { PRODUCT_PAGES } from '@toolpath/tool-scraper/families/harvey'
import { LEAVES as MARITOOL_LEAVES } from '@toolpath/tool-scraper/families/maritool'
import {
  boundFamilies,
  boundToolholding,
  toHolding,
  toRecords,
} from '@toolpath/tool-scraper/registry'
import { scrapeEndMills } from '@toolpath/tool-scraper/vendors/destinytool'
import { scrapeCategory, type EmugeTarget } from '@toolpath/tool-scraper/vendors/emuge'
import { scrapeProduct } from '@toolpath/tool-scraper/vendors/harvey'
import { addThreadPitch, scrapeFamily } from '@toolpath/tool-scraper/vendors/kennametal'
import { scrapeHolders as scrapeMaritoolHolders } from '@toolpath/tool-scraper/vendors/maritool'
import {
  scrapeCollets as scrapeRegofixCollets,
  scrapeHolders as scrapeRegofixHolders,
} from '@toolpath/tool-scraper/vendors/regofix'
import { createHolderApi, measureHolder } from '@toolpath/tool-scraper/node'

import { statedForm } from './forms.js'
import type { ScrapedCollet, ScrapedFamily, ScrapedHolder, ScrapedTool } from './ingest.js'

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
export const threadSystemOf = (familyId: string): 'millimeters' | 'inches' | null => {
  const metric = /(^|-)metric(-|$)/.test(familyId)
  const inch = /(^|-)inch(-|$)/.test(familyId)
  if (metric === inch) {
    return null
  }
  return metric ? 'millimeters' : 'inches'
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

/**
 * ## Toolholding
 *
 * The record seam, taken. Until 2026-09-02 this module scraped cutting tools
 * only, because no toolholding family carried a record mapper and the vendors'
 * own column labels were all that existed upstream; `src/vendors/` read them
 * here as a stopgap that named itself one. `@toolpath/tool-scraper` 2.1.0 mints
 * `HolderRecord` and `ColletRecord`, so the handoff happens at the same seam a
 * cutting tool's does and the vendor knowledge stays where its tests are.
 *
 * **What the record does not carry.** A `HolderRecord` states a taper, a
 * clamping mode, a gage length, a bore, a body diameter and a lock-nut
 * diameter. It does not state a nose diameter, a nose length, a projection or a
 * flange diameter — the four the REGO-FIX stopgap pinned by hand off DIN 4000
 * sheets. Those are silhouette facts, and the honest source for a silhouette is
 * the vendor's own CAD model: the record carries `cadModelUrl`, and
 * `docs/HOLDER-PROFILES.md` is the pipeline that turns it into one. So a holder
 * ingested here draws from its measured profile or draws plainly, and does not
 * get four numbers nobody published.
 */

/** How this package drives one vendor's toolholding scrape. */
type HoldingScraper = (
  fetcher: Fetcher,
  csvName: string,
  warn?: Warn,
) => Promise<ScrapeResult> | null

/**
 * The vendors whose toolholding this package can reach, and how.
 *
 * A table rather than a chain of `if`s, for the reason `reachable` gives about
 * cutting tools: a brand that is absent is a brand this package cannot scrape
 * *yet*, which is a different thing from a brand the scraper cannot map, and
 * the two need to be told apart in a message.
 *
 * REGO-FIX's collet groups are the vendor's own `product_group_name` and the
 * sizes are the ones its BT30 holders take — both come off `families/regofix.ts`
 * rather than being typed here, except the group name, which is the one string
 * the family config does not carry.
 */
const HOLDING_SCRAPERS: Readonly<Record<string, HoldingScraper>> = {
  maritool: (fetcher, csvName, warn) => {
    const leaves = MARITOOL_LEAVES[csvName as keyof typeof MARITOOL_LEAVES]
    return leaves === undefined
      ? null
      : scrapeMaritoolHolders(fetcher, leaves, warn === undefined ? {} : { warn })
  },
  regofix: (fetcher, csvName, warn) => {
    const options = warn === undefined ? {} : { warn }
    if (csvName === 'regofix_bt30_pg_holders.csv') {
      return scrapeRegofixHolders(fetcher, 'BT/PG', 'BT', options)
    }
    const group = REGOFIX_COLLET_GROUPS[csvName]
    return group === undefined
      ? null
      : scrapeRegofixCollets(fetcher, group, BT30_COLLET_SIZES, options)
  },
}

/**
 * The PG sizes REGO-FIX's BT 30 holders take.
 *
 * Declared here because the scraper keeps it in its CLI rather than exporting
 * it — the same four the `regofix collets` command restricts to, and the reason
 * is the same: a PG 32 collet fits no holder in this catalog, so scraping one
 * would add a part nothing can hold.
 */
const BT30_COLLET_SIZES: ReadonlyArray<string> = ['6', '10', '15', '25']

/** REGO-FIX's own `product_group_name` for each collet family this package scrapes. */
const REGOFIX_COLLET_GROUPS: Readonly<Record<string, string>> = {
  'regofix_pg_collets_standard.csv': 'Standard',
}

/**
 * Why this toolholding family cannot be scraped from here, or null.
 *
 * The three reasons are different and a caller should be able to tell them
 * apart: nothing here drives the brand at all, the brand is driven but this
 * family is not one of the ones it knows, or the scraper maps the rows for no
 * such kind. The third is `toHolding`'s to say, and it says it well.
 */
export const holdingReachable = (csvName: string, family: BoundToolholding): string | null => {
  const brand = familyBrand(family)
  if (HOLDING_SCRAPERS[brand] === undefined) {
    return `no toolholding scraper reachable from this package drives ${brand}`
  }
  if (family.records === undefined) {
    return `${brand} has no ${family.kind} record mapper`
  }
  return null
}

const holderHandoff = (record: HolderRecord, familyId: string): ScrapedHolder => ({
  guid: record.guid,
  catalogNumber: record.catalogNumber,
  materialNumber: record.materialNumber,
  familyId,
  brand: record.vendor,
  vendor: record.vendor,
  unit: record.unit,
  taper: record.taper,
  contact: record.contact,
  clamping: record.clamping,
  gaugeLength: record.gaugeLength,
  colletSeries: record.colletSeries,
  boreDiameter: record.bore,
  bodyDiameter: record.bodyDiameter,
  productLink: record.productLink,
  cadModelUrl: record.cadModelUrl,
  // Everything here came off the vendor's own table. The silhouette fields
  // this record has none of are absent rather than assumed, which is what
  // keeps a drawing from inventing a nose nobody published.
  provenance: {
    taper: 'vendor-stated',
    clamping: 'vendor-stated',
    gaugeLength: 'vendor-stated',
    ...(record.colletSeries === null ? {} : { colletSeries: 'vendor-stated' as const }),
    ...(record.bore === null ? {} : { boreDiameter: 'vendor-stated' as const }),
    ...(record.bodyDiameter === null ? {} : { bodyDiameter: 'vendor-stated' as const }),
  },
})

const colletHandoff = (record: ColletRecord, familyId: string): ScrapedCollet => ({
  guid: record.guid,
  catalogNumber: record.catalogNumber,
  materialNumber: record.materialNumber,
  familyId,
  brand: record.vendor,
  vendor: record.vendor,
  unit: record.unit,
  series: record.series,
  clampMin: record.clampMin,
  clampMax: record.clampMax,
  clampLength: record.functionalLength,
  productLink: record.productLink,
  provenance: {
    clampMin: 'vendor-stated',
    clampMax: 'vendor-stated',
    ...(record.functionalLength === null ? {} : { clampLength: 'vendor-stated' as const }),
  },
})

/** What one toolholding family's scrape produced. */
export interface ScrapedToolholding {
  readonly holders: ReadonlyArray<ScrapedHolder>
  readonly collets: ReadonlyArray<ScrapedCollet>
  /**
   * The holder records the handoff was mapped from, kept beside it.
   *
   * Not a duplicate for its own sake: `measureHolders` needs the record and not
   * the handoff — a `ScrapedHolder` states its gage length in the family's own
   * unit, where the gauge cross-check is in millimetres, and the brand *key* is
   * what a measurement is filed under, not the vendor's display name. Deriving
   * either one back out of the handoff is how a 3/8 in holder gets measured
   * against 9.525 and checked against 0.375.
   */
  readonly records: ReadonlyArray<HolderRecord>
  /** Rows the mapper dropped — a blank required cell, warned about and skipped. */
  readonly unmapped: number
}

/** One toolholding family, scraped and mapped onto the handoff. */
export const scrapeHoldingOne = async (
  fetcher: Fetcher,
  csvName: string,
  family: BoundToolholding,
  warn?: Warn,
): Promise<ScrapedToolholding> => {
  const brand = familyBrand(family)
  const scraper = HOLDING_SCRAPERS[brand]
  if (scraper === undefined) {
    throw new ScrapeError(`no toolholding scraper reachable from this package drives ${brand}`)
  }

  const scrape = await scraper(fetcher, csvName, warn)
  if (scrape === null) {
    throw new ScrapeError(`${brand} declares no scrape target for ${csvName}`)
  }

  const records = toHolding(csvName, scrape, warn === undefined ? {} : { warn })
  const familyId = csvName.replace(/\.csv$/, '')

  const holders: Array<ScrapedHolder> = []
  const collets: Array<ScrapedCollet> = []
  const holderRecords: Array<HolderRecord> = []
  for (const record of records) {
    if (record.kind === 'holder') {
      holders.push(holderHandoff(record, familyId))
      holderRecords.push(record)
    } else {
      collets.push(colletHandoff(record, familyId))
    }
  }

  return {
    holders,
    collets,
    records: holderRecords,
    unmapped: scrape.rows.length - records.length,
  }
}

/** What a caller is told about one toolholding family, as it finishes. */
export type HoldingOutcome =
  | { readonly csvName: string; readonly outcome: 'skipped'; readonly reason: string }
  | { readonly csvName: string; readonly outcome: 'failed'; readonly reason: string }
  | ({ readonly csvName: string; readonly outcome: 'scraped' } & ScrapedToolholding)

export interface HoldingScrapeOptions {
  readonly fetcher: Fetcher
  readonly onFamily: (outcome: HoldingOutcome) => void | Promise<void>
  /** A reason to pass this family over, or null to scrape it. */
  readonly skip?: (csvName: string) => string | null
  readonly warn?: Warn
}

/**
 * Every toolholding family the scraper declares, one at a time.
 *
 * The same shape and the same pacing as {@link scrapeCuttingTools}, and
 * separate from it because they are separate runs: a shop re-scrapes its tool
 * catalog far more often than its spindle rack, and 13,000 cutting tools is an
 * afternoon where 550 holders is minutes.
 */
export const scrapeToolholding = async (options: HoldingScrapeOptions): Promise<void> => {
  for (const [csvName, family] of boundToolholding()) {
    const asked = options.skip?.(csvName) ?? null
    if (asked !== null) {
      await options.onFamily({ csvName, outcome: 'skipped', reason: asked })
      continue
    }

    const unreachable = holdingReachable(csvName, family)
    if (unreachable !== null) {
      await options.onFamily({ csvName, outcome: 'skipped', reason: unreachable })
      continue
    }

    try {
      const scraped = await scrapeHoldingOne(options.fetcher, csvName, family, options.warn)
      await options.onFamily({ csvName, outcome: 'scraped', ...scraped })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await options.onFamily({ csvName, outcome: 'failed', reason })
    }

    await pause(REQUEST_DELAY_MS)
  }
}

/**
 * ## Measuring a holder
 *
 * A `HolderRecord` states no nose, no projection and no flange — see the note
 * above — so the silhouette a drawing needs comes from the vendor's own CAD
 * model, measured by the Toolpath Engine API. This drives that, for the same
 * reason the scrape lives here: `@toolpath/tool-scraper/node` is the scraper,
 * and `eslint.config.js` lets exactly this module import its values.
 *
 * **The bytes are somebody else's problem.** `stepFor` is handed in, so this
 * module never touches the filesystem or fetches a CAD file, and a test drives
 * the whole thing off a literal. `scripts/profiles.mjs` is what mirrors the
 * models and writes the document.
 *
 * A holder whose model the kernel cannot read is one holder dropped, warned
 * about, and the run continues — `measureHolder` raises `IncompletePartError`
 * for exactly that, and losing a 200-holder batch to one bad STEP file is not a
 * trade worth making. Anything else stops the run.
 */

/** One holder's mirrored STEP bytes, or null where the vendor published no model. */
export type StepBytes = (record: HolderRecord) => Promise<Uint8Array | null> | Uint8Array | null

export interface MeasureOptions {
  readonly records: ReadonlyArray<HolderRecord>
  readonly stepFor: StepBytes
  /** Called as each holder settles, so a caller can print a progress column. */
  readonly onHolder?: (catalogNumber: string, outcome: 'measured' | 'skipped', why?: string) => void
  readonly warn?: Warn
  /**
   * How often to ask whether an import job has settled.
   *
   * The scraper's own default is 500 ms, which is right against a deployment
   * sized for it and twice the budget it needs against a local stack: the
   * Engine allows 100 requests a minute per key, an import settles in about two
   * seconds, and a second between polls halves what the waiting costs. The
   * scraper waits out a `429` either way — this only makes it rarer.
   */
  readonly pollIntervalMs?: number
  /** Milliseconds to pause between holders, to stay inside the Engine's window. */
  readonly betweenHoldersMs?: number
}

/**
 * Every holder that has a model, measured into one profiles document.
 *
 * Returns null when nothing could be measured at all, rather than throwing:
 * a family whose vendor publishes no CAD is a real answer, and
 * `buildProfiles` refuses an empty document on the grounds that writing one
 * looks exactly like a run that worked.
 */
export const measureHolders = async (options: MeasureOptions): Promise<ProfilesDocument | null> => {
  const warn = options.warn ?? ((message: string) => console.warn(message))
  const api = createHolderApi(
    options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs },
  )
  const measured: Array<MeasuredHolder> = []
  const covered: Array<HolderRecord> = []
  let first = true

  for (const record of options.records) {
    const step = await options.stepFor(record)
    if (step === null) {
      options.onHolder?.(record.catalogNumber, 'skipped', 'no mirrored model')
      continue
    }

    // Paced between holders that actually cost requests, not between rows: a
    // family whose vendor publishes no CAD would otherwise sleep its way
    // through 200 skips.
    if (!first && options.betweenHoldersMs !== undefined) {
      await pause(options.betweenHoldersMs)
    }
    first = false

    try {
      measured.push(
        await measureHolder(
          api,
          { brand: record.brand, catalogNumber: record.catalogNumber },
          step,
        ),
      )
      covered.push(record)
      options.onHolder?.(record.catalogNumber, 'measured')
    } catch (error) {
      if (!(error instanceof IncompletePartError)) {
        throw error
      }
      warn(`  ${record.catalogNumber}: ${error.message}`)
      options.onHolder?.(record.catalogNumber, 'skipped', error.message)
    }
  }

  return assembleProfiles(measured, covered, warn)
}

/**
 * The measurements, sorted into the ones with a gauge plane and the ones
 * without.
 *
 * ## Why this is not just `buildProfiles`
 *
 * `buildProfiles` refuses a holder whose measured cone is not the taper its row
 * declares, and it refuses by throwing, which ends the family. Two different
 * things reach that check and only one of them is bad data:
 *
 * - **A mismatch** — a CAT40 row whose model measures size 30 — is the wrong
 *   STEP file published under a part's name, and drawing it would be drawing a
 *   different holder. Dropped, loudly.
 * - **No taper found at all** is, on the evidence, the Engine's solver rather
 *   than the vendor. Measured 2026-09-02: 166 of 169 MariTool CAT40 models
 *   failed to solve a 7:24 cone, while every one of them reaches 63.50 mm — the
 *   CAT40 flange — so the geometry is there, and neither `flipped` nor
 *   `fillBays` changes the answer. Upstream's four validated holders are all
 *   Kennametal BT30s.
 *
 * Treating the second as bad data threw 166 good silhouettes away to guard
 * against three. So a holder with no solved gauge plane keeps its measurement
 * and is stated on the **nose** datum — which is exactly what that value is
 * defined for: the frame a holder with no cone to solve a gauge plane on is
 * measured in, carrying no gauge length for anything to read.
 *
 * The holders that do solve still go through `buildProfiles` and keep every
 * check it makes: the gauge cross-check, the guid collision, the one-run kernel
 * agreement.
 */
const assembleProfiles = (
  measured: ReadonlyArray<MeasuredHolder>,
  covered: ReadonlyArray<HolderRecord>,
  warn: Warn,
): ProfilesDocument | null => {
  const solvedMeasured: Array<MeasuredHolder> = []
  const solvedCovered: Array<HolderRecord> = []
  const onNose: Array<[string, ScrapedHolderProfile]> = []

  for (const [index, record] of measured.entries()) {
    const holder = covered[index]!
    const declared = taperDesignation(holder.taper)

    if (record.sizeClass === null && record.taperFamily === null) {
      warn(
        `  ${record.catalogNumber}: no gauge plane was solved on its model — kept on the nose ` +
          `datum, with no gauge length`,
      )
      onNose.push([holder.guid, noseProfile(record, holder)])
      continue
    }

    if (record.sizeClass !== declared.sizeClass || record.taperFamily !== declared.family) {
      warn(
        `  ${record.catalogNumber}: the row declares ${holder.taper} and its model measures ` +
          `size ${record.sizeClass} / ${record.taperFamily} — dropped, because the wrong model ` +
          `was published under this part's name or the row's taper is wrong`,
      )
      continue
    }

    solvedMeasured.push(record)
    solvedCovered.push(holder)
  }

  if (solvedMeasured.length === 0 && onNose.length === 0) {
    return null
  }

  // `buildProfiles` refuses an empty batch, on the grounds that a document
  // covering nothing looks exactly like a run that worked. A family where
  // nothing solved is not that — it is a document of nose-datum profiles — so
  // it is only called when it has something to build from.
  const solved = solvedMeasured.length > 0 ? buildProfiles(solvedMeasured, solvedCovered) : null
  const first = measured[0]!

  return {
    profilesVersion: solved?.profilesVersion ?? SCRAPER_PROFILES_VERSION,
    unit: 'millimeters',
    kernelVersion: solved?.kernelVersion ?? first.kernelVersion,
    options: solved?.options ?? first.options,
    holderCount: (solved?.holderCount ?? 0) + onNose.length,
    holders: { ...(solved?.holders ?? {}), ...Object.fromEntries(onNose) },
  }
}

/**
 * One holder measured with no gauge plane to datum on.
 *
 * `complete` is true and there is no shortfall, and both are the honest answer:
 * completeness is whether the *model* reaches the gage length the vendor
 * publishes, and with no gauge plane solved there is nothing to compare it
 * against. Saying `false` would claim the vendor's model stops short, which is
 * a different and unevidenced accusation. `datum` is what tells a reader there
 * is no gauge line here, and it is the field a UI keys on.
 */
const noseProfile = (record: MeasuredHolder, holder: HolderRecord): ScrapedHolderProfile => ({
  catalogNumber: record.catalogNumber,
  datum: 'nose',
  points: layersToProfile(record.layers, null),
  gaugeLengthSolved: null,
  gaugeLengthPublished: holder.gaugeLengthMm,
  sizeClass: null,
  taperFamily: null,
  complete: true,
})
