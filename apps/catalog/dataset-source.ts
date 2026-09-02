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
    return { path: sample, note: null }
  }
  const version = versionOf(asked)
  if (version === reads) {
    return { path: asked, note: null }
  }
  return {
    path: sample,
    note:
      version === null
        ? `Could not read a version from ${asked}; building against the sample catalog instead.`
        : `${asked} is catalog version ${String(version)} and this build reads ${String(reads)}. ` +
          'Building against the sample catalog instead — re-run the scrape to use it.',
  }
}
