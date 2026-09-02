import {
  colletsFor,
  compareHolders,
  defaultStickout,
  holderNeedsCollet,
  holderTakesTool,
  matchesFilters,
  maxStickout,
  seriesSize,
  seriesUnstocked,
  type Assembly,
  type CatalogTool,
  type Collet,
  type Holder,
  type HolderFilters,
} from '@toolpath/catalog-data'

/**
 * Browsing the crib holder-first.
 *
 * Every other list in this application starts from a tool: a part needs a
 * feature cut, a feature needs a cutter, and a holder is whatever will hold the
 * cutter. This is the question from the other end — *what is in the spindle
 * rack, and what does each one look like* — which is the question somebody asks
 * when a holder has been measured and they want to see what came back.
 *
 * The filtering and ordering are `@toolpath/catalog-data`'s own
 * (`assembly-picking.ts`), not a second copy: a holder list that sorted
 * differently from the assembly picker would be two answers to one question.
 * What is here is the part that is this page's: which holders have a measured
 * profile, and what to draw a holder *with*.
 */

/** One row of the holder list: the holder, and whether anything has measured it. */
export interface HolderRow {
  readonly holder: Holder
  readonly measured: boolean
}

/**
 * The holders this filter admits, in the picker's order.
 *
 * `isMeasured` is passed in rather than read from the dataset, so this module
 * stays pure and a test does not need a dataset to exercise the ordering.
 */
export const holderRows = (
  holders: ReadonlyArray<Holder>,
  filters: HolderFilters,
  isMeasured: (guid: string) => boolean,
): Array<HolderRow> =>
  holders
    .filter((holder) => matchesFilters(holder, filters))
    .slice()
    .sort(compareHolders)
    .map((holder) => ({ holder, measured: isMeasured(holder.guid) }))

/**
 * A tool to draw the holder with, and the collet between them.
 *
 * `<ToolDrawing>` draws an *assembly*: there is no holder-alone drawing, and
 * inventing one here would be a second picture of a holder that the package
 * does not own. So the page draws the holder the way a shop would ever see it —
 * with something in it — and says which tool that is.
 *
 * **The first tool that fits, in catalog order**, rather than a cleverer
 * choice. A representative tool is scenery; picking the "best" one would be a
 * tool-selection answer given on a page that asked no tool-selection question,
 * and the catalog's order is at least an order somebody can predict.
 */
export const representativeAssembly = (
  holder: Holder,
  tools: ReadonlyArray<CatalogTool>,
  collets: ReadonlyArray<Collet>,
): Assembly | null => {
  for (const tool of tools) {
    const candidates: Array<Collet | null> = holderNeedsCollet(holder)
      ? colletsFor(tool, holder, collets)
      : [null]

    for (const collet of candidates) {
      if (!holderTakesTool(holder, collet, tool)) {
        continue
      }
      const stickout = defaultStickout(tool, collet)
      if (stickout === null) {
        continue
      }
      return { tool, holder, collet, stickout, maxStickout: maxStickout(tool, collet) }
    }
  }

  return seriesUnstocked(holder, collets) ? colletlessAssembly(holder, tools) : null
}

/**
 * A holder drawn with nothing in it but a tool, because the crib stocks no
 * collet of its series.
 *
 * **Not a claim that this stack holds anything.** `holderTakesTool` says it
 * does not and stays saying so; this is a *picture* of a holder somebody wants
 * to look at, and MariTool's 135 collet chucks would otherwise be undrawable
 * for as long as nobody has bought an ER collet. The drawing package needs no
 * collet — `ViewerAssembly` has no field for one — so the only thing standing
 * in the way was this application refusing to build the stack.
 *
 * **The tool is bounded by the series' nominal size**, which is the collet's
 * outside designation and not its clamping capacity — an ER16 closes on 10 mm,
 * not 16. It is deliberately a loose bound rather than a made-up capacity
 * table: its whole job is to keep a 25 mm end mill out of an ER11 chuck, where
 * the picture would be absurd enough to be read as a claim. A caller shows the
 * result with the collet said to be missing.
 */
const colletlessAssembly = (holder: Holder, tools: ReadonlyArray<CatalogTool>): Assembly | null => {
  const bound = seriesSize(holder.colletSeries)

  for (const tool of tools) {
    const shank = tool.geometry.SFDM
    if (shank === undefined || (bound !== null && shank > bound)) {
      continue
    }
    const stickout = defaultStickout(tool, null)
    if (stickout === null) {
      continue
    }
    return { tool, holder, collet: null, stickout, maxStickout: maxStickout(tool, null) }
  }
  return null
}

/**
 * What a measured profile is short by, said in words.
 *
 * Null where the model is complete, because a complete profile needs no
 * caption. The wording names the *model* rather than the holder: a BTKV30 whose
 * STEP file stops at the threaded nose is a complete holder and an incomplete
 * model, and a note that blamed the holder would send somebody looking for a
 * part that is not missing.
 */
export const shortfallNote = (
  shortfallMm: number | null,
  format: (millimetres: number) => string,
): string | null =>
  shortfallMm === null || shortfallMm <= 0
    ? null
    : `the vendor's model stops ${format(shortfallMm)} short of its published gauge length`
