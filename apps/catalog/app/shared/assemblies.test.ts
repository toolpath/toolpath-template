import { describe, expect, it } from 'vitest'
import type { Assembly, CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { assemblyLabel } from './assemblies'

const tool = { guid: 'tool-1', catalogNumber: 'TDMX0500' } as CatalogTool
const holder = { guid: 'holder-1', catalogNumber: 'BT30ER16060M' } as Holder
const collet = { guid: 'collet-1', catalogNumber: 'ER16-6' } as Collet

const assembly: Assembly = { holder, collet, tool, stickout: 40, maxStickout: 40 }

describe('assemblyLabel', () => {
  it('reads as the stack somebody orders, holder first', () => {
    expect(assemblyLabel(assembly)).toBe('BT30ER16060M + ER16-6 + TDMX0500')
  })

  it('leaves out a collet a bore holder does not use', () => {
    expect(assemblyLabel({ ...assembly, collet: null })).toBe('BT30ER16060M + TDMX0500')
  })
})
