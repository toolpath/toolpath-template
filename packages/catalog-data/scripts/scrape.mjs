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
 * Cutting tools come across at the scraper's own record seam — `registry.toRecords`,
 * which is the package's uniform output as of 2026-08-30 and replaces this
 * script calling a family's mapper row by row. Nothing here reads a vendor's
 * column labels. **Toolholding has no such seam** — no toolholding family
 * carries a column map or a record mapper — so those rows are mapped by
 * `src/vendors/`, one file per vendor, each citing the evidence that pins it.
 * That mapping's right home is the scraper; see `docs/TOOL-CATALOG-PLAN.md`.
 *
 * Five vendors are scraped: Kennametal and WIDIA through one AEM adapter,
 * Destiny Tool, Harvey Tool (one request per product page), REGO-FIX
 * toolholding, and MariTool toolholding.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { colletsFrom, holdersFrom } from '../dist/vendors/regofix.js'
import { holdersFrom as maritoolHoldersFrom } from '../dist/vendors/maritool.js'

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
const harvey = await import(`${dist}/vendors/harvey/scrape.js`)
const maritool = await import(`${dist}/vendors/maritool/scrape.js`)
const tables = await import(`${dist}/families/index.js`)
const harveyFamilies = await import(`${dist}/families/harvey.js`)
const maritoolFamilies = await import(`${dist}/families/maritool.js`)
const regofix = await import(`${dist}/vendors/regofix/scrape.js`)

const fetcher = core.createFetcher()
const brandOf = (family) => family.brand ?? 'kennametal'

/** Warnings the vendor's own data earned, kept out of the progress column. */
const warnings = []
const warn = (message) => warnings.push(message)

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

/**
 * What a family's tools are, where the vendor's own page title says it and the
 * scraper's coarse `kind` does not.
 *
 * Harvey files its keyseat cutters under `kind: 'endmill'` — the scraper has
 * no finer kind for them — and their `profile` fact cites the page title that
 * does: *"Keyseat Cutters - Square - Reduced Shank"*. Ingested on the kind
 * alone they come out as flat end mills with a corner radius of zero, which is
 * how a 22 mm cutter with 1.6 mm of flute and twelve teeth ends up offered to
 * finish a pocket floor (Paul, 2026-09-01: "are you sure this is a flat
 * endmill?").
 *
 * `slot mill` is what a CAM library calls this tool — Fusion's own type for a
 * keyseat or woodruff cutter — and it is the vocabulary `TOOL_FORMS` speaks.
 *
 * **This belongs upstream.** A kind of its own in the scraper's family table
 * would state it once for every consumer; until then it is stated here, from
 * the vendor's own words, in one place.
 */
const FORMS_BY_FAMILY = [{ brand: 'harvey', id: /^keyseat-/, form: 'slot mill' }]

const formOf = (family) =>
  FORMS_BY_FAMILY.find((each) => each.brand === brandOf(family) && each.id.test(family.id))?.form ??
  null

/* ─────────────────────────── cutting tools ─────────────────────────── */

const families = []
for (const [name, family] of registry.boundFamilies()) {
  const id = name.replace(/\.csv$/, '')
  try {
    let scrape
    if (brandOf(family) === 'destinytool') {
      scrape = await destinytool.scrapeEndMills(fetcher)
    } else if (brandOf(family) === 'harvey') {
      // One product page per family, and the page's own matrix explodes into
      // one row per orderable part — the family's declared unit decides every
      // `_mm`/`_in`, so a family without one is a fault rather than a default.
      const page = harveyFamilies.PRODUCT_PAGES[name]
      if (page === undefined) throw new Error(`no product page is declared for ${name}`)
      if (family.unit === undefined) throw new Error(`family ${name} declares no unit`)
      scrape = await harvey.scrapeProduct(fetcher, page, { unit: family.unit, warn })
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

    // The record seam: the scraper's own mappers, checked against the family's
    // column map before the first row.
    const records = registry.toRecords(name, scrape, { warn })
    const form = formOf(family)
    const tools = records.map((record) => ({
      guid: record.guid,
      catalogNumber: record.catalogNumber,
      materialNumber: record.materialNumber,
      kind: record.kind,
      ...(form === null ? {} : { form }),
      unit: record.unit,
      geometry: record.geometry,
      materialGroups: record.materialGroups,
      productLink: core.productLink(record.brand, record.materialNumber),
    }))
    const unmapped = scrape.rows.length - tools.length

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

/* ───────────────────────── REGO-FIX toolholding ────────────────────── */

const guidFor = (brand) => (material) => core.recordGuid(brand, material)
const productLinkFor = (brand) => (material) => core.productLink(brand, material)
const context = { guidFor: guidFor('regofix'), productLinkFor: productLinkFor('regofix') }

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

/* ───────────────────────── MariTool toolholding ─────────────────────── */

const maritoolContext = {
  guidFor: guidFor('maritool'),
  productLinkFor: productLinkFor('maritool'),
}

for (const [name, leaves] of Object.entries(maritoolFamilies.LEAVES)) {
  const id = name.replace(/\.csv$/, '')
  try {
    // One request per leaf page for the roster, then one per part for its
    // geometry — the scrape paces itself throughout.
    const scrape = await maritool.scrapeHolders(fetcher, leaves, { warn })
    const mapped = maritoolHoldersFrom(scrape.rows, maritoolContext, id)
    holders.push(...mapped.holders)
    for (const note of mapped.notes) {
      warn(`${id}: ${note.materialNumber} left out — ${note.reason}`)
    }
    console.log(
      `  ${id.padEnd(52)} ${String(mapped.holders.length).padStart(5)} holders` +
        (mapped.notes.length > 0 ? `  (${mapped.notes.length} rows left out)` : ''),
    )
  } catch (error) {
    console.log(`  ${id.padEnd(52)} FAILED: ${error.message}`)
  }
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

if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s) from the vendors' own data:`)
  for (const message of warnings.slice(0, 40)) console.log(`  ${message}`)
  if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`)
}
