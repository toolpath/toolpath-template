/**
 * Scrape the vendors' toolholding into the local store.
 *
 *   pnpm --filter @toolpath/catalog-data scrape:holding [--refresh] [--only <family.csv>]
 *
 * The spindle rack, and a separate command from `scrape.mjs` on purpose: a shop
 * re-scrapes its cutting tools far more often than its holders, and 13,000
 * tools is an afternoon of paced requests where 550 holders is minutes. Both
 * write into one store and both rebuild `scrape.json` from all of it — see
 * `store.mjs`, which is why running either one alone does not drop the other's
 * work.
 *
 * Everything with a decision in it is `src/scrape.ts`, where the lint and style
 * sensors reach. This file is what needs `fs`.
 *
 * **Nothing here is committed.** `scrape-out/` is gitignored: the rows are the
 * vendor's data and this repository is public.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createFetcher } from '@toolpath/tool-scraper'
import { scraperVersion } from '@toolpath/tool-scraper/node'

import { scrapeToolholding } from '../dist/scrape.js'
import { ROOT, HOLDING, ensureStore, writeMergedScrape } from './store.mjs'

const argv = process.argv.slice(2)
const refresh = argv.includes('--refresh')
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : undefined
if (argv.includes('--only') && (only === undefined || only.startsWith('--'))) {
  console.error('usage: node scripts/scrape-holding.mjs [--refresh] [--only <family.csv>]')
  process.exit(1)
}

const fileFor = (csvName) => resolve(HOLDING, `${csvName.replace(/\.csv$/, '')}.json`)

ensureStore()
console.log(`Scrape root: ${ROOT}\n`)

const warnings = []
const left = []
let scraped = 0

await scrapeToolholding({
  fetcher: createFetcher(),
  warn: (message) => warnings.push(message),
  skip: (csvName) => {
    if (only !== undefined) {
      return csvName === only ? null : `--only named ${only}`
    }
    if (!refresh && existsSync(fileFor(csvName))) {
      return 'already in the store'
    }
    return null
  },
  onFamily: (outcome) => {
    const id = outcome.csvName.replace(/\.csv$/, '')

    if (outcome.outcome === 'scraped') {
      writeFileSync(
        fileFor(outcome.csvName),
        `${JSON.stringify(
          { holders: outcome.holders, collets: outcome.collets, records: outcome.records },
          null,
          2,
        )}\n`,
        'utf8',
      )
      scraped += 1
      const unmapped = outcome.unmapped > 0 ? `  (${outcome.unmapped} rows unmapped)` : ''
      const counts =
        outcome.holders.length > 0
          ? `${String(outcome.holders.length).padStart(4)} holders`
          : `${String(outcome.collets.length).padStart(4)} collets`
      console.log(`  ${id.padEnd(40)} ${counts}${unmapped}`)
      return
    }

    if (outcome.outcome === 'failed') {
      left.push(`${id}: ${outcome.reason}`)
      console.log(`  ${id.padEnd(40)} FAILED: ${outcome.reason}`)
      return
    }

    // A family the caller asked to skip is not something left out; one this
    // package cannot reach is, and the receipt has to say which.
    if (!outcome.reason.startsWith('--only named') && outcome.reason !== 'already in the store') {
      left.push(`${id}: ${outcome.reason}`)
      console.log(`  ${id.padEnd(40)} skipped: ${outcome.reason}`)
    }
  },
})

const { families, tools, holders, collets } = writeMergedScrape()

const receiptPath = resolve(ROOT, 'toolholding-receipt.json')
writeFileSync(
  receiptPath,
  `${JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      scraperVersion: scraperVersion(),
      scrapedThisRun: scraped,
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
  `\n${holders} holders and ${collets} collets in the store ` +
    `(${scraped} families scraped this run), beside ${tools} tools across ` +
    `${families} families -> ${resolve(ROOT, 'scrape.json')}`,
)

if (left.length > 0) {
  console.log(`\n${left.length} family/families left out:`)
  for (const note of left) {
    console.log(`  ${note}`)
  }
}

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s) -> ${receiptPath}`)
}
