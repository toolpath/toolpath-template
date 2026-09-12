import { describe, expect, it } from 'vitest'
import {
  DRAFT_TREE,
  addAssembly,
  assemblyName,
  defaultAssemblyName,
  renameAssembly,
  defaultAssemblies,
  draftKeyFor,
  emptyAssembly,
  firstNode,
  forThread,
  guidAt,
  hasOverride,
  heldIn,
  isEmpty,
  isOverride,
  linesOf,
  nextAssemblyId,
  orderedAs,
  readTrees,
  groupOf,
  removeAssembly,
  restoreAssembly,
  sameNode,
  setSlot,
  sharedPhrase,
  sharedWith,
  slotLabel,
  stacksOf,
  treeFromLines,
  treeGroups,
  treeRows,
  writeTrees,
  type TreeAssembly,
} from './assembly-tree'
import { nextId } from './feature-list'

const filled: TreeAssembly = {
  id: 'assembly-1',
  role: 'cut',
  toolGuid: 'tool-a',
  holderGuid: 'holder-a',
  colletGuid: 'collet-a',
}

describe('what a feature starts with', () => {
  it('gives an ordinary feature one stack', () => {
    const made = defaultAssemblies(false)
    expect(made).toHaveLength(1)
    expect(made[0]?.role).toBe('cut')
  })

  it('gives a threaded hole a tap and a drill, tap first', () => {
    expect(defaultAssemblies(true).map((each) => each.role)).toEqual(['tap', 'drill'])
  })

  it('names the tool slot after the role it is for', () => {
    const [tap, drill] = defaultAssemblies(true)
    expect(slotLabel(tap!, 'tool')).toBe('TAP')
    expect(slotLabel(drill!, 'tool')).toBe('DRILL')
    expect(slotLabel(tap!, 'holder')).toBe('HOLDER')
  })
})

/**
 * **A hole is plain until somebody says otherwise, and its stacks say the
 * same** (Paul, 2026-09-07: "after I define one set of holes as threaded, it
 * defaults to finding a tap for any new hole selection — new hole selections
 * should be treated as new and default to plain").
 *
 * A tree is kept in the browser and a thread is not, so a tap stack outlived
 * the reading that asked for it: the table opened on the taps for a hole the
 * panel above it called plain.
 */
describe('the stacks following the thread', () => {
  it('opens a tap and a drill once the hole is given a thread', () => {
    expect(forThread(defaultAssemblies(false), true).map((each) => each.role)).toEqual([
      'tap',
      'drill',
    ])
  })

  it('goes back to one stack on a hole nobody has called threaded', () => {
    expect(forThread(defaultAssemblies(true), false).map((each) => each.role)).toEqual(['cut'])
  })

  it('leaves a tree that already matches the thread alone', () => {
    const held = defaultAssemblies(true)
    expect(forThread(held, true)).toBe(held)
  })

  /**
   * **Work is never thrown away by a reading changing underneath it.** A stack
   * with a component in it is somebody's answer; only empty stacks are the
   * page's own opening position to correct.
   */
  it('keeps stacks that hold something, whatever the thread says', () => {
    const built = setSlot(defaultAssemblies(true), 'assembly-1', 'tool', 'tap-a')
    expect(forThread(built, false)).toBe(built)
    expect(forThread([filled], true)).toEqual([filled])
  })
})

/**
 * **The drill hangs off the tap it predrills** (Paul, 2026-09-07: "the drill is
 * dependent on the tap, but both the drill and the tap may have their own
 * holder and collet"). Drawn as stacks of equal rank they read as two answers
 * to one question rather than one answer taking two tools in an order.
 */
describe('how the stacks nest', () => {
  it('hangs a threaded hole’s drill under its tap', () => {
    expect(treeRows(defaultAssemblies(true))).toEqual([
      { assembly: defaultAssemblies(true)[0], depth: 0 },
      { assembly: defaultAssemblies(true)[1], depth: 1 },
    ])
  })

  it('leaves every ordinary stack a root of its own', () => {
    const two = addAssembly(defaultAssemblies(false))
    expect(treeRows(two).map((row) => row.depth)).toEqual([0, 0])
  })

  /** A drill with no tap above it is a hole in its own right, not a child. */
  it('makes a lone drill a stack of its own', () => {
    expect(treeRows([emptyAssembly('assembly-1', 'drill')])[0]?.depth).toBe(0)
  })

  /**
   * **A group is one assembly** (Paul, 2026-09-08: "there should only be one
   * 'add to order list' button for the full assembly"), so the tap and the
   * drill under it come back as one thing to press a button about.
   */
  it('gathers a threaded hole into one group', () => {
    const groups = treeGroups(defaultAssemblies(true))
    expect(groups).toHaveLength(1)
    expect(stacksOf(groups[0]!).map((each) => each.role)).toEqual(['tap', 'drill'])
  })

  it('finds the group a stack stands in, child or root', () => {
    const made = defaultAssemblies(true)
    expect(groupOf(made, 'assembly-2')?.root.role).toBe('tap')
    expect(groupOf(made, 'nothing')).toBeNull()
  })

  /** Drawn tap-first even where the bill happens to hold the drill first. */
  it('draws the tap before the drill it predrills', () => {
    const back = [emptyAssembly('assembly-1', 'drill'), emptyAssembly('assembly-2', 'tap')]
    expect(treeRows(back).map((row) => [row.assembly.role, row.depth])).toEqual([
      ['tap', 0],
      ['drill', 1],
    ])
  })
})

describe('ids', () => {
  it('reads the next off the tree rather than a clock', () => {
    expect(nextAssemblyId(defaultAssemblies(true))).toBe('assembly-3')
    expect(nextAssemblyId([])).toBe('assembly-1')
  })

  it('adds an empty stack on the end', () => {
    const made = addAssembly(defaultAssemblies(false))
    expect(made).toHaveLength(2)
    expect(isEmpty(made[1]!)).toBe(true)
  })
})

describe('filling a slot', () => {
  it('puts a guid in the slot named', () => {
    const made = setSlot(defaultAssemblies(false), 'assembly-1', 'holder', 'holder-a')
    expect(guidAt(made[0]!, 'holder')).toBe('holder-a')
  })

  it('clears the collet when the holder changes, because a series is an interface', () => {
    const made = setSlot([filled], 'assembly-1', 'holder', 'holder-b')
    expect(made[0]?.holderGuid).toBe('holder-b')
    expect(made[0]?.colletGuid).toBeNull()
  })

  it('leaves the tool alone when the collet changes', () => {
    const made = setSlot([filled], 'assembly-1', 'collet', 'collet-b')
    expect(made[0]?.toolGuid).toBe('tool-a')
  })

  it('empties a slot with null', () => {
    expect(setSlot([filled], 'assembly-1', 'tool', null)[0]?.toolGuid).toBeNull()
  })
})

/**
 * **A choice made against the rules is a fact about the choice** (Paul,
 * 2026-09-08: "a small warning should show in the tree denoting that I chose a
 * geometrically incompatible tool"). It is kept rather than derived because the
 * verdict that produced it is a property of the filters that were set at the
 * time, and those change under the stack.
 */
describe('overriding the rules', () => {
  it('marks the slot the override went into, and no other', () => {
    const made = setSlot([filled], 'assembly-1', 'tool', 'tool-b', true)
    expect(isOverride(made[0]!, 'tool')).toBe(true)
    expect(isOverride(made[0]!, 'holder')).toBe(false)
    expect(hasOverride(made[0]!)).toBe(true)
  })

  it('takes the mark off when the same slot is filled with something that fits', () => {
    const over = setSlot([filled], 'assembly-1', 'tool', 'tool-b', true)
    const back = setSlot(over, 'assembly-1', 'tool', 'tool-c')
    expect(isOverride(back[0]!, 'tool')).toBe(false)
    expect(hasOverride(back[0]!)).toBe(false)
  })

  it('takes it off when the slot is cleared, so no warning outlives its choice', () => {
    const over = setSlot([filled], 'assembly-1', 'collet', 'collet-b', true)
    expect(isOverride(setSlot(over, 'assembly-1', 'collet', null)[0]!, 'collet')).toBe(false)
  })

  /** The collet goes when the holder changes, so a warning about it goes too. */
  it('drops the collet mark with the collet on a holder change', () => {
    const over = setSlot([filled], 'assembly-1', 'collet', 'collet-b', true)
    const swapped = setSlot(over, 'assembly-1', 'holder', 'holder-b')
    expect(swapped[0]?.colletGuid).toBeNull()
    expect(isOverride(swapped[0]!, 'collet')).toBe(false)
  })

  it('leaves the other stacks of the tree alone', () => {
    const two = addAssembly([filled])
    const made = setSlot(two, 'assembly-1', 'tool', 'tool-b', true)
    expect(hasOverride(made[1]!)).toBe(false)
  })

  it('clears every mark when a stack is put back to the line the bill holds', () => {
    const over = setSlot([filled], 'assembly-1', 'tool', 'tool-b', true)
    const back = restoreAssembly(over, 'assembly-1', { toolGuid: 'tool-a' })
    expect(hasOverride(back[0]!)).toBe(false)
  })

  it('survives the round trip through storage', () => {
    const over = setSlot([filled], 'assembly-1', 'tool', 'tool-b', true)
    const held = new Map<string, string>()
    const storage = {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
    }
    writeTrees(storage, 'part-1', { 'feature-1': over })
    expect(isOverride(readTrees(storage, 'part-1')['feature-1']?.[0] as TreeAssembly, 'tool')).toBe(
      true,
    )
  })

  /** A tree stored before the field existed reads as nothing overridden. */
  it('reads a tree with no record of one as nothing overridden', () => {
    expect(hasOverride(filled)).toBe(false)
    expect(isOverride(filled, 'tool')).toBe(false)
  })
})

describe('removing', () => {
  it('takes the stack off', () => {
    const three = addAssembly(defaultAssemblies(false))
    expect(removeAssembly(three, 'assembly-1').map((each) => each.id)).toEqual(['assembly-2'])
  })

  /**
   * **The trash takes the whole assembly** (Paul, 2026-09-08). A tap taken off
   * on its own leaves a drill hanging under nothing, which the next read turns
   * into a stack of its own: a hole drilled for a thread nobody is cutting.
   */
  it('takes the drill with the tap it hangs under', () => {
    const made = removeAssembly(addAssembly(defaultAssemblies(true)), 'assembly-1')
    expect(made.map((each) => each.role)).toEqual(['cut'])
  })

  /** And removing the drill leaves the tap: what hangs under it is nothing. */
  it('leaves the tap when the drill goes', () => {
    expect(removeAssembly(defaultAssemblies(true), 'assembly-2').map((each) => each.role)).toEqual([
      'tap',
    ])
  })

  it('empties the last one rather than leaving a feature with no stack to click', () => {
    const made = removeAssembly([filled], 'assembly-1')
    expect(made).toHaveLength(1)
    expect(isEmpty(made[0]!)).toBe(true)
  })
})

describe('where the tree opens', () => {
  it('lands on the first slot nobody has filled', () => {
    const made = setSlot(defaultAssemblies(false), 'assembly-1', 'tool', 'tool-a')
    expect(firstNode(made)).toEqual({ assemblyId: 'assembly-1', slot: 'holder' })
  })

  it('lands on the first tool when everything is filled', () => {
    expect(firstNode([filled])).toEqual({ assemblyId: 'assembly-1', slot: 'tool' })
  })

  it('has nowhere to go on an empty tree', () => {
    expect(firstNode([])).toBeNull()
  })

  it('tells two nodes apart', () => {
    expect(sameNode({ assemblyId: 'a', slot: 'tool' }, { assemblyId: 'a', slot: 'tool' })).toBe(
      true,
    )
    expect(sameNode({ assemblyId: 'a', slot: 'tool' }, { assemblyId: 'a', slot: 'holder' })).toBe(
      false,
    )
    expect(sameNode(null, { assemblyId: 'a', slot: 'tool' })).toBe(false)
  })
})

describe('the stack a line of the bill stands for', () => {
  const second: TreeAssembly = {
    id: 'assembly-2',
    role: 'cut',
    toolGuid: 'tool-b',
    holderGuid: null,
    colletGuid: null,
  }

  it("finds the stack holding the line's tool", () => {
    expect(orderedAs([filled, second], 'tool-b')?.id).toBe('assembly-2')
  })

  it('answers by what the stack was ordered as, not what stands in it now', () => {
    // The cutter was swapped after the line was written; the line still belongs
    // to this stack, which is what keeps a press on it opening that stack.
    const swapped: TreeAssembly = { ...filled, toolGuid: 'tool-c', orderedTool: 'tool-a' }
    expect(orderedAs([swapped, second], 'tool-a')?.id).toBe('assembly-1')
    expect(orderedAs([swapped, second], 'tool-c')).toBeNull()
  })

  it('has no stack for a line no tree holds', () => {
    expect(orderedAs([filled], 'tool-z')).toBeNull()
  })
})

describe('the bill', () => {
  it('writes a line only for a stack that has a tool', () => {
    expect(linesOf([filled, emptyAssembly('assembly-2', 'cut')])).toEqual([
      { toolGuid: 'tool-a', holderGuid: 'holder-a', colletGuid: 'collet-a' },
    ])
  })

  it('leaves a holder with no tool off it — there is nothing to order yet', () => {
    const held = setSlot(defaultAssemblies(false), 'assembly-1', 'holder', 'holder-a')
    expect(linesOf(held)).toEqual([])
  })

  it('writes a tool-only line without inventing a holder', () => {
    const made = setSlot(defaultAssemblies(false), 'assembly-1', 'tool', 'tool-a')
    expect(linesOf(made)).toEqual([{ toolGuid: 'tool-a' }])
  })

  it('reads a tree back off lines already on the bill', () => {
    const made = treeFromLines([{ toolGuid: 'tap-a' }, { toolGuid: 'drill-a' }], true)
    expect(made.map((each) => each.role)).toEqual(['tap', 'drill'])
    expect(made[1]?.toolGuid).toBe('drill-a')
  })

  /**
   * **The bill is not in the tree's order.** Roles handed out by position gave
   * a threaded hole whose drill was billed first a drill labelled `TAP`,
   * opening the tap list on a drill.
   */
  it('reads which line is the tap off the tool rather than its position', () => {
    const made = treeFromLines([{ toolGuid: 'drill-a' }, { toolGuid: 'tap-a' }], true, (guid) =>
      guid.startsWith('tap'),
    )
    expect(made.map((each) => [each.role, each.toolGuid])).toEqual([
      ['tap', 'tap-a'],
      ['drill', 'drill-a'],
    ])
  })

  it('falls back to the default stack where the bill holds nothing', () => {
    expect(treeFromLines([], false)).toEqual(defaultAssemblies(false))
  })
})

describe('the key a question keeps its stacks under before it is a row', () => {
  it('gives two different questions two different keys', () => {
    expect(draftKeyFor(['a'])).not.toBe(draftKeyFor(['b']))
  })

  /** The same features asked in a different order are the same question. */
  it('does not care what order the tags came in', () => {
    expect(draftKeyFor(['a', 'b'])).toBe(draftKeyFor(['b', 'a']))
  })

  /** List ids are `feature-N` / `group-N`, so the prefix can never be one. */
  it('can never collide with a list id', () => {
    expect(draftKeyFor(['a']).startsWith(`${DRAFT_TREE}:`)).toBe(true)
    expect(nextId([], 'feature').startsWith(DRAFT_TREE)).toBe(false)
    expect(nextId([], 'group').startsWith(DRAFT_TREE)).toBe(false)
  })
})

describe('kept in the browser', () => {
  const store = () => {
    const held = new Map<string, string>()
    return {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
    }
  }

  it('keeps the trees for a part and reads them back', () => {
    const storage = store()
    writeTrees(storage, 'part-1', { 'feature-1': [filled] })
    expect(readTrees(storage, 'part-1')['feature-1']).toEqual([filled])
  })

  it('reads another part as nothing kept', () => {
    const storage = store()
    writeTrees(storage, 'part-1', { 'feature-1': [filled] })
    expect(readTrees(storage, 'part-2')).toEqual({})
  })

  it('reads unreadable storage as nothing kept rather than throwing', () => {
    expect(readTrees({ getItem: () => 'not json' }, 'part-1')).toEqual({})
  })

  it('drops an entry that is not a list of stacks', () => {
    const storage = { getItem: () => JSON.stringify({ 'feature-1': [{ id: 3 }] }) }
    expect(readTrees(storage, 'part-1')).toEqual({})
  })
})

/**
 * **Backing out is a press.** A stack differing from the bill is an unsaved
 * edit, and the only way out of one used to be remembering what had been there
 * and finding it again in a table of two hundred (Paul, 2026-09-07).
 */
describe('putting a stack back to the line the bill holds', () => {
  const tree: Array<TreeAssembly> = [
    { id: 'assembly-1', role: 'cut', toolGuid: 'tool-a', holderGuid: 'holder-b', colletGuid: null },
    { id: 'assembly-2', role: 'cut', toolGuid: 'tool-c', holderGuid: null, colletGuid: null },
  ]

  it('restores every slot, not the one being looked at', () => {
    const back = restoreAssembly(tree, 'assembly-1', {
      toolGuid: 'tool-a',
      holderGuid: 'holder-a',
      colletGuid: 'collet-a',
    })
    expect(back[0]).toEqual({
      id: 'assembly-1',
      role: 'cut',
      toolGuid: 'tool-a',
      holderGuid: 'holder-a',
      colletGuid: 'collet-a',
      // What is put back is the *line*, so the stack stands as that line again.
      orderedTool: 'tool-a',
      // And nothing in it is an unreviewed choice of this session's any more.
      overrides: [],
    })
  })

  it('reads a slot the line does not state as empty rather than as unchanged', () => {
    const back = restoreAssembly(tree, 'assembly-1', { toolGuid: 'tool-a' })
    expect(back[0]?.holderGuid).toBeNull()
  })

  it('leaves the other stacks of the feature alone', () => {
    const back = restoreAssembly(tree, 'assembly-1', { toolGuid: 'tool-a' })
    expect(back[1]).toBe(tree[1])
  })
})

/**
 * **A badge says which stack, not that there is one** (Paul, 2026-09-07: "it
 * should say which assembly it is used in rather than just saying 'in the
 * tree'").
 */
describe('what a stack is called, and where a component stands', () => {
  const twoStacks: Array<TreeAssembly> = [
    { id: 'assembly-1', role: 'cut', toolGuid: 'tool-a', holderGuid: 'holder-a', colletGuid: null },
    { id: 'assembly-2', role: 'cut', toolGuid: 'tool-b', holderGuid: 'holder-a', colletGuid: null },
  ]
  const threaded: Array<TreeAssembly> = [
    { id: 'assembly-1', role: 'tap', toolGuid: 'tap-a', holderGuid: 'holder-a', colletGuid: null },
    {
      id: 'assembly-2',
      role: 'drill',
      toolGuid: 'drill-a',
      holderGuid: 'holder-a',
      colletGuid: null,
    },
  ]

  it('numbers a plain stack by where it stands', () => {
    expect(assemblyName(twoStacks, twoStacks[1] as TreeAssembly)).toBe('Assembly 2')
  })

  it('calls a tap and a drill what they are', () => {
    expect(assemblyName(threaded, threaded[0] as TreeAssembly)).toBe('TAP')
    expect(assemblyName(threaded, threaded[1] as TreeAssembly)).toBe('DRILL')
  })

  it('names the stacks a component is standing in', () => {
    expect(heldIn(threaded, 'holder-a')).toEqual(['TAP', 'DRILL'])
  })

  /** The table's own selected row already says that one. */
  it('leaves out the stack being filled', () => {
    expect(heldIn(twoStacks, 'holder-a', 'assembly-1')).toEqual(['Assembly 2'])
  })

  it('names nothing for a component standing nowhere', () => {
    expect(heldIn(twoStacks, 'holder-z')).toEqual([])
  })

  /**
   * **A number is a position, not a name** (Paul, 2026-09-08). A pocket's
   * rougher and its finisher are `Assembly 1` and `Assembly 2`, which is the
   * case where which is which is the whole decision.
   */
  it('calls a stack what somebody called it, wherever it is mentioned', () => {
    const named = renameAssembly(twoStacks, 'assembly-2', '  Finisher  ')

    expect(assemblyName(named, named[1] as TreeAssembly)).toBe('Finisher')
    // The placeholder a name is typed over is what it goes on being called.
    expect(defaultAssemblyName(named, named[1] as TreeAssembly)).toBe('Assembly 2')
    // The badge on a table row reads the same name, so the two cannot disagree.
    expect(heldIn(named, 'holder-a')).toEqual(['Assembly 1', 'Finisher'])
  })

  /** Clearing the field is the way back: there is no second un-name control. */
  it('goes back to its number when the name is cleared', () => {
    const named = renameAssembly(twoStacks, 'assembly-2', 'Finisher')

    expect(renameAssembly(named, 'assembly-2', '  ')[1]).toEqual(twoStacks[1])
  })

  /** A tap is called what it is until it is called something else. */
  it('names a tap over its role', () => {
    const named = renameAssembly(threaded, 'assembly-1', 'M6 tap')

    expect(assemblyName(named, named[0] as TreeAssembly)).toBe('M6 tap')
    expect(assemblyName(named, named[1] as TreeAssembly)).toBe('DRILL')
  })

  it('keeps a name through a slot being filled, and in the browser', () => {
    const named = renameAssembly(twoStacks, 'assembly-1', 'Rougher')
    const filled = setSlot(named, 'assembly-1', 'collet', 'collet-a')

    expect(assemblyName(filled, filled[0] as TreeAssembly)).toBe('Rougher')

    const held = new Map<string, string>()
    const storage = {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
    }
    writeTrees(storage, 'part-a', { 'feature-1': filled })

    expect(readTrees(storage, 'part-a')['feature-1']).toEqual(filled)
  })
})

/**
 * **A shop should see the double-up while it is making it** (Paul, 2026-09-10:
 * "would it be possible to flag duplicates when they are added, even if an
 * assembly has not been added to the list yet? Show a (×2, used in Assembly 1)
 * in the feature dialog"). The table marks a component another stack is *on the
 * order list* with; the stack being built is where the decision is being made.
 */
describe('a component standing in more than one stack', () => {
  const stack = (id: string, over: Partial<TreeAssembly> = {}): TreeAssembly => ({
    ...emptyAssembly(id, 'cut'),
    ...over,
  })

  it('says nothing where a component stands in one stack only', () => {
    const tree = [stack('assembly-1', { toolGuid: 'tool-a' }), stack('assembly-2')]

    expect(sharedWith(tree, 'assembly-1', 'tool')).toBeNull()
  })

  it('says nothing about an empty slot: nothing chosen is not chosen twice', () => {
    const tree = [stack('assembly-1'), stack('assembly-2')]

    expect(sharedWith(tree, 'assembly-1', 'collet')).toBeNull()
  })

  it('counts the stacks and names the others', () => {
    const tree = [
      stack('assembly-1', { toolGuid: 'tool-a' }),
      stack('assembly-2', { toolGuid: 'tool-a' }),
    ]

    expect(sharedWith(tree, 'assembly-2', 'tool')).toEqual({
      count: 2,
      others: ['Assembly 1'],
    })
    // And the same phrase from the other side, naming the other one.
    expect(sharedWith(tree, 'assembly-1', 'tool')).toEqual({
      count: 2,
      others: ['Assembly 2'],
    })
  })

  /**
   * A collet is a collet whichever row it is drawn on: one bought twice is two
   * collets whether the second went into a holder slot or a collet slot.
   */
  it('reads a component across every slot, not the same slot', () => {
    const tree = [
      stack('assembly-1', { colletGuid: 'part-a' }),
      stack('assembly-2', { holderGuid: 'part-a' }),
    ]

    expect(sharedWith(tree, 'assembly-1', 'collet')?.count).toBe(2)
  })

  it('wears the name a shop gave the stack it names', () => {
    const tree = [
      stack('assembly-1', { toolGuid: 'tool-a', name: 'Rougher' }),
      stack('assembly-2', { toolGuid: 'tool-a' }),
    ]

    expect(sharedWith(tree, 'assembly-2', 'tool')?.others).toEqual(['Rougher'])
  })

  describe('said in the words the row wears', () => {
    it('passes nothing through as nothing', () => {
      expect(sharedPhrase(null)).toBeNull()
    })

    it('is the count first, then which stacks', () => {
      expect(sharedPhrase({ count: 2, others: ['Assembly 1'] })).toBe('×2, used in Assembly 1')
      expect(sharedPhrase({ count: 3, others: ['Assembly 1', 'Assembly 3'] })).toBe(
        '×3, used in Assembly 1 and Assembly 3',
      )
      expect(sharedPhrase({ count: 4, others: ['A', 'B', 'C'] })).toBe('×4, used in A, B and C')
    })
  })
})
