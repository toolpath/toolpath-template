import { describe, expect, it } from 'vitest'
import {
  mapTool,
  mappingFor,
  passProgress,
  planProgress,
  strayMappings,
  toolsInPlan,
  unmap,
  unmappedFeatures,
  type Plan,
} from './mapping.js'
import type { Assembly, Collet, Holder } from './toolholding.js'
import type { CatalogTool } from './types.js'

const tool = (guid: string): CatalogTool =>
  ({ guid, catalogNumber: guid.toUpperCase(), geometry: {} }) as unknown as CatalogTool

const assembly: Assembly = {
  holder: { guid: 'holder-1' } as Holder,
  collet: { guid: 'collet-1' } as Collet,
  tool: tool('t1'),
  stickout: 40,
  maxStickout: 40,
}

const TAGS = ['pocket-1', 'hole-1', 'slot-1']

describe('mapping a tool to a feature', () => {
  it('records the tool for one feature and one pass', () => {
    const plan = mapTool([], 'pocket-1', 'rough', tool('t1'))

    expect(mappingFor(plan, 'pocket-1', 'rough')?.toolGuid).toBe('t1')
    expect(mappingFor(plan, 'pocket-1', 'finish')).toBeNull()
  })

  /** Mapping a second tool is a correction, not an addition. */
  it('replaces the tool already mapped for that pass', () => {
    const plan = mapTool(
      mapTool([], 'pocket-1', 'rough', tool('t1')),
      'pocket-1',
      'rough',
      tool('t2'),
    )

    expect(plan).toHaveLength(1)
    expect(mappingFor(plan, 'pocket-1', 'rough')?.toolGuid).toBe('t2')
  })

  it('keeps roughing and finishing apart', () => {
    const plan = mapTool(
      mapTool([], 'pocket-1', 'rough', tool('t1')),
      'pocket-1',
      'finish',
      tool('t2'),
    )

    expect(mappingFor(plan, 'pocket-1', 'rough')?.toolGuid).toBe('t1')
    expect(mappingFor(plan, 'pocket-1', 'finish')?.toolGuid).toBe('t2')
  })

  it('remembers the assembly a tool was mapped with', () => {
    const plan = mapTool([], 'pocket-1', 'rough', tool('t1'), assembly)

    expect(mappingFor(plan, 'pocket-1', 'rough')).toMatchObject({
      holderGuid: 'holder-1',
      colletGuid: 'collet-1',
      stickout: 40,
    })
  })

  /** Identity only: a rebuilt catalog must not leave a stale diameter in a plan. */
  it('stores identities and no geometry', () => {
    const mapping = mapTool([], 'pocket-1', 'rough', tool('t1'))[0]!

    expect(Object.keys(mapping).sort()).toEqual([
      'colletGuid',
      'featureTag',
      'holderGuid',
      'pass',
      'stickout',
      'toolGuid',
    ])
  })

  it('unmaps one pass and leaves the other alone', () => {
    const both = mapTool(
      mapTool([], 'pocket-1', 'rough', tool('t1')),
      'pocket-1',
      'finish',
      tool('t2'),
    )
    const plan = unmap(both, 'pocket-1', 'rough')

    expect(mappingFor(plan, 'pocket-1', 'rough')).toBeNull()
    expect(mappingFor(plan, 'pocket-1', 'finish')?.toolGuid).toBe('t2')
  })
})

describe('progress, counted in features', () => {
  it('counts each pass separately', () => {
    const plan: Plan = [
      ...mapTool([], 'pocket-1', 'rough', tool('t1')),
      ...mapTool([], 'hole-1', 'rough', tool('t2')),
      ...mapTool([], 'pocket-1', 'finish', tool('t3')),
    ]

    expect(planProgress(plan, TAGS)).toEqual([
      { pass: 'rough', mapped: 2, total: 3, fraction: 2 / 3 },
      { pass: 'finish', mapped: 1, total: 3, fraction: 1 / 3 },
    ])
  })

  it('counts a feature once however many times it was remapped', () => {
    const plan = mapTool(
      mapTool([], 'pocket-1', 'rough', tool('t1')),
      'pocket-1',
      'rough',
      tool('t2'),
    )

    expect(passProgress(plan, TAGS, 'rough').mapped).toBe(1)
  })

  it('is zero rather than a division by zero on a part with no features', () => {
    expect(passProgress([], [], 'rough')).toEqual({
      pass: 'rough',
      mapped: 0,
      total: 0,
      fraction: 0,
    })
  })

  /** A plan for another part must not inflate this one's progress. */
  it('ignores mappings for features this part does not have', () => {
    const plan = mapTool([], 'from-another-part', 'rough', tool('t1'))

    expect(passProgress(plan, TAGS, 'rough').mapped).toBe(0)
    expect(strayMappings(plan, TAGS)).toHaveLength(1)
  })
})

describe('what is left', () => {
  it('names the features with nothing mapped, in the part’s own order', () => {
    const plan = mapTool([], 'hole-1', 'rough', tool('t1'))

    expect(unmappedFeatures(plan, TAGS, 'rough')).toEqual(['pocket-1', 'slot-1'])
    expect(unmappedFeatures(plan, TAGS, 'finish')).toEqual(TAGS)
  })

  it('lists each tool a plan calls for once', () => {
    const plan: Plan = [
      ...mapTool([], 'pocket-1', 'rough', tool('t1')),
      ...mapTool([], 'hole-1', 'rough', tool('t1')),
      ...mapTool([], 'slot-1', 'finish', tool('t2')),
    ]

    expect(toolsInPlan(plan).sort()).toEqual(['t1', 't2'])
  })
})
