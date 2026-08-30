import { describe, expect, it } from 'vitest'
import { clearChoice, emptySheet, readSheet, setChoice, writeSheet } from './setup-sheet'

const store = () => {
  const held = new Map<string, string>()
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  }
}

describe('the setup sheet', () => {
  it('stores guids and a stickout per feature, and nothing else', () => {
    const sheet = setChoice(emptySheet('part-1'), 'pocket-1', {
      toolGuid: 't',
      holderGuid: 'h',
      stickout: 30,
    })

    expect(sheet.choices['pocket-1']).toEqual({ toolGuid: 't', holderGuid: 'h', stickout: 30 })
  })

  it('removes a cleared feature rather than leaving a null behind', () => {
    const sheet = clearChoice(
      setChoice(emptySheet('part-1'), 'pocket-1', { toolGuid: 't' }),
      'pocket-1',
    )

    expect(Object.keys(sheet.choices)).toEqual([])
    expect(clearChoice(sheet, 'pocket-1')).toBe(sheet)
  })

  it('survives a reload, and reads another part’s sheet as empty', () => {
    const storage = store()
    writeSheet(storage, setChoice(emptySheet('part-1'), 'pocket-1', { toolGuid: 't' }))

    expect(readSheet(storage, 'part-1').choices['pocket-1']).toEqual({ toolGuid: 't' })
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
