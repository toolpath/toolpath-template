/**
 * Builds the committed sample profiles document.
 *
 * The measured half of the sample dataset, and it exists for the reason
 * `build-sample-catalog.mjs` does: the application draws a measured holder on a
 * fresh clone, with no scrape, no API key and no vendor's data in a public
 * repository.
 *
 * Run it with `pnpm --filter @toolpath/catalog-data build:sample-profiles`, and
 * commit what it writes. `sample-profiles.test.ts` fails if the committed file
 * and this script disagree.
 *
 * **These are not a vendor's numbers, and they are not a measurement.** A real
 * profile comes off a vendor's STEP model through the Toolpath Engine API, and
 * that model is the vendor's; what is here is a synthetic silhouette with the
 * features a holder has — a 7:24 cone, a V-flange groove, a body step and a
 * nose taper — chosen to exercise the drawing and the two cases a consumer must
 * handle. It goes through the same `ingestProfiles` a scrape does, so a fixture
 * the pipeline could not have produced cannot be committed by accident.
 *
 * The guids are the sample catalog's own holder guids. A profile keyed to a
 * holder no catalog holds draws nothing, which is the failure this file would
 * otherwise ship silently.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ingestProfiles } from '../dist/index.js'

/** The kernel a real run records. Stated here so the shape is the shape. */
const KERNEL_VERSION = '0.0.0-sample'

const round = (value) => Math.round(value * 1000) / 1000

/**
 * One synthetic holder silhouette, spindle end first.
 *
 * `z` ascends from the top of the 7:24 cone to the nose face, with the gage
 * line at zero. A step in the solid emits **two vertices at one `z`** — the
 * rule `@toolpath/tool-scraper`'s `layersToProfile` follows, and the reason a
 * consumer may not assume `z` strictly increases.
 */
const silhouette = ({ reach, noseDiameter, bodyDiameter }) => {
  // A 7:24 cone whose large end is the gage line: 31.75 mm there, narrowing
  // 7 mm of diameter for every 24 mm of length over the 48.4 mm to the flange.
  const coneLength = 48.4
  const gageRadius = 31.75 / 2
  const coneTop = round(gageRadius - (coneLength * 7) / 24 / 2)
  const flangeRadius = 46 / 2
  const bodyRadius = bodyDiameter / 2
  const noseRadius = noseDiameter / 2

  return [
    // The retention knob boss behind the cone, and the step onto the cone.
    [-coneLength - 12, 7.5],
    [-coneLength - 12, 9.5],
    [-coneLength, 9.5],
    [-coneLength, coneTop],
    // The cone itself, up to the gage line.
    [0, gageRadius],
    // The flange, stepping out at the spindle face.
    [0, flangeRadius],
    [4, flangeRadius],
    // The V-flange groove the gripper takes — a real feature, and the reason a
    // measured profile is worth having over four published numbers.
    [6, 20.2],
    [10, 20.2],
    [12, flangeRadius],
    [16, flangeRadius],
    // The step down onto the body.
    [16, bodyRadius],
    [reach - 14, bodyRadius],
    // The nose taper, and the nose face.
    [reach - 6, noseRadius],
    [reach, noseRadius],
    [reach, 0],
  ].map(([z, r]) => [round(z), round(r)])
}

/**
 * One entry of the scraper's own document shape.
 *
 * `reach` is how far the *model* goes, which is the published gage length on a
 * complete holder and short of it on one whose model omits something — the
 * BTKV30 case, where five vendor models stop at the threaded nose and leave the
 * collet nut out. A UI that cannot tell the two apart draws the second as a
 * shorter holder.
 */
const profile = ({ guid, catalogNumber, gaugeLength, reach, noseDiameter, bodyDiameter }) => {
  const shortfall = round(gaugeLength - reach)
  return [
    guid,
    {
      catalogNumber,
      datum: 'gage-line',
      points: silhouette({ reach, noseDiameter, bodyDiameter }),
      gaugeLengthSolved: reach,
      gaugeLengthPublished: gaugeLength,
      sizeClass: 30,
      taperFamily: 'iso7x24',
      complete: shortfall <= 0,
      ...(shortfall > 0 ? { shortfallMm: shortfall } : {}),
    },
  ]
}

/**
 * The three sample holders, measured.
 *
 * Two collet chucks and a shrink-fit holder, matching `build-sample-catalog.mjs`
 * guid for guid — and the ER20 one deliberately incomplete, because "the
 * vendor's model stops short" is a state the drawing has to render and no
 * complete profile exercises.
 */
const holders = [
  profile({
    guid: '44444444-4444-5444-8444-444444444401',
    catalogNumber: 'BT30ER16060M',
    gaugeLength: 60,
    reach: 60,
    noseDiameter: 34,
    bodyDiameter: 42,
  }),
  profile({
    guid: '44444444-4444-5444-8444-444444444402',
    catalogNumber: 'BT30ER20070M',
    gaugeLength: 70,
    reach: 63.5,
    noseDiameter: 34,
    bodyDiameter: 42,
  }),
  profile({
    guid: '44444444-4444-5444-8444-444444444403',
    catalogNumber: 'BT30SF0600M',
    gaugeLength: 80,
    reach: 80,
    noseDiameter: 24,
    bodyDiameter: 32,
  }),
]

const document = ingestProfiles({
  profilesVersion: 1,
  unit: 'millimeters',
  kernelVersion: KERNEL_VERSION,
  options: { tolerance: 0.05, fillBays: false, flipped: false },
  holderCount: holders.length,
  holders: Object.fromEntries(holders),
})

const out = resolve(fileURLToPath(import.meta.url), '../../fixtures/sample-profiles.json')
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)
console.log(`${out}: ${Object.keys(document.holders).length} profiles`)
