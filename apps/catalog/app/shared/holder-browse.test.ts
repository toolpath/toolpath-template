import { describe, expect, it } from 'vitest'
import {
  holderNeedsCollet,
  holderTakesTool,
  seriesSize,
  seriesUnstocked,
} from '@toolpath/catalog-data'
import { allTools, collets, getProfile, holders } from './catalog'
import { holderRows, representativeAssembly, shortfallNote } from './holder-browse'

/**
 * Against the committed sample, which `vitest.config.ts` pins both documents
 * to. A holder list whose result depended on whether somebody had run a scrape
 * would be a suite that passes on one machine.
 */
const measured = (guid: string) => getProfile(guid) !== null

describe('browsing holders', () => {
  it('lists every holder when nothing is filtered', () => {
    expect(holderRows(holders, {}, measured)).toHaveLength(holders.length)
  })

  it('narrows to the axis asked for, and AND-s across axes', () => {
    const collet = holderRows(holders, { clamping: ['collet'] }, measured)

    expect(collet.length).toBeGreaterThan(0)
    expect(collet.every((row) => row.holder.clamping === 'collet')).toBe(true)
    expect(collet.length).toBeLessThan(holders.length)
  })

  /**
   * A shrink-fit chuck carries no collet series, so a series filter must not
   * match one — the rule `matchesFilters` states, pinned from this side too
   * because it is the one that silently offers a machinist the wrong holder.
   */
  it('never matches a series filter against a holder that takes no collet', () => {
    const rows = holderRows(holders, { colletSeries: ['ER16'] }, measured)

    expect(rows.every((row) => row.holder.colletSeries === 'ER16')).toBe(true)
  })

  it('says which holders have been measured', () => {
    const rows = holderRows(holders, {}, measured)

    expect(rows.some((row) => row.measured)).toBe(true)
    expect(rows.every((row) => row.measured === (getProfile(row.holder.guid) !== null))).toBe(true)
  })
})

describe('a holder drawn with something in it', () => {
  it('finds a tool and, for a collet chuck, the collet between them', () => {
    for (const holder of holders) {
      const assembly = representativeAssembly(holder, allTools, collets)

      expect(assembly).not.toBeNull()
      expect(assembly?.holder).toBe(holder)
      expect(assembly?.stickout).toBeGreaterThan(0)
      // The collet is not optional decoration: a collet chuck with no collet
      // grips nothing, and drawing one would be a picture of a stack that
      // cannot exist.
      expect(assembly?.collet === null).toBe(!holderNeedsCollet(holder))
    }
  })

  it('answers null rather than a stack that does not fit', () => {
    expect(representativeAssembly(holders[0]!, [], collets)).toBeNull()
  })
})

describe('what an incomplete model is short by', () => {
  it('says nothing where the model reaches the published gauge length', () => {
    expect(shortfallNote(null, (mm) => `${mm} mm`)).toBeNull()
    expect(shortfallNote(0, (mm) => `${mm} mm`)).toBeNull()
  })

  /**
   * The wording blames the model, not the holder. A BTKV30 whose STEP file
   * stops at the threaded nose is a complete holder and an incomplete model,
   * and a note that said otherwise sends somebody looking for a missing part.
   */
  it('names the vendor model, in the page unit', () => {
    const note = shortfallNote(6.5, (mm) => `${mm} mm`)

    expect(note).toContain('6.5 mm')
    expect(note).toContain("vendor's model")
  })
})

describe('a collet chuck the crib stocks no collet for', () => {
  /**
   * The whole point of the change: 135 MariTool collet chucks were invisible
   * because nobody has bought an ER collet, and `ViewerAssembly` never needed
   * one — the drawing package has no field for a collet at all.
   */
  it('still produces a stack to draw, with no collet in it', () => {
    const chuck = holders.find((holder) => holder.clamping === 'collet')
    expect(chuck).toBeDefined()

    const assembly = representativeAssembly(chuck!, allTools, [])

    expect(assembly).not.toBeNull()
    expect(assembly?.collet).toBeNull()
    expect(assembly?.holder).toBe(chuck)
    expect(assembly?.stickout).toBeGreaterThan(0)
  })

  /**
   * Drawing it is not claiming it holds anything, and the verdict that decides
   * that must not have moved.
   */
  it('does not become something that holds a tool', () => {
    const chuck = holders.find((holder) => holder.clamping === 'collet')!
    const assembly = representativeAssembly(chuck, allTools, [])!

    expect(holderTakesTool(chuck, null, assembly.tool)).toBe(false)
    expect(seriesUnstocked(chuck, [])).toBe(true)
  })

  /**
   * A loose bound, and loose on purpose — an ER16 closes on 10 mm, not 16 —
   * but it keeps a picture from being absurd enough to read as a claim.
   */
  it('keeps a tool wider than the series designation out of the picture', () => {
    const chuck = holders.find((holder) => holder.colletSeries !== null)!
    const bound = seriesSize(chuck.colletSeries)
    const assembly = representativeAssembly(chuck, allTools, [])

    expect(bound).not.toBeNull()
    expect(assembly?.tool.geometry.SFDM).toBeLessThanOrEqual(bound!)
  })

  it('still answers null for a bore holder nothing fits, rather than inventing one', () => {
    const bore = holders.find((holder) => holder.clamping !== 'collet')!

    expect(representativeAssembly(bore, [], [])).toBeNull()
  })
})
