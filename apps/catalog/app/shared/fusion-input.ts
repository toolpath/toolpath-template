import type { CatalogTool, Holder, HolderProfile } from '@toolpath/catalog-data'
import type { HolderProfile as DomainProfile } from '@toolpath/tool-support'
import type { ExportNote } from '@toolpath/tool-support/export'
import type {
  CatalogHolder,
  CatalogPreset,
  FusionLibrary,
  ToolRequest,
} from '@toolpath/tool-support/export/fusion'

/**
 * The order list as `@toolpath/tool-support/export/fusion` wants to be asked.
 *
 * **This is the whole seam.** The exporter itself is not this application's —
 * its per-type rules come from Autodesk's own published JSON Schema, reduced
 * into that repository's `fusion/digest.json` and watched for drift. What is
 * ours is the translation from the shapes this catalog stores into the shapes
 * that package takes, and it lives here rather than in the route so it can be
 * tested without mounting a page.
 *
 * The route resolves guids through `catalog.ts` and hands the records over;
 * nothing here reaches for the dataset.
 *
 * ## Three names this catalog spells differently
 *
 * The package documents that a `@toolpath/tool-scraper` `ToolRecord` satisfies
 * its input with no adapter, and that is true of a record. It is not true of
 * *this* catalog's `CatalogTool`, which is a different document: ingestion
 * renames `unit` to `unitSystem`, and drops `description`, `substrate` and
 * `coolantThrough` on the way in. So `BMC` is always `unspecified` and `CSP` is
 * always the exporter's filled `false` — including on a through-coolant drill.
 * Carrying those two fields through ingest is a catalog version bump and a
 * re-ingest, and until then the silence is honest rather than invented.
 */

/** One distinct stack on the order list, resolved through the current catalog. */
export interface OrderedStack {
  /** The order list's own key for the row, so a note can be sent back to it. */
  readonly key: string
  readonly tool: CatalogTool
  readonly holder?: Holder | undefined
  /**
   * The holder measured off the vendor's CAD model, where the catalog has one.
   *
   * Preferred over the published dimensions when it exists: a `Holder` states a
   * nose, a body and a flange, and the exporter draws three stepped cylinders
   * from them, where a profile is the vendor's own silhouette and carries the
   * V-flange groove and the thread relief. `fusionHolder` cuts it at its own
   * gage line, so the two arms agree about where the holder starts.
   */
  readonly profile?: HolderProfile | null | undefined
  /** The setout selected for this stack; absent means the catalog's LBH setup value. */
  readonly stickout?: number | undefined
}

/**
 * The measured silhouette in the shape the domain states one, or `null` to use
 * the vendor's published dimensions instead.
 *
 * Two things make this a conversion rather than a pass-through. This catalog's
 * `HolderProfile` is a *measurement record* — a guid, the catalog number, how
 * well the model agreed with the vendor's gage length — where the domain's is
 * the *shape*, and the two fields the shape needs and the measurement does not
 * carry, `colletSeries` and `colletProtrusion`, are on the holder beside it.
 *
 * **And an incomplete model is refused.** `complete: false` means the vendor's
 * STEP file stops short — five BTKV30 models end at the threaded nose and omit
 * the collet nut altogether. That missing piece is at the cutting end, which is
 * the end that fouls the part, so exporting the measurement would hand Fusion a
 * holder shorter than the real one and let it clear material it cannot. The
 * published dimensions are the honest answer there, and `catalog.ts` has
 * already backfilled them from whatever the model did reach.
 */
const measuredShape = (
  holder: Holder,
  profile: HolderProfile | null | undefined,
): DomainProfile | null => {
  if (profile === undefined || profile === null || !profile.complete) {
    return null
  }
  return {
    points: profile.points,
    datum: profile.datum,
    colletSeries: holder.colletSeries,
    colletProtrusion: holder.colletProtrusion,
  }
}

/**
 * One stack, as the exporter takes it, with what is needed to read its notes
 * back.
 *
 * An `ExportNote` names its subject by guid. Because this module mints those
 * guids it also knows which order-list row each one came from, which is what
 * lets a diagnostic point at a row rather than at a catalog number that two
 * rows may share.
 */
export interface StackRequest {
  readonly key: string
  /** The guid written into the Fusion record for the tool. */
  readonly toolGuid: string
  /** The guid written for its holder, or `null` where the stack has none. */
  readonly holderGuid: string | null
  /** What a machinist orders the tool by, for a message they can act on. */
  readonly catalogNumber: string
  readonly request: ToolRequest
}

/**
 * A guid per exported record, minted here rather than taken from the catalog.
 *
 * **The package deliberately mints none**, and it is right not to: reusing a
 * catalog guid is what makes a re-exported library update a tool in Fusion
 * instead of adding a second copy of it. But an order list is not a catalog. The
 * same end mill can be ordered in two different holders, and those are two
 * assemblies a machinist sets up separately — under one guid Fusion would hold
 * only the second. So identity here is per stack, and this application owns it.
 *
 * The cost is that a re-export is a fresh set of tools rather than an update of
 * the last one, which is what this page already did.
 */
export type MintGuid = () => string

const browserGuid: MintGuid = () => globalThis.crypto.randomUUID()

/**
 * The holder as the exporter takes one: the shape, plus who made it.
 *
 * A holder carries no unit system of its own — nothing in the catalog publishes
 * one — so it takes the tool's, which is also the record it will sit inside.
 */
const holderFor = (stack: OrderedStack, mintGuid: MintGuid): CatalogHolder | undefined => {
  const { holder, profile, tool } = stack
  if (holder === undefined) {
    return undefined
  }
  return {
    guid: mintGuid(),
    holder: measuredShape(holder, profile) ?? holder,
    unit: tool.unitSystem,
    description: `${holder.brand} ${holder.catalogNumber}`,
    vendor: holder.brand,
    catalogNumber: holder.catalogNumber,
    ...(holder.productLink === null ? {} : { productLink: holder.productLink }),
  }
}

/**
 * Every ordered stack, as a request the exporter can be handed.
 *
 * `number` is the stack's place in this list rather than its place among the
 * tools that survive the export, so a tool the format refuses leaves a gap in
 * the carousel numbering. That is the trade for not exporting twice: a tool's
 * number then depends only on where it sits on the order list, and not on
 * whether some other tool three rows up happened to state a corner radius.
 *
 * Every tool carries {@link defaultPreset}, because a tool with none is a tool
 * Fusion will not load — see that function for the evidence.
 */
/** What the one preset every exported tool carries is called. */
export const DEFAULT_PRESET_NAME = 'Default Preset'

/**
 * The placeholder preset every exported tool carries.
 *
 * ## Why a tool must carry one
 *
 * `start-values.presets` used to go out empty, on the reading that Autodesk's
 * schema requires the key and not a preset in it. That reading is wrong and the
 * libraries would not import. The schema does ask for one — every `start-values`
 * branch declares `presets: { type: 'array', minLength: 1 }` — but `minLength`
 * is a *string* keyword, so on an array it is a no-op and no validator enforces
 * it. Autodesk meant `minItems`. The corroboration is Fusion's own output: of
 * 727 tools across seventeen libraries Fusion itself wrote, every one carries at
 * least one preset and none carries zero.
 *
 * ## Why the numbers are all 1
 *
 * They are placeholders and nothing else. What a tool's feeds and speeds should
 * be is a machining model — a chip load per material, a surface speed, a shop's
 * own opinion about both — and this application does not answer that yet.
 * `pretool-presets.ts` is that model, still unwired and still carrying the three
 * things to fix before it goes back through this same argument. Until then a
 * visible 1 is the honest placeholder: it loads, and nobody mistakes it for a
 * recommendation. The same reasoning keeps the name plain rather than dressed up
 * as a material.
 *
 * A `1` also cannot be wrong about its units, which matters here: the exporter
 * converts geometry between unit systems and deliberately does not convert feeds
 * and speeds, since which unit a preset field uses differs per field.
 *
 * ## Why one shape serves all five
 *
 * Autodesk states a preset's shape per tool type and the five shapes are not
 * variations on one another — a milling preset requires seventeen fields, a
 * tap's requires six and models nine, a drill states a feed per revolution and
 * no cutting feedrate at all. What is written below is the *union* of what the
 * five require, and `fusionPresets` narrows it: a field the type does not model
 * is dropped with a note before the record is written, so a tap goes out with
 * its six and a drill with its seven. Writing one shape per type here would be a
 * fourth copy of a table that already exists in the exporter and in the digest
 * it is checked against.
 *
 * The booleans are the two switches Autodesk hangs `if`/`then` rules off, and
 * both are set so the fields they demand travel with their own 1. `material` is
 * deliberately absent: an absent band is not a narrower one but no restriction
 * at all, and the exporter supplies the all-materials band for exactly that
 * reason.
 */
export const defaultPreset = (guid: string): CatalogPreset => ({
  guid,
  name: DEFAULT_PRESET_NAME,
  'tool-coolant': 'flood',
  n: 1,
  n_ramp: 1,
  v_c: 1,
  f_n: 1,
  f_n_retract: 1,
  f_z: 1,
  v_f: 1,
  v_f_leadIn: 1,
  v_f_leadOut: 1,
  v_f_plunge: 1,
  v_f_ramp: 1,
  v_f_retract: 1,
  v_f_transition: 1,
  'ramp-angle': 1,
  'use-stepdown': true,
  stepdown: 1,
  'use-stepover': true,
  stepover: 1,
  'use-feed-per-revolution': true,
})

export const fusionInput = (
  stacks: ReadonlyArray<OrderedStack>,
  mintGuid: MintGuid = browserGuid,
): Array<StackRequest> =>
  stacks.map((stack, index) => {
    const { tool } = stack
    const toolGuid = mintGuid()
    const holder = holderFor(stack, mintGuid)
    const stickout = stack.stickout ?? tool.geometry.LBH ?? null

    return {
      key: stack.key,
      toolGuid,
      holderGuid: holder?.guid ?? null,
      catalogNumber: tool.catalogNumber,
      request: {
        tool: {
          form: tool.form,
          guid: toolGuid,
          unit: tool.unitSystem,
          geometry: tool.geometry,
          threadMethod: tool.threadMethod,
          description: `${tool.brand} ${tool.catalogNumber}`,
          vendor: tool.brand,
          catalogNumber: tool.catalogNumber,
          ...(tool.productLink === null ? {} : { productLink: tool.productLink }),
          number: index + 1,
        },
        presets: [defaultPreset(mintGuid())],
        ...(holder === undefined && stickout === null
          ? {}
          : { assembly: { stickout, ...(holder === undefined ? {} : { holder }) } }),
      },
    }
  })

/** One thing worth telling whoever pressed the button, in their words. */
export interface FusionExportDiagnostic {
  readonly catalogNumber: string
  readonly reason: string
}

export interface FusionReport {
  readonly exported: number
  readonly skipped: ReadonlyArray<FusionExportDiagnostic>
  readonly holderWarnings: ReadonlyArray<FusionExportDiagnostic>
}

/**
 * What the export has to say for itself, read back off the notes.
 *
 * **A tool is skipped when it is absent from the document, not when a note says
 * so.** The exporter reports a missing required key twice — once from the
 * geometry block naming the key and once from the record summarising it — and a
 * `skipped` note is also written for a preset that was refused while the tool
 * itself exported fine. Membership in `document.data` is the only exact test,
 * and this module can make it because it minted the guids.
 *
 * `filled` notes are not surfaced. Every tool draws several — the hand, the
 * through-coolant flag, the shoulder read off the shank — and they are
 * conventions the format demands rather than anything a shop has to act on.
 */
export const fusionReport = (
  requests: ReadonlyArray<StackRequest>,
  document: FusionLibrary,
  notes: ReadonlyArray<ExportNote>,
): FusionReport => {
  const written = new Set(document.data.map((record) => record.guid))
  const skipped: Array<FusionExportDiagnostic> = []
  const holderWarnings: Array<FusionExportDiagnostic> = []

  for (const request of requests) {
    const { catalogNumber, toolGuid, holderGuid } = request
    if (!written.has(toolGuid)) {
      const said = notes
        .filter((note) => note.subject === toolGuid && note.kind === 'skipped')
        .map((note) => note.message)
      skipped.push({
        catalogNumber,
        reason: said.length === 0 ? 'Fusion has no record this tool fits' : said.join('; '),
      })
      continue
    }
    if (holderGuid === null) {
      continue
    }
    for (const note of notes) {
      if (note.subject === holderGuid && note.kind === 'dropped') {
        holderWarnings.push({ catalogNumber, reason: note.message })
      }
    }
  }

  return { exported: document.data.length, skipped, holderWarnings }
}
