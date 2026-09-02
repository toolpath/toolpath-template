import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { paneOf, threadPanes } from './thread-panes'

const tool = (guid: string, form: string): CatalogTool =>
  ({ guid, catalogNumber: guid, form, geometry: {} }) as unknown as CatalogTool

const DRILLS = [tool('D1', 'drill'), tool('D2', 'drill')]
const TAPS = [tool('T1', 'tap right hand'), tool('T2', 'tap right hand')]

describe('the two tools a threaded hole takes', () => {
  it('leads each tab with the best of its own list', () => {
    expect(threadPanes(DRILLS, TAPS, null)).toEqual({ drill: DRILLS[0], tap: TAPS[0] })
  })

  /** A tool picked in either list is the one its own tab shows; the other is unchanged. */
  it('shows the tool somebody picked on its own tab', () => {
    expect(threadPanes(DRILLS, TAPS, 'D2')).toEqual({ drill: DRILLS[1], tap: TAPS[0] })
    expect(threadPanes(DRILLS, TAPS, 'T2')).toEqual({ drill: DRILLS[0], tap: TAPS[1] })
  })

  /** A hole nothing taps still has its drill, and the tab says so by being empty. */
  it('says nothing where a list is empty', () => {
    expect(threadPanes(DRILLS, [], null).tap).toBeNull()
    expect(threadPanes([], TAPS, null).drill).toBeNull()
  })

  it('knows which tab a clicked tool belongs to', () => {
    expect(paneOf(tool('T1', 'tap right hand'))).toBe('tap')
    expect(paneOf(tool('D1', 'drill'))).toBe('drill')
    expect(paneOf(tool('M1', 'flat end mill'))).toBe('drill')
    // A tapered mill is a milling cutter, whatever its name starts with.
    expect(paneOf(tool('T1', 'tapered mill'))).toBe('drill')
  })
})
