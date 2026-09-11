/**
 * Measure the mirrored holder models into the profiles document the app reads.
 *
 *   pnpm --filter @toolpath/catalog-data profiles [--refresh] [--only <family.csv>]
 *
 * The third of the three commands that fill the store: `scrape.mjs` for cutting
 * tools, `scrape-holding.mjs` for the spindle rack, and this for what the rack
 * actually looks like. It exists because a `HolderRecord` states no nose, no
 * projection and no flange — see `src/scrape.ts` § Toolholding — so without a
 * measurement a holder from the record seam has no silhouette to draw at all.
 *
 * Two steps, and only the second needs the API:
 *
 * 1. **Mirror.** Each holder's `cadModelUrl` is downloaded once into
 *    `scrape-out/step/`, and kept. The vendor's STEP files are a local working
 *    copy for measuring; only the derived profile is ever meant to leave, which
 *    is why `.gitignore` covers the whole of `scrape-out/`.
 * 2. **Measure.** `src/scrape.ts` drives the five API calls per holder.
 *
 * **Needs `TOOLPATH_API_KEY`, and nothing else** (2026-09-07). The holder
 * routes reached production: `api.toolpath.com` answers Engine API 1.3.3 and
 * carries `/v1/holders`, so `TOOLPATH_API_URL` is now an override for a local
 * or staging stack rather than the requirement it was while production was
 * 1.1.0. See `docs/HOLDER-PROFILES.md`.
 *
 * The key is read from the environment only — never a flag, because a key in a
 * shell history is a key in a CI log. `--env-file-if-exists=.env` on the
 * `profiles` script means a gitignored `packages/catalog-data/.env` holding
 * `TOOLPATH_API_KEY=...` is enough, and is the way that keeps it out of both.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describeApi } from '@toolpath/tool-scraper/node'

import { ingestProfiles } from '../dist/index.js'
import { measureHolders } from '../dist/scrape.js'
import { ROOT, HOLDING, isFamilyDocument, profilesFileFor, writeMergedProfiles } from './store.mjs'

const STEP = resolve(ROOT, 'step')

const argv = process.argv.slice(2)
const refresh = argv.includes('--refresh')
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined
if (argv.includes('--only') && (only === undefined || only.startsWith('--'))) {
  console.error('usage: node scripts/profiles.mjs [--refresh] [--only <family.csv>]')
  process.exit(1)
}

if (!process.env.TOOLPATH_API_KEY) {
  console.error('TOOLPATH_API_KEY must be set. It is never a flag: a key in a shell history')
  console.error('is a key in a CI log. `pnpm dev:api-key` in the services repo mints a local one.')
  process.exit(1)
}

mkdirSync(STEP, { recursive: true })
console.log(`Scrape root: ${ROOT}`)
console.log(`${describeApi()}\n`)

const families = readdirSync(HOLDING)
  // Not this command's own output from a previous run: it writes
  // `<family>.profiles.json` beside the families it reads.
  .filter(isFamilyDocument)
  .filter((name) => only === undefined || name === only.replace(/\.csv$/, '.json'))
  .sort()

if (families.length === 0) {
  console.error('Nothing in the toolholding store. Run `pnpm scrape:holding` first.')
  process.exit(1)
}

/** One holder's STEP bytes, mirrored on first use and read from disk after. */
const stepFor = async (record) => {
  if (record.cadModelUrl === null) {
    return null
  }
  const file = resolve(STEP, `${record.catalogNumber.replaceAll('/', '_')}.stp`)
  if (existsSync(file) && !refresh) {
    return readFileSync(file)
  }

  // The vendor's CDN, not the Engine. One dead link is one holder without a
  // drawing, which is a fact about that part rather than a broken run — and a
  // CDN that hangs is the same fact. A bare `await fetch` here threw
  // `read ETIMEDOUT` through the whole run on 2026-09-10 and ended it at 137 of
  // 158 families, so a transport failure is caught as well as a bad status.
  let response
  try {
    response = await fetch(record.cadModelUrl, { signal: AbortSignal.timeout(60_000) })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    console.log(`  ${record.catalogNumber.padEnd(24)} no model (${why})`)
    return null
  }
  if (!response.ok) {
    console.log(`  ${record.catalogNumber.padEnd(24)} no model (${response.status})`)
    return null
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  writeFileSync(file, bytes)
  return bytes
}

const OPTIONS = { tolerance: 0.05, fillBays: false, flipped: false }

let kernelVersion = ''
let measuredCount = 0
let skippedCount = 0
let alreadyMeasured = 0
const failed = []

for (const name of families) {
  // Resumable, like `scrape.mjs` and `scrape-holding.mjs`: a family already
  // measured is in the store, and re-measuring it spends the Engine's per-key
  // budget to arrive at the answer already on disk. `--refresh` is how a run
  // says to measure it again. Until 2026-09-10 every run re-measured the whole
  // rack, which is what made an interrupted one so expensive.
  if (!refresh && existsSync(profilesFileFor(name))) {
    alreadyMeasured += 1
    continue
  }

  const store = JSON.parse(readFileSync(resolve(HOLDING, name), 'utf8'))
  const records = store.records ?? []
  if (records.length === 0) {
    console.log(`${name}: no holder records — re-run \`scrape:holding --refresh\` for this family`)
    continue
  }

  console.log(`${name}: ${records.length} holders`)
  // Contained per family, the shape `scrape-holding.mjs` already uses: one
  // family failing costs that family, not the run and not the measurements
  // already in the store.
  let document
  try {
    document = await measureHolders({
      records,
      stepFor,
      // An import settles in about two seconds, so a second between polls costs
      // one second per holder and halves what a 200-holder run spends on the
      // Engine's per-key budget. `rateLimitedFetch` waits out the rest.
      pollIntervalMs: 1_000,
      betweenHoldersMs: 250,
      onHolder: (catalogNumber, outcome, why) => {
        if (outcome === 'measured') {
          measuredCount += 1
          return
        }
        skippedCount += 1
        if (why !== 'no mirrored model') {
          console.log(`  ${catalogNumber.padEnd(24)} skipped: ${why}`)
        }
      },
      warn: (message) => console.log(message),
    })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    failed.push(`${name}: ${why}`)
    console.log(`  FAILED: ${why}`)
    continue
  }

  if (document === null) {
    console.log(`  nothing measurable in this family`)
    continue
  }

  kernelVersion = document.kernelVersion
  writeFileSync(profilesFileFor(name), `${JSON.stringify(document, null, 2)}\n`, 'utf8')

  // Rebuilt from the store as each family lands, so the document the
  // application reads is never behind the measurements on disk — and a run cut
  // short leaves it correct rather than empty.
  writeMergedProfiles(ingestProfiles, { kernelVersion, options: OPTIONS })
}

const merged = writeMergedProfiles(ingestProfiles, { kernelVersion, options: OPTIONS })

if (merged.holders === 0) {
  console.error('\nNothing measured, and nothing in the store. No profiles document was written.')
  process.exit(1)
}

console.log(
  `\n${measuredCount} measured this run (${skippedCount} skipped, ` +
    `${alreadyMeasured} families already in the store), ` +
    `${merged.holders} holders across ${merged.families} families in total, ` +
    `${merged.complete} agreeing with the vendor's published gauge length -> ${merged.path}`,
)

if (failed.length > 0) {
  console.log(`\n${failed.length} family/families failed:`)
  for (const note of failed) {
    console.log(`  ${note}`)
  }
  process.exitCode = 1
}
