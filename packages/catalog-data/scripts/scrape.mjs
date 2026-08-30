/**
 * Run `@toolpath/tool-scraper` and write the handoff `ingest` reads.
 *
 *   TOOLPATH_SCRAPER=~/dev/ui_packages/packages/tool-scraper \
 *     node scripts/scrape.mjs scrape.json
 *
 * **The scraper is not a dependency of this repository and must not become
 * one by copy.** It is not published to npm yet, so this reads a local
 * checkout by path — build it there first (`pnpm --filter @toolpath/tool-scraper
 * build`). When it ships to npm, the import below becomes a normal one and
 * nothing else here changes.
 *
 * Cutting tools come across at the scraper's own record seam: an adapter turns
 * that vendor's rows into a canonical `ToolRecord`, and nothing here reads a
 * vendor's column labels. **Toolholding has no such seam** — no toolholding
 * family carries a column map or a record mapper — so those rows are mapped by
 * `src/vendors/`, one file per vendor, each citing the evidence that pins it.
 * That mapping's right home is the scraper; see `docs/TOOL-CATALOG-PLAN.md`.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colletsFrom, holdersFrom } from '../dist/vendors/regofix.js'

const root = process.env.TOOLPATH_SCRAPER
const out = process.argv[2]
if (!root || !out) {
  console.error(
    'usage: TOOLPATH_SCRAPER=<path to tool-scraper> node scripts/scrape.mjs <scrape.json>',
  )
  process.exit(1)
}

const dist = resolve(root.replace(/^~/, process.env.HOME ?? '~'), 'dist')
const core = await import(`${dist}/index.js`)
const registry = await import(`${dist}/registry.js`)
const kennametal = await import(`${dist}/vendors/kennametal/scrape.js`)
const threadColumn = await import(`${dist}/vendors/kennametal/thread-column.js`)
const destinytool = await import(`${dist}/vendors/destinytool/scrape.js`)
const tables = await import(`${dist}/families/index.js`)
const regofix = await import(`${dist}/vendors/regofix/scrape.js`)

const fetcher = core.createFetcher()
const brandOf = (family) => family.brand ?? 'kennametal'

/**
 * A tap family's thread system is a constant column the operator supplies at
 * scrape time — the scraper refuses to default it, because its two readers once
 * defaulted in opposite directions and produced a silent unit mix. It is taken
 * from the family's own id, which states it, and a family whose id says neither
 * fails loudly rather than guessing.
 */
const threadSystemOf = (id) => {
  const metric = /(^|-)metric(-|$)/.test(id)
  const inch = /(^|-)inch(-|$)/.test(id)
  if (metric === inch) return null
  return metric ? 'metric' : 'inch'
}

/* ─────────────────────────── cutting tools ─────────────────────────── */

const families = []
for (const [name, family] of registry.boundFamilies()) {
  const id = name.replace(/\.csv$/, '')
  try {
    let scrape
    if (brandOf(family) === 'destinytool') {
      scrape = await destinytool.scrapeEndMills(fetcher)
    } else if (family.kind === 'tap') {
      const system = threadSystemOf(family.id)
      if (system === null) throw new Error(`family id ${family.id} states no thread system`)
      // `Thread Pitch` is derived from `D1-TDZ` rather than published, which is
      // why the CLI has a separate command for it. The annotator composes here
      // without a CSV in between.
      scrape = threadColumn.addThreadPitch(
        await kennametal.scrapeFamily(fetcher, family.familyCode, brandOf(family), [
          ['Thread System', system],
        ]),
      )
    } else {
      scrape = await kennametal.scrapeFamily(fetcher, family.familyCode, brandOf(family), [])
    }

    const tools = []
    let unmapped = 0
    for (const row of scrape.rows) {
      try {
        const record = family.records(row, family, family.columns)
        tools.push({
          guid: core.recordGuid(brandOf(family), record.materialNumber),
          catalogNumber: record.catalogNumber,
          materialNumber: record.materialNumber,
          kind: record.kind,
          unit: record.unit,
          geometry: record.geometry,
          materialGroups: record.materialGroups,
          productLink: core.productLink(brandOf(family), record.materialNumber),
        })
      } catch {
        unmapped += 1
      }
    }

    families.push({
      id,
      name: id.replaceAll('_', ' '),
      brand: core.BRANDS[brandOf(family)].vendor,
      vendor: core.BRANDS[brandOf(family)].vendor,
      unit: family.unit ?? tools[0]?.unit ?? 'millimeters',
      source: scrape.source,
      tools,
    })
    console.log(
      `  ${id.padEnd(52)} ${String(tools.length).padStart(5)} tools` +
        (unmapped > 0 ? `  (${unmapped} rows unmapped)` : ''),
    )
  } catch (error) {
    console.log(`  ${id.padEnd(52)} FAILED: ${error.message}`)
  }
  await core.pause(core.REQUEST_DELAY_MS)
}

/* ───────────────────────────── toolholding ─────────────────────────── */

const guidFor = (material) => core.recordGuid('regofix', material)
const productLinkFor = (material) => core.productLink('regofix', material)
const context = { guidFor, productLinkFor }

const holders = []
const collets = []

try {
  const scrape = await regofix.scrapeHolders(fetcher)
  holders.push(...holdersFrom(scrape.rows, context))
  console.log(
    `  ${'regofix_bt30_pg_holders'.padEnd(52)} ${String(holders.length).padStart(5)} holders`,
  )
} catch (error) {
  console.log(`  regofix holders FAILED: ${error.message}`)
}

/** The PG sizes a BT30 holder takes; PG 32 and PG 48 fit none in this catalog. */
const BT30_COLLET_SIZES = ['6', '10', '15', '25']

/**
 * The vendor's own `product_group_name`, which is what `scrapeCollets` asks for.
 *
 * Taken from the family's `style` fact, whose citation records it verbatim —
 * `"the ProductFinder index groups these under product_group_name 'Coolant
 * flush'"`. The slug cannot be reversed into it: `pg-securgrip` is `secuRgrip`
 * and `pg-turning` is `PG-T`, so anything that re-cases a slug is guessing.
 *
 * A family whose citation stops recording it is skipped with a message rather
 * than scraped under a guessed name, which would quietly return nothing.
 */
const groupNameFor = (csvName) => {
  const cite = tables.COLLET_FAMILIES[csvName]?.facts?.style?.cite ?? ''
  return /product_group_name '([^']+)'/.exec(cite)?.[1] ?? null
}

for (const [name, family] of registry.boundToolholding()) {
  if (brandOf(family) !== 'regofix' || family.taper !== undefined) continue
  const id = name.replace(/\.csv$/, '')
  const group = groupNameFor(name)
  if (group === null) {
    console.log(`  ${id.padEnd(52)} SKIPPED: its style fact records no product_group_name`)
    continue
  }
  try {
    const scrape = await regofix.scrapeCollets(fetcher, group, BT30_COLLET_SIZES)
    const mapped = colletsFrom(scrape.rows, context, id)
    collets.push(...mapped)
    console.log(`  ${id.padEnd(52)} ${String(mapped.length).padStart(5)} collets`)
  } catch (error) {
    console.log(`  ${id.padEnd(52)} FAILED: ${error.message}`)
  }
  await core.pause(core.REQUEST_DELAY_MS)
}

/* ─────────────────────────────── write ─────────────────────────────── */

const document = {
  builtAt: new Date().toISOString().slice(0, 10),
  families,
  holders,
  collets,
}
writeFileSync(resolve(out), `${JSON.stringify(document, null, 2)}\n`, 'utf8')

const tools = families.reduce((sum, family) => sum + family.tools.length, 0)
console.log(
  `\n${tools} tools, ${holders.length} holders and ${collets.length} collets -> ${resolve(out)}`,
)
