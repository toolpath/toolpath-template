import {
  gripsShank,
  holderCanTake,
  holderMayTake,
  holderNeedsCollet,
  holderTakesTool,
  matchesFilters,
  seriesUnstocked,
  type CatalogTool,
  type Collet,
  type Holder,
  type HolderFilters,
} from '@toolpath/catalog-data'

/**
 * Every list in the tree narrowed by every other choice in it.
 *
 * **A component chosen first narrows the rest** (Paul, 2026-09-07: "if I select
 * a CAT40 Kennametal holder of a certain type, only tools that work for the
 * geometry with that holder applied are shown, and only collets that fit that
 * holder"). The page could only ever go one way — pick a tool, then be offered
 * holders for it — which is the wrong way round for a shop that owns four
 * holders and buys cutters to suit them.
 *
 * Every rule here is symmetric, and every one of them is the same three facts
 * asked from a different corner:
 *
 * | Chosen  | Narrows tools to           | Narrows holders to          | Narrows collets to        |
 * | ------- | -------------------------- | --------------------------- | ------------------------- |
 * | tool    | —                          | those that can take it      | those closing on its shank|
 * | holder  | those it can take          | —                           | those of its series        |
 * | collet  | those it closes on         | those of its series         | —                          |
 * | nothing | —                          | those that take one of the  | those closing on one of   |
 * |         |                            | tools the geometry admits   | their shanks              |
 *
 * The last row is {@link takesAny} and {@link gripsAny}, and it is the one
 * entry that is not a pick: a slot opened before a tool is chosen is still a
 * slot **on a feature**, so the feature's own tools are what "compatible" means
 * there. It is the same sentence in both columns — the chosen tool is decisive,
 * and the feature's tools stand in until there is one.
 *
 * Pure and tested here: a narrowing that is wrong shows an empty list, and an
 * empty list is indistinguishable from "nothing in the catalog fits".
 */

/** What has been chosen in one assembly so far, by identity. */
export interface Chosen {
  readonly tool: CatalogTool | null
  readonly holder: Holder | null
  readonly collet: Collet | null
}

export const NOTHING_CHOSEN: Chosen = { tool: null, holder: null, collet: null }

/**
 * Whether a holder and a collet go together at all.
 *
 * A series is an interface rather than a size class: an ER16 collet does not go
 * in an ER20 nose, and a holder that grips the shank itself takes no collet.
 */
export const holderTakesCollet = (holder: Holder, collet: Collet): boolean =>
  holderNeedsCollet(holder) && holder.colletSeries === collet.series

/**
 * The tools this stack can hold, given whichever of the two are chosen.
 *
 * With both, the pair is asked together — `holderTakesTool` is the one
 * arithmetic that knows a collet's clamp range and a holder's bore are the same
 * question asked of different holders. With only a collet, the shank is all
 * there is to go on, which is the honest answer rather than a guess at which
 * chuck it will end up in.
 */
export const narrowTools = (
  tools: ReadonlyArray<CatalogTool>,
  { holder, collet }: Pick<Chosen, 'holder' | 'collet'>,
  collets: ReadonlyArray<Collet>,
): ReadonlyArray<CatalogTool> => {
  if (holder === null && collet === null) {
    return tools
  }
  if (holder !== null) {
    /*
      **Asked once per shank, not once per tool.** Every rule below reads the
      tool through `geometry.SFDM` and nothing else — `holderTakesTool` refuses
      a tool that states no shank and otherwise compares that one number — so
      two tools of the same shank always answer alike. A feature's list is
      thousands of tools and a few dozen shanks, and the collet-chuck branch
      walks a whole series per ask.
    */
    const answers = new Map<number, boolean>()
    return tools.filter((tool) => {
      const shank = tool.geometry.SFDM
      if (shank === undefined) {
        return false
      }
      const had = answers.get(shank)
      if (had !== undefined) {
        return had
      }
      const takes =
        collet === null
          ? // The rack's own rule, both ways round: a chuck offered for want of
            // a collet has to offer the tools it would take once one is bought,
            // or picking it empties the list under it.
            holderMayTake(tool, holder, collets)
          : holderTakesCollet(holder, collet) && holderTakesTool(holder, collet, tool)
      answers.set(shank, takes)
      return takes
    })
  }
  return tools.filter((tool) => {
    const shank = tool.geometry.SFDM
    return shank !== undefined && collet !== null && gripsShank(collet, shank)
  })
}

/**
 * One tool per distinct shank — the set every "does any of these fit" question
 * is really asked of.
 *
 * **A shank is all these rules read.** `holderTakesTool` compares a collet's
 * clamp range or a holder's bore against `geometry.SFDM`, and `gripsShank` the
 * same, so a thousand end mills on a 12 mm shank are one question rather than a
 * thousand. Narrowing a rack against a feature's matched tools was
 * holders × tools work on every click; this makes it holders × shanks, and the
 * answer is identical because the dropped tools would each have repeated one
 * that is kept.
 *
 * A tool stating no shank is left out rather than kept: both predicates refuse
 * one, so it can never be the tool that makes a holder fit.
 */
export const byShank = (tools: ReadonlyArray<CatalogTool>): ReadonlyArray<CatalogTool> => {
  const seen = new Set<number>()
  const kept: Array<CatalogTool> = []
  for (const tool of tools) {
    const shank = tool.geometry.SFDM
    if (shank === undefined || seen.has(shank)) {
      continue
    }
    seen.add(shank)
    kept.push(tool)
  }
  return kept
}

/**
 * Whether a holder can take at least one of a set of tools.
 *
 * **What "compatible" means before a tool is picked** (Paul, 2026-09-07: "only
 * holders [that] are compatible with tools that match the geometry should be
 * shown in the holder view of the table"). The holder slot used to open on the
 * whole drawable rack, on the reading that a list is a catalog to browse before
 * it is an answer — but the slot hangs off a feature, and a BT30 ER11 chuck in
 * a list for a 16 mm shank pocket is not something to browse. It is a row that
 * empties the tree when it is clicked.
 *
 * Short-circuits on the first tool that fits, which is what keeps it cheap over
 * a rack: most holders answer on their first or second. {@link gripsAny} is the
 * same question asked of a collet.
 */
export const takesAny = (
  holder: Holder,
  tools: ReadonlyArray<CatalogTool>,
  collets: ReadonlyArray<Collet>,
  collet: Collet | null = null,
): boolean =>
  tools.some((tool) =>
    collet === null
      ? // `holderMayTake`, not `holderCanTake`: a chuck the crib has no collet
        // for is still an answer to "what would hold this", and hiding it says
        // the holder is wrong for the tool when the collet drawer is what is
        // empty. {@link colletGap} is what keeps that honest on screen.
        holderMayTake(tool, holder, collets)
      : // With a collet chosen the claim is strict again: that collet grips, or
        // the stack somebody is building does not.
        holderTakesTool(holder, collet, tool),
  )

/**
 * The holders that can hold what is already chosen, and match the filters.
 *
 * **The chosen tool is decisive; `fits` stands in for it until there is one.**
 * With neither, every holder in the rack — the list is a catalog to browse when
 * there is no feature to answer, and `fits` is `null` exactly then.
 */
export const narrowHolders = (
  holders: ReadonlyArray<Holder>,
  { tool, collet }: Pick<Chosen, 'tool' | 'collet'>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters = {},
  /** The tools the feature's geometry admits, or null where no feature is being asked. */
  fits: ReadonlyArray<CatalogTool> | null = null,
): ReadonlyArray<Holder> => {
  const wanted = tool === null ? fits : [tool]
  return holders
    .filter((holder) => matchesFilters(holder, filters))
    .filter((holder) => collet === null || holderTakesCollet(holder, collet))
    .filter((holder) => wanted === null || takesAny(holder, wanted, collets, collet))
}

/**
 * Whether a collet closes on at least one of a set of tools' shanks.
 *
 * {@link takesAny}'s twin, for the same reason and by the same rule: a collet
 * slot opened before a tool is picked is a slot on a feature, and an ER32
 * closing on nothing this feature can be cut with is not a row worth clicking.
 *
 * A shank the vendor does not state grips nothing rather than everything —
 * `holderTakesTool` refuses one for the same reason, and the unchecked case
 * here is a cutter falling out of a collet.
 */
export const gripsAny = (collet: Collet, tools: ReadonlyArray<CatalogTool>): boolean =>
  tools.some((tool) => {
    const shank = tool.geometry.SFDM
    return shank !== undefined && gripsShank(collet, shank)
  })

/**
 * The collets that fit what is already chosen.
 *
 * A holder narrows to its series outright; a tool narrows to what closes on its
 * shank, whatever series that is — which is what makes picking a collet first a
 * usable way in. With no tool chosen the feature's own tools stand in, exactly
 * as they do for a holder.
 */
export const narrowCollets = (
  collets: ReadonlyArray<Collet>,
  { tool, holder }: Pick<Chosen, 'tool' | 'holder'>,
  /** The tools the feature's geometry admits, or null where no feature is being asked. */
  fits: ReadonlyArray<CatalogTool> | null = null,
): ReadonlyArray<Collet> => {
  const wanted = tool === null ? fits : [tool]
  return collets
    .filter((collet) => holder === null || holderTakesCollet(holder, collet))
    .filter((collet) => wanted === null || gripsAny(collet, wanted))
}

/** The words for a chuck the crib cannot close on, by which of the two gaps it is. */
const gapWords = (holder: Holder, collets: ReadonlyArray<Collet>, many: boolean): string => {
  const series = holder.colletSeries
  if (series === null) {
    return 'the crib stocks no collet for it'
  }
  if (seriesUnstocked(holder, collets)) {
    return `the crib stocks no ${series} collet`
  }
  return `no ${series} collet in the crib closes on ${many ? 'any of these shanks' : 'this shank'}`
}

/**
 * Why the crib cannot grip this tool in this chuck **today**, in a few words,
 * or null where it can.
 *
 * **The other half of showing a holder anyway.** {@link takesAny} widened the
 * rack to chucks no stocked collet closes on (Paul, 2026-09-09), and a row that
 * cannot be assembled out of what the shop owns, drawn identically to one that
 * can, is a worse answer than the missing row it replaced. The rule the order
 * dialog already followed — offer it, sort it last, and never present it as
 * something that holds the tool — is this sentence.
 *
 * Two gaps, said apart, because they are two different things to do about it:
 * a series the crib stocks none of is a drawer nobody has scraped or bought,
 * and a series it stocks but in no size that closes is one collet to order.
 */
export const colletGap = (
  tool: CatalogTool,
  holder: Holder,
  collets: ReadonlyArray<Collet>,
): string | null =>
  !holderNeedsCollet(holder) || holderCanTake(tool, holder, collets)
    ? null
    : gapWords(holder, collets, false)

/**
 * The same question asked of the shanks a slot with no tool chosen is standing
 * in for.
 *
 * One gap or none: a chuck that grips any one of those tools is not gapped at
 * all, and where it grips none of them they all fail for the same reason, since
 * the reason is a property of the chuck's series rather than of any one tool.
 *
 * With no feature to ask about there are no shanks either, and the only gap
 * left to report is the one that is true of the chuck on its own — a series the
 * crib stocks nothing of.
 */
export const colletGapFor = (
  holder: Holder,
  tools: ReadonlyArray<CatalogTool> | null,
  collets: ReadonlyArray<Collet>,
): string | null => {
  if (!holderNeedsCollet(holder)) {
    return null
  }
  if (tools === null || tools.length === 0) {
    return seriesUnstocked(holder, collets) ? gapWords(holder, collets, false) : null
  }
  return tools.some((tool) => holderCanTake(tool, holder, collets))
    ? null
    : gapWords(holder, collets, tools.length > 1)
}

/**
 * The holders to offer, and how many were kept back for having no shape.
 *
 * **Only the holders that can be drawn are offered** (Paul, 2026-09-07: "show
 * only holders we can visualize in the holders table") — the rule the dropdown
 * this table replaces already applied, and load-bearing here for a further
 * reason: the panel beside the table draws the stack as it is assembled, so a
 * holder with no silhouette puts a blank sheet under a row somebody just
 * clicked.
 *
 * **What that hides is counted, never silently dropped.** Under the record seam
 * a `HolderRecord` carries no geometry at all, so a drawable holder is one that
 * has been *measured* — and on a machine where nobody has run the profiles
 * command that is the whole rack. An empty list that fits and an empty list
 * that was filtered read the same on screen and mean opposite things.
 *
 * `canDraw` is handed in because answering it needs the catalog's own profile
 * document, which `app/shared/catalog.ts` owns and this module must not reach
 * for: the rule is here, the lookup stays where the data is.
 */
export const holdersToOffer = (
  holders: ReadonlyArray<Holder>,
  chosen: Pick<Chosen, 'tool' | 'collet'>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters,
  canDraw: (holder: Holder) => boolean,
  /** The tools the feature's geometry admits — {@link narrowHolders} says what for. */
  tools: ReadonlyArray<CatalogTool> | null = null,
): { readonly shown: ReadonlyArray<Holder>; readonly hidden: number } => {
  const fits = narrowHolders(holders, chosen, collets, filters, tools)
  const shown = fits.filter(canDraw)
  return { shown, hidden: fits.length - shown.length }
}

/**
 * Why a list is empty, in one line, or null where it is not empty.
 *
 * **An empty list has two meanings and the page could only say one** (Paul,
 * 2026-09-07, on holders disappearing): nothing in the catalog fits, or what is
 * already chosen ruled everything out. The second is a decision somebody can
 * undo, and saying which choice did it is the difference between a dead end and
 * a step back.
 */
export const whyEmpty = (
  shown: number,
  { tool, holder, collet }: Chosen,
  labels: { tool?: string; holder?: string; collet?: string } = {},
  /**
   * Whether the list was narrowed to what the feature's own tools can use.
   *
   * Without it an empty slot says "nothing in the catalog", which since
   * {@link takesAny} and {@link gripsAny} is the one thing it is not: the crib
   * is full and none of it takes the tools this feature admits.
   */
  byFit = false,
  /**
   * Why the crib grips nothing in the chuck already chosen — {@link colletGap}.
   *
   * It answers before the choices do, because it is the more specific fact
   * about the same emptiness: a collet list emptied by an ER16 chuck the crib
   * stocks no ER16 collet for is not asking anybody to clear a choice, it is
   * naming what to buy. Widening the rack is what put such a chuck on screen,
   * so this is the first slot it can empty.
   */
  gap: string | null = null,
): string | null => {
  if (shown > 0) {
    return null
  }
  if (gap !== null) {
    return `No collet fits this holder: ${gap}. Order the holder on its own, or choose another.`
  }
  const by: Array<string> = []
  if (holder !== null) {
    by.push(labels.holder ?? holder.catalogNumber)
  }
  if (collet !== null) {
    by.push(labels.collet ?? collet.catalogNumber)
  }
  if (tool !== null) {
    by.push(labels.tool ?? tool.catalogNumber)
  }
  if (by.length > 0) {
    return `Nothing fits alongside ${by.join(' and ')}. Clear one of them to widen the list.`
  }
  return byFit
    ? 'Nothing here takes any of the tools that fit this feature.'
    : 'Nothing in the catalog to show here.'
}
