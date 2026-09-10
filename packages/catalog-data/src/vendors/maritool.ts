import type { ScrapedHolder } from '../ingest.js'
import type { Row } from './regofix.js'

/**
 * MariTool toolholding rows → the toolholding handoff.
 *
 * The second vendor to arrive without a record seam, and it is here for the
 * reason `vendors/regofix.ts` states at length: `@toolpath/tool-scraper` maps
 * vendor rows into canonical records for cutting tools and **not** for
 * toolholding, so something has to read the vendor's own column labels, and
 * that something is confined to one file per vendor with its evidence cited.
 *
 * What MariTool gives that REGO-FIX did not: **holders that are not collet
 * chucks**. A shrink-fit holder and a hydraulic chuck each grip a plain
 * cylindrical shank directly, which is the catalog's `bore` clamping, and
 * until now the catalog had none.
 *
 * ## The columns this reads, and what fills them
 *
 * The scrape writes four axes in front of the vendor's own labels — `taper`,
 * `contact`, `clamping`, `style` — plus `CST` (the collet series, spacing
 * closed) and a promoted `L1_in`/`L1_mm` pair for the gage length. Everything
 * else is MariTool's own label carried verbatim, which is what the two reads
 * below are:
 *
 * - **`Shank Size`** is the bore of a shrink-fit or hydraulic holder — the
 *   shank it takes. The scraper deliberately refuses to promote it to `D1`
 *   because a collet chuck states it too and would then claim a clamping
 *   capacity it does not have, so it is read here **only on a holder that
 *   clamps on a bore**.
 * - **`Nose Diameter`** is what fouls the part, and it is the field the
 *   clearance sweep cannot proceed without.
 *
 * Nothing states a nose length, a body step, a projection or a flange, so
 * those are null and the sweep falls back to what it already falls back to for
 * a holder that publishes less than REGO-FIX does.
 *
 * ## Units are per cell, and the vendor marks only one of them
 *
 * MariTool mixes inch and millimetre parts inside one category, so no family
 * declares a unit and the gage length arrives as a pair with exactly one side
 * filled. The measured cells that stay verbatim carry the vendor's own
 * convention, which the scraper's own `parseGageLength` documents from 473
 * sampled cells: **a metric cell is marked `mm` and an imperial one is bare.**
 * {@link millimetres} applies exactly that, and refuses anything else rather
 * than guessing a basis — a `Shank Size` this cannot read is a holder that
 * would otherwise claim a 0.75 mm bore.
 *
 * The handoff carries one `unit` per holder and MariTool's rows do not have
 * one, so every length is converted here and the row is handed over as
 * millimetres.
 */

const INCH_MM = 25.4

const round = (value: number): number => Math.round(value * 1000) / 1000

/**
 * One measured cell in millimetres, or null where it says nothing this can read.
 *
 * `20mm`, `20 mm` and `20MM` are millimetres; a bare `.750`, `1.0` or `3/4` is
 * inches, by the vendor's own convention. A cell carrying anything else — a
 * range, a note, a second figure — is refused, because a number taken out of a
 * string MariTool did not write as a number is this package authoring tool data.
 */
export const millimetres = (cell: string | undefined): number | null => {
  if (cell === undefined) {
    return null
  }
  const text = cell.trim()
  if (text === '') {
    return null
  }

  const metric = /^([\d.]+)\s*mm$/i.exec(text)
  if (metric) {
    const value = Number(metric[1])
    return Number.isFinite(value) ? round(value) : null
  }

  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text)
  if (fraction) {
    const value = Number(fraction[1]) / Number(fraction[2])
    return Number.isFinite(value) ? round(value * INCH_MM) : null
  }

  if (/^[\d.]+"?$/.test(text)) {
    const value = Number(text.replace('"', ''))
    return Number.isFinite(value) ? round(value * INCH_MM) : null
  }

  return null
}

/**
 * How the scrape's `clamping` maps onto the catalog's three.
 *
 * `hydraulic` is `bore`: the catalog's clamping says what the holder grips,
 * and a hydraulic chuck grips a plain cylindrical shank in a bore exactly as a
 * shrink-fit holder does — the hydraulic sleeve is how it closes on it, which
 * is a fact about the mechanism and not about what fits. Modelling it as its
 * own kind would divide the bore holders in two for the picker with no rule
 * that reads the difference.
 */
const CLAMPING: Readonly<Record<string, 'bore' | 'collet' | 'shrink'>> = {
  collet: 'collet',
  shrink: 'shrink',
  hydraulic: 'bore',
}

export interface MaritoolContext {
  /** `recordGuid` from the scraper: the guid rule stays in the package that owns it. */
  readonly guidFor: (materialNumber: string) => string
  readonly productLinkFor: (materialNumber: string) => string | null
}

/** Why a row was left out. Reported rather than logged, as the ingest's notes are. */
export interface MaritoolNote {
  readonly materialNumber: string
  readonly reason: string
}

export interface MaritoolHolders {
  readonly holders: Array<ScrapedHolder>
  readonly notes: Array<MaritoolNote>
}

/**
 * One MariTool family's rows as holders, and what was left out.
 *
 * A row is refused rather than written with a hole where the hole would make
 * the catalog claim something: a bore holder that states no shank size has no
 * capacity, and `ingest` rejects it by the same rule one line later.
 */
export const holdersFrom = (
  rows: ReadonlyArray<Row>,
  context: MaritoolContext,
  familyId: string,
): MaritoolHolders => {
  const holders: Array<ScrapedHolder> = []
  const notes: Array<MaritoolNote> = []

  for (const row of rows) {
    const material = row['Material Number']
    if (!material) {
      continue
    }
    const clamping = CLAMPING[row['clamping'] ?? '']
    if (clamping === undefined) {
      notes.push({ materialNumber: material, reason: `clamping "${row['clamping'] ?? ''}"` })
      continue
    }

    const bore = clamping === 'collet' ? null : millimetres(row['Shank Size'])
    if (clamping !== 'collet' && bore === null) {
      notes.push({ materialNumber: material, reason: 'no Shank Size this can read' })
      continue
    }
    const series = row['CST'] ?? null
    if (clamping === 'collet' && !series) {
      notes.push({ materialNumber: material, reason: 'no collet series' })
      continue
    }
    /**
     * **A holder whose spindle interface is unknown fits no machine.**
     * `BT40-ER32-60` publishes no `Taper` row at all — alone among the parts
     * in scope — and the scrape keeps that hole rather than filling it in from
     * the part number, which is the right call for a receipt. A catalog is not
     * a receipt: offering a holder without saying what spindle takes it is the
     * one field a machinist cannot work around.
     */
    const taper = row['taper'] ?? ''
    if (taper === '') {
      notes.push({ materialNumber: material, reason: 'the vendor publishes no taper' })
      continue
    }

    const gauge = millimetres(row['L1_mm'] ? `${row['L1_mm']}mm` : row['L1_in'])
    const nose = millimetres(row['Nose Diameter'])

    holders.push({
      guid: context.guidFor(material),
      catalogNumber: material,
      materialNumber: material,
      familyId,
      brand: 'MariTool',
      vendor: 'MariTool',
      // Converted above, cell by cell: the vendor mixes both inside one family.
      unit: 'millimeters' as const,
      taper,
      contact: row['contact'] === 'face' ? 'face' : row['contact'] === 'taper' ? 'taper' : null,
      clamping,
      gaugeLength: gauge,
      colletSeries: series,
      boreDiameter: bore,
      noseDiameter: nose,
      noseLength: null,
      bodyDiameter: null,
      bodyLength: null,
      projection: null,
      flangeDiameter: null,
      colletProtrusion: null,
      productLink: context.productLinkFor(material),
      cadModelUrl: row['CAD_STEP_URL'] ? row['CAD_STEP_URL'] : null,
      provenance: {
        gaugeLength: 'vendor-stated' as const,
        boreDiameter: 'vendor-stated' as const,
        noseDiameter: 'vendor-stated' as const,
        colletSeries: 'vendor-stated' as const,
      },
    })
  }

  return { holders, notes }
}
