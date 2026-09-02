/**
 * Scrape the vendors' cutting-tool catalogs into the local store.
 *
 *   pnpm --filter @toolpath/catalog-data scrape [--refresh] [--only <family.csv>]
 *
 * Everything with a decision in it is `src/scrape.ts`, where the lint and
 * style sensors reach. This file is what needs `fs`: where the store lives,
 * writing each family as it arrives, and the progress column.
 *
 * ## The store, and why one file per family
 *
 * `scrape-out/records/<family>.json` is written the moment a family finishes,
 * so a failure costs that family and nothing else. The old script logged a
 * failure and wrote its single output at the end, which meant one 404 in the
 * last minute cost every family that had already succeeded — and a full run is
 * an afternoon of paced requests.
 *
 * A second run scrapes only what the store does not already hold. `--refresh`
 * re-scrapes everything; `--only <family.csv>` re-scrapes one.
 *
 * `scrape.json` is the merged handoff `ingest.mjs` reads, rebuilt from the
 * store at the end of every run — including from families a previous run
 * wrote. `receipt.json` records what ran, when, and what it left out.
 *
 * **Nothing here is committed.** `scrape-out/` is gitignored: the rows are the
 * vendor's data and a working file, and this repository is public.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createFetcher } from '@toolpath/tool-scraper'
import { scraperVersion } from '@toolpath/tool-scraper/node'

import { scrapeCuttingTools } from '../dist/scrape.js'
import { ROOT, RECORDS, ensureStore, writeMergedScrape } from './store.mjs'

const argv = process.argv.slice(2)
const refresh = argv.includes('--refresh')
// Guarded on the flag being present, not on `indexOf` alone: `indexOf` answers
// -1 when it is absent, and `-1 + 1` is the first argument. `--refresh` on its
// own therefore read as `--only --refresh`, every family was skipped as "not
// the one named", and the run reported success having scraped nothing.
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined
if (argv.includes('--only') && (only === undefined || only.startsWith('--'))) {
  console.error('usage: node scripts/scrape.mjs [--refresh] [--only <family.csv>]')
  process.exit(1)
}

const fileFor = (id) => resolve(RECORDS, `${id}.json`)

ensureStore()
console.log(`Scrape root: ${ROOT}\n`)

const warnings = []
const left = []
let scraped = 0

await scrapeCuttingTools({
  fetcher: createFetcher(),
  warn: (message) => warnings.push(message),
  skip: (csvName) => {
    if (only !== undefined) {
      return csvName === only ? null : `--only named ${only}`
    }
    if (!refresh && existsSync(fileFor(csvName.replace(/\.csv$/, '')))) {
      return 'already in the store'
    }
    return null
  },
  onFamily: (outcome) => {
    const { id, reason } = outcome
    if (outcome.outcome === 'scraped') {
      writeFileSync(fileFor(id), `${JSON.stringify(outcome.family, null, 2)}\n`, 'utf8')
      scraped += 1
      const unmapped = outcome.unmapped > 0 ? `  (${outcome.unmapped} rows unmapped)` : ''
      console.log(
        `  ${id.padEnd(52)} ${String(outcome.family.tools.length).padStart(5)} tools${unmapped}`,
      )
      return
    }
    if (outcome.outcome === 'failed') {
      left.push(`${id}: ${reason}`)
      console.log(`  ${id.padEnd(52)} FAILED: ${reason}`)
      return
    }
    // A family the caller asked to skip is not something left out; a family the
    // scrape could not reach is, and the receipt has to say which.
    if (!reason.startsWith('--only named') && reason !== 'already in the store') {
      left.push(`${id}: ${reason}`)
      console.log(`  ${id.padEnd(52)} skipped: ${reason}`)
    }
  },
})

/* ───────────────────── the merged handoff, from the store ───────────────────── */

const { families, tools, holders, collets } = writeMergedScrape()

writeFileSync(
  resolve(ROOT, 'receipt.json'),
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      // The scraper's own answer, not a version read out of a manifest here: a
      // store scraped by an older scraper has to be able to say so.
      scraperVersion: scraperVersion(),
      scrapedThisRun: scraped,
      familiesInStore: families,
      tools,
      // Written by `scrape-holding.mjs`, not by this run — stated so a receipt
      // says what the store holds rather than what this command scraped.
      holders,
      collets,
      leftOut: left,
      warnings,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(
  `\n${tools} tools across ${families} families, ${holders} holders and ` +
    `${collets} collets in the store (${scraped} families scraped this run) ` +
    `-> ${resolve(ROOT, 'scrape.json')}`,
)

if (left.length > 0) {
  console.log(`\n${left.length} family/families left out:`)
  for (const note of left) {
    console.log(`  ${note}`)
  }
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s) from the vendors' own data:`)
  for (const message of warnings.slice(0, 40)) {
    console.log(`  ${message}`)
  }
  if (warnings.length > 40) {
    console.log(`  … and ${warnings.length - 40} more`)
  }
}
