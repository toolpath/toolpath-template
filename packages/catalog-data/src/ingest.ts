import type { ToolRecord, UnitSystem } from '@toolpath/tool-scraper'

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
import { isToolForm, type ToolForm } from './forms.js'
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
 * The producer is `src/scrape.ts`, which imports the scraper directly. This
 * still reads a **file** rather than taking the records in memory, and that is
 * deliberate rather than left over: a scrape is an afternoon of paced requests
 * against five vendors, and an ingest is a second. Keeping the store between
 * them is what lets the contract move without going back to the vendors' sites,
 * which is the same reason `scripts/rebuild.mjs` exists.
 *
 * So the file is a boundary, and it is validated like one. The types below say
 * what a well-formed store holds; the guards below them say what to do about a
 * store written by an older scraper, or edited by hand.
 */

/** The scraper's unit vocabulary, which is not the catalog's. */
export type ScrapedUnit = UnitSystem

/**
 * One tool as `@toolpath/tool-scraper` hands it over.
 *
 * **The shared fields are `ToolRecord`'s own, not a restatement of them.** They
 * were written out here — `geometry: Record<string, unknown>`, `kind: string` —
 * for as long as the scraper could not be imported, and `ingest.test.ts` then
 * built its fixtures from *this* declaration, so the suite proved the ingest
 * agreed with itself and nothing checked it against the producer. Picking the
 * fields off the record instead means a shape that moves upstream fails
 * `check-types` here rather than at the far end of a scrape.
 *
 * The three fields that are not picked are the ones this handoff adds:
 * {@link ScrapedTool.form}, which the scraper has no kind for; `productLink`,
 * which is `identity.productLink` applied rather than carried on a record; and
 * `provenance`, which the catalog states per value.
 *
 * `guid` is picked and never minted here. A guid is `uuid5` of the brand's home
 * page, and a mistake in that seed is not a wrong string — it is every one of
 * that vendor's guids, permanently, and the guid is the join key everything
 * downstream holds. That rule stays in the one package that owns it.
 */
export interface ScrapedTool
  extends Pick<ToolRecord, 'guid' | 'catalogNumber' | 'kind' | 'geometry' | 'materialGroups'>,
    /**
     * `productLine` is the record's own field and its own type, and optional
     * only here: a store written before `@toolpath/tool-scraper` recorded one
     * has no such key, and a required field would make every file on disk
     * unreadable to say something a `?? null` already says. Picked rather than
     * restated so that the day the record's type moves, this fails to compile.
     */
    Partial<Pick<ToolRecord, 'productLine'>> {
  readonly materialNumber?: string | null
  /**
   * What the tool is, where the vendor's own page says it outright.
   *
   * The scraper's `kind` is a coarse family type — `endmill` covers a slot
   * drill and a keyseat cutter alike — and the finer `form` is otherwise
   * derived from the geometry. A vendor that titles its page "Keyseat Cutters"
   * has stated the answer, and a stated answer beats a derived one: without
   * this, Harvey's 2,261 keyseat cutters read as flat end mills, corner radius
   * and all (Paul, 2026-09-01). Ignored where it is not a form this catalog
   * knows.
   */
  readonly form?: string
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

const CLAMPINGS: ReadonlySet<string> = new Set<Clamping>(['bore', 'collet', 'shrink', 'hydraulic'])

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
export const DROPPED: ReadonlyMap<string, string> = new Map([
  ['TP', 'thread pitch: the inch unit convention is unconfirmed'],
])

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

  /*
   * Silence is carried through, not turned into an empty rating.
   *
   * This read `scraped.materialGroups ?? []`, which made the two states one:
   * a vendor that rates a part for nothing and a vendor that publishes no index
   * at all both arrived as `[]`. Every Harvey record is the second — its index
   * is per part, where a scrape cannot reach it — so 12,773 tools would have
   * claimed a rating nobody made.
   *
   * A stated list is still filtered to the groups ISO 513 defines and reordered
   * onto its sequence: a facet rendered from one order and a tool's own list
   * from another cannot notice when the two disagree.
   */
  const rated = scraped.materialGroups
  const materialGroups =
    rated === null || rated === undefined
      ? null
      : MATERIAL_GROUPS.filter((group) => rated.includes(group))

  // A form the handoff states is the vendor's own word and is kept as one;
  // anything else is left for `withDerived` to work out from the geometry.
  const stated =
    scraped.form !== undefined && isToolForm(scraped.form) ? (scraped.form as ToolForm) : null
  if (scraped.form !== undefined && stated === null) {
    notes.push({
      familyId: family.id,
      guid: scraped.guid,
      code: 'form',
      reason: `"${scraped.form}" is not a form this catalog knows`,
    })
  }

  return {
    guid: scraped.guid.toLowerCase(),
    familyId: family.id,
    brand: family.brand,
    vendor: family.vendor,
    catalogNumber: scraped.catalogNumber,
    materialNumber: scraped.materialNumber ?? null,
    toolType,
    ...(stated === null ? {} : { form: stated }),
    unitSystem: UNIT_SYSTEM[family.unit],
    geometry,
    materialGroups,
    // The vendor's own word, carried through and never invented: a store
    // written before the scraper recorded one says `undefined`, and that is
    // the same silence as a vendor who names no line.
    productLine: scraped.productLine ?? null,
    productLink: scraped.productLink ?? null,
    provenance:
      stated === null
        ? (scraped.provenance ?? {})
        : { ...scraped.provenance, form: 'vendor-stated' as const },
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
      `Holder ${scraped.catalogNumber} clamps by "${scraped.clamping}", which is none of ${[...CLAMPINGS].sort().join(', ')}.`,
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

/**
 * One part the vendor published under two of its own facets, collapsed to one.
 *
 * EMUGE splits its end mill category by a unit facet, and 750 of its parts
 * carry **both** values: the same material number, the same guid, its
 * dimensions stated once in inches and once in millimetres. That is not a
 * corrupt scrape — it is a vendor publishing one part two ways — but it
 * arrives here as two catalog tools sharing a join key, which `buildCatalog`
 * refuses outright and is right to.
 *
 * **The millimetre listing wins**, because it is the one that is not a
 * conversion: this catalog stores millimetres, and a figure the vendor stated
 * in millimetres reaches it untouched where an inch figure is multiplied by
 * 25.4 first. Nothing else about the two entries differs — `unitSystem` is the
 * only field that records which facet it came from, and it is a fact about how
 * the vendor published a family rather than about the tool.
 *
 * **Only a genuine same-part pair is collapsed.** Two tools sharing a guid and
 * disagreeing about their catalog or material number are not one part
 * published twice; they are the minting fault `buildCatalog`'s refusal exists
 * to catch, and they are left in place for it to throw on. A guid is `uuid5`
 * under the brand's namespace, so a wrong seed is every one of that vendor's
 * guids, permanently — that check must not be weakened to make room for this.
 *
 * **A stopgap, and named as one.** The fact that two facet values overlap is
 * knowledge about EMUGE's storefront, and it belongs beside the family table
 * that declares the split — `families/emuge.ts` in `@toolpath/tool-scraper`,
 * whose own citation still claims the two are a partition of 1,832 and 5,189
 * variants. The day that table stops handing over the same part twice, every
 * note below stops being written and this can come out.
 */
const collapseUnitDuplicates = (
  families: ReadonlyArray<FamilyInput>,
  notes: Array<IngestNote>,
): Array<FamilyInput> => {
  const seen = new Map<string, { tool: ToolInput; unitSystem: FamilyInput['unitSystem'] }>()
  /** Guids two *different* parts share: nothing here may touch them. */
  const conflicting = new Set<string>()

  for (const family of families) {
    for (const tool of family.tools) {
      const previous = seen.get(tool.guid)
      if (
        previous !== undefined &&
        (previous.tool.catalogNumber !== tool.catalogNumber ||
          previous.tool.materialNumber !== tool.materialNumber)
      ) {
        // Not one part twice. Both are left in place for `buildCatalog` to
        // refuse by name — recording the conflict rather than skipping it,
        // because dropping the second copy is exactly what would hide it.
        conflicting.add(tool.guid)
        continue
      }
      if (previous === undefined || previous.unitSystem !== 'metric') {
        seen.set(tool.guid, { tool, unitSystem: family.unitSystem })
      }
    }
  }

  const dropped = new Set<string>()
  const kept = families.map((family) => ({
    ...family,
    tools: family.tools.filter((tool) => {
      const winner = seen.get(tool.guid)
      if (conflicting.has(tool.guid) || winner === undefined || winner.tool === tool) {
        return true
      }
      // One note per part, not one per copy: the pair is the fact.
      if (!dropped.has(tool.guid)) {
        dropped.add(tool.guid)
        notes.push({
          familyId: family.id,
          guid: tool.guid,
          code: 'guid',
          reason: `the vendor publishes this part in more than one family; kept the ${winner.unitSystem} listing`,
        })
      }
      return false
    }),
  }))

  return kept
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
    families: collapseUnitDuplicates(families, notes),
    holders: (scrape.holders ?? []).map(holderFrom),
    collets: (scrape.collets ?? []).map(colletFrom),
  }
  return { catalog: buildCatalog(input), notes }
}
