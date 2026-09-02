import type { Collet, Holder } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'

/**
 * A part in words, not just a number.
 *
 * A catalog number is not a description: `BT 30 / PG 6 x 050` encodes the
 * taper, the series and the projection, and a machinist who has not memorised
 * REGO-FIX's scheme reads none of them off it. So every row and every summary
 * says in words what the part is — the same words in both places, so a
 * summary repeats what the row said.
 *
 * **Every token is the vendor's.** `powRgrip` is REGO-FIX's name for the
 * system, from its own product pages; a PG collet is pressed in and drawn out
 * with a hydraulic clamping unit rather than closed by a nut, so a shop without
 * one on the bench cannot build the assembly at all — which is the first thing
 * a machinist asks about it, and what the label is for.
 */

/** The spindle interface in words: `BT30`, or `BT30 face contact` for a dual-contact shank. */
export const taperLabel = (holder: Pick<Holder, 'taper' | 'contact'>): string =>
  holder.contact === 'face' ? `${holder.taper} face contact` : holder.taper

/** What kind of holder this is. A plain collet chuck is labelled too: `PG6` is the series, not the kind. */
export const styleLabel = (holder: Pick<Holder, 'clamping' | 'brand'>): string => {
  switch (holder.clamping) {
    case 'collet':
      return holder.brand === 'REGO-FIX' ? 'powRgrip collet chuck' : 'collet chuck'
    case 'shrink':
      return 'shrink fit'
    case 'hydraulic':
      return 'hydraulic chuck'
    case 'bore':
      return 'direct bore'
  }
}

/**
 * What kind of collet, where the plain one needs no word — or the raw family
 * suffix for one nobody has labelled, so a new family is visibly unlabelled
 * rather than quietly indistinguishable from a standard collet.
 */
const COLLET_STYLES: Readonly<Record<string, string | null>> = {
  standard: null,
  coolant_flush: 'peripheral coolant, flush',
  cool_bore: 'peripheral coolant, cool bore',
  short: 'short',
  long: 'long',
  microbore: 'microbore',
  turning: 'turning',
  tap: 'tapping, internal square',
  mql: 'MQL',
  securgrip: 'secuRgrip, pullout protection',
  sealed_cap: 'sealed cap',
  pgst_short_tail: 'short tail, PGST holders only',
}

const colletStyleLabel = (collet: Pick<Collet, 'familyId'>): string | null => {
  const suffix = collet.familyId.replace(/^regofix_pg_collets_/, '').replace(/^regofix_/, '')
  const label = COLLET_STYLES[suffix]
  return label === undefined ? suffix : label
}

const join = (parts: ReadonlyArray<string | null>): string =>
  parts.filter((part): part is string => part !== null && part !== '').join(' · ')

export const describeHolder = (holder: Holder, unit: Unit): string =>
  join([
    taperLabel(holder),
    holder.clamping === 'collet'
      ? holder.colletSeries
      : holder.boreDiameter === null
        ? null
        : `${formatLength(holder.boreDiameter, unit)} bore`,
    styleLabel(holder),
    holder.gaugeLength === null ? null : `${formatLength(holder.gaugeLength, unit)} gauge`,
  ])

export const describeCollet = (collet: Collet, unit: Unit): string =>
  join([
    collet.series,
    // A powRgrip collet takes one exact size and nothing else, so a "range" of
    // one number would read as a mistake.
    collet.clampMin === collet.clampMax
      ? `exactly ${formatLength(collet.clampMax, unit)}`
      : `closes ${formatLength(collet.clampMin, unit)} – ${formatLength(collet.clampMax, unit)}`,
    colletStyleLabel(collet),
  ])
