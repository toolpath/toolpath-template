import { describe, expect, it } from 'vitest'
import { datasetSource, profilesSource } from './dataset-source'

const PATHS = { scraped: '/repo/scrape-out/catalog.json', sample: '/pkg/sample-catalog.json' }
const version = (found: Record<string, number | null>) => (path: string) => found[path] ?? null

describe('which dataset a build bundles', () => {
  it('takes the scrape when it matches the contract this build reads', () => {
    expect(datasetSource(PATHS, 6, () => true, version({ [PATHS.scraped]: 6 }))).toEqual({
      path: PATHS.scraped,
      note: null,
      fromScrape: true,
    })
  })

  it('takes the sample where no scrape has been ingested', () => {
    expect(datasetSource(PATHS, 6, () => false, version({}))).toEqual({
      path: PATHS.sample,
      note: null,
      fromScrape: false,
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

const PROFILES = { scraped: '/repo/scrape-out/profiles.json', sample: '/pkg/sample-profiles.json' }
const SCRAPED = { path: PATHS.scraped, note: null, fromScrape: true }
const SAMPLE = { path: PATHS.sample, note: null, fromScrape: false }

describe('which measured holder profiles a build bundles', () => {
  it("takes the scrape's profiles beside the scrape's catalog", () => {
    expect(profilesSource(PROFILES, SCRAPED, () => true).path).toBe(PROFILES.scraped)
  })

  it("takes the sample's profiles beside the sample catalog", () => {
    expect(profilesSource(PROFILES, SAMPLE, () => false).path).toBe(PROFILES.sample)
  })

  /**
   * **The regression this pairing exists for** (Paul, 2026-09-03: "the tool
   * holders are being drawn"). A version-8 `catalog.json` was stood in for by
   * the sample, the profiles alias kept pointing at the real
   * `scrape-out/profiles.json` because the file was still there, and not one
   * of its 374 guids named a sample holder — so `getProfile` answered null
   * everywhere and every assembly fell back to the parametric holder, with
   * nothing anywhere saying why.
   */
  it("does not pair a stood-in catalog with another dataset's measurements", () => {
    expect(profilesSource(PROFILES, SAMPLE, () => true).path).toBe(PROFILES.sample)
  })

  it('says so when a scrape has holders nobody has measured', () => {
    const chosen = profilesSource(PROFILES, SCRAPED, () => false)

    expect(chosen.path).toBe(PROFILES.sample)
    expect(chosen.note).toContain('No measured holder profiles')
    expect(chosen.note).toContain(PATHS.scraped)
  })

  it('takes measurements named by hand over both', () => {
    const asked = { ...PROFILES, override: '/elsewhere/profiles.json' }

    expect(profilesSource(asked, SAMPLE, () => false).path).toBe('/elsewhere/profiles.json')
  })
})
