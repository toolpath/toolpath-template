import { describe, expect, it } from 'vitest'
import {
  assemblyActions,
  groupActions,
  holdingChanges,
  lineOf,
  nothingToConfirm,
  orderingPress,
  savedFor,
} from './assembly-actions'
import { emptyAssembly, type TreeAssembly } from './assembly-tree'
import type { Choice } from './setup-sheet'

/**
 * A stack that has been ordered as `tool-a`, which is what links it to a line.
 *
 * `orderedTool` is the whole of that link — a stack nobody has ordered adopts no
 * line, however familiar the cutter in it (Paul, 2026-09-10) — so a fixture that
 * left it out was a fixture asking about a stack that is not on the bill, and
 * the tests below are about ones that are. Swapping the *tool* over it is how a
 * replacement is written: the stack keeps what it was ordered as.
 */
const stack = (over: Partial<TreeAssembly> = {}): TreeAssembly => ({
  id: 'assembly-1',
  role: 'cut',
  toolGuid: 'tool-a',
  holderGuid: 'holder-a',
  colletGuid: null,
  orderedTool: 'tool-a',
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
  /**
   * **The press is on screen from the start, greyed** (Paul, 2026-09-09: "Add
   * to order list should be shown by default but greyed out until a component
   * is selected. Right now it is hidden by default"). Same words and same
   * place as the press it becomes, so picking a tool changes whether it can be
   * pressed and nothing else about it.
   */
  it('offers the press greyed out for a stack with no tool', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [])[0]).toEqual({
      kind: 'add',
      label: 'Add to order list',
      disabled: true,
    })
  })

  /**
   * **The emptied box is not a dead end** (Paul, 2026-09-11: "if I have removed
   * all the tools from an assembly on a feature, it should give me the option
   * to remove the feature as the button. This is a spot you can get stuck
   * currently"). The greyed press was the whole of what a row on the list with
   * an emptied tree offered, so the one thing somebody had just said — *nothing
   * goes here after all* — had no press to finish it.
   */
  it('offers the row itself off the list where it is on it with no tool left', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [])).toEqual([
      { kind: 'add', label: 'Add to order list', disabled: true },
      { kind: 'drop', label: 'Remove feature from list', danger: true },
    ])
  })

  it('names the row it would take off, for each kind of row', () => {
    const labelled = (subject: 'feature' | 'group' | 'assembly') =>
      assemblyActions(stack({ toolGuid: null }), [], true, subject).find(
        (each) => each.kind === 'drop',
      )?.label
    expect(labelled('group')).toBe('Remove group from list')
    expect(labelled('assembly')).toBe('Remove tool assembly from list')
  })

  /** Nothing to take off a list the row is not on yet — that is Cancel's job. */
  it('offers no removal where the row is not on the list yet', () => {
    expect(
      assemblyActions(stack({ toolGuid: null }), [], false).map((each) => each.kind),
    ).not.toContain('drop')
  })

  /**
   * The greyed press only stands where there is nothing to order. A stack with
   * a tool in it has a press that works, so nothing is offered beside it.
   */
  it('offers no removal while there is still a tool in the stack', () => {
    expect(assemblyActions(stack(), []).map((each) => each.kind)).not.toContain('drop')
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
      expect(
        assemblyActions(stack({ toolGuid: 'tool-b', orderedTool: null }), on).map(
          (each) => each.kind,
        ),
      ).toEqual(['add'])
    })

    /**
     * **A second stack given the first's cutter is still a new stack** (Paul,
     * 2026-09-10: "when I select the same tool as a second assembly for a
     * feature, it autofills everything and does some odd stuff … secondary
     * assemblies added to a feature or group should be treated as unique, new
     * assemblies").
     *
     * `savedFor` fell back to the tool standing in the stack, so the new one
     * found the line the *other* stack had ordered and became it: its empty
     * holder slot drew that stack's holder struck through to a dash, and the
     * press under it offered to take that holder off.
     */
    it('adopts no line for a new stack holding a cutter another one ordered', () => {
      const fresh = stack({
        id: 'assembly-2',
        toolGuid: 'tool-a',
        holderGuid: null,
        orderedTool: null,
      })

      expect(savedFor(fresh, on)).toBeNull()
      expect(assemblyActions(fresh, on).map((each) => each.kind)).toEqual(['add'])
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
      button (or update, context aware)"). It makes the row as well, and says
      nothing about that: the note under it came out on 2026-09-11.
    */
    expect(offered[0]?.label).toBe('Add to order list')
    expect(offered[0]?.note).toBeUndefined()
  })

  it('says nothing under the press where a group is what would be created', () => {
    expect(assemblyActions(stack(), [], false, 'group')[0]?.note).toBeUndefined()
  })

  /**
   * The bill is not consulted for a row that does not exist: whatever is keyed
   * under some other feature's tag says nothing about this one.
   */
  it('offers the same press whatever the sheet already holds', () => {
    const on = [{ toolGuid: 'tool-a', holderGuid: 'holder-a' }]
    expect(assemblyActions(stack(), on, false).map((each) => each.kind)).toEqual(['confirm'])
  })

  /**
   * **A feature can be kept before it is answered** (Paul, 2026-09-10: "I should
   * be able to create a feature or group without adding a tool"). The greyed
   * press stays where there is nothing left to do — the row exists already — and
   * where there is no row yet it becomes the one thing an empty stack *can* do.
   */
  it('offers the row itself where there is no row yet and no tool', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [], false)).toEqual([
      { kind: 'list', label: 'Add feature to list' },
    ])
  })

  it('names the group where a group is what would be made', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [], false, 'group')[0]?.label).toBe(
      'Add group to list',
    )
  })

  /**
   * A part-level assembly *is* its order — "Tool assembly 3" with nothing in it
   * is a row about nothing — so it keeps the greyed press (Paul, 2026-09-08).
   */
  it('keeps the greyed press for a tool assembly with nothing in it', () => {
    expect(assemblyActions(stack({ toolGuid: null }), [], false, 'assembly')).toEqual([
      { kind: 'confirm', label: 'Add to order list', disabled: true },
    ])
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

  it('holds none for a stack nobody has ordered, whatever is standing in it', () => {
    expect(savedFor(stack({ toolGuid: null, orderedTool: null }), [{ toolGuid: 'tool-a' }])).toBe(
      null,
    )
    // Including one holding the very tool the line is for: the link is the
    // ordering, not the cutter.
    expect(savedFor(stack({ orderedTool: null }), [{ toolGuid: 'tool-a' }])).toBeNull()
  })

  /**
   * A stack that *was* ordered still holds its line once the tool is cleared out
   * of it — that is what the way back off the change is drawn from.
   */
  it('still holds the line of an ordered stack somebody has emptied', () => {
    expect(savedFor(stack({ toolGuid: null }), [{ toolGuid: 'tool-a' }])).toEqual({
      toolGuid: 'tool-a',
    })
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
  const tap = stack({
    id: 'assembly-1',
    role: 'tap',
    toolGuid: 'tap-a',
    colletGuid: 'collet-a',
    orderedTool: 'tap-a',
  })
  const drill = stack({
    id: 'assembly-2',
    role: 'drill',
    toolGuid: 'drill-a',
    holderGuid: 'holder-b',
    colletGuid: 'collet-b',
    orderedTool: 'drill-a',
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

  it('greys the one press where no stack of it has a tool', () => {
    expect(
      offered([emptyAssembly('assembly-1', 'tap'), emptyAssembly('assembly-2', 'drill')], []).map(
        (each) => each.kind,
      ),
    ).toEqual(['add', 'drop'])
  })

  /**
   * The press under the box reads every stack in the tree, so a threaded hole
   * emptied of both its tap and its drill is the same dead end a single stack
   * was (Paul, 2026-09-11).
   */
  it('offers the feature off the list where the tap and the drill are both emptied', () => {
    const [, second] = offered(
      [emptyAssembly('assembly-1', 'tap'), emptyAssembly('assembly-2', 'drill')],
      [],
    )
    expect(second).toEqual({ kind: 'drop', label: 'Remove feature from list', danger: true })
  })

  /** The same reversal, over a group of stacks: an empty tree can still be kept. */
  it('offers the row itself where a tap and a drill are both empty and new', () => {
    const [first] = offered(
      [emptyAssembly('assembly-1', 'tap'), emptyAssembly('assembly-2', 'drill')],
      [],
      false,
    )
    expect(first?.kind).toBe('list')
    expect(first?.label).toBe('Add feature to list')
  })

  it('makes the feature and writes the assembly in one press', () => {
    const [first] = offered([tap, drill], [], false)
    expect(first?.kind).toBe('confirm')
    expect(first?.note).toBeUndefined()
  })

  /**
   * **A tool assembly the part needs is named for itself** (Paul, 2026-09-08).
   * It answers no feature, and it is a draft until this press precisely because
   * an assembly with nothing on the order list is a row about nothing. The
   * press carries no note of its own — Paul took all three out on 2026-09-11.
   */
  it('offers the one press where there is no feature', () => {
    const [first] = groupActions([stack()], [], false, 'assembly')
    expect(first?.kind).toBe('confirm')
    expect(first?.note).toBeUndefined()
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

describe('orderingPress', () => {
  it('is the press that puts the stack on the order list', () => {
    expect(orderingPress([{ kind: 'confirm' }, { kind: 'revert' }])).toEqual({ kind: 'confirm' })
    expect(orderingPress([{ kind: 'replace' }, { kind: 'revert' }])).toEqual({ kind: 'replace' })
    expect(orderingPress([{ kind: 'update' }, { kind: 'revert' }])).toEqual({ kind: 'update' })
  })

  it('is nothing where the stack has nothing to order', () => {
    // The greyed press an empty stack offers: Enter must not fire it.
    expect(orderingPress([{ kind: 'confirm', disabled: true }])).toBeNull()
    expect(orderingPress([])).toBeNull()
  })

  /*
    The press that keeps an unanswered feature orders nothing, and Enter still
    reaches it: what both rules are about is the press that finishes the box.
  */
  it('is the press that keeps the feature where that is all there is', () => {
    expect(orderingPress([{ kind: 'list' }])).toEqual({ kind: 'list' })
  })

  it('never takes something off the list', () => {
    // Enter is the way *on*. Remove and Cancel are presses somebody makes.
    expect(orderingPress([{ kind: 'remove' }])).toBeNull()
    expect(orderingPress([{ kind: 'revert' }])).toBeNull()
    /* And not the one that takes the row itself off: a key that can delete a
       feature is a key nobody can press with confidence. */
    expect(orderingPress([{ kind: 'add', disabled: true }, { kind: 'drop' }])).toBeNull()
  })
})
