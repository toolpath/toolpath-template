/**
 * Builds the committed sample dataset.
 *
 * The sample exists so the application builds, tests and runs on a fresh
 * clone, with no scrape, no network and no vendor's data in a public
 * repository. It is generated rather than hand-written for one reason: it goes
 * through the same `buildCatalog` the real ingestion will, so a fixture that
 * could not have been produced by the pipeline cannot be committed by accident.
 *
 * Run it with `pnpm --filter @toolpath/catalog-data build:sample`, and commit
 * what it writes. `sample-catalog.test.ts` fails if the committed file and this
 * script disagree.
 *
 * **These are not a vendor's numbers.** They are plausible values chosen to
 * exercise the catalog's shape — two unit systems, three tool types, a missing
 * dimension, a code the dictionary cannot label, and a value this pipeline
 * would have assumed rather than read.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../dist/index.js'

const BUILT_AT = '2026-08-27'

const endmill = (guid, catalogNumber, dc, lcf, oal, re, nof, dmm) => ({
  guid,
  familyId: 'sample-vhm-endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber,
  materialNumber: null,
  toolType: 'endmill',
  unitSystem: 'metric',
  geometry: { DC: dc, LCF: lcf, OAL: oal, RE: re, NOF: nof, SFDM: dmm },
  // ISO 513 groups, in the standard's order. An end mill family indexed for
  // steel and stainless; the drills add cast iron; the taps carry none, which
  // is a real answer rather than a gap.
  materialGroups: ['P', 'M'],
  // The vendor's own name for the line, which the taps below deliberately
  // leave `null`: a catalog holds both, and the facet has to count only the
  // named ones.
  productLine: 'Sample HP Series',
  productLink: null,
  provenance: {
    DC: 'vendor-stated',
    LCF: 'vendor-stated',
    OAL: 'vendor-stated',
    RE: 'vendor-stated',
    NOF: 'vendor-stated',
    SFDM: 'vendor-stated',
  },
})

const drill = (guid, catalogNumber, dc, lcf, oal, sig, dmm) => ({
  guid,
  familyId: 'sample-solid-drills',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber,
  materialNumber: null,
  toolType: 'drill',
  unitSystem: 'metric',
  geometry: { DC: dc, LCF: lcf, OAL: oal, SIG: sig, SFDM: dmm },
  materialGroups: ['P', 'M', 'K'],
  productLine: 'Sample Deep-Hole Series',
  productLink: null,
  // The point angle is a family constant here rather than a per-part column,
  // which is exactly the kind of fact that has to be marked as derived.
  provenance: {
    DC: 'vendor-stated',
    LCF: 'vendor-stated',
    OAL: 'vendor-stated',
    SIG: 'derived',
    SFDM: 'vendor-stated',
  },
})

const tap = (guid, catalogNumber, dc, lcf, oal, nof, dmm, materialGroups) => ({
  guid,
  familyId: 'sample-inch-taps',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber,
  materialNumber: null,
  toolType: 'tap',
  unitSystem: 'inch',
  // ZEFP is a real vendor column the dictionary deliberately does not define:
  // the detail page has to show it under the vendor's own code.
  geometry: { DC: dc, LCF: lcf, OAL: oal, NOF: nof, SFDM: dmm, ZEFP: 3 },
  // The two silences, which are different claims and are drawn differently:
  // `[]` is a vendor index that rates this part for nothing — Kennametal
  // indexes no tap by workpiece material — and `null` is no index a scrape
  // could reach, which is every Harvey part.
  materialGroups,
  // No line: the vendor names none, which is not the same as an unnamed one.
  productLine: null,
  productLink: null,
  provenance: {
    DC: 'vendor-stated',
    LCF: 'vendor-stated',
    OAL: 'vendor-stated',
    NOF: 'vendor-stated',
    SFDM: 'assumed',
  },
})

/**
 * Sample toolholding: one BT30 spindle's worth.
 *
 * Two collet chucks and a shrink-fit holder, because the three clamp
 * differently and the assembly logic has to be exercised on all three — a
 * collet series that matches, one that does not, and a bore that takes exactly
 * one shank.
 */
const holder = (guid, catalogNumber, clamping, gaugeLength, colletSeries, boreDiameter) => ({
  guid,
  familyId: 'sample-bt30-holders',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber,
  materialNumber: null,
  taper: 'BT30',
  contact: 'taper',
  clamping,
  gaugeLength,
  colletSeries,
  boreDiameter,
  noseDiameter: clamping === 'collet' ? 34 : 24,
  // The body behind the nose, the way a DIN 4000 sheet states it: nose length,
  // body diameter and length, projection from the flange (gauge length less
  // BT 30's 48.4 mm gauge-line-to-flange), and the taper's flange.
  noseLength: 8,
  bodyDiameter: clamping === 'collet' ? 42 : 32,
  bodyLength: 3,
  projection: Math.round((gaugeLength - 48.4) * 10) / 10,
  flangeDiameter: 46,
  colletProtrusion: clamping === 'collet' ? 2 : null,
  productLink: null,
  cadModelUrl: null,
  provenance: {
    gaugeLength: 'vendor-stated',
    noseDiameter: 'assumed',
    noseLength: 'assumed',
    bodyDiameter: 'assumed',
    bodyLength: 'assumed',
    projection: 'derived',
    flangeDiameter: 'derived',
    colletProtrusion: 'assumed',
  },
})

const collet = (guid, catalogNumber, series, clampMin, clampMax, clampLength) => ({
  guid,
  familyId: `sample-${series.toLowerCase()}-collets`,
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber,
  materialNumber: null,
  series,
  clampMin,
  clampMax,
  clampLength,
  productLink: null,
  provenance: { clampMin: 'vendor-stated', clampMax: 'vendor-stated', clampLength: 'assumed' },
})

const catalog = buildCatalog({
  builtAt: BUILT_AT,
  families: [
    {
      id: 'sample-vhm-endmills',
      name: 'Sample solid carbide end mills',
      brand: 'WIDIA',
      vendor: 'Kennametal',
      unitSystem: 'metric',
      source: null,
      tools: [
        endmill('11111111-1111-5111-8111-111111111101', 'TDMX0300', 3, 8, 50, 0, 4, 6),
        endmill('11111111-1111-5111-8111-111111111102', 'TDMX0500', 5, 13, 57, 0.5, 4, 6),
        endmill('11111111-1111-5111-8111-111111111103', 'TDMX0800', 8, 19, 63, 1, 4, 8),
        endmill('11111111-1111-5111-8111-111111111104', 'TDMX1200', 12, 26, 83, 2, 5, 12),
      ],
    },
    {
      id: 'sample-solid-drills',
      name: 'Sample solid carbide drills, 3×D',
      brand: 'Kennametal',
      vendor: 'Kennametal',
      unitSystem: 'metric',
      source: null,
      tools: [
        drill('22222222-2222-5222-8222-222222222201', 'B041A03000', 3, 12, 62, 140, 6),
        drill('22222222-2222-5222-8222-222222222202', 'B041A06000', 6, 24, 82, 140, 6),
        drill('22222222-2222-5222-8222-222222222203', 'B041A10000', 10, 40, 103, 140, 10),
      ],
    },
    {
      id: 'sample-inch-taps',
      name: 'Sample inch spiral-flute taps',
      brand: 'WIDIA',
      vendor: 'Kennametal',
      unitSystem: 'inch',
      source: null,
      tools: [
        tap('33333333-3333-5333-8333-333333333301', 'VTSFT0250', 6.35, 15.875, 63.5, 3, 6.35, []),
        tap(
          '33333333-3333-5333-8333-333333333302',
          'VTSFT0375',
          9.525,
          19.05,
          76.2,
          3,
          7.938,
          null,
        ),
      ],
    },
  ],
  holders: [
    holder('44444444-4444-5444-8444-444444444401', 'BT30ER16060M', 'collet', 60, 'ER16', null),
    holder('44444444-4444-5444-8444-444444444402', 'BT30ER20070M', 'collet', 70, 'ER20', null),
    // A shrink-fit holder takes one shank and no collet at all.
    holder('44444444-4444-5444-8444-444444444403', 'BT30SF0600M', 'shrink', 80, null, 6),
  ],
  collets: [
    collet('55555555-5555-5555-8555-555555555501', 'ER16-3', 'ER16', 2, 3, 18),
    collet('55555555-5555-5555-8555-555555555502', 'ER16-6', 'ER16', 5, 6, 18),
    collet('55555555-5555-5555-8555-555555555503', 'ER16-8', 'ER16', 7, 8, 18),
    collet('55555555-5555-5555-8555-555555555504', 'ER20-10', 'ER20', 9, 10, 24),
    collet('55555555-5555-5555-8555-555555555505', 'ER20-12', 'ER20', 11, 12, 24),
  ],
})

const target = resolve(fileURLToPath(new URL('../fixtures/sample-catalog.json', import.meta.url)))
writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(
  `Wrote ${catalog.tools.length} sample tools, ${catalog.holders.length} holders and ` +
    `${catalog.collets.length} collets to ${target}.`,
)
