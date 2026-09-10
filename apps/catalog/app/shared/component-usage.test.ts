import { describe, expect, it } from 'vitest'
import { sayUse, usedElsewhere, usesByGuid, type UsedRow } from './component-usage'
import { emptyAssembly, setSlot, type TreeAssembly } from './assembly-tree'

const stack = (over: Partial<TreeAssembly> = {}): TreeAssembly => ({
  ...emptyAssembly('assembly-1', 'cut'),
  toolGuid: 'tool-a',
  orderedTool: 'tool-a',
  ...over,
})

const row = (over: Partial<UsedRow> = {}): UsedRow => ({
  itemId: 'feature-1',
  name: '⌀8 Through Hole',
  lines: [{ toolGuid: 'tool-a', holderGuid: 'holder-a', colletGuid: 'collet-a' }],
  stacks: [stack()],
  ...over,
})

describe('where a component is already used', () => {
  it('names the feature and the assembly for every part of a line', () => {
    const uses = usesByGuid([row()])

    for (const guid of ['tool-a', 'holder-a', 'collet-a']) {
      expect(uses.get(guid)).toEqual([
        { feature: '⌀8 Through Hole', assembly: 'Assembly 1', itemId: 'feature-1' },
      ])
    }
  })

  /** A tap stack is called what the tree calls it, not "Assembly 1". */
  it('takes the stack its role gives it', () => {
    const uses = usesByGuid([row({ stacks: [stack({ role: 'tap' })] })])

    expect(uses.get('tool-a')?.[0]?.assembly).toBe('TAP')
  })

  /**
   * The link from a line to a stack is what the stack was *ordered* as, so a
   * cutter swapped in the tree after ordering still points at its own line.
   */
  it('finds the stack by what it was ordered as', () => {
    const swapped = stack({ toolGuid: 'tool-b', orderedTool: 'tool-a' })
    expect(usesByGuid([row({ stacks: [swapped] })]).get('tool-a')?.[0]?.assembly).toBe('Assembly 1')
  })

  /** A part answered before the tree existed still says which feature. */
  it('says the feature alone where no stack answers for the line', () => {
    const uses = usesByGuid([row({ stacks: [] })])
    expect(uses.get('tool-a')).toEqual([
      { feature: '⌀8 Through Hole', assembly: '', itemId: 'feature-1' },
    ])
    expect(sayUse(uses.get('tool-a')![0]!)).toBe('⌀8 Through Hole')
  })

  it('collects a component used on more than one feature', () => {
    const uses = usesByGuid([row(), row({ itemId: 'feature-2', name: 'Pocket' })])

    expect(uses.get('holder-a')?.map((use) => use.feature)).toEqual(['⌀8 Through Hole', 'Pocket'])
  })

  it('says a component standing in two stacks of one feature once for each', () => {
    const two = row({
      lines: [
        { toolGuid: 'tool-a', holderGuid: 'holder-a' },
        { toolGuid: 'tool-b', holderGuid: 'holder-a' },
      ],
      stacks: [stack(), stack({ id: 'assembly-2', toolGuid: 'tool-b', orderedTool: 'tool-b' })],
    })

    expect(
      usesByGuid([two])
        .get('holder-a')
        ?.map((use) => use.assembly),
    ).toEqual(['Assembly 1', 'Assembly 2'])
  })

  it('leaves out a slot the line does not hold', () => {
    expect(
      usesByGuid([row({ lines: [{ toolGuid: 'tool-a' }] })].map((each) => each)).get('holder-a'),
    ).toBeUndefined()
  })
})

describe('what the badge says', () => {
  const uses = usesByGuid([
    row(),
    row({ itemId: 'feature-2', name: 'Pocket' }),
    row({ itemId: 'feature-3', name: 'Slot' }),
  ])

  it('says nothing about the feature being answered', () => {
    expect(usedElsewhere(usesByGuid([row()]).get('tool-a') ?? [], 'feature-1')).toBeNull()
  })

  it('names the one other feature in full', () => {
    const two = usesByGuid([row(), row({ itemId: 'feature-2', name: 'Pocket' })])
    expect(usedElsewhere(two.get('tool-a') ?? [], 'feature-1')?.label).toBe(
      'on Pocket · Assembly 1',
    )
  })

  /** A badge is read at a glance; the rest are in the tooltip. */
  it('counts the rest rather than listing them on the row', () => {
    const said = usedElsewhere(uses.get('tool-a') ?? [], 'feature-1')
    expect(said?.label).toBe('on Pocket · Assembly 1 +1')
    expect(said?.title).toContain('Slot · Assembly 1')
  })

  it('says every use where none of them is the feature being answered', () => {
    expect(usedElsewhere(uses.get('tool-a') ?? [], null)?.label).toContain('⌀8 Through Hole')
  })
})

describe('the stack setSlot leaves behind', () => {
  /** A guard on the fixture itself: `setSlot` keeps `orderedTool` where it is. */
  it('keeps what a stack was ordered as when a slot changes', () => {
    const [changed] = setSlot([stack()], 'assembly-1', 'holder', 'holder-b')
    expect(changed?.orderedTool).toBe('tool-a')
  })
})
