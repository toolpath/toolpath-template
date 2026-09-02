import type { Assembly, CatalogTool, Holder, ToolForm } from '@toolpath/catalog-data'
import { TOOL_FORMS } from '@toolpath/catalog-data'
import type { ViewerAssembly, ViewerHolder, ViewerTool } from '@toolpath/tool-drawing/geometry'

/**
 * The one seam between this catalog's records and `@toolpath/tool-drawing`.
 *
 * `CatalogTool` already satisfies `ViewerTool` structurally, so a cast would
 * compile. The adapter exists anyway, and the explicitness is the whole point:
 * the coupling between two independently-versioned shapes lives in one file
 * that fails to typecheck the moment either side moves, rather than in a cast
 * that keeps compiling while the meaning drifts underneath it.
 *
 * **Geometry codes are passed through, never renamed.** `DC`, `SFDM`, `OAL`,
 * `LCF`, `RE`, `SIG`, `NOF`, `shoulder-diameter`, `shoulder-length` are the
 * scraper's own names and the package speaks the same vocabulary. A translation
 * table here is how an `SFDM` silently becomes a `DC` — AGENTS.md § Vendor Tool
 * Data states the rule and this file is where it would be broken first.
 *
 * The holder is mapped field by field for the same reason: nine named
 * dimensions, each of which a rename upstream should stop the build over.
 */

/**
 * What the drawing needs of an assembly: a tool, and a holder at a stickout
 * where there is one.
 *
 * Wider than {@link Assembly}, which always has a holder, because the tool page
 * draws a bare tool before anything is picked to hold it. An `Assembly`
 * satisfies this, so the caller can pass either.
 */
export type DrawableAssembly = Pick<Assembly, 'tool' | 'stickout'> & {
  readonly holder: Holder | null
}

export const toViewerTool = (tool: CatalogTool): ViewerTool => ({
  form: tool.form,
  label: tool.catalogNumber,
  geometry: tool.geometry,
  provenance: tool.provenance,
})

export const toViewerHolder = (holder: Holder): ViewerHolder => ({
  noseDiameter: holder.noseDiameter,
  noseLength: holder.noseLength,
  bodyDiameter: holder.bodyDiameter,
  bodyLength: holder.bodyLength,
  projection: holder.projection,
  flangeDiameter: holder.flangeDiameter,
  gaugeLength: holder.gaugeLength,
  colletSeries: holder.colletSeries,
  colletProtrusion: holder.colletProtrusion,
  provenance: holder.provenance,
})

export const toViewerAssembly = (assembly: DrawableAssembly): ViewerAssembly => ({
  tool: toViewerTool(assembly.tool),
  holder: assembly.holder === null ? null : toViewerHolder(assembly.holder),
  stickout: assembly.stickout,
})

/**
 * Which forms the drawing package has a generator for.
 *
 * **A declaration, not the implementation.** The generators live in
 * `@toolpath/tool-drawing/geometry`, and this list says which ones this catalog
 * believes exist. Two lists that could drift are worth nothing on their own, so
 * `tool-drawing-input.test.ts` checks every entry against what
 * `assemblyOutline` actually returns: a form named here that draws nothing, or
 * one named undrawable that draws something, is a failing test rather than a
 * wrong picture.
 *
 * The package draws nothing for a form it does not recognise — no fallback
 * cylinder — so an unlisted form is a caption saying so, not a plausible shape.
 */
export const DRAWABLE_FORMS: ReadonlySet<ToolForm> = new Set<ToolForm>([
  'ball end mill',
  'bull nose end mill',
  'center drill',
  'chamfer mill',
  'counter sink',
  'drill',
  'flat end mill',
  'slot mill',
  'spot drill',
  'tap left hand',
  'tap right hand',
])

/**
 * The forms nobody can draw honestly yet, listed one by one on purpose.
 *
 * Every one of these is a real gap: `tapered mill`, `dovetail mill` and
 * `lollipop mill` were dropped from the generators ported into the package
 * because they invented shape out of a hardcoded taper angle or a neck radius
 * of `r * 0.4`, and the rest have never had a generator at all. Naming them
 * here is what keeps the gap visible — and what makes a form added to
 * {@link TOOL_FORMS} without a decision about drawing it fail the suite.
 */
export const UNDRAWABLE_FORMS: ReadonlySet<ToolForm> = new Set<ToolForm>([
  'boring bar',
  'circle segment barrel',
  'circle segment lens',
  'circle segment oval',
  'circle segment taper',
  'counter bore',
  'dovetail mill',
  'face mill',
  'lollipop mill',
  'radius mill',
  'reamer',
  'tapered mill',
  'thread mill',
  // What `buildCatalog` calls a tool it could not name. There is by definition
  // no geometry to draw from.
  'other',
])

/** Every form the catalog can produce: the vocabulary, plus its escape hatch. */
export const ALL_FORMS: ReadonlyArray<ToolForm> = [...TOOL_FORMS.map((each) => each.value), 'other']

/** Whether the drawing package claims a generator for this form. */
export const canDraw = (form: ToolForm): boolean => DRAWABLE_FORMS.has(form)
