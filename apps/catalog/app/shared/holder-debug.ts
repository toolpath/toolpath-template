import {
  holderCanTake,
  holderMayTake,
  holderNeedsCollet,
  matchesFilters,
  seriesSize,
  seriesUnstocked,
  type CatalogTool,
  type Collet,
  type Holder,
  type HolderFilters,
} from '@toolpath/catalog-data'

/**
 * Why the rack in front of somebody holds what it holds — the whole funnel, in
 * text they can paste.
 *
 * **An empty rack says nothing about which rule emptied it.** A holder reaches
 * the table through five gates in `holdersToOffer` and the table's own query,
 * and every one of them fails the same way on screen: the row is not there.
 * "Why are there no hydraulic or shrink-fit holders for this feature" is a
 * question the page cannot answer and this can — a shrink chuck is dropped for
 * publishing no bore, for publishing one that is not this shank, for having no
 * measured silhouette, or for a filter somebody forgot they set, and those are
 * four different things to do about it.
 *
 * Pure, and reads nothing but its arguments: the caller hands in the two
 * predicates that need the catalog's own documents, exactly as
 * `holdersToOffer` takes `canDraw`. Nothing here decides anything the page
 * shows — it re-asks the same rules and counts the answers, so a report that
 * disagrees with the table is a bug in this module rather than a second
 * opinion.
 */

/** The gates a holder passes on its way to a row, in the order it meets them. */
export type Gate = 'filters' | 'fit' | 'drawable' | 'collet' | 'query'

const GATE_LABEL: Readonly<Record<Gate, string>> = {
  filters: 'match crib filters',
  fit: 'can hold the asked tool(s)',
  drawable: 'has a silhouette',
  collet: 'crib has a collet for it',
  query: 'match table filters',
}

const GATES: ReadonlyArray<Gate> = ['filters', 'fit', 'drawable', 'collet', 'query']

export interface HolderDebugInput {
  /** What the report is about, in a phrase: the feature, the slot, the role. */
  readonly about: string
  /**
   * Which dataset is loaded — `builtAt` from `shared/catalog.ts`.
   *
   * **The first thing to check and the one a screenshot cannot show.** A
   * scrape built against an older contract falls back to the committed sample,
   * which is three holders and nine tools, and a rack that is empty because of
   * that is indistinguishable from a rack that is empty because of a rule.
   */
  readonly dataset: string
  readonly holders: ReadonlyArray<Holder>
  readonly collets: ReadonlyArray<Collet>
  /**
   * The tools the slot is standing on — `stackShanks`, one per shank — or null
   * where no feature is being asked and the rack is a catalog again.
   */
  readonly tools: ReadonlyArray<CatalogTool> | null
  readonly chosenTool: CatalogTool | null
  readonly chosenCollet: Collet | null
  readonly filters: HolderFilters
  /** `drawable(holder, …)`, handed in because it needs the profile document. */
  readonly canDraw: (holder: Holder) => boolean
  /** Whether the table's own column filters keep this holder. */
  readonly inQuery: (holder: Holder) => boolean
  /** Whether the press in the chrome is showing chucks the crib has no collet for. */
  readonly noCollet: boolean
}

/** Which gate a holder fell at, and in a few words why. */
interface Fate {
  readonly holder: Holder
  readonly gate: Gate | null
  readonly why: string
}

const shanksOf = (tools: ReadonlyArray<CatalogTool>): ReadonlyArray<number> =>
  [...new Set(tools.map((tool) => tool.geometry.SFDM).filter((shank) => shank !== undefined))].sort(
    (a, b) => a - b,
  )

const list = (values: ReadonlyArray<number>): string =>
  values.length === 0 ? 'none' : values.map((value) => String(value)).join(', ')

/** Why this holder holds none of the asked tools, for a holder that grips the shank. */
const boreWhy = (holder: Holder, shanks: ReadonlyArray<number>): string => {
  if (holder.boreDiameter === null) {
    return 'publishes no bore diameter'
  }
  if (shanks.length === 0) {
    return 'no asked tool states a shank'
  }
  return `bore ${holder.boreDiameter} is none of the asked shanks (${list(shanks)})`
}

/** The same, for a collet chuck, which is judged on its series' nominal size. */
const colletWhy = (
  holder: Holder,
  collets: ReadonlyArray<Collet>,
  shanks: ReadonlyArray<number>,
  chosen: Collet | null,
): string => {
  if (chosen !== null) {
    return holder.colletSeries === chosen.series
      ? `${chosen.catalogNumber} does not close on ${list(shanks)}`
      : `takes ${holder.colletSeries ?? 'no'} collets, not the chosen ${chosen.series}`
  }
  const bound = seriesSize(holder.colletSeries)
  if (bound !== null && shanks.every((shank) => shank > bound)) {
    return `${holder.colletSeries ?? 'its series'} cannot reach ${list(shanks)}`
  }
  if (seriesUnstocked(holder, collets)) {
    return `the crib stocks no ${holder.colletSeries ?? ''} collet`.replace('  ', ' ')
  }
  return `no stocked ${holder.colletSeries ?? ''} collet closes on ${list(shanks)}`.replace(
    '  ',
    ' ',
  )
}

/** Why a holder has no silhouette, which is one of two absent things. */
const drawWhy = (holder: Holder): string =>
  holder.cadModelUrl === null
    ? 'no measured profile, no published nose diameter, and no CAD model to measure'
    : 'no measured profile and no published nose diameter — its CAD model has not been measured'

const fateOf = (holder: Holder, input: HolderDebugInput, shanks: ReadonlyArray<number>): Fate => {
  const { collets, tools, chosenTool, chosenCollet, filters } = input
  if (!matchesFilters(holder, filters)) {
    return { holder, gate: 'filters', why: 'a crib filter excludes it' }
  }
  if (
    chosenCollet !== null &&
    !(holderNeedsCollet(holder) && holder.colletSeries === chosenCollet.series)
  ) {
    return { holder, gate: 'fit', why: `does not take the chosen ${chosenCollet.series} collet` }
  }
  const wanted = chosenTool !== null ? [chosenTool] : tools
  if (wanted !== null) {
    const takes = wanted.some((tool) =>
      chosenCollet === null
        ? holderMayTake(tool, holder, collets)
        : holderCanTake(tool, holder, collets),
    )
    if (!takes) {
      return {
        holder,
        gate: 'fit',
        why: holderNeedsCollet(holder)
          ? colletWhy(holder, collets, shanks, chosenCollet)
          : boreWhy(holder, shanks),
      }
    }
  }
  if (!input.canDraw(holder)) {
    return { holder, gate: 'drawable', why: drawWhy(holder) }
  }
  const gapped =
    holderNeedsCollet(holder) &&
    (wanted === null
      ? seriesUnstocked(holder, collets)
      : !wanted.some((tool) => holderCanTake(tool, holder, collets)))
  if (gapped && !input.noCollet) {
    return {
      holder,
      gate: 'collet',
      why: `no stocked ${holder.colletSeries ?? ''} collet grips it — press "show with no collet" to see it`.replace(
        '  ',
        ' ',
      ),
    }
  }
  if (!input.inQuery(holder)) {
    return { holder, gate: 'query', why: 'a table column filter excludes it' }
  }
  return { holder, gate: null, why: '' }
}

const CLAMPINGS: ReadonlyArray<string> = ['collet', 'shrink', 'hydraulic', 'bore']

const clampingOf = (holder: Holder): string =>
  CLAMPINGS.includes(holder.clamping) ? holder.clamping : 'other'

const pad = (text: string, width: number): string => text.padEnd(width, ' ')

const padStart = (text: string, width: number): string => text.padStart(width, ' ')

/** The funnel as a table: one row per gate, one column per clamping mode. */
const funnel = (fates: ReadonlyArray<Fate>): string => {
  const modes = [...new Set(fates.map((fate) => clampingOf(fate.holder)))].sort()
  const survives = (fate: Fate, upto: number): boolean => {
    const fell = fate.gate === null ? GATES.length : GATES.indexOf(fate.gate)
    return fell >= upto
  }
  const width = 26
  const cell = 11
  const header =
    pad('stage', width) + padStart('all', cell) + modes.map((mode) => padStart(mode, cell)).join('')
  const row = (label: string, upto: number): string => {
    const kept = fates.filter((fate) => survives(fate, upto))
    return (
      pad(label, width) +
      padStart(String(kept.length), cell) +
      modes
        .map((mode) =>
          padStart(String(kept.filter((fate) => clampingOf(fate.holder) === mode).length), cell),
        )
        .join('')
    )
  }
  return [
    header,
    row('in the crib', 0),
    ...GATES.map((gate, index) => row(GATE_LABEL[gate], index + 1)),
  ].join('\n')
}

/** The reasons a mode lost holders, most common first, with an example each. */
const reasons = (fates: ReadonlyArray<Fate>): string => {
  const lost = fates.filter((fate) => fate.gate !== null)
  const modes = [...new Set(lost.map((fate) => clampingOf(fate.holder)))].sort()
  return modes
    .map((mode) => {
      const mine = lost.filter((fate) => clampingOf(fate.holder) === mode)
      const grouped = new Map<string, Array<Fate>>()
      for (const fate of mine) {
        const key = `${fate.gate}: ${fate.why}`
        const had = grouped.get(key)
        if (had === undefined) {
          grouped.set(key, [fate])
        } else {
          had.push(fate)
        }
      }
      const lines = [...grouped.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 6)
        .map(([why, group]) => {
          const one = group[0].holder
          return `    ${padStart(String(group.length), 4)}  ${why}\n          e.g. ${one.brand} ${one.catalogNumber} (${one.taper}, bore ${one.boreDiameter ?? '—'}, series ${one.colletSeries ?? '—'}, guid ${one.guid})`
        })
      return `  ${mode} — ${mine.length} dropped\n${lines.join('\n')}`
    })
    .join('\n')
}

/**
 * The whole report, as one string to paste.
 *
 * Everything the page decided, in the order it decided it, with the counts a
 * screen cannot show and an example holder against every reason so the claim
 * can be checked against the vendor's own sheet.
 */
export const holderReport = (input: HolderDebugInput): string => {
  const asked = input.chosenTool !== null ? [input.chosenTool] : (input.tools ?? [])
  const shanks = shanksOf(asked)
  const fates = input.holders.map((holder) => fateOf(holder, input, shanks))
  const boresBy = (mode: string): string =>
    list(
      [
        ...new Set(
          input.holders
            .filter((holder) => clampingOf(holder) === mode && holder.boreDiameter !== null)
            .map((holder) => holder.boreDiameter as number),
        ),
      ].sort((a, b) => a - b),
    )
  const filters = Object.entries(input.filters)
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .map(([axis, values]) => `${axis}=[${(values as ReadonlyArray<string>).join(', ')}]`)
  return [
    '=== holder debug ===',
    `when:    ${new Date().toISOString()}`,
    `about:   ${input.about}`,
    `dataset: built ${input.dataset}`,
    `chosen:  tool ${input.chosenTool === null ? '—' : `${input.chosenTool.brand} ${input.chosenTool.catalogNumber} (shank ${input.chosenTool.geometry.SFDM ?? '—'})`} · collet ${input.chosenCollet === null ? '—' : `${input.chosenCollet.catalogNumber} (${input.chosenCollet.series})`}`,
    `asked:   ${asked.length} tool(s), shanks ${list(shanks)}`,
    `crib:    ${input.holders.length} holders, ${input.collets.length} collets`,
    `filters: ${filters.length === 0 ? 'none' : filters.join(' ')}`,
    `no-collet press: ${input.noCollet ? 'on (widened rack)' : 'off (stocked rack)'}`,
    '',
    funnel(fates),
    '',
    'bores published, by clamping mode:',
    `  shrink:    ${boresBy('shrink')}`,
    `  hydraulic: ${boresBy('hydraulic')}`,
    `  bore:      ${boresBy('bore')}`,
    '',
    'why they went:',
    reasons(fates),
    '=== end ===',
  ].join('\n')
}
