/**
 * Turn a scrape into the catalog dataset the application reads.
 *
 *   node scripts/ingest.mjs <scrape.json> [dataset.json]
 *
 * The input is the **records** handoff described in `src/ingest.ts`, not a
 * vendor's CSV — a vendor CSV keeps that vendor's own column labels, and only
 * that vendor's scraper adapter may read them.
 *
 * Everything left out is printed. A silent ingest is how a catalog ends up
 * missing a dimension nobody notices for a month.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ingest } from '../dist/index.js'

const [, , input, output = 'catalog.json'] = process.argv
if (!input) {
  console.error('Usage: node scripts/ingest.mjs <scrape.json> [dataset.json]')
  process.exit(1)
}

const scrape = JSON.parse(readFileSync(resolve(input), 'utf8'))
const { catalog, notes } = ingest(scrape)

writeFileSync(resolve(output), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')

console.log(
  `Ingested ${catalog.tools.length} tools across ${catalog.families.length} families into ${resolve(output)}.`,
)

if (notes.length > 0) {
  console.log(`\n${notes.length} value(s) left out:`)
  const byReason = new Map()
  for (const note of notes) {
    const key = `${note.code}: ${note.reason}`
    byReason.set(key, (byReason.get(key) ?? 0) + 1)
  }
  for (const [reason, count] of [...byReason].sort()) {
    console.log(`  ${count} × ${reason}`)
  }
}
