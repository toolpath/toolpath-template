import { describe, expect, it } from 'vitest'
import type { Assembly, CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import {
  assemblyLabel,
  loadAssemblies,
  sameAssembly,
  saveAssemblies,
  withAssembly,
  withoutAssembly,
  type SavedAssembly,
} from './assemblies'

const tool = { guid: 'tool-1', catalogNumber: 'TDMX0500' } as CatalogTool
const holder = { guid: 'holder-1', catalogNumber: 'BT30ER16060M' } as Holder
const collet = { guid: 'collet-1', catalogNumber: 'ER16-6' } as Collet

const assembly: Assembly = { holder, collet, tool, stickout: 40, maxStickout: 40 }

/** The same stack as identities: guids and the stickout, and no geometry. */
const saved: SavedAssembly = {
  holderGuid: 'holder-1',
  colletGuid: 'collet-1',
  toolGuid: 'tool-1',
  stickout: 40,
}

const store = () => {
  const held = new Map<string, string>()
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  }
}

describe('assemblyLabel', () => {
  it('reads as the stack somebody orders, holder first', () => {
    expect(assemblyLabel(assembly)).toBe('BT30ER16060M + ER16-6 + TDMX0500')
  })

  it('leaves out a collet a bore holder does not use', () => {
    expect(assemblyLabel({ ...assembly, collet: null })).toBe('BT30ER16060M + TDMX0500')
  })
})

describe('what a saved assembly holds', () => {
  it('round-trips through storage', () => {
    const storage = store()
    saveAssemblies(storage, [saved])

    expect(loadAssemblies(storage)).toEqual([saved])
  })

  it('survives having no storage at all', () => {
    expect(loadAssemblies(null)).toEqual([])
    expect(() => saveAssemblies(null, [saved])).not.toThrow()
  })

  /** Somebody's saved list being unreadable is not an application error. */
  it('reads unparseable storage as an empty list', () => {
    const storage = store()
    storage.setItem('tool-catalog.assemblies', '{ not json')

    expect(loadAssemblies(storage)).toEqual([])
  })

  it('ignores entries that are not assemblies', () => {
    const storage = store()
    storage.setItem('tool-catalog.assemblies', JSON.stringify([{ nonsense: true }, saved]))

    expect(loadAssemblies(storage)).toEqual([saved])
  })
})

describe('keeping and dropping', () => {
  it('does not save the same stack twice', () => {
    expect(withAssembly([saved], saved)).toEqual([saved])
  })

  /** The same tool at a different stickout is a different decision. */
  it('treats a different stickout as a different assembly', () => {
    const longer = { ...saved, stickout: 55 }

    expect(sameAssembly(saved, longer)).toBe(false)
    expect(withAssembly([saved], longer)).toHaveLength(2)
  })

  it('drops exactly the one asked for', () => {
    const longer = { ...saved, stickout: 55 }

    expect(withoutAssembly([saved, longer], saved)).toEqual([longer])
  })
})
