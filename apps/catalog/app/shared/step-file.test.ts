import { describe, expect, it } from 'vitest'
import { stepFile } from './step-file'

/** A ⌀6 cutter with a ⌀8 shank behind it: two diameters, one shoulder. */
const stepped = [
  { fromHeight: 0, radius: 3 },
  { fromHeight: 20, radius: 4 },
]

const entities = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('#'))
    .map((line) => line.slice(1, line.indexOf('=')))

describe('a component as a STEP file', () => {
  it('writes a header, a data section and an end marker', () => {
    const file = stepFile('TDMX0800', stepped, 63)!

    expect(file.startsWith('ISO-10303-21;')).toBe(true)
    expect(file).toContain("FILE_SCHEMA(('AUTOMOTIVE_DESIGN")
    expect(file.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true)
    expect(file).toContain("MANIFOLD_SOLID_BREP('TDMX0800'")
  })

  /** Every entity is written once and numbered in order: nothing dangles. */
  it('numbers its entities from one, without a gap', () => {
    const ids = entities(stepFile('T', stepped, 63)!).map(Number)

    expect(ids[0]).toBe(1)
    expect(ids).toEqual(ids.map((_, at) => at + 1))
  })

  /** Every coordinate is a STEP REAL: a bare `3` is an integer and refused. */
  it('writes every number with a decimal point', () => {
    const file = stepFile('T', stepped, 63)!
    const numbers = [...file.matchAll(/CARTESIAN_POINT\('',\(([^)]*)\)\)/g)].flatMap((match) =>
      match[1]!.split(','),
    )

    expect(numbers.filter((each) => !each.includes('.'))).toEqual([])
  })

  it('references only entities it wrote', () => {
    const file = stepFile('T', stepped, 63)!
    const written = new Set(entities(file))
    const referenced = [...file.matchAll(/#(\d+)(?![\d=])/g)].map((match) => match[1]!)

    expect(referenced.filter((id) => !written.has(id))).toEqual([])
  })

  /**
   * A solid, not a sheet: in a closed shell every edge is used by exactly two
   * faces, once each way round. This is the check that a hand-written B-rep
   * needs and the reason the shell is triangulated rather than hand-plumbed.
   */
  it('closes the shell — every edge shared by exactly two faces', () => {
    const file = stepFile('T', stepped, 63)!
    const used = new Map<string, { forward: number; back: number }>()
    for (const match of file.matchAll(/ORIENTED_EDGE\('',\*,\*,#(\d+),\.(T|F)\.\)/g)) {
      const had = used.get(match[1]!) ?? { forward: 0, back: 0 }
      used.set(match[1]!, {
        forward: had.forward + (match[2] === 'T' ? 1 : 0),
        back: had.back + (match[2] === 'F' ? 1 : 0),
      })
    }

    expect(used.size).toBeGreaterThan(0)
    expect([...used.values()].filter((count) => count.forward !== 1 || count.back !== 1)).toEqual(
      [],
    )
  })

  /** A step in the profile is a flat shoulder, so both diameters are in the solid. */
  it('carries every stated diameter into the shell', () => {
    const file = stepFile('T', stepped, 63)!

    expect(file).toContain('(3.,0.,0.)')
    expect(file).toContain('(4.,0.,20.)')
    // The body ends where it was told to, whatever the last stated step was.
    expect(file).toContain(',63.)')
  })

  /** A component that publishes no shape gets no file, not a guessed cylinder. */
  it('writes nothing where there is no profile', () => {
    expect(stepFile('T', [], 63)).toBeNull()
    expect(stepFile('T', [{ fromHeight: 0, radius: 0 }], 63)).toBeNull()
    expect(stepFile('T', [{ fromHeight: 0, radius: 3 }], 0)).toBeNull()
  })
})
