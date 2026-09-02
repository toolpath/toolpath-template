/**
 * The bundled holder profiles document, resolved by `vite.config.ts` the way
 * `catalog-dataset` is: the gitignored `scrape-out/profiles.json` on a machine
 * that has measured holders, and the committed synthetic sample otherwise.
 */
declare module 'catalog-profiles' {
  const profiles: unknown
  export default profiles
}
