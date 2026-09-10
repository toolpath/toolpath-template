/**
 * The local scrape store, and the merged handoff built from it.
 *
 * Two runs write into one store — `scrape.mjs` for cutting tools and
 * `scrape-holding.mjs` for the spindle rack — and either one has to be able to
 * rebuild `scrape.json` without the other having just run. So the merge lives
 * here rather than in whichever script happened to write last: a toolholding
 * scrape that rebuilt the handoff from its own store alone would silently drop
 * 13,000 cutting tools.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)), 'scrape-out')
export const RECORDS = resolve(ROOT, 'records')
/** Beside `records/` rather than under it: a holder is not a family of tools. */
export const HOLDING = resolve(ROOT, 'toolholding')

export const ensureStore = () => {
  mkdirSync(RECORDS, { recursive: true })
  mkdirSync(HOLDING, { recursive: true })
}

/**
 * A family document in the store, as opposed to something written beside it.
 *
 * `profiles.mjs` writes its measurements into `toolholding/` as
 * `<family>.profiles.json`, so "every `.json` in the directory" stopped meaning
 * "every family" the day the first holder was measured. A profiles document
 * keys its `holders` by guid rather than listing them, and `flatMap` folds an
 * object in as a single element — so each one became one holder with no
 * catalog number and no clamping, and `ingest` refused the whole run on the
 * first of them (2026-09-08). Five junk holders, and every re-ingest blocked.
 */
export const isFamilyDocument = (name) => name.endsWith('.json') && !name.endsWith('.profiles.json')

const documentsIn = (directory) =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter(isFamilyDocument)
        .sort()
        .map((name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8')))
    : []

/**
 * Rebuild `scrape.json` from everything in the store.
 *
 * Returns the counts, so a caller can print them without reading the file it
 * just wrote.
 */
export const writeMergedScrape = () => {
  const families = documentsIn(RECORDS)
  const toolholding = documentsIn(HOLDING)

  const holders = toolholding.flatMap((document) => document.holders ?? [])
  const collets = toolholding.flatMap((document) => document.collets ?? [])
  const builtAt = new Date().toISOString().slice(0, 10)

  writeFileSync(
    resolve(ROOT, 'scrape.json'),
    `${JSON.stringify({ builtAt, families, holders, collets }, null, 2)}\n`,
    'utf8',
  )

  return {
    families: families.length,
    tools: families.reduce((sum, family) => sum + family.tools.length, 0),
    holders: holders.length,
    collets: collets.length,
  }
}
