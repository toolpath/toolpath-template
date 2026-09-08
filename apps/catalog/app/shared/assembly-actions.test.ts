import { describe, expect, it } from 'vitest'
import {
  assemblyActions,
  groupActions,
  holdingChanges,
  lineOf,
  nothingToConfirm,
  savedFor,
} from './assembly-actions'
import { emptyAssembly, type TreeAssembly } from './assembly-tree'
import type { Choice } from './setup-sheet'

const stack = (over: Partial<TreeAssembly> = {}): TreeAssembly => ({
  id: 'assembly-1',
  role: 'cut',
  toolGuid: 'tool-a',
  holderGuid: 'holder-a',
  colletGuid: null,
  ...over,
})

describe('the line a stack would write', () => {
  it('leaves out what was not chosen rather than writing a null', () => {
    expect(lineOf(stack())).toEqual({ toolGuid: 'tool-a', holderGuid: 'holder-a' })
  })

  it('writes nothing for a stack with no tool', () => {
    expect(lineOf(stack({ toolGuid: null }))).toBeNull()
  })
})

describe('what is offered', () => {
  it('offers nothing for a stack with no tool', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [])).toEqual([])
  })

  it('offers Add to order list where the tool is not on the bill for this feature', () => {
    expect(assemblyActions(stack(), []).map((each) => each.kind)).toEqual(['add'])
  })

  it('offers the update, the way back, and Remove where the holding has changed', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b' }]
    expect(assemblyActions(stack(), on).map((each) => each.kind)).toEqual([
      'update',
      'revert',
      'remove',
    ])
  })

  it('offers only Remove where nothing has changed', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    expect(assemblyActions(stack(), on).map((each) => each.kind)).toEqual(['remove'])
  })

  /**
   * **A stack is the line's identity, not its tool** (Paul, 2026-09-07: "when
   * editing an already active assembly, a tool not in the order list should say
   * 'replace' in the active assembly. Right now it is adding a new assembly to
   * the feature"). The sheet keys a line by its tool, so without `orderedTool`
   * the swapped cutter looked like a stack nobody had ordered.
   */
  describe('a stack that is on the order list with a different cutter in it', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    const swapped = stack({ toolGuid: 'tool-b', orderedTool: 'tool-a' })

    it('offers Replace rather than Add', () => {
      expect(assemblyActions(swapped, on).map((each) => each.kind)).toEqual(['replace', 'revert'])
    })

    it('names both cutters', () => {
      const named: Record<string, string> = { 'tool-a': 'TDMX0800', 'tool-b': 'TDMX1200' }
      expect(
        assemblyActions(swapped, on, true, 'feature', (guid) => named[guid] ?? null)[0]?.label,
      ).toBe('Replace TDMX0800 with TDMX1200')
    })

    it('says the change without a name it cannot resolve', () => {
      expect(assemblyActions(swapped, on)[0]?.label).toBe('Replace the tool on the order list')
    })

    it('flags the holding that moves with it', () => {
      const held = stack({ toolGuid: 'tool-b', orderedTool: 'tool-a', holderGuid: null })
      const named: Record<string, string> = { 'holder-a': 'BT30-ER16-100DT' }
      expect(
        assemblyActions(held, on, true, 'feature', (guid) => named[guid] ?? null)[0]?.note,
      ).toContain('BT30-ER16-100DT')
    })

    /** Nothing was written, so backing out is the tree going back to the line. */
    it('offers the way back beside it, and no Remove', () => {
      expect(assemblyActions(swapped, on).map((each) => each.kind)).not.toContain('remove')
    })

    it('finds no line for a stack that was never ordered', () => {
      expect(assemblyActions(stack({ toolGuid: 'tool-b' }), on).map((each) => each.kind)).toEqual([
        'add',
      ])
    })
  })

  it('reads an absent collet and a null collet as the same decision', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    expect(assemblyActions(stack({ colletGuid: null }), on).map((each) => each.kind)).toEqual([
      'remove',
    ])
  })
})

describe('a feature that is not a row yet', () => {
  it('offers one press that makes the feature and adds the stack', () => {
    const offered = assemblyActions(stack(), [], false)
    expect(offered.map((each) => each.kind)).toEqual(['confirm'])
    /*
      Named for where it puts the tool rather than for the row it writes
      against (Paul, 2026-09-07: "I should just have an 'add to order list'
      button (or update, context aware)"). That it makes the row as well is the
      note under it, because it is the half somebody would not expect.
    */
    expect(offered[0]?.label).toBe('Add to order list')
    expect(offered[0]?.note).toContain('feature list')
  })

  it('says group in the note where a group is what would be created', () => {
    expect(assemblyActions(stack(), [], false, 'group')[0]?.note).toContain('the group')
  })

  /**
   * The bill is not consulted for a row that does not exist: whatever is keyed
   * under some other feature's tag says nothing about this one.
   */
  it('offers the same press whatever the sheet already holds', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    expect(assemblyActions(stack(), on, false).map((each) => each.kind)).toEqual(['confirm'])
  })

  it('offers nothing while the stack has no tool, row or not', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [], false)).toEqual([])
  })

  it('treats a row as a row by default, so existing callers are unchanged', () => {
    expect(assemblyActions(stack(), []).map((each) => each.kind)).toEqual(['add'])
  })
})

describe('why there is nothing to confirm', () => {
  it('says nothing about a stack nobody has touched', () => {
    expect(nothingToConfirm(emptyAssembly('assembly-1', 'cut'))).toBeNull()
  })

  it('says a holder on its own is not orderable for a feature', () => {
    expect(nothingToConfirm(stack({ toolGuid: null }))).toContain('Pick a tool')
  })

  it('says nothing once there is a tool', () => {
    expect(nothingToConfirm(stack())).toBeNull()
  })
})

/**
 * **The button says what pressing it changes** (Paul, 2026-09-07). The stack is
 * drawn once, in the tree, so the panel's one job is to say what is different
 * about it — and a holder change takes the collet with it.
 */
describe('what the update button says', () => {
  const named: Record<string, string> = {
    'holder-a': 'BT30-ER16-100DT',
    'holder-b': 'BT30-ER11-60',
    'collet-a': '16ER100M',
    'collet-b': '11ER040M',
  }
  const nameOf = (guid: string) => named[guid] ?? null

  const label = (assembly: TreeAssembly, on: ReadonlyArray<Choice>) =>
    assemblyActions(assembly, on, true, 'feature', nameOf).find((each) => each.kind === 'update')

  it('names the holder it is changing from and to', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b' }]
    expect(label(stack(), on)?.label).toBe('Change holder from BT30-ER11-60 to BT30-ER16-100DT')
  })

  it('names the collet where the collet is what moved', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a', colletGuid: 'collet-a' }]
    const changed = stack({ colletGuid: 'collet-b' })
    expect(label(changed, on)?.label).toBe('Change collet from 16ER100M to 11ER040M')
  })

  it('names what it would take off, where a slot was cleared', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a', colletGuid: 'collet-a' }]
    expect(label(stack(), on)?.label).toBe('Take collet 16ER100M off')
  })

  it('says Add where the slot was empty on the bill', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    expect(label(stack({ colletGuid: 'collet-b' }), on)?.label).toBe('Add collet 11ER040M')
  })

  it('flags the collet that comes off with the holder', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b', colletGuid: 'collet-b' }]
    const offered = label(stack(), on)
    expect(offered?.label).toBe('Change holder from BT30-ER11-60 to BT30-ER16-100DT')
    expect(offered?.note).toContain('collet comes off with it')
    expect(offered?.note).toContain('11ER040M')
  })

  it('flags a collet that changes alongside the holder', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b', colletGuid: 'collet-b' }]
    const offered = label(stack({ colletGuid: 'collet-a' }), on)
    expect(offered?.label).toBe('Change holder from BT30-ER11-60 to BT30-ER16-100DT')
    expect(offered?.note).toBe('The collet changes with it: 11ER040M \u2192 16ER100M.')
  })

  /** A uuid on a button is worse than the shorter sentence without it. */
  it('says the change without a name it cannot resolve', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-z' }]
    expect(label(stack(), on)?.label).toBe('Change the holder')
  })

  it('still says which slot moved where no caller named anything', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b' }]
    expect(assemblyActions(stack(), on).find((each) => each.kind === 'update')?.label).toBe(
      'Change the holder',
    )
  })
})

describe('the slots that differ', () => {
  it('reads holder first, because a collet change follows it', () => {
    expect(
      holdingChanges(
        { toolGuid: 'tool-a', holderGuid: 'holder-a', colletGuid: 'collet-a' },
        { toolGuid: 'tool-a', holderGuid: 'holder-b' },
      ),
    ).toEqual([
      { slot: 'holder', from: 'holder-a', to: 'holder-b' },
      { slot: 'collet', from: 'collet-a', to: null },
    ])
  })

  it('reads an absent slot and a null slot as the same choice', () => {
    expect(
      holdingChanges({ toolGuid: 'tool-a' }, { toolGuid: 'tool-a', holderGuid: 'holder-a' }),
    ).toEqual([{ slot: 'holder', from: null, to: 'holder-a' }])
  })
})

/**
 * **A change can be backed out of** (Paul, 2026-09-07: "have a way to back out
 * — tell it I don't want to make any changes"). Cancel appears exactly when the
 * update does: they are the two answers to the same question.
 */
describe('backing out of a change', () => {
  const named: Record<string, string> = { 'holder-b': 'BT30-ER11-60' }
  const nameOf = (guid: string) => named[guid] ?? null

  it('offers Cancel beside the update, and nothing else changes order', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b' }]
    expect(assemblyActions(stack(), on, true, 'feature', nameOf).map((each) => each.kind)).toEqual([
      'update',
      'revert',
      'remove',
    ])
  })

  it('names what it would keep, so it does not read as cancelling the feature', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b' }]
    const offered = assemblyActions(stack(), on, true, 'feature', nameOf)
    expect(offered.find((each) => each.kind === 'revert')?.label).toBe('Cancel — keep BT30-ER11-60')
  })

  it('says the plain word where two slots moved and there is no one thing to name', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b', colletGuid: 'collet-b' }]
    const offered = assemblyActions(stack(), on, true, 'feature', nameOf)
    expect(offered.find((each) => each.kind === 'revert')?.label).toBe('Cancel')
  })

  it('is drawn quietly: it is the way back, not the press that goes forward', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-b' }]
    const offered = assemblyActions(stack(), on, true, 'feature', nameOf)
    expect(offered.find((each) => each.kind === 'revert')?.quiet).toBe(true)
  })

  it('offers no way back where nothing has changed', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    expect(assemblyActions(stack(), on).map((each) => each.kind)).toEqual(['remove'])
  })

  it('offers no way back for a stack that is not on the bill at all', () => {
    expect(assemblyActions(stack(), []).map((each) => each.kind)).toEqual(['add'])
  })
})

describe('the line the bill holds for a stack', () => {
  it('finds it by the tool, which is what makes an update an update', () => {
    const on = [
      { toolGuid: 'tool-b', holderGuid: 'holder-b' },
      { toolGuid: 'tool-a', holderGuid: 'holder-a' },
    ]
    expect(savedFor(stack(), on)).toEqual({ toolGuid: 'tool-a', holderGuid: 'holder-a' })
  })

  it('holds none for a stack with no tool', () => {
    expect(savedFor(stack({ toolGuid: null }), [{ toolGuid: 'tool-a' }])).toBeNull()
  })
})

/**
 * **One press for the full assembly** (Paul, 2026-09-08: "there should only be
 * one 'add to order list' button for the full assembly"). A threaded hole is a
 * tap with the drill that predrills it hanging under it, and it carried a press
 * per stack — two buttons for one decision, and a tap orderable on its own with
 * no hole under it to cut the thread in.
 */
describe('what a whole assembly offers', () => {
  const tap = stack({ id: 'assembly-1', role: 'tap', toolGuid: 'tap-a', colletGuid: 'collet-a' })
  const drill = stack({
    id: 'assembly-2',
    role: 'drill',
    toolGuid: 'drill-a',
    holderGuid: 'holder-b',
    colletGuid: 'collet-b',
  })
  const named: Record<string, string> = {
    'tap-a': 'A0101001.5037',
    'tap-b': 'A0101001.6000',
    'drill-a': 'TE239744.0225',
    'holder-a': 'BT30-ER11-110DT',
    'holder-b': 'BT30-ER11-60M',
    'holder-c': 'BT30-ER16-100DT',
  }
  const nameOf = (guid: string) => named[guid] ?? null
  const offered = (
    stacks: ReadonlyArray<TreeAssembly>,
    onSheet: ReadonlyArray<Choice>,
    onList = true,
  ) => groupActions(stacks, onSheet, onList, 'feature', nameOf)

  /** A group of one is a stack, and every label it has ever said is unchanged. */
  it('is the stack’s own rule where there is only one stack', () => {
    expect(groupActions([stack()], [])).toEqual(assemblyActions(stack(), []))
  })

  it('offers one press for the tap and the drill together', () => {
    expect(offered([tap, drill], []).map((each) => each.kind)).toEqual(['add'])
  })

  it('offers nothing where no stack of it has a tool', () => {
    expect(
      offered([emptyAssembly('assembly-1', 'tap'), emptyAssembly('assembly-2', 'drill')], []),
    ).toEqual([])
  })

  it('makes the feature and writes the assembly in one press', () => {
    const [first] = offered([tap, drill], [], false)
    expect(first?.kind).toBe('confirm')
    expect(first?.note).toContain('feature list')
  })

  it('offers the way off the list once every stack of it is on there', () => {
    const on = [lineOf(tap)!, lineOf(drill)!]
    expect(offered([tap, drill], on).map((each) => each.kind)).toEqual(['remove'])
  })

  /**
   * A drill chosen for a thread that was ordered without one is an addition to
   * the assembly, not a change to it — and the sentence names which stack.
   */
  it('names the stack a change is about', () => {
    const on = [lineOf(tap)!]
    const [first] = offered([tap, drill], on)
    expect(first?.kind).toBe('update')
    expect(first?.label).toBe('Add drill TE239744.0225')
  })

  it('says the tap’s holder change on the button and the drill’s under it', () => {
    const on = [lineOf(tap)!, lineOf(drill)!]
    const moved = [
      { ...tap, holderGuid: 'holder-c' },
      { ...drill, holderGuid: 'holder-a' },
    ]
    const [first, second] = offered(moved, on)
    expect(first?.label).toBe('TAP: Change holder from BT30-ER11-110DT to BT30-ER16-100DT')
    expect(first?.note).toContain('DRILL: Change holder from BT30-ER11-60M to BT30-ER11-110DT')
    // And the way back out of it, exactly where the change is.
    expect(second?.kind).toBe('revert')
  })

  it('reads a swapped cutter in an ordered assembly as a replacement', () => {
    const on = [lineOf(tap)!, lineOf(drill)!]
    // `orderedTool` is the link back to the line: what the press wrote there.
    const swapped = [{ ...tap, toolGuid: 'tap-b', orderedTool: 'tap-a' }, drill]
    const [first] = offered(swapped, on)
    expect(first?.kind).toBe('replace')
    expect(first?.label).toBe('Replace A0101001.5037 with A0101001.6000')
  })
})
