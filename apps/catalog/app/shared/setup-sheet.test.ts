import { describe, expect, it } from 'vitest'
import {
  addChoice,
  choicesFor,
  chosenFor,
  clearChoice,
  emptySheet,
  lineId,
  quantityOf,
  readSheet,
  removeChoice,
  removeTool,
  setQuantity,
  setTotal,
  totalOf,
  writeSheet,
  type SetupSheet,
} from './setup-sheet'

const store = () => {
  const held = new Map<string, string>()
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  }
}

describe('the setup sheet', () => {
  it('stores guids and a stickout per feature, and nothing else', () => {
    const sheet = addChoice(emptySheet('part-1'), 'pocket-1', {
      toolGuid: 't',
      holderGuid: 'h',
      stickout: 30,
    })

    expect(choicesFor(sheet, 'pocket-1')).toEqual([
      { toolGuid: 't', holderGuid: 'h', stickout: 30 },
    ])
  })

  /**
   * **A line is the stack that wrote it** (Paul, 2026-09-11: "when I have two
   * (or more) tool assemblies on a feature or group, both need to be shown in
   * the order list"). Keyed by its tool, one feature held one line per cutter,
   * so the second stack given that cutter wrote over the first and took its
   * holder with it.
   */
  it('keeps two stacks of one cutter as two lines', () => {
    const sheet = addChoice(
      addChoice(emptySheet('part-1'), 'pocket-1', {
        toolGuid: 't',
        holderGuid: 'a',
        assemblyId: 'assembly-1',
      }),
      'pocket-1',
      { toolGuid: 't', holderGuid: 'b', assemblyId: 'assembly-2' },
    )

    expect(choicesFor(sheet, 'pocket-1')).toEqual([
      { toolGuid: 't', holderGuid: 'a', assemblyId: 'assembly-1' },
      { toolGuid: 't', holderGuid: 'b', assemblyId: 'assembly-2' },
    ])
  })

  it('replaces the line one stack already wrote, where that stack writes again', () => {
    const sheet = addChoice(
      addChoice(emptySheet('part-1'), 'pocket-1', {
        toolGuid: 't',
        holderGuid: 'a',
        assemblyId: 'assembly-1',
      }),
      'pocket-1',
      { toolGuid: 'u', holderGuid: 'b', assemblyId: 'assembly-1' },
    )

    expect(choicesFor(sheet, 'pocket-1')).toEqual([
      { toolGuid: 'u', holderGuid: 'b', assemblyId: 'assembly-1' },
    ])
  })

  /** A line nothing built out of a tree is its tool, exactly as it always was. */
  it('names a line by its tool where no stack wrote it', () => {
    expect(lineId({ toolGuid: 't' })).toBe('t')
    expect(lineId({ toolGuid: 't', assemblyId: 'assembly-2' })).toBe('assembly-2')
  })

  it('takes one stack off and leaves the other standing', () => {
    const sheet = addChoice(
      addChoice(emptySheet('part-1'), 'pocket-1', { toolGuid: 't', assemblyId: 'assembly-1' }),
      'pocket-1',
      { toolGuid: 't', assemblyId: 'assembly-2' },
    )

    expect(removeChoice(sheet, 'pocket-1', 'assembly-1')).toEqual({
      partId: 'part-1',
      choices: { 'pocket-1': [{ toolGuid: 't', assemblyId: 'assembly-2' }] },
    })
  })

  /** What the tool panel's *Remove* means: this tool, however many stacks hold it. */
  it('takes a tool off every stack of the feature holding it', () => {
    const sheet = addChoice(
      addChoice(emptySheet('part-1'), 'pocket-1', { toolGuid: 't', assemblyId: 'assembly-1' }),
      'pocket-1',
      { toolGuid: 't', assemblyId: 'assembly-2' },
    )

    expect(choicesFor(removeTool(sheet, 'pocket-1', 't'), 'pocket-1')).toEqual([])
  })

  it('removes a cleared feature rather than leaving a null behind', () => {
    const sheet = clearChoice(
      addChoice(emptySheet('part-1'), 'pocket-1', { toolGuid: 't' }),
      'pocket-1',
    )

    expect(Object.keys(sheet.choices)).toEqual([])
    expect(clearChoice(sheet, 'pocket-1')).toBe(sheet)
  })

  it('survives a reload, and reads another part’s sheet as empty', () => {
    const storage = store()
    writeSheet(storage, addChoice(emptySheet('part-1'), 'pocket-1', { toolGuid: 't' }))

    expect(choicesFor(readSheet(storage, 'part-1'), 'pocket-1')).toEqual([{ toolGuid: 't' }])
    expect(readSheet(storage, 'part-2').choices).toEqual({})
  })

  /** Unreadable storage is not an application error: the sheet is gone, the catalog still works. */
  it('reads garbage as an empty sheet', () => {
    const storage = store()
    storage.setItem('tool-catalog.setup.part-1', '{not json')

    expect(readSheet(storage, 'part-1')).toEqual(emptySheet('part-1'))
    storage.setItem(
      'tool-catalog.setup.part-1',
      JSON.stringify({ partId: 'part-1', choices: { a: { nope: 1 }, b: { toolGuid: 't' } } }),
    )
    expect(Object.keys(readSheet(storage, 'part-1').choices)).toEqual(['b'])
  })
})

describe('more than one tool for a feature', () => {
  const sheet = addChoice(emptySheet('p'), 'pocket-1', { toolGuid: 'rough' })

  /**
   * Roughing then finishing a pocket is two cutters for one feature, and a
   * sheet that held one silently replaced the first with the second (Paul,
   * 2026-08-31).
   */
  it('keeps them both, in the order they were kept', () => {
    const both = addChoice(sheet, 'pocket-1', { toolGuid: 'finish' })

    expect(both.choices['pocket-1']).toEqual([{ toolGuid: 'rough' }, { toolGuid: 'finish' }])
  })

  /** The same cutter with a different holder is a correction, not a second line. */
  it('replaces a tool already kept, where it stands', () => {
    const both = addChoice(sheet, 'pocket-1', { toolGuid: 'finish' })
    const fixed = addChoice(both, 'pocket-1', { toolGuid: 'rough', holderGuid: 'h' })

    expect(fixed.choices['pocket-1']).toEqual([
      { toolGuid: 'rough', holderGuid: 'h' },
      { toolGuid: 'finish' },
    ])
  })

  it('finds the line for one tool, and says nothing about a tool it never kept', () => {
    expect(chosenFor(sheet, 'pocket-1', 'rough')).toEqual({ toolGuid: 'rough' })
    expect(chosenFor(sheet, 'pocket-1', 'finish')).toBeNull()
  })

  it('drops one tool without dropping the others', () => {
    const both = addChoice(sheet, 'pocket-1', { toolGuid: 'finish' })

    expect(removeChoice(both, 'pocket-1', 'rough').choices['pocket-1']).toEqual([
      { toolGuid: 'finish' },
    ])
    expect(removeChoice(both, 'pocket-1', 'nobody')).toBe(both)
  })

  /** The last one out takes the feature with it, rather than leaving an empty list. */
  it('removes the feature when nothing is left kept for it', () => {
    expect(removeChoice(sheet, 'pocket-1', 'rough').choices).toEqual({})
  })

  /** A sheet saved before a feature could hold two is read as the one it held. */
  it('reads a sheet written when a feature held one tool', () => {
    const storage = store()
    storage.setItem(
      'tool-catalog.setup.part-1',
      JSON.stringify({ partId: 'part-1', choices: { 'pocket-1': { toolGuid: 't' } } }),
    )

    expect(choicesFor(readSheet(storage, 'part-1'), 'pocket-1')).toEqual([{ toolGuid: 't' }])
  })
})

describe('how many of each component', () => {
  const sheet = addChoice(emptySheet('p'), 'pocket-1', { toolGuid: 't', holderGuid: 'h' })
  const line = (of: SetupSheet, tool = 't') => chosenFor(of, 'pocket-1', tool)!

  /** A line is one of each until somebody says otherwise. */
  it('reads an absent quantity as one', () => {
    expect(quantityOf(line(sheet), 'tool')).toBe(1)
    expect(quantityOf(line(sheet), 'holder')).toBe(1)
  })

  /**
   * Three cutters and one holder to put them in — the thing a per-line
   * quantity could not say (Paul, 2026-08-31).
   */
  it('counts each component on its own', () => {
    const three = setQuantity(sheet, 'pocket-1', 't', 'tool', 3)

    expect(line(three)).toEqual({ toolGuid: 't', holderGuid: 'h', quantities: { tool: 3 } })
    expect(quantityOf(line(three), 'tool')).toBe(3)
    expect(quantityOf(line(three), 'holder')).toBe(1)
  })

  /** One is stored as nothing, and a line with nothing but ones stores none. */
  it('stores one as nothing at all', () => {
    const back = setQuantity(
      setQuantity(sheet, 'pocket-1', 't', 'tool', 4),
      'pocket-1',
      't',
      'tool',
      1,
    )

    expect(line(back)).toEqual({ toolGuid: 't', holderGuid: 'h' })
  })

  it('never goes below one, and never holds a fraction', () => {
    expect(quantityOf(line(setQuantity(sheet, 'pocket-1', 't', 'tool', 0)), 'tool')).toBe(1)
    expect(quantityOf(line(setQuantity(sheet, 'pocket-1', 't', 'tool', 2.7)), 'tool')).toBe(2)
  })

  it('says nothing about a line that was never kept', () => {
    expect(setQuantity(sheet, 'nobody', 't', 'tool', 5)).toBe(sheet)
    expect(setQuantity(sheet, 'pocket-1', 'other', 'tool', 5)).toBe(sheet)
  })

  /** Each tool on a feature counts on its own, which is the point of holding two. */
  it('counts one tool without touching the other', () => {
    const both = addChoice(sheet, 'pocket-1', { toolGuid: 'finish' })
    const three = setQuantity(both, 'pocket-1', 'finish', 'tool', 3)

    expect(quantityOf(line(three, 'finish'), 'tool')).toBe(3)
    expect(quantityOf(line(three), 'tool')).toBe(1)
  })

  /**
   * Two of a setup is two of everything in it, and the per-component counts
   * are left alone — the total multiplies them (Paul, 2026-08-31).
   */
  it('multiplies rather than rewrites, when the assembly is doubled', () => {
    const two = setTotal(setQuantity(sheet, 'pocket-1', 't', 'tool', 3), 'pocket-1', 't', 2)

    expect(totalOf(line(two))).toBe(2)
    expect(quantityOf(line(two), 'tool')).toBe(3)
    expect(quantityOf(line(two), 'holder')).toBe(1)
  })

  it('reads an absent total as one, and stores one as nothing', () => {
    expect(totalOf(line(sheet))).toBe(1)
    expect(line(setTotal(setTotal(sheet, 'pocket-1', 't', 5), 'pocket-1', 't', 1))).toEqual({
      toolGuid: 't',
      holderGuid: 'h',
    })
  })
})
