import { describe, expect, it } from 'vitest'
import { datasetSource } from './dataset-source'

const PATHS = { scraped: '/repo/scrape-out/catalog.json', sample: '/pkg/sample-catalog.json' }
const version = (found: Record<string, number | null>) => (path: string) => found[path] ?? null

describe('which dataset a build bundles', () => {
  it('takes the scrape when it matches the contract this build reads', () => {
    expect(datasetSource(PATHS, 6, () => true, version({ [PATHS.scraped]: 6 }))).toEqual({
      path: PATHS.scraped,
      note: null,
    })
  })

  it('takes the sample where no scrape has been ingested', () => {
    expect(datasetSource(PATHS, 6, () => false, version({}))).toEqual({
      path: PATHS.sample,
      note: null,
    })
  })

  /**
   * **A stale scrape is not bundled** (Paul, 2026-09-02: "white screen when
   * accessing"). `shared/catalog.ts` throws at import on a version it cannot
   * read, and a module-level throw kills the route module rather than
   * rendering an error — so the page came up blank with the reason only in the
   * browser console. The build stands the sample in and says why.
   */
  it('stands the sample in for a scrape built against another contract, and says so', () => {
    const chosen = datasetSource(PATHS, 6, () => true, version({ [PATHS.scraped]: 4 }))

    expect(chosen.path).toBe(PATHS.sample)
    expect(chosen.note).toContain('version 4')
    expect(chosen.note).toContain('reads 6')
    expect(chosen.note).toContain('re-run the scrape')
  })

  it('does the same for a file it cannot read a version from', () => {
    const chosen = datasetSource(PATHS, 6, () => true, version({}))

    expect(chosen.path).toBe(PATHS.sample)
    expect(chosen.note).toContain('Could not read a version')
  })

  /** An explicit override is checked the same way: a stale file is stale. */
  it('checks a dataset named by hand as closely as one it found', () => {
    const asked = { ...PATHS, override: '/elsewhere/catalog.json' }

    expect(
      datasetSource(asked, 6, () => true, version({ '/elsewhere/catalog.json': 6 })).path,
    ).toBe('/elsewhere/catalog.json')
    expect(datasetSource(asked, 6, () => true, version({})).path).toBe(PATHS.sample)
  })
})
