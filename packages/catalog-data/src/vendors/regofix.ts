import type { ScrapedCollet, ScrapedHolder } from '../ingest.js'

/**
 * REGO-FIX powRgrip rows → the toolholding handoff.
 *
 * ## Why this file exists here, and where it belongs
 *
 * `@toolpath/tool-scraper` maps vendor rows into canonical records for cutting
 * tools and **not for toolholding** — no toolholding family carries a column
 * map or a record mapper. So there is no record seam to take a handoff at, and
 * something has to read the vendor's own column labels.
 *
 * **The right home for that is the scraper**, beside the vendor knowledge and
 * the tests that check it. This file is a stopgap so the catalog can hold real
 * toolholding today, and it is confined to one vendor, one file, with every
 * mapping citing the evidence that pins it.
 *
 * ## The evidence
 *
 * DIN 4000 is a paid standard and REGO-FIX's XML is a bare code/value list, so
 * a code is read only where something published pins it. The scraper's own
 * `docs/REGOFIX_PRODUCTFINDER_API.md` pins three by the vendor's tables:
 *
 * - `B4` — **gage length**: `B4 - B3 == 48.4` on every document, 48.4 mm
 *   being BT 30's gauge-line-to-flange distance in `BT MAS 403`. Written as
 *   `L1_mm`.
 * - `A1` — **diameter at the collet end**, row for row against the `D` column
 *   of the BT/PG table. Written as `D2_mm`.
 * - `B3` — **projection from the flange face**, the `L` column of that table.
 *   Written as `B3_mm`.
 *
 * Four more arrive as `DIN_<code>` and were unpinned until 2026-08-29, when
 * reading them across every series pinned them by how they vary (the table is
 * in `docs/TOOL-CATALOG-PLAN.md` § Holder body):
 *
 * - `B1` — the **nose length**: 10.55 on every PG 6, 9.9 on every PG 10,
 *   whatever the projection — a property of the nose, not the holder.
 * - `A2` / `B2` — the **body diameter and length behind the nose**: a step up
 *   from `A1` (10 → 12.02, 16 → 17.89, 24 → 28, 40 → 42), longer and narrower
 *   on the slim `H` bodies exactly as their designation says. Blank on PG 15
 *   and PG 25, where the body goes straight to the taper.
 * - `B3_WOA` — the projection **without the collet**: `B3 - B3_WOA` is 2.5,
 *   4, 4.5 and 6 for PG 6, 10, 15 and 25 — and those are the collets' own `B3`
 *   in their DIN 4000-93 sheets, to the decimal. Two documents agreeing is the
 *   corroboration; the difference is carried as `colletProtrusion`.
 *
 * `A4` is 46 on every BT 30 part — the flange, a property of the taper — and
 * the scraper asserts rather than writes it, so it is stated here from the
 * same `BT MAS 403` row, marked derived.
 */
/** A scraped row, before anything has been made of it. */
export type Row = Readonly<Record<string, string>>

const number = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** The flange, by taper, from the vendor's own `BT MAS 403` table: `BT 30 | 31.75 | 46 | …`. */
const FLANGE_DIAMETER = { BT30: 46 } as const

/** How far the seated collet stands proud of the nose: the projection with it less the projection without. */
const protrusion = (withCollet: number | null, without: number | null): number | null =>
  withCollet !== null && without !== null && withCollet > without
    ? Math.round((withCollet - without) * 1000) / 1000
    : null

export interface RegofixContext {
  /** `recordGuid` from the scraper: the guid rule stays in the package that owns it. */
  readonly guidFor: (materialNumber: string) => string
  readonly productLinkFor: (materialNumber: string) => string | null
}

/**
 * The BT30 powRgrip holders.
 *
 * Every one is a collet chuck — the family's `clamping` fact says so — so
 * `colletSeries` comes from the vendor's own `CST` column (`PG6`) and no
 * holder here states a bore.
 */
export const holdersFrom = (
  rows: ReadonlyArray<Row>,
  context: RegofixContext,
  familyId = 'regofix-bt30-pg-holders',
): Array<ScrapedHolder> =>
  rows.flatMap((row) => {
    const material = row['Material Number']
    const series = row['CST']
    if (!material || !series) {
      return []
    }

    return [
      {
        guid: context.guidFor(material),
        catalogNumber: row['ISO Catalog Number'] ?? material,
        materialNumber: material,
        familyId,
        brand: 'REGO-FIX',
        vendor: 'REGO-FIX',
        unit: 'millimeters' as const,
        taper: 'BT30',
        // The scrape writes `form_name`, the vendor's own dual-contact
        // discriminant, as `contact`: `taper` for a plain BT 30, `face` for a
        // `BT+ 30`. Anything else is left unstated rather than guessed.
        contact: row['contact'] === 'face' ? 'face' : row['contact'] === 'taper' ? 'taper' : null,
        clamping: 'collet',
        // `L1_mm` is DIN 4000 `B4`, pinned as gage length.
        gaugeLength: number(row['L1_mm']),
        colletSeries: series,
        boreDiameter: null,
        // `D2_mm` is DIN 4000 `A1`, pinned as the diameter at the collet end —
        // the nose, which is what fouls a part.
        noseDiameter: number(row['D2_mm']),
        noseLength: number(row['DIN_B1']),
        bodyDiameter: number(row['DIN_A2']),
        bodyLength: number(row['DIN_B2']),
        projection: number(row['B3_mm']),
        flangeDiameter: FLANGE_DIAMETER.BT30,
        colletProtrusion: protrusion(number(row['B3_mm']), number(row['DIN_B3_WOA'])),
        productLink: context.productLinkFor(material),
        // The vendor's STEP model on its CDN, written by the scrape as
        // `CAD_STEP_URL`; empty where none is published.
        cadModelUrl: row['CAD_STEP_URL'] ? row['CAD_STEP_URL'] : null,
        provenance: {
          gaugeLength: 'vendor-stated' as const,
          noseDiameter: 'vendor-stated' as const,
          colletSeries: 'vendor-stated' as const,
          noseLength: 'vendor-stated' as const,
          bodyDiameter: 'vendor-stated' as const,
          bodyLength: 'vendor-stated' as const,
          projection: 'vendor-stated' as const,
          flangeDiameter: 'derived' as const,
          colletProtrusion: 'derived' as const,
        },
      },
    ]
  })

/**
 * The PG and PGST collets.
 *
 * **A powRgrip collet clamps one size rather than closing over a range**, so
 * `CCCN == CCCX == D1` on every row — the vendor's own "Clamping range or
 * tolerance" row in the PG catalog. A zero-width range is still a range, and it
 * is carried as one rather than special-cased.
 *
 * The millimetre columns are read even on an inch collet: the scrape projects
 * an exact millimetre value from the fractional designation, and millimetres
 * are what this catalog compares in. The inch designation stays in the catalog
 * number, which is what a machinist ordered.
 *
 * **No grip length is published**, so `clampLength` is null and an assembly
 * built on one of these carries no stickout rather than a guessed one.
 */
export const colletsFrom = (
  rows: ReadonlyArray<Row>,
  context: RegofixContext,
  familyId: string,
): Array<ScrapedCollet> =>
  rows.flatMap((row) => {
    const material = row['Material Number']
    const series = row['Collet Series']
    const clampMin = number(row['CCCN_mm'])
    const clampMax = number(row['CCCX_mm'])
    if (!material || !series || clampMin === null || clampMax === null) {
      return []
    }

    return [
      {
        guid: context.guidFor(material),
        catalogNumber: row['ISO Catalog Number'] ?? material,
        materialNumber: material,
        familyId,
        brand: 'REGO-FIX',
        vendor: 'REGO-FIX',
        unit: 'millimeters' as const,
        // Written exactly as the vendor designates it, so a `PGST 15` collet
        // matches no `PG` holder: nothing published says whether it seats in
        // one, and offering a collet that does not fit costs a machinist a
        // setup.
        series,
        clampMin,
        clampMax,
        clampLength: null,
        productLink: context.productLinkFor(material),
        provenance: { clampMin: 'vendor-stated' as const, clampMax: 'vendor-stated' as const },
      },
    ]
  })
