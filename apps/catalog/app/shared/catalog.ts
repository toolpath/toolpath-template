import type {
  Catalog,
  CatalogTool,
  Collet,
  Facets,
  Holder,
  HolderProfile,
  Profiles,
  ToolFamily,
} from '@toolpath/catalog-data'
import { CATALOG_VERSION, PROFILES_VERSION, profileFor } from '@toolpath/catalog-data'
import dataset from 'catalog-dataset'
import profileDocument from 'catalog-profiles'

/**
 * The only module in this application that touches the dataset.
 *
 * Everything the UI knows about tool data comes through here, so replacing
 * today's build-time JSON with a fetch against an API later is a one-file
 * change. Components import {@link allTools} and {@link getTool};
 * nothing else imports the dataset.
 *
 * `catalog-dataset` is resolved by `vite.config.ts`: the gitignored
 * `scrape-out/catalog.json` when a scrape has been ingested on this machine,
 * and the committed sample otherwise. Scraped vendor data never enters the
 * repository, and a checkout still builds.
 */
const document = dataset as unknown as Catalog

if (document.version !== CATALOG_VERSION) {
  // A dataset built against an older contract is a stale artifact, not a
  // rendering problem: failing at import is what stops it being read field by
  // field until something looks wrong.
  throw new Error(
    `Catalog dataset is version ${document.version}; this application reads version ${CATALOG_VERSION}.`,
  )
}

export const allTools: ReadonlyArray<CatalogTool> = document.tools
export const facets: Facets = document.facets

/**
 * What the catalog can hold a tool with.
 *
 * Empty in a dataset built before toolholding was ingested. The UI has to say
 * "no toolholding in this dataset" rather than "nothing holds this tool": the
 * two look the same on screen and mean opposite things.
 */
export const holders: ReadonlyArray<Holder> = document.holders ?? []
export const collets: ReadonlyArray<Collet> = document.collets ?? []
export const hasToolholding = (): boolean => holders.length > 0

/**
 * The measured half, kept out of the catalog document on purpose.
 *
 * A profile is ~110 vertices that only an assembly drawing needs, and this
 * module is imported by every page. It is loaded here rather than in the
 * drawing so that {@link getProfile} stays the one way to reach it — the same
 * rule the dataset itself follows.
 *
 * **A missing profile is not an error.** A catalog is measured holder by
 * holder, so a holder with none is the ordinary state and draws parametrically;
 * only a *version* mismatch is a stale artifact worth refusing at import.
 */
const measured = profileDocument as unknown as Profiles

if (measured.profilesVersion !== PROFILES_VERSION) {
  throw new Error(
    `Holder profiles are version ${measured.profilesVersion}; this application reads version ${PROFILES_VERSION}.`,
  )
}

/** The silhouette measured off this holder's own CAD model, or null where none was. */
export const getProfile = (guid: string): HolderProfile | null => profileFor(measured, guid)

const byGuid = new Map(document.tools.map((tool) => [tool.guid, tool]))
const familiesById = new Map(document.families.map((family) => [family.id, family]))

export const getTool = (guid: string): CatalogTool | null => byGuid.get(guid) ?? null

export const getFamily = (id: string): ToolFamily | null => familiesById.get(id) ?? null

/**
 * Whose each vendor-owned filter value is.
 *
 * A family carries its brand on its own record. A product line does not — it
 * is a string on the tool — so the brands publishing one are read off the
 * tools once, here, rather than scanned per render. Both answer the one
 * question the filter panel asks of these axes: with a vendor chosen, which of
 * these values are that vendor's.
 *
 * A list rather than a single brand because nothing stops two vendors printing
 * the same words on a page, and a value nobody owns comes back empty — which
 * the panel reads as "not a vendor's to hide".
 */
const brandsByProductLine = new Map<string, Set<string>>()
for (const tool of document.tools) {
  const line = tool.productLine
  if (line === null || line === undefined) {
    continue
  }
  const brands = brandsByProductLine.get(line) ?? new Set<string>()
  brands.add(tool.brand)
  brandsByProductLine.set(line, brands)
}

export const brandsOfFamily = (id: string): ReadonlyArray<string> => {
  const family = familiesById.get(id)
  return family === undefined ? [] : [family.brand]
}

export const brandsOfProductLine = (line: string): ReadonlyArray<string> => [
  ...(brandsByProductLine.get(line) ?? []),
]
