import {
  applicableFilters,
  axisConstrains,
  type HolderAxis,
  type HolderFilters,
} from './assembly-picking.js'
import type { Clamping, Contact } from './toolholding.js'

/**
 * What an assembly picker has chosen, and its round trip through a URL.
 *
 * Taken from the DFM catalog's `assembly-filters.ts` (Justin Gray,
 * 2026-08-05). The whole selection — holder, collet, stickout, and the four
 * holder filters — can live in a page's query string, so "the 6 mm end mill
 * in the short PG 6 chuck at 30 mm" is a link somebody can send. Or a page
 * can own it, when an assembly belongs to a feature rather than a page.
 *
 * Guids are **not** validated here: this module imports no catalog, so the
 * round trip is testable against literals. A page resolves a stale guid to
 * nothing selected.
 */

export interface BuildSelection {
  readonly holder: string | null
  readonly collet: string | null
  /** In millimetres; null is the application's default. */
  readonly stickout: number | null
  readonly taper: ReadonlyArray<string>
  readonly contact: ReadonlyArray<Contact>
  readonly clamping: ReadonlyArray<Clamping>
  readonly colletSeries: ReadonlyArray<string>
}

export const emptyBuildSelection = (): BuildSelection => ({
  holder: null,
  collet: null,
  stickout: null,
  taper: [],
  contact: [],
  clamping: [],
  colletSeries: [],
})

/** Whether an axis can narrow anything, given the rest of the selection. */
export const axisApplies = (selection: BuildSelection, axis: HolderAxis): boolean =>
  axisConstrains({ clamping: selection.clamping }, axis)

/**
 * The selection as holder filters, with an axis that cannot constrain
 * dropped: `?clamping=bore&series=PG6` asks for bore chucks that are PG 6
 * chucks, which no holder can be, and answering "nothing matches" would hide
 * orderable chucks behind a contradiction the user cannot see.
 */
export const holderFiltersFrom = (selection: BuildSelection): HolderFilters =>
  applicableFilters({
    taper: selection.taper,
    contact: selection.contact,
    clamping: selection.clamping,
    colletSeries: selection.colletSeries,
  })

type TermAxis = 'taper' | 'contact' | 'clamping' | 'colletSeries'

/**
 * Toggle one value of a discrete axis.
 *
 * **Changing a filter clears the holder and collet.** A selection that
 * survived its own filter being narrowed away would leave the page showing a
 * holder that is no longer in the list beneath it. It also clears a series
 * the change locks out, so the link somebody shares says what the page shows.
 */
export const toggleBuildTerm = (
  selection: BuildSelection,
  axis: TermAxis,
  value: string,
): BuildSelection => {
  const current = selection[axis] as ReadonlyArray<string>
  const values = current.includes(value)
    ? current.filter((held) => held !== value)
    : [...current, value]
  const next = { ...selection, [axis]: values, holder: null, collet: null } as BuildSelection
  return axisApplies(next, 'colletSeries') ? next : { ...next, colletSeries: [] }
}

/** Pick a holder. The collet is cleared: it belongs to a holder's series. */
export const selectHolder = (selection: BuildSelection, guid: string | null): BuildSelection => ({
  ...selection,
  holder: guid,
  collet: null,
})

export const selectCollet = (selection: BuildSelection, guid: string | null): BuildSelection => ({
  ...selection,
  collet: guid,
})

export const withBuildStickout = (
  selection: BuildSelection,
  stickout: number | null,
): BuildSelection => ({ ...selection, stickout })

const HOLDER_PARAM = 'holder'
const COLLET_PARAM = 'collet'
const STICKOUT_PARAM = 'stickout'
const TERM_PARAMS: Readonly<Record<TermAxis, string>> = {
  taper: 'taper',
  contact: 'contact',
  clamping: 'clamping',
  colletSeries: 'series',
}
const CLAMPINGS: ReadonlyArray<Clamping> = ['bore', 'collet', 'shrink', 'hydraulic']
const CONTACTS: ReadonlyArray<Contact> = ['taper', 'face']

/** A param name under a prefix; an empty prefix is the bare name. */
const scoped = (prefix: string, param: string): string =>
  prefix === '' ? param : `${prefix}-${param}`

/** Every param name a prefix owns — what {@link writeBuildParams} clears first. */
export const buildParamNames = (prefix = ''): Array<string> =>
  [HOLDER_PARAM, COLLET_PARAM, STICKOUT_PARAM, ...Object.values(TERM_PARAMS)].map((param) =>
    scoped(prefix, param),
  )

/** Serialise. Empty axes and null guids are left out, so a cleared selection leaves a clean URL. */
export const toBuildParams = (selection: BuildSelection, prefix = ''): URLSearchParams => {
  const params = new URLSearchParams()
  if (selection.holder !== null) {
    params.set(scoped(prefix, HOLDER_PARAM), selection.holder)
  }
  if (selection.collet !== null) {
    params.set(scoped(prefix, COLLET_PARAM), selection.collet)
  }
  if (selection.stickout !== null) {
    params.set(scoped(prefix, STICKOUT_PARAM), String(selection.stickout))
  }
  for (const [axis, param] of Object.entries(TERM_PARAMS) as Array<[TermAxis, string]>) {
    for (const value of selection[axis]) {
      params.append(scoped(prefix, param), value)
    }
  }
  return params
}

/**
 * One selection written into a query string that carries other state too.
 * The prefix's own params are cleared before the new ones go in; everything
 * else — a part page's `?job=`, for one — is left exactly as it was.
 */
export const writeBuildParams = (
  params: URLSearchParams,
  selection: BuildSelection,
  prefix = '',
): URLSearchParams => {
  const next = new URLSearchParams(params)
  for (const name of buildParamNames(prefix)) {
    next.delete(name)
  }
  for (const [name, value] of toBuildParams(selection, prefix)) {
    next.append(name, value)
  }
  return next
}

/** A hand-edited stickout that is not a non-negative finite number falls back to the default, not to zero. */
const parseStickout = (raw: string | null): number | null => {
  if (raw === null || raw.trim() === '') {
    return null
  }
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Parse. An unrecognised clamping or contact is dropped rather than passed
 * through — a hand-edited URL filters on nothing, not on a mode that does not
 * exist. `taper` and `colletSeries` are open vendor strings and are kept;
 * an unknown one simply matches no holder.
 */
export const fromBuildParams = (params: URLSearchParams, prefix = ''): BuildSelection => ({
  holder: params.get(scoped(prefix, HOLDER_PARAM)),
  collet: params.get(scoped(prefix, COLLET_PARAM)),
  stickout: parseStickout(params.get(scoped(prefix, STICKOUT_PARAM))),
  taper: params.getAll(scoped(prefix, TERM_PARAMS.taper)),
  contact: params
    .getAll(scoped(prefix, TERM_PARAMS.contact))
    .filter((value): value is Contact => (CONTACTS as ReadonlyArray<string>).includes(value)),
  clamping: params
    .getAll(scoped(prefix, TERM_PARAMS.clamping))
    .filter((value): value is Clamping => (CLAMPINGS as ReadonlyArray<string>).includes(value)),
  colletSeries: params.getAll(scoped(prefix, TERM_PARAMS.colletSeries)),
})
