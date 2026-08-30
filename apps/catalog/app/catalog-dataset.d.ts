/**
 * The bundled catalog dataset, resolved by `vite.config.ts` rather than named
 * by a path: which file this is depends on whether a scrape has been ingested
 * on this machine.
 */
declare module 'catalog-dataset' {
  const dataset: unknown
  export default dataset
}
