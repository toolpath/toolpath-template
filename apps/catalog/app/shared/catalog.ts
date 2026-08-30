import type {
  Catalog,
  CatalogTool,
  Collet,
  Facets,
  Holder,
  ToolFamily,
} from '@toolpath/catalog-data'
import { CATALOG_VERSION } from '@toolpath/catalog-data'
import dataset from 'catalog-dataset'

/**
 * The only module in this application that touches the dataset.
 *
 * Everything the UI knows about tool data comes through here, so replacing
 * today's build-time JSON with a fetch against an API later is a one-file
 * change. Components import {@link searchableTools} and {@link getTool};
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

export const builtAt: string = document.builtAt
export const families: ReadonlyArray<ToolFamily> = document.families
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

const byGuid = new Map(document.tools.map((tool) => [tool.guid, tool]))
const familiesById = new Map(document.families.map((family) => [family.id, family]))

/** The tools a search runs over, in catalog order. */
export const searchableTools = (): ReadonlyArray<CatalogTool> => allTools

export const getTool = (guid: string): CatalogTool | null => byGuid.get(guid) ?? null

export const getFamily = (id: string): ToolFamily | null => familiesById.get(id) ?? null
