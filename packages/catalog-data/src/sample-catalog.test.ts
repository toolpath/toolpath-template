import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATALOG_VERSION } from './types.js'
import { undefinedGeometryCodes } from './build.js'
import type { Catalog } from './types.js'

const committed = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/sample-catalog.json', import.meta.url)), 'utf8'),
) as Catalog

describe('the committed sample dataset', () => {
  it('is the shape this package builds today', () => {
    expect(committed.version).toBe(CATALOG_VERSION)
  })

  /**
   * The fixture is generated, not authored: a dataset that could not have come
   * out of `buildCatalog` is one the application would be reading facts from
   * that the pipeline cannot produce.
   */
  it('is what the generator writes', () => {
    const script = fileURLToPath(new URL('../scripts/build-sample-catalog.mjs', import.meta.url))
    const before = readFileSync(
      fileURLToPath(new URL('../fixtures/sample-catalog.json', import.meta.url)),
      'utf8',
    )

    execFileSync(process.execPath, [script], { stdio: 'pipe' })

    const after = readFileSync(
      fileURLToPath(new URL('../fixtures/sample-catalog.json', import.meta.url)),
      'utf8',
    )
    expect(after).toBe(before)
  })

  it('exercises both unit systems and more than one tool type', () => {
    expect(new Set(committed.families.map((family) => family.unitSystem))).toEqual(
      new Set(['millimeters', 'inches']),
    )
    expect(new Set(committed.tools.map((tool) => tool.toolType)).size).toBeGreaterThan(1)
  })

  /** The detail page has to have an unlabelled vendor code to render. */
  it('includes a code the dictionary deliberately does not define', () => {
    expect(undefinedGeometryCodes(committed.tools)).not.toEqual([])
  })

  it('carries a value this pipeline decided rather than read', () => {
    const decided = committed.tools.flatMap((tool) =>
      Object.values(tool.provenance).filter((each) => each !== 'vendor-stated'),
    )
    expect(decided.length).toBeGreaterThan(0)
  })
})
