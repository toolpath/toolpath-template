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
 * Needs `TOOLPATH_API_KEY`, and `TOOLPATH_API_URL` until the holder routes
 * reach production — `http://localhost:4000` for the local services stack. See
 * `docs/HOLDER-PROFILES.md`.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { apiUrl, describeApi } from '@toolpath/tool-scraper/node'

import { ingestProfiles } from '../dist/index.js'
import { measureHolders } from '../dist/scrape.js'
import { ROOT, HOLDING } from './store.mjs'

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

if (apiUrl() === 'https://api.toolpath.com') {
  console.log('note: production is Engine API 1.1.0 and carries no holder routes.\n')
}

const families = readdirSync(HOLDING)
  .filter((name) => name.endsWith('.json'))
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

  const response = await fetch(record.cadModelUrl)
  if (!response.ok) {
    // The vendor's CDN, not the Engine. One dead link is one holder without a
    // drawing, which is a fact about that part rather than a broken run.
    console.log(`  ${record.catalogNumber.padEnd(24)} no model (${response.status})`)
    return null
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  writeFileSync(file, bytes)
  return bytes
}

const merged = {}
let kernelVersion = ''
let measuredCount = 0
let skippedCount = 0

for (const name of families) {
  const store = JSON.parse(readFileSync(resolve(HOLDING, name), 'utf8'))
  const records = store.records ?? []
  if (records.length === 0) {
    console.log(`${name}: no holder records — re-run \`scrape:holding --refresh\` for this family`)
    continue
  }

  console.log(`${name}: ${records.length} holders`)
  const document = await measureHolders({
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

  if (document === null) {
    console.log(`  nothing measurable in this family`)
    continue
  }

  kernelVersion = document.kernelVersion
  Object.assign(merged, document.holders)
  writeFileSync(
    resolve(HOLDING, name.replace(/\.json$/, '.profiles.json')),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  )
}

if (Object.keys(merged).length === 0) {
  console.error('\nNothing measured. No profiles document was written.')
  process.exit(1)
}

// Written in the shape the application reads, not the scraper's — `catalog.json`
// beside it is ingested too, and a document only one of the two understands is
// a fixture the app fails to load at import.
const profiles = ingestProfiles({
  profilesVersion: 1,
  unit: 'millimeters',
  kernelVersion,
  options: { tolerance: 0.05, fillBays: false, flipped: false },
  holderCount: Object.keys(merged).length,
  holders: merged,
})

const out = resolve(ROOT, 'profiles.json')
writeFileSync(out, `${JSON.stringify(profiles, null, 2)}\n`, 'utf8')

const complete = Object.values(profiles.holders).filter((profile) => profile.complete).length
console.log(
  `\n${measuredCount} measured (${skippedCount} skipped), ${complete} agreeing with the ` +
    `vendor's published gauge length -> ${out}`,
)
