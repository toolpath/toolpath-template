import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { withClampingLength } from './clamping-length'

const tool = (geometry: Record<string, number>): CatalogTool =>
  ({
    guid: 't',
    catalogNumber: 'T',
    form: 'flat end mill',
    geometry,
    provenance: {},
  }) as unknown as CatalogTool

/** A ⌀6 end mill on a ⌀6 shank, 57 long, as the dataset carries it. */
const sixMil = tool({ DC: 6, SFDM: 6, LCF: 13, OAL: 57, LBH: 39, LD: 6.5 })
const RULE = { vendorSpec: true, perDiameter: 3 }

/**
 * The rule itself is `@toolpath/catalog-data`'s and is tested there — the
 * dataset is built with it. What this file covers is the knob: a shop changing
 * the multiple, and that change reaching every tool the page reads.
 */
describe('the catalog as this shop reads it', () => {
  it('rewrites the length below holder, and the ratio with it', () => {
    // 6×⌀6 clamped leaves 21 of a 57 mm tool, and 21 ÷ 6 is 3.5.
    const [read] = withClampingLength([sixMil], { vendorSpec: true, perDiameter: 6 })

    expect(read?.geometry.LBH).toBe(21)
    expect(read?.geometry.LD).toBe(3.5)
    expect(read?.provenance.LBH).toBe('derived')
    expect(read?.provenance.LD).toBe('derived')
  })

  /** The dataset was built with this one, so nothing moves. */
  it('leaves the dataset’s own figures where the rule is the default', () => {
    const [read] = withClampingLength([sixMil], RULE)

    expect(read?.geometry.LBH).toBe(39)
  })

  it('leaves the catalog’s own numbers alone where the rule says nothing', () => {
    const off = { vendorSpec: false, perDiameter: 0 }

    expect(withClampingLength([sixMil], off)[0]?.geometry.LBH).toBe(39)
  })

  it('leaves a tool that states no diameter or length alone', () => {
    const blank = tool({ LCF: 13 })

    expect(withClampingLength([blank], RULE)[0]).toBe(blank)
  })
})
