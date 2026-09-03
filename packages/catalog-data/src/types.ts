import type { ToolForm } from './forms.js'

/**
 * What the tool catalog is, as a document.
 *
 * The application never sees a vendor's CSV, a scraper record, or a vendor's
 * own column labels. It sees this: one flat list of tools, the families they
 * came from, and a precomputed index of what can be filtered on. Everything
 * upstream of this file is ingestion; everything downstream is presentation.
 *
 * **Lengths are millimetres and angles are degrees**, the same basis the
 * Toolpath API states, so an inch-published tool and a metric one are
 * comparable without the reader knowing which is which. `unitSystem` records
 * how the vendor published a tool — it is a fact about the tool, not the unit
 * a number is stored in. Converting for display is
 * `@toolpath/domain/units`' job.
 */

import type { Collet, Holder } from './toolholding.js'

/** How a vendor publishes a family: not the unit its dimensions are stored in. */
export type UnitSystem = 'metric' | 'inch'

/**
 * What a tool is for, coarse enough that a shop picks one without reading a
 * vendor's marketing name for it.
 */
export type ToolType = 'chamfer' | 'drill' | 'endmill' | 'reamer' | 'tap' | 'other'

/**
 * Where a stated fact came from.
 *
 * The scraper carries this per constant and it survives into the catalog for
 * one reason: a number a shop cannot trace is a number they have to take on
 * faith. A derived or assumed value must be visibly not the vendor's.
 */
export type Provenance = 'vendor-stated' | 'derived' | 'assumed'

/**
 * A geometry field, under the name `@toolpath/tool-scraper` hands it over in.
 *
 * Seven of these are ISO 13399's own codes with the standard's meanings —
 * the machine-tool industry's interchange dictionary, which is also why they
 * appear in Fusion's tool JSON. Three are Autodesk's names for measurements
 * ISO codes differently, and `iso` records the standard's counterpart rather
 * than quietly renaming them: a downstream consumer recognises the name the
 * scraper emitted, and a reader can still find the standard's.
 *
 * **This vocabulary is the scraper's, not this package's invention.** Renaming
 * a field here would mean translating on ingest, and a translation table is
 * where a `SFDM` becomes a `DC` in one direction and nobody notices.
 */
export interface GeometryField {
  readonly code: string
  readonly label: string
  /** `mm`, `deg`, or `count`. Stored in this unit; converted only for display. */
  readonly unit: 'count' | 'deg' | 'mm' | 'ratio'
  readonly description: string
  /** The ISO 13399 code, or null where the standard's counterpart is unpinned. */
  readonly iso: string | null
}

/**
 * The dictionary the detail page reads codes through.
 *
 * A code with no entry here is shown as the vendor's own code and not given a
 * label this repository cannot defend — the alternative is inventing a meaning
 * for a column nobody has checked.
 */
export const GEOMETRY_FIELDS: Readonly<Record<string, GeometryField>> = {
  DC: {
    code: 'DC',
    label: 'Cutting diameter',
    unit: 'mm',
    description: 'The diameter of the cutting portion — what the tool actually removes.',
    iso: 'DC',
  },
  OAL: {
    code: 'OAL',
    label: 'Overall length',
    unit: 'mm',
    description: 'Tip to the end of the shank. Sets how far the tool has to stick out.',
    iso: 'OAL',
  },
  LCF: {
    code: 'LCF',
    label: 'Flute length',
    unit: 'mm',
    description: 'The usable cutting length, which bounds the depth reachable in one pass.',
    iso: 'LCF',
  },
  /**
   * Not a vendor's column. Worked out by `stickout.ts` and written in
   * `build.ts`: **the length a machinist would set this tool up at** — the
   * flutes (or the neck) out to the sheet's floor and onto its step, held
   * under the clamping rule, the hold share and any collet grip.
   *
   * It stated the *ceiling* until 2026-09-03 — `OAL` less the shank the shop
   * keeps clamped — which is a different question and was answered in four
   * different places. The ceiling is `stickoutCeiling`; this is the setup, and
   * it is the same number the drawing beside it draws.
   */
  LBH: {
    code: 'LBH',
    label: 'Length below holder',
    unit: 'mm',
    description:
      'How far the tool is set out of the holder: its flutes, out to the shop’s shortest stickout and onto its step, within the shank the shop keeps clamped.',
    iso: null,
  },
  /**
   * Length below holder over cutting diameter — the "×D" a shop reads reach
   * in. Derived from LBH and DC; no vendor states it.
   */
  LD: {
    code: 'LD',
    label: 'L/D',
    unit: 'ratio',
    description:
      'Length below holder over cutting diameter — the ×D a shop reads reach in. Derived from LBH and DC; no vendor states it.',
    iso: null,
  },
  RE: {
    code: 'RE',
    label: 'Corner radius',
    unit: 'mm',
    description: 'The radius at the corner of the cutting edge. Zero for a square end.',
    iso: 'RE',
  },
  NOF: {
    code: 'NOF',
    label: 'Flute count',
    unit: 'count',
    description: 'Cutting edges. More edges means more feed and less chip room.',
    iso: 'NOF',
  },
  SIG: {
    code: 'SIG',
    label: 'Point angle',
    unit: 'deg',
    description: 'The included angle at a drill point.',
    iso: 'SIG',
  },
  // Autodesk's name for the measurement ISO codes as `DMM`. Kept under the
  // scraper's name because that is the name a consumer recognises.
  SFDM: {
    code: 'SFDM',
    label: 'Shank diameter',
    unit: 'mm',
    description: 'What the holder grips. Decides which collet a tool can be held in.',
    iso: 'DMM',
  },
  /**
   * ISO 13399's clamping length minimum: the shank a manufacturer wants held.
   *
   * No vendor in this catalog publishes it yet — the scraper carries no such
   * column — and the day one does, this is where it lands: the application
   * reads it in preference to any rule of thumb (Paul, 2026-09-01).
   */
  LSCN: {
    code: 'LSCN',
    label: 'Clamping length, least',
    unit: 'mm',
    description:
      'The least of the shank the manufacturer wants clamped. What is left of the tool below the holder is the overall length less this.',
    iso: 'LSCN',
  },
  'shoulder-length': {
    code: 'shoulder-length',
    label: 'Shoulder length',
    unit: 'mm',
    description: 'Usable length below the full shank, which is what reach is measured against.',
    iso: null,
  },
  'shoulder-diameter': {
    code: 'shoulder-diameter',
    label: 'Shoulder diameter',
    unit: 'mm',
    description: 'Diameter at the shoulder — the neck, where the tool is necked.',
    iso: null,
  },
}

/**
 * A tool before `buildCatalog` has worked out what it is: everything but the
 * derived `form`, which a scraper may state and the build fills in otherwise.
 */
export type ToolInput = Omit<CatalogTool, 'form'> & { readonly form?: ToolForm }

/** One tool, flattened out of whatever family and vendor table it arrived in. */
export interface CatalogTool {
  /** Stable across regenerations of the catalog: the join key everything uses. */
  readonly guid: string
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  /** What a shop orders by. */
  readonly catalogNumber: string
  /** What the vendor's own systems key on, and what CAD links are built from. */
  readonly materialNumber: string | null
  readonly toolType: ToolType
  /**
   * What the tool is in a CAM library's words — `bull nose end mill` where
   * `toolType` says only `endmill`. Worked out by `buildCatalog` from the type
   * and the geometry, with its provenance under `provenance.form`; see
   * `forms.ts`.
   */
  readonly form: ToolForm
  readonly unitSystem: UnitSystem
  /** Geometry code to value, in millimetres, degrees, or a count. */
  readonly geometry: Readonly<Record<string, number>>
  /**
   * ISO 513 workpiece-material groups this tool is indexed under — `P`, `M`,
   * `K`, `N`, `S`, `H`, `C`.
   *
   * **Three states, and they are different claims.** This was
   * `ReadonlyArray<string>` until catalog version 5, and an empty array carried
   * two incompatible facts at once:
   *
   * - **`null`** — nobody has said. The vendor publishes no material index a
   *   scrape can reach, or the sweep that reads one was never run. Says nothing
   *   about what this tool cuts, and is **not** a claim that it cuts nothing.
   * - **`[]`** — the vendor's index exists and rates this part for nothing.
   * - **non-empty** — rated, in {@link MATERIAL_GROUPS} order.
   *
   * The distinction is the scraper's, and collapsing it here threw away the
   * only evidence of which one a tool was: `ingest` read `?? []`, so a Harvey
   * tool — every one of which is unrated, because Harvey publishes its index
   * per part where no scrape reaches it — entered the catalog indistinguishable
   * from a Kennametal tap the vendor really does rate for nothing.
   *
   * **Empty is still a real answer, not "unconstrained".** Showing a tool under
   * every material on no evidence is how a shop ends up trusting a
   * recommendation nobody made — which is as true of `null` as it was of `[]`.
   */
  readonly materialGroups: ReadonlyArray<string> | null
  /**
   * The vendor's own name for the product line this tool belongs to —
   * `KenCut™ FF`, `MultiDRILL`, `Viper` — or `null` where the vendor names
   * none.
   *
   * **Not the family, and that is the point.** A family is one page in a
   * vendor's catalogue and its id says how the scrape was run
   * (`kencut_ff_square_6fl_inch`); a product line is what a machinist calls
   * the tool. One line spans several families — the same `KenCut™ FF` is a
   * square end and a ball nose, metric and inch — so filtering by it is the
   * question "show me the rest of that line" that `familyId` could not ask.
   *
   * **`null` is the vendor's silence, not an empty name** — the scraper's own
   * three-state rule, kept for the reason {@link CatalogTool.materialGroups}
   * states: Harvey publishes no line separate from its part description, and a
   * `''` would read as a line with no name.
   */
  readonly productLine: string | null
  /** The vendor's page for this tool, where the vendor publishes one. */
  readonly productLink: string | null
  /** Which geometry values are the vendor's, and which this pipeline decided. */
  readonly provenance: Readonly<Record<string, Provenance>>
}

/** A vendor product family: the unit a scrape is run in and a catalog is browsed by. */
export interface ToolFamily {
  readonly id: string
  readonly name: string
  readonly brand: string
  readonly vendor: string
  readonly unitSystem: UnitSystem
  readonly toolTypes: ReadonlyArray<ToolType>
  readonly toolCount: number
  /** The vendor page the family was scraped from. */
  readonly source: string | null
}

/** A discrete filter axis and how many tools carry each of its values. */
export interface TermAxis {
  readonly key: string
  readonly label: string
  readonly values: ReadonlyArray<{ readonly value: string; readonly count: number }>
}

/** A continuous filter axis and the bounds the catalog actually spans, in mm. */
export interface RangeAxis {
  readonly key: string
  readonly label: string
  readonly min: number
  readonly max: number
}

/**
 * The catalog-wide vocabulary of every filter.
 *
 * Its counts are catalog-wide and do not move with a selection: they decide
 * which values a control offers and what a slider's bounds are. The number
 * beside a value in a filtered view is counted over the result set instead,
 * in the application.
 */
export interface Facets {
  readonly terms: ReadonlyArray<TermAxis>
  readonly ranges: ReadonlyArray<RangeAxis>
}

/**
 * ISO 513's main workpiece-material groups, in the one order everything must
 * agree on — a facet rendered from one order and a tool's own list from
 * another have no way to notice they disagree.
 */
export const MATERIAL_GROUPS = ['P', 'M', 'K', 'N', 'S', 'H', 'C'] as const

export interface Catalog {
  /** Bumped whenever this document's shape changes, so a stale dataset is loud. */
  readonly version: number
  /** ISO date the dataset was built. Ingestion stamps it; nothing derives it. */
  readonly builtAt: string
  readonly families: ReadonlyArray<ToolFamily>
  readonly tools: ReadonlyArray<CatalogTool>
  /**
   * What holds the tools.
   *
   * Empty in a dataset built before toolholding was ingested, which the
   * application has to render as "nothing to hold this with yet" rather than as
   * "nothing holds this" — the two read the same on screen and mean opposite
   * things.
   */
  readonly holders: ReadonlyArray<Holder>
  readonly collets: ReadonlyArray<Collet>
  readonly facets: Facets
}

/**
 * The shape this document is at now.
 *
 * 2 — geometry moved to the scraper's canonical field names (`DMM` became
 * `SFDM`), provenance adopted the scraper's `vendor-stated`, and tools carry
 * their ISO 513 material groups.
 *
 * 3 — the document carries toolholding, because a tool nothing holds is not an
 * answer.
 *
 * 5 — `materialGroups` tells "nobody said" from "rated for nothing". It is
 * `null` for the first, where it was `[]` for both, and a dataset built before
 * this cannot be repaired by reading it: the two states are already merged in
 * the file. Re-ingest the store rather than rebuild — `scripts/rebuild.mjs`
 * works forwards from a built dataset and would carry the merge forward.
 *
 * 6 — every tool carries the vendor's own `productLine`, which
 * `@toolpath/tool-scraper` records for the first time, and an AEM family's
 * `name` is the vendor's own title for it rather than its id with the
 * underscores taken out. A version-5 dataset states neither, and there is
 * nothing in it to derive them from — both are the vendor's words and come off
 * a page. Re-ingest the store; `rebuild.mjs` would only write `null`.
 *
 * 7 — toolholding comes from `@toolpath/tool-scraper`'s own `HolderRecord` and
 * `ColletRecord` rather than from this package reading a vendor's column
 * labels, and `Clamping` gained `hydraulic`, which the records state and the
 * three-value union rejected. A version-6 dataset cannot be repaired by reading
 * it: it holds no toolholding at all, because nothing ever wrote any. Re-ingest
 * the store.
 *
 * 8 — `LBH` is the length the tool is set up at rather than the most it could
 * stand out, and `LD` follows it. Both are derived, so unlike 5, 6 and 7 this
 * one **rebuilds**: `scripts/rebuild.mjs` re-runs `withDerived` over an
 * existing dataset and writes what a fresh ingest would. A tool that states no
 * flute length now carries neither field, where a version-7 document gave it
 * both from `OAL` and `SFDM` alone.
 */
export const CATALOG_VERSION = 8
