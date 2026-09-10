import { describe, expect, it } from 'vitest'
import { allTools, collets, getCollet, getHolder, getTool, holders } from './catalog'

/**
 * The three guid lookups, against the committed sample.
 *
 * `vitest.config.ts` pins `catalog-dataset` to the sample, so these read the
 * same rack on every machine — `docs/TOOL-CATALOG-PLAN.md` § Testing.
 *
 * **The point of pinning them is the measured holder.** `getHolder` has to
 * answer with the entry from {@link holders}, which carries the nose, body and
 * flange measured off the vendor's own CAD model — not the raw record in the
 * dataset document, which states none of them. A map built from the wrong one
 * of those two lists would look right in every test that only checked a
 * catalog number, and would quietly hand `clearance()` back the silence that
 * `shared/catalog.ts` exists to fill.
 */
describe('a component by its guid', () => {
  it('answers with the record the catalog holds', () => {
    const tool = allTools[0]
    expect(tool).toBeDefined()
    expect(getTool(tool!.guid)).toBe(tool)
  })

  it('answers with the measured holder, not the raw record', () => {
    const holder = holders[0]
    expect(holder).toBeDefined()
    // `toBe`, not `toEqual`: the identity is the assertion.
    expect(getHolder(holder!.guid)).toBe(holder)
  })

  it('answers with the collet the catalog holds', () => {
    const collet = collets[0]
    expect(collet).toBeDefined()
    expect(getCollet(collet!.guid)).toBe(collet)
  })

  /** A sheet outlives the dataset it was written against, so this is ordinary. */
  it('answers null for a guid the catalog does not hold', () => {
    expect(getTool('not-a-guid')).toBeNull()
    expect(getHolder('not-a-guid')).toBeNull()
    expect(getCollet('not-a-guid')).toBeNull()
  })

  it('finds every guid in the catalog, not just the first', () => {
    expect(holders.every((each) => getHolder(each.guid) === each)).toBe(true)
    expect(collets.every((each) => getCollet(each.guid) === each)).toBe(true)
  })
})
