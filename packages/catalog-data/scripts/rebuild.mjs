/**
 * Re-run `buildCatalog` over a dataset this package already built.
 *
 *   node scripts/rebuild.mjs <dataset.json> [out.json]
 *
 * For when the contract moves under an ingested dataset. `CATALOG_VERSION` has
 * moved four times, and each time the answer was to scrape again to get a file
 * the application would read — when everything the new version needed was
 * already in the old one. A scrape is a vendor's website and an afternoon;
 * this is a second, and it produces exactly what a fresh ingest would.
 *
 * It only works forwards from a dataset whose tools are already `CatalogTool`s,
 * which is version 3 and later. Anything older is a scrape, not a rebuild.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCatalog } from '../dist/index.js'

const [, , input, output = input] = process.argv
if (!input) {
  console.error('Usage: node scripts/rebuild.mjs <dataset.json> [out.json]')
  process.exit(1)
}

const old = JSON.parse(readFileSync(resolve(input), 'utf8'))
if (typeof old.version !== 'number' || old.version < 3) {
  console.error(
    `${input} is version ${String(old.version)}; only version 3 and later can be rebuilt. Run a scrape instead.`,
  )
  process.exit(1)
}

const byFamily = new Map(
  old.families.map((family) => [
    family.id,
    {
      id: family.id,
      name: family.name,
      brand: family.brand,
      vendor: family.vendor,
      unitSystem: family.unitSystem,
      source: family.source ?? null,
      tools: [],
    },
  ]),
)
for (const tool of old.tools) {
  const family = byFamily.get(tool.familyId)
  if (!family) {
    console.error(
      `Tool ${tool.catalogNumber} belongs to family ${tool.familyId}, which the dataset does not list.`,
    )
    process.exit(1)
  }
  family.tools.push(tool)
}

const catalog = buildCatalog({
  builtAt: old.builtAt,
  families: [...byFamily.values()],
  holders: old.holders ?? [],
  collets: old.collets ?? [],
})

writeFileSync(resolve(output), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(
  `Rebuilt ${catalog.tools.length} tools from version ${old.version} to ${catalog.version} in ${resolve(output)}.`,
)
