import { existsSync, openSync, readSync, closeSync } from 'node:fs'

/**
 * Which dataset a build bundles, and why.
 *
 * `scrape-out/catalog.json` when a scrape has been ingested on this machine,
 * the committed sample otherwise, and `CATALOG_DATASET` over both — see
 * `vite.config.ts`. This module is the choosing, kept out of the config so it
 * can be tested.
 *
 * **A dataset built against another contract is not used** (Paul, 2026-09-02:
 * "white screen when accessing"). A scrape from before the contract moved was
 * bundled anyway, and `shared/catalog.ts` threw at import — which kills the
 * route module rather than rendering an error, so the page came up blank with
 * the reason only in the browser console. The file is left alone, the sample
 * stands in, and the reason is printed where the dev server was started.
 */
export interface DatasetChoice {
  readonly path: string
  /** What to tell whoever started the build, where there is anything to say. */
  readonly note: string | null
  /** Whether this is the scrape on this machine rather than the committed sample. */
  readonly fromScrape: boolean
}

/**
 * The `version` of a catalog file, off the head of it.
 *
 * A scrape is fifteen megabytes and the field is in the first line, so this
 * reads a few hundred bytes rather than parsing the document.
 */
export const datasetVersion = (path: string): number | null => {
  let file: number | undefined
  try {
    file = openSync(path, 'r')
    const head = Buffer.alloc(512)
    const read = readSync(file, head, 0, head.length, 0)
    const found = /"version"\s*:\s*(\d+)/.exec(head.toString('utf8', 0, read))
    return found?.[1] === undefined ? null : Number(found[1])
  } catch {
    return null
  } finally {
    if (file !== undefined) {
      closeSync(file)
    }
  }
}

export const datasetSource = (
  { override, scraped, sample }: { override?: string; scraped: string; sample: string },
  reads: number,
  exists: (path: string) => boolean = existsSync,
  versionOf: (path: string) => number | null = datasetVersion,
): DatasetChoice => {
  const asked = override ?? (exists(scraped) ? scraped : null)
  if (asked === null) {
    return { path: sample, note: null, fromScrape: false }
  }
  const version = versionOf(asked)
  if (version === reads) {
    return { path: asked, note: null, fromScrape: true }
  }
  return {
    path: sample,
    fromScrape: false,
    note:
      version === null
        ? `Could not read a version from ${asked}; building against the sample catalog instead.`
        : `${asked} is catalog version ${String(version)} and this build reads ${String(reads)}. ` +
          'Building against the sample catalog instead — re-run the scrape to use it.',
  }
}

/**
 * Which measured holder profiles get bundled, given the dataset that won.
 *
 * **The two documents are a pair, and pairing them is the whole job.** A
 * profile is keyed by the guid `toolholding.ts` mints, so a profiles document
 * from one catalog against another catalog's holders matches nothing at all —
 * `getProfile` answers null for every holder, every drawing falls back to the
 * parametric nose-body-flange, and there is no error anywhere to say why.
 *
 * That is exactly what a stale scrape produced (Paul, 2026-09-03: "the tool
 * holders are being drawn"): {@link datasetSource} stood the sample catalog in
 * for a version-8 `catalog.json`, the profiles alias kept pointing at the real
 * `scrape-out/profiles.json` because the file was there, and the holders came
 * out blocky. So the profiles follow the dataset rather than deciding for
 * themselves, and say when they had to.
 *
 * `CATALOG_PROFILES` still overrides both, for measurements kept elsewhere.
 */
export const profilesSource = (
  { override, scraped, sample }: { override?: string; scraped: string; sample: string },
  dataset: DatasetChoice,
  exists: (path: string) => boolean = existsSync,
): DatasetChoice => {
  if (override !== undefined) {
    return { path: override, note: null, fromScrape: true }
  }
  if (!dataset.fromScrape) {
    return { path: sample, note: null, fromScrape: false }
  }
  if (exists(scraped)) {
    return { path: scraped, note: null, fromScrape: true }
  }
  return {
    path: sample,
    fromScrape: false,
    note:
      `No measured holder profiles beside ${dataset.path}; no holder in it will be drawn as ` +
      'measured. Run `toolpath-scrape profiles` to measure them.',
  }
}
