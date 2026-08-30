import { MODEL_UNIT, convertLength } from '@toolpath/domain/units'
import {
  GEOMETRY_FIELDS,
  MATERIAL_GROUPS,
  type CatalogTool,
  type Provenance,
  type ToolInput,
  type ToolType,
} from './types.js'
import { buildCatalog, type CatalogInput, type FamilyInput } from './build.js'
import type { Clamping, Collet, Holder } from './toolholding.js'
import type { Catalog } from './types.js'

/**
 * Turning a scrape into the catalog.
 *
 * **The handoff is records, not CSVs.** `@toolpath/tool-scraper` is explicit
 * that a vendor's CSV keeps the vendor's own column labels and that only that
 * vendor's adapter may read them — Kennametal's `D1` is the cutting diameter
 * while ISO 13399 defines `D1` as a fixing hole, so anything that reads a
 * vendor CSV without going through its adapter is *confidently* wrong rather
 * than obviously broken. The scraper draws its seam at `ToolRecord`, and this
 * package takes the handoff at exactly that seam.
 *
 * Until the scraper is published to npm this arrives as a JSON document with
 * the shape below, written by whoever runs the scrape. When it is published,
 * the producer imports it directly and this reader stops needing a file — the
 * types on either side of the seam do not change either way.
 */

/** The scraper's unit vocabulary, which is not the catalog's. */
export type ScrapedUnit = 'millimeters' | 'inches'

/** One tool as `@toolpath/tool-scraper` hands it over. */
export interface ScrapedTool {
  /**
   * Minted by the scraper, under its brand namespace.
   *
   * **Not derived here, deliberately.** A guid is `uuid5` of the brand's home
   * page, and a mistake in that seed is not a wrong string — it is every one of
   * that vendor's guids, permanently, and the guid is the join key everything
   * downstream holds. That rule stays in the one package that owns it.
   */
  readonly guid: string
  readonly catalogNumber: string
  readonly materialNumber?: string | null
  readonly kind: string
  readonly geometry: Readonly<Record<string, unknown>>
  readonly materialGroups?: ReadonlyArray<string>
  readonly productLink?: string | null
  readonly provenance?: Readonly<Record<string, Provenance>>
}

export interface ScrapedFamily {
  readonly id: string
  readonly name: string
  readonly brand: string
  readonly vendor: string
  readonly unit: ScrapedUnit
  readonly source?: string | null
  readonly tools: ReadonlyArray<ScrapedTool>
}

/**
 * A holder as the handoff states it.
 *
 * Declared rather than mapped from a vendor's columns: the scraper binds record
 * mappers for cutting tools only, so there is no `ToolRecord` equivalent for
 * toolholding and the vendor's own labels are all that exists upstream.
 * Interpreting those belongs beside the vendor knowledge, in the scraper — see
 * `toolholding.ts`. Lengths are in the family's `unit`, like a tool's.
 */
export interface ScrapedHolder {
  readonly guid: string
  readonly catalogNumber: string
  readonly materialNumber?: string | null
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  readonly unit: ScrapedUnit
  readonly taper: string
  readonly contact?: string | null
  readonly clamping: string
  readonly gaugeLength?: number | null
  readonly colletSeries?: string | null
  readonly boreDiameter?: number | null
  readonly noseDiameter?: number | null
  readonly noseLength?: number | null
  readonly bodyDiameter?: number | null
  readonly bodyLength?: number | null
  readonly projection?: number | null
  readonly flangeDiameter?: number | null
  readonly colletProtrusion?: number | null
  readonly productLink?: string | null
  readonly cadModelUrl?: string | null
  readonly provenance?: Readonly<Record<string, Provenance>>
}

export interface ScrapedCollet {
  readonly guid: string
  readonly catalogNumber: string
  readonly materialNumber?: string | null
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  readonly unit: ScrapedUnit
  readonly series: string
  readonly clampMin: number
  readonly clampMax: number
  readonly clampLength?: number | null
  readonly productLink?: string | null
  readonly provenance?: Readonly<Record<string, Provenance>>
}

export interface Scrape {
  /** Stamped by the producer. Nothing in here reads a clock. */
  readonly builtAt: string
  readonly families: ReadonlyArray<ScrapedFamily>
  readonly holders?: ReadonlyArray<ScrapedHolder>
  readonly collets?: ReadonlyArray<ScrapedCollet>
}

export class IngestError extends Error {}

/** What was left out, and why. Reported rather than logged, so a caller must see it. */
export interface IngestNote {
  readonly familyId: string
  readonly guid: string
  readonly code: string
  readonly reason: string
}

export interface Ingested {
  readonly catalog: Catalog
  readonly notes: ReadonlyArray<IngestNote>
}

const UNIT_SYSTEM: Record<ScrapedUnit, 'inch' | 'metric'> = {
  millimeters: 'metric',
  inches: 'inch',
}

const TOOL_TYPES: Readonly<Record<string, ToolType>> = {
  drill: 'drill',
  endmill: 'endmill',
  tap: 'tap',
  reamer: 'reamer',
  chamfer: 'chamfer',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CLAMPINGS: ReadonlySet<string> = new Set<Clamping>(['bore', 'collet', 'shrink'])

const requireGuid = (guid: string, what: string): string => {
  if (!UUID.test(guid)) {
    throw new IngestError(
      `${what} has guid "${guid}", which is not a UUID. Guids are minted by the scraper.`,
    )
  }
  return guid.toLowerCase()
}

/** A length in the family's unit, in millimetres. */
const mm = (value: number | null | undefined, unit: ScrapedUnit): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return unit === 'inches' ? convertLength(value, 'in', MODEL_UNIT) : value
}

/**
 * Which codes are lengths, and therefore converted.
 *
 * Read from the dictionary rather than listed again: a field added there with
 * `unit: 'mm'` is converted from the moment it exists, and one added here
 * instead would be a second list to forget.
 */
const isLength = (code: string): boolean => GEOMETRY_FIELDS[code]?.unit === 'mm'

/**
 * `TP` is dropped, and this is the reason.
 *
 * The scraper defines thread pitch as being "in the tool's own unit system",
 * and an inch tap's pitch is conventionally threads-per-inch — a *reciprocal*,
 * not a length. Converting it as a length would produce a number that looks
 * like a pitch and is wrong by a factor of its own value. Until the inch
 * convention is confirmed against a real tap table, carrying it is worse than
 * not carrying it.
 */
const DROPPED = new Map([['TP', 'thread pitch: the inch unit convention is unconfirmed']])

const toolFrom = (
  family: ScrapedFamily,
  scraped: ScrapedTool,
  notes: Array<IngestNote>,
): ToolInput => {
  if (!UUID.test(scraped.guid)) {
    throw new IngestError(
      `Tool ${scraped.catalogNumber} in family ${family.id} has guid "${scraped.guid}", which is not a UUID. Guids are minted by the scraper.`,
    )
  }
  if (scraped.catalogNumber.trim() === '') {
    throw new IngestError(`A tool in family ${family.id} has no catalog number.`)
  }

  const toolType = TOOL_TYPES[scraped.kind] ?? 'other'
  const geometry: Record<string, number> = {}

  for (const [code, raw] of Object.entries(scraped.geometry)) {
    const dropped = DROPPED.get(code)
    if (dropped !== undefined) {
      notes.push({ familyId: family.id, guid: scraped.guid, code, reason: dropped })
      continue
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      // A boolean or a blank cell is not a measurement. Recorded rather than
      // coerced, because a `0` here reads as a measured zero.
      notes.push({
        familyId: family.id,
        guid: scraped.guid,
        code,
        reason: `not a finite number (${typeof raw})`,
      })
      continue
    }
    geometry[code] =
      isLength(code) && family.unit === 'inches' ? convertLength(raw, 'in', MODEL_UNIT) : raw
  }

  const groups = (scraped.materialGroups ?? []).filter((group) =>
    (MATERIAL_GROUPS as ReadonlyArray<string>).includes(group),
  )
  // Reordered onto ISO 513's sequence: a facet rendered from one order and a
  // tool's own list from another cannot notice when the two disagree.
  const materialGroups = MATERIAL_GROUPS.filter((group) => groups.includes(group))

  return {
    guid: scraped.guid.toLowerCase(),
    familyId: family.id,
    brand: family.brand,
    vendor: family.vendor,
    catalogNumber: scraped.catalogNumber,
    materialNumber: scraped.materialNumber ?? null,
    toolType,
    unitSystem: UNIT_SYSTEM[family.unit],
    geometry,
    materialGroups,
    productLink: scraped.productLink ?? null,
    provenance: scraped.provenance ?? {},
  }
}

/**
 * A scrape, as the catalog document.
 *
 * Lengths are converted to millimetres here and nowhere else, so every number
 * past this point is in one basis and `unitSystem` is left saying only how the
 * vendor published the family. Counts and angles are never converted: four
 * flutes are four flutes in every unit system.
 */
const holderFrom = (scraped: ScrapedHolder): Holder => {
  if (!CLAMPINGS.has(scraped.clamping)) {
    throw new IngestError(
      `Holder ${scraped.catalogNumber} clamps by "${scraped.clamping}", which is not bore, collet or shrink.`,
    )
  }
  const clamping = scraped.clamping as Clamping
  if (clamping === 'collet' && !scraped.colletSeries) {
    throw new IngestError(`Collet holder ${scraped.catalogNumber} names no collet series.`)
  }
  if (clamping !== 'collet' && mm(scraped.boreDiameter, scraped.unit) === null) {
    throw new IngestError(`Holder ${scraped.catalogNumber} clamps on a bore it does not state.`)
  }

  return {
    guid: requireGuid(scraped.guid, `Holder ${scraped.catalogNumber}`),
    familyId: scraped.familyId,
    brand: scraped.brand,
    vendor: scraped.vendor,
    catalogNumber: scraped.catalogNumber,
    materialNumber: scraped.materialNumber ?? null,
    taper: scraped.taper,
    contact: scraped.contact === 'taper' || scraped.contact === 'face' ? scraped.contact : null,
    clamping,
    gaugeLength: mm(scraped.gaugeLength, scraped.unit),
    colletSeries: scraped.colletSeries ?? null,
    boreDiameter: mm(scraped.boreDiameter, scraped.unit),
    noseDiameter: mm(scraped.noseDiameter, scraped.unit),
    noseLength: mm(scraped.noseLength, scraped.unit),
    bodyDiameter: mm(scraped.bodyDiameter, scraped.unit),
    bodyLength: mm(scraped.bodyLength, scraped.unit),
    projection: mm(scraped.projection, scraped.unit),
    flangeDiameter: mm(scraped.flangeDiameter, scraped.unit),
    colletProtrusion: mm(scraped.colletProtrusion, scraped.unit),
    productLink: scraped.productLink ?? null,
    cadModelUrl: scraped.cadModelUrl ?? null,
    provenance: scraped.provenance ?? {},
  }
}

const colletFrom = (scraped: ScrapedCollet): Collet => {
  const clampMin = mm(scraped.clampMin, scraped.unit)
  const clampMax = mm(scraped.clampMax, scraped.unit)
  if (clampMin === null || clampMax === null || clampMin > clampMax) {
    throw new IngestError(`Collet ${scraped.catalogNumber} states no usable clamping range.`)
  }

  return {
    guid: requireGuid(scraped.guid, `Collet ${scraped.catalogNumber}`),
    familyId: scraped.familyId,
    brand: scraped.brand,
    vendor: scraped.vendor,
    catalogNumber: scraped.catalogNumber,
    materialNumber: scraped.materialNumber ?? null,
    series: scraped.series,
    clampMin,
    clampMax,
    clampLength: mm(scraped.clampLength, scraped.unit),
    productLink: scraped.productLink ?? null,
    provenance: scraped.provenance ?? {},
  }
}

export const ingest = (scrape: Scrape): Ingested => {
  if (scrape.families.length === 0) {
    throw new IngestError('A scrape with no families would build an empty catalog.')
  }

  const notes: Array<IngestNote> = []
  const families: Array<FamilyInput> = scrape.families.map((family) => {
    if (!(family.unit in UNIT_SYSTEM)) {
      throw new IngestError(`Family ${family.id} declares unit "${family.unit}".`)
    }
    return {
      id: family.id,
      name: family.name,
      brand: family.brand,
      vendor: family.vendor,
      unitSystem: UNIT_SYSTEM[family.unit],
      source: family.source ?? null,
      tools: family.tools.map((tool) => toolFrom(family, tool, notes)),
    }
  })

  const input: CatalogInput = {
    builtAt: scrape.builtAt,
    families,
    holders: (scrape.holders ?? []).map(holderFrom),
    collets: (scrape.collets ?? []).map(colletFrom),
  }
  return { catalog: buildCatalog(input), notes }
}
