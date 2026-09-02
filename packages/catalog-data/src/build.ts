import {
  CATALOG_VERSION,
  GEOMETRY_FIELDS,
  type Catalog,
  type CatalogTool,
  type Provenance,
  type ToolFamily,
  type ToolInput,
  type ToolType,
  type UnitSystem,
} from './types.js'
import type { ToolForm } from './forms.js'
import { facetsFor } from './facets.js'
import { type Collet, type Holder } from './toolholding.js'
import { lengthBelowHolder } from './clamping.js'

/**
 * What ingestion hands this package.
 *
 * One family at a time, because that is the unit a vendor publishes and a
 * scrape is run in — and because a family that fails to scrape should leave
 * the rest of the catalog buildable.
 *
 * Nothing here mentions a vendor, a transport, or a CSV column. The adapter
 * that knows those things is `@toolpath/tool-scraper`, and it stays outside
 * this package on purpose: this transform is pure, so it is testable against
 * five literal tools rather than against a live scrape.
 */
export interface FamilyInput {
  readonly id: string
  readonly name: string
  readonly brand: string
  readonly vendor: string
  readonly unitSystem: UnitSystem
  readonly source?: string | null
  readonly tools: ReadonlyArray<ToolInput>
}

export interface CatalogInput {
  /** Stamped by the caller. Nothing in here reads a clock. */
  readonly builtAt: string
  readonly families: ReadonlyArray<FamilyInput>
  readonly holders?: ReadonlyArray<Holder>
  readonly collets?: ReadonlyArray<Collet>
}

export class CatalogBuildError extends Error {}

const toolTypesIn = (tools: ReadonlyArray<ToolInput>): ReadonlyArray<ToolType> =>
  [...new Set(tools.map((tool) => tool.toolType))].sort()

/**
 * Every geometry code the tools use that the dictionary does not define.
 *
 * Surfaced rather than dropped: an undefined code is a scraper change or a new
 * vendor column, and both are things a human should look at before a catalog
 * ships with a field nobody can read.
 */
export const undefinedGeometryCodes = (
  tools: ReadonlyArray<CatalogTool>,
): ReadonlyArray<string> => {
  const codes = new Set<string>()
  for (const tool of tools) {
    for (const code of Object.keys(tool.geometry)) {
      if (!(code in GEOMETRY_FIELDS)) {
        codes.add(code)
      }
    }
  }
  return [...codes].sort()
}

/**
 * What a tool is, from what the vendor did state.
 *
 * A vendor's family table says `endmill`; the corner radius says which kind.
 * `RE` of zero is a flat end, a radius of half the diameter is a ball, and
 * anything between is a bull nose — and every one of those is a different
 * answer to "what cuts a filleted pocket". A radius nobody stated makes the
 * flat end an assumption rather than a derivation, and it is marked as one.
 *
 * A tap's hand is not a column any vendor here publishes. Right-hand is what a
 * shop means by "a tap", and it is marked assumed so that a left-hand family
 * arriving with its own statement is not silently overwritten.
 */
const formOf = (tool: ToolInput): { form: ToolForm; provenance: Provenance } => {
  switch (tool.toolType) {
    case 'endmill': {
      const { DC, RE } = tool.geometry
      if (RE === undefined || DC === undefined) {
        return { form: 'flat end mill', provenance: 'assumed' }
      }
      if (RE <= 0) {
        return { form: 'flat end mill', provenance: 'derived' }
      }
      return {
        form: RE >= DC / 2 - 1e-6 ? 'ball end mill' : 'bull nose end mill',
        provenance: 'derived',
      }
    }
    case 'drill':
      return { form: 'drill', provenance: 'derived' }
    case 'reamer':
      return { form: 'reamer', provenance: 'derived' }
    case 'chamfer':
      return { form: 'chamfer mill', provenance: 'derived' }
    case 'tap':
      return { form: 'tap right hand', provenance: 'assumed' }
    default:
      return { form: 'other', provenance: 'derived' }
  }
}

/**
 * The facts this package works out for a tool, marked as its own.
 *
 * - `LBH`, length below holder: the overall length less the shank the shop
 *   keeps clamped — `clamping.ts` is the rule and the reasoning, and this
 *   builds with its default of the vendor's `LSCN` where one is stated and 3×D
 *   of the shank where none is. It replaced a rule of this package's own —
 *   flute length plus a diameter, capped at two thirds of the overall length —
 *   which disagreed with what the part page applied over the top, so the same
 *   tool read one way on the catalog page and another beside a feature (Paul,
 *   2026-09-02).
 * - `LD`: length below holder over cutting diameter, the "3×D" a shop reads
 *   reach in.
 * - `form`: what the tool is in a CAM library's words.
 *
 * None is a vendor's column, so all are derived here, **once, where the
 * dataset is built**: derived in the table they would be numbers the filters
 * could not see, and derived in the filters they would be a second formula for
 * the table to disagree with. Rounded to two places so the same tool gets the
 * same figure on every rebuild.
 *
 * **Re-derived on every build.** A figure this package worked out last time
 * is replaced by what the rule says now, so a rule that changes reaches an
 * existing dataset through `rebuild.mjs`; anything a vendor stated keeps its
 * own value and provenance.
 */
export const withDerived = (tool: ToolInput): CatalogTool => {
  const geometry = { ...tool.geometry }
  const provenance = { ...tool.provenance }
  const round = (value: number) => Math.round(value * 100) / 100
  /** Unstated, or stated by an earlier run of this same function. */
  const ours = (code: string) => geometry[code] === undefined || provenance[code] === 'derived'

  const { DC } = geometry
  const below = ours('LBH') ? lengthBelowHolder(geometry) : null
  if (below !== null) {
    geometry.LBH = round(below)
    provenance.LBH = 'derived'
  }

  if (ours('LD') && geometry.LBH !== undefined && DC !== undefined && DC > 0) {
    geometry.LD = round(geometry.LBH / DC)
    provenance.LD = 'derived'
  }

  let form = tool.form
  if (form === undefined || provenance.form === 'derived' || provenance.form === 'assumed') {
    const derived = formOf(tool)
    form = derived.form
    provenance.form = derived.provenance
  }

  return { ...tool, form, geometry, provenance }
}

/**
 * Flatten families into the catalog document the application reads.
 *
 * Pure, and total except for one refusal: a duplicate guid is thrown on rather
 * than resolved. The guid is the join key a cart line, a URL and a saved order
 * all hold, so two tools sharing one is not a display bug to be tidied — it is
 * a corrupt dataset, and it has to fail where it is built rather than where it
 * is read.
 */
export const buildCatalog = (input: CatalogInput): Catalog => {
  const tools: Array<CatalogTool> = []
  const families: Array<ToolFamily> = []
  const seen = new Map<string, string>()

  for (const family of input.families) {
    for (const tool of family.tools) {
      const previous = seen.get(tool.guid)
      if (previous !== undefined) {
        throw new CatalogBuildError(
          `Duplicate tool guid ${tool.guid} in families ${previous} and ${family.id}.`,
        )
      }
      if (tool.familyId !== family.id) {
        throw new CatalogBuildError(
          `Tool ${tool.catalogNumber} claims family ${tool.familyId} but was built under ${family.id}.`,
        )
      }
      seen.set(tool.guid, family.id)
      tools.push(withDerived(tool))
    }

    families.push({
      id: family.id,
      name: family.name,
      brand: family.brand,
      vendor: family.vendor,
      unitSystem: family.unitSystem,
      toolTypes: toolTypesIn(family.tools),
      toolCount: family.tools.length,
      source: family.source ?? null,
    })
  }

  // A dataset built before the holder body was carried has no such keys at
  // all; read as unstated rather than as undefined, so `rebuild.mjs` brings
  // an older file forward without a crash and without inventing a body.
  const holders = (input.holders ?? []).map((holder) => ({
    ...holder,
    noseLength: holder.noseLength ?? null,
    bodyDiameter: holder.bodyDiameter ?? null,
    bodyLength: holder.bodyLength ?? null,
    projection: holder.projection ?? null,
    flangeDiameter: holder.flangeDiameter ?? null,
    colletProtrusion: holder.colletProtrusion ?? null,
    contact: holder.contact ?? null,
    cadModelUrl: holder.cadModelUrl ?? null,
  }))
  const collets = input.collets ?? []
  for (const holder of holders) {
    const previous = seen.get(holder.guid)
    if (previous !== undefined) {
      throw new CatalogBuildError(
        `Holder ${holder.catalogNumber} reuses guid ${holder.guid}, already used in ${previous}.`,
      )
    }
    seen.set(holder.guid, 'holders')
  }
  for (const collet of collets) {
    const previous = seen.get(collet.guid)
    if (previous !== undefined) {
      throw new CatalogBuildError(
        `Collet ${collet.catalogNumber} reuses guid ${collet.guid}, already used in ${previous}.`,
      )
    }
    seen.set(collet.guid, 'collets')
  }

  return {
    version: CATALOG_VERSION,
    builtAt: input.builtAt,
    families,
    tools,
    holders,
    collets,
    facets: facetsFor(tools),
  }
}
