import { useCallback, useEffect, useRef, useState } from 'react'
import type { Choice } from './setup-sheet'

/**
 * The tool assemblies a feature is answered with, as a tree somebody builds.
 *
 * **The question a feature asks is not "which tool" — it is "which stack"**
 * (Paul, 2026-09-07). A cutter is chosen with a holder and a collet, and a
 * threaded hole needs two stacks before it is a hole at all: a drill and a tap.
 * The page asked for a tool and then offered the other two as dropdowns hanging
 * off the row, which made the holder a footnote on the tool rather than a thing
 * of the same rank — and made the second assembly for a feature something
 * nobody could reach.
 *
 * A tree is that shape said out loud:
 *
 * ```
 * ▾ Assembly 1        ▾ Tap
 *   ● TOOL              ● TAP
 *   ○ HOLDER            ○ HOLDER
 *   ○ COLLET            ○ COLLET
 * + Add assembly        ○ DRILL …
 *                         ○ HOLDER
 *                         ○ COLLET
 * ```
 *
 * The drill hangs *under* the tap it predrills rather than beside it: the
 * thread is the decision and the hole under it follows from which tap was
 * chosen (Paul, 2026-09-07). `treeRows` is that nesting, `treeGroups` the
 * assembly it makes — one card, and **one press for the whole of it** (Paul,
 * 2026-09-08).
 *
 * Pure, and here rather than in the route, for the reason every other rule on
 * this page is: what a slot holds, what a threaded hole starts with, and how a
 * tree becomes lines on the bill are all sentences somebody can be wrong about.
 */

/** One of the three things an assembly is made of. */
export type Slot = 'tool' | 'holder' | 'collet'

export const SLOTS: ReadonlyArray<Slot> = ['tool', 'holder', 'collet']

/**
 * What the cutting end of an assembly is for.
 *
 * `cut` is every ordinary feature. A threaded hole is the one feature that
 * needs two stacks by definition, and its two are not interchangeable — the
 * tap list and the drill list are different lists, and the role is what says
 * which one a slot opens.
 */
export type Role = 'cut' | 'tap' | 'drill'

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  cut: 'TOOL',
  tap: 'TAP',
  drill: 'DRILL',
}

export const SLOT_LABEL: Readonly<Record<Slot, string>> = {
  tool: 'TOOL',
  holder: 'HOLDER',
  collet: 'COLLET',
}

export interface TreeAssembly {
  readonly id: string
  readonly role: Role
  readonly toolGuid: string | null
  readonly holderGuid: string | null
  readonly colletGuid: string | null
  /**
   * The tool this stack currently stands as on the order list, where it is on
   * it at all.
   *
   * **A stack is the line's identity, not its tool** (Paul, 2026-09-07: "when
   * editing an already active assembly, a tool not in the order list should say
   * 'replace' in the active assembly. Right now it is adding a new assembly to
   * the feature"). A line is keyed on the sheet by its tool, so swapping the
   * cutter in a stack that had been ordered read as a *different* line — and the
   * press under it offered to add a second assembly to a feature that has one.
   * This is the link back: what the sheet holds for this stack, so a swap is a
   * replacement of that line rather than a new one beside it.
   *
   * Absent on a stack nobody has ordered, and on any tree stored before this
   * field existed — those read as "not on the order list", which is what a tree
   * kept beside an empty bill means anyway.
   */
  readonly orderedTool?: string | null
  /**
   * The slots holding something the rules had removed for this feature.
   *
   * **An override has to be visible on the stack it is in** (Paul, 2026-09-08:
   * "I should be able to change the filter, see incompatible tools, and add
   * them … a small warning should show in the tree denoting that I chose a
   * geometrically incompatible tool"). The filters are the last word — a shop
   * running a larger cutter than the geometry asks for is making a decision,
   * not a mistake — but a decision taken against the rules and then drawn
   * exactly like one taken with them is a decision nobody can review.
   *
   * Written here rather than derived, and that is the point. What the rules say
   * about a tool is only known while that tool is in an answer, and an answer
   * is a question about *these* filters: clearing the range that admitted the
   * cutter would take the tool out of the removed list it was picked from and
   * the warning with it. The override is a fact about the choice somebody made,
   * so it is kept with the choice.
   *
   * Absent on every tree stored before the field existed, and on one read back
   * off the bill — a line carries a tool, not why it was picked — both of which
   * read as "nothing was overridden", which is what a tree with no record of
   * one means.
   */
  readonly overrides?: ReadonlyArray<Slot>
  /**
   * What a shop calls this stack (Paul, 2026-09-08: naming a tool assembly when
   * it is made, and from the list afterwards).
   *
   * **A number is a position, not a name.** `Assembly 1` and `Assembly 2` say
   * which of two stacks a component is standing in and nothing about why either
   * exists — and a pocket's rougher and finisher are exactly the case where the
   * difference is the whole decision. It is optional and stays optional: the
   * rule {@link assemblyName} already followed holds for every stack nobody
   * names, so a tree reads as it did before.
   *
   * Absent, or empty, on every tree stored before the field existed and on one
   * read back off the bill — a line carries a stack, not what somebody called
   * it — both of which read as unnamed. Trimmed on the way in, in {@link
   * renameAssembly}.
   */
  readonly name?: string
}

/** Which slot of which assembly is being filled — what the table below is a list of. */
export interface TreeNode {
  readonly assemblyId: string
  readonly slot: Slot
}

export const sameNode = (a: TreeNode | null, b: TreeNode | null): boolean =>
  a !== null && b !== null && a.assemblyId === b.assemblyId && a.slot === b.slot

/** What a slot is called on this assembly: a tool slot wears its role's name. */
export const slotLabel = (assembly: TreeAssembly, slot: Slot): string =>
  slot === 'tool' ? ROLE_LABEL[assembly.role] : SLOT_LABEL[slot]

/** Whether this slot was filled against the rules, rather than by them. */
export const isOverride = (assembly: TreeAssembly, slot: Slot): boolean =>
  (assembly.overrides ?? []).includes(slot)

/** Whether anything in this stack was, which is what one card has to say. */
export const hasOverride = (assembly: TreeAssembly): boolean =>
  (assembly.overrides ?? []).length > 0

/** What a slot holds, by guid, or nothing. */
export const guidAt = (assembly: TreeAssembly, slot: Slot): string | null =>
  slot === 'tool'
    ? assembly.toolGuid
    : slot === 'holder'
      ? assembly.holderGuid
      : assembly.colletGuid

export const emptyAssembly = (id: string, role: Role): TreeAssembly => ({
  id,
  role,
  toolGuid: null,
  holderGuid: null,
  colletGuid: null,
  orderedTool: null,
})

/** Nothing chosen in any slot: the row a `+` just added, and the one Remove is safe on. */
export const isEmpty = (assembly: TreeAssembly): boolean =>
  SLOTS.every((slot) => guidAt(assembly, slot) === null)

/**
 * Ids are arithmetic, read off the tree.
 *
 * `feature-list.ts` mints its ids the same way and for the same reason: a clock
 * or a random suffix makes a component test that renders twice fail differently
 * each run.
 */
export const nextAssemblyId = (assemblies: ReadonlyArray<TreeAssembly>): string => {
  let highest = 0
  for (const assembly of assemblies) {
    const at = Number(assembly.id.split('-')[1])
    if (Number.isFinite(at)) {
      highest = Math.max(highest, at)
    }
  }
  return `assembly-${String(highest + 1)}`
}

/**
 * What a feature starts with before anybody has chosen anything.
 *
 * One stack for an ordinary feature; **a tap and a drill for a threaded hole**,
 * because a threaded hole is not made with one tool and a tree that opened
 * showing one would be asking the wrong question before a click (Paul,
 * 2026-09-07). The drill comes second because the tap is what the feature is
 * called, and first is where the eye lands — the order the page's two panes
 * are already in.
 */
export const defaultAssemblies = (threaded: boolean): Array<TreeAssembly> =>
  threaded
    ? [emptyAssembly('assembly-1', 'tap'), emptyAssembly('assembly-2', 'drill')]
    : [emptyAssembly('assembly-1', 'cut')]

/**
 * The stacks a feature has, reconciled with the thread it is being read for.
 *
 * **A hole is plain until somebody says otherwise, and its stacks say the same**
 * (Paul, 2026-09-07: "after I define one set of holes as threaded, it defaults
 * to finding a tap for any new hole selection — new hole selections should be
 * treated as new and default to plain"). A tree is kept in the browser and a
 * thread is not, so a tap stack outlived the reading that asked for it: the
 * table opened on the taps for a hole the panel above it called plain, and
 * there was no thread anywhere to explain why.
 *
 * So the roles follow the thread rather than the storage — but only while
 * there is nothing to lose. A stack somebody has put a tool, a holder or a
 * collet in is work, and work is never thrown away by a reading changing
 * underneath it; those trees are left exactly as they stand.
 */
export const forThread = (
  assemblies: ReadonlyArray<TreeAssembly>,
  threaded: boolean,
): ReadonlyArray<TreeAssembly> => {
  const wanted = assemblies.some((each) => each.role === 'tap')
  if (wanted === threaded || !assemblies.every(isEmpty)) {
    return assemblies
  }
  return defaultAssemblies(threaded)
}

/* ------------------------------ the nesting ------------------------------ */

/** One stack as the tree draws it: what it is, and how deep it hangs. */
export interface TreeRow {
  readonly assembly: TreeAssembly
  /** 0 for a stack of its own; 1 for a drill hanging under the tap it predrills. */
  readonly depth: number
}

/**
 * Which stack a drill hangs off: the tap it predrills.
 *
 * The nearest tap above it, and — for a bill read back the other way round —
 * the first tap anywhere. A drill with no tap at all is a stack of its own,
 * which is what a plain hole's drill is.
 */
const tapFor = (assemblies: ReadonlyArray<TreeAssembly>, at: number): number | null => {
  for (let above = at - 1; above >= 0; above -= 1) {
    if (assemblies[above]?.role === 'tap') {
      return above
    }
  }
  const anywhere = assemblies.findIndex((each) => each.role === 'tap')
  return anywhere === -1 ? null : anywhere
}

/** A root stack and whatever hangs under it — one assembly, drawn as one card. */
export interface TreeGroup {
  readonly root: TreeAssembly
  /** The drill under a tap; empty for every ordinary stack. */
  readonly under: ReadonlyArray<TreeAssembly>
}

/**
 * The stacks gathered into the assemblies they make up.
 *
 * **The drill belongs to the tap** (Paul, 2026-09-07: "the drill is dependent
 * on the tap, but both the drill and the tap may have their own holder and
 * collet — so it needs to be Tap / Tap holder / Tap collet / Drill / Drill
 * holder / Drill collet"). The two were drawn as cards of equal rank, which
 * says they are two answers to one question rather than one answer that takes
 * two tools in an order: the thread is the decision and the hole under it
 * follows from which tap was chosen.
 *
 * **And a group is one thing to order** (Paul, 2026-09-08: "there should only
 * be one 'add to order list' button for the full assembly"). A tap that cuts a
 * thread the drill under it never made is not half an order, it is a mistake,
 * so the press is the group's rather than each stack's — `assembly-actions`
 * `groupActions` is what it offers.
 *
 * Every other stack is a root with nothing under it, in the order it was added,
 * so a pocket's rougher and finisher stay siblings.
 */
export const treeGroups = (assemblies: ReadonlyArray<TreeAssembly>): Array<TreeGroup> => {
  const under = new Map<number, Array<TreeAssembly>>()
  const roots: Array<{ readonly at: number; readonly assembly: TreeAssembly }> = []
  assemblies.forEach((assembly, at) => {
    const tap = assembly.role === 'drill' ? tapFor(assemblies, at) : null
    if (tap === null) {
      roots.push({ at, assembly })
      return
    }
    const held = under.get(tap)
    if (held) {
      held.push(assembly)
    } else {
      under.set(tap, [assembly])
    }
  })
  return roots.map((root) => ({ root: root.assembly, under: under.get(root.at) ?? [] }))
}

/** The group a stack stands in, root or child alike. */
export const groupOf = (assemblies: ReadonlyArray<TreeAssembly>, id: string): TreeGroup | null =>
  treeGroups(assemblies).find(
    (group) => group.root.id === id || group.under.some((each) => each.id === id),
  ) ?? null

/** Every stack of a group, root first — what one button writes and one trash takes off. */
export const stacksOf = (group: TreeGroup): Array<TreeAssembly> => [group.root, ...group.under]

/**
 * The stacks in the order they are drawn, each with how deep it hangs.
 *
 * 0 for a root, 1 for the drill hanging under the tap it predrills.
 */
export const treeRows = (assemblies: ReadonlyArray<TreeAssembly>): Array<TreeRow> =>
  treeGroups(assemblies).flatMap((group) => [
    { assembly: group.root, depth: 0 },
    ...group.under.map((assembly) => ({ assembly, depth: 1 })),
  ])

export const addAssembly = (
  assemblies: ReadonlyArray<TreeAssembly>,
  role: Role = 'cut',
): Array<TreeAssembly> => [...assemblies, emptyAssembly(nextAssemblyId(assemblies), role)]

/**
 * One assembly off the tree — the stack and whatever hangs under it.
 *
 * **The trash is the group's, because the group is the assembly** (Paul,
 * 2026-09-08). A tap taken off on its own leaves a drill hanging under nothing,
 * which the next read turns into a stack of its own: a hole to drill for a
 * thread nobody is cutting. Whatever hangs under the stack goes with it; a
 * stack that is somebody's child takes nothing but itself.
 *
 * Never the last one: a feature with no assembly has nothing to click.
 */
export const removeAssembly = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string,
): Array<TreeAssembly> => {
  const group = treeGroups(assemblies).find((each) => each.root.id === id)
  const off = new Set(group === undefined ? [id] : stacksOf(group).map((each) => each.id))
  const left = assemblies.filter((each) => !off.has(each.id))
  return left.length === 0 ? assemblies.map((each) => emptyAssembly(each.id, each.role)) : left
}

/**
 * The overrides a stack is left with once one slot is written.
 *
 * The slot's own mark follows what is going into it, and a holder change takes
 * the collet's with it for the same reason it takes the collet: the collet is
 * gone, so a warning about it is about nothing.
 */
const overridesAfter = (
  assembly: TreeAssembly,
  slot: Slot,
  override: boolean,
): ReadonlyArray<Slot> => {
  const kept = (assembly.overrides ?? []).filter(
    (each) => each !== slot && !(slot === 'holder' && each === 'collet'),
  )
  return override ? [...kept, slot] : kept
}

/**
 * One slot filled — or emptied, with `null`.
 *
 * **A holder change clears the collet under it.** A collet is a mechanical
 * interface to one holder's series, so a collet kept across a holder change is
 * a stack that does not go together; the page used to keep it and discover the
 * problem at the drawing.
 */
export const setSlot = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string,
  slot: Slot,
  guid: string | null,
  /**
   * Whether what is going in was chosen against the rules — {@link
   * TreeAssembly.overrides}.
   *
   * A parameter of the write rather than a mark applied afterwards, because
   * every way a slot changes has to settle it: filling it with a tool that
   * fits, or clearing it, takes the warning off, and a warning left behind by
   * the choice it was about is worse than no warning at all.
   */
  override = false,
): Array<TreeAssembly> =>
  assemblies.map((each) => {
    if (each.id !== id) {
      return each
    }
    const overrides = overridesAfter(each, slot, override)
    if (slot === 'tool') {
      return { ...each, toolGuid: guid, overrides }
    }
    if (slot === 'holder') {
      return { ...each, holderGuid: guid, colletGuid: null, overrides }
    }
    return { ...each, colletGuid: guid, overrides }
  })

/**
 * What this stack stands as on the order list, written down.
 *
 * Pressed onto the tree by the button under the stack: `null` when the line
 * comes off, the tool that was written when it goes on. It is the only thing
 * that makes a *replacement* distinguishable from a second assembly, because a
 * line on the sheet is keyed by its tool and a stack that swapped cutters would
 * otherwise look like a stack that had never been ordered.
 */
export const markOrdered = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string,
  toolGuid: string | null,
): Array<TreeAssembly> =>
  assemblies.map((each) => (each.id === id ? { ...each, orderedTool: toolGuid } : each))

/**
 * One assembly put back to the line the bill already holds for it.
 *
 * **Backing out is a press, not a reconstruction** (Paul, 2026-09-07: "I need
 * to see the holder that was previously selected for the feature in the list
 * and have a way to back out"). A stack differing from the bill is an *unsaved
 * edit*, and until now the only way out of one was to remember what had been
 * there and pick it again from a table of two hundred — which is not backing
 * out, it is redoing the choice from memory.
 *
 * Every slot at once, including the tool: what is restored is the line, not the
 * slot somebody happened to be looking at.
 */
export const restoreAssembly = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string,
  line: Choice,
): Array<TreeAssembly> =>
  assemblies.map((each) =>
    each.id === id
      ? {
          ...each,
          toolGuid: line.toolGuid,
          holderGuid: line.holderGuid ?? null,
          colletGuid: line.colletGuid ?? null,
          orderedTool: line.toolGuid,
          // Put back to the line the bill holds, so nothing in it is an
          // unreviewed choice of this session's any more.
          overrides: [],
        }
      : each,
  )

/**
 * What a stack is called on screen: its role, or its position among the plain
 * ones.
 *
 * Numbered rather than named, the rule `groupLabel` already follows: an assembly
 * is "the second one" until it has a tool in it, and a name somebody has to
 * invent for every stack is a name most stacks will not get.
 *
 * Here rather than in the tree component because a table row has to say the same
 * words — a holder standing in another stack of the same feature says **which**
 * (Paul, 2026-09-07: "it should say which assembly it is used in rather than
 * just saying 'in the tree'"), and two places inventing a name for the same
 * stack is how the badge and the tree end up disagreeing.
 */
export const assemblyName = (
  assemblies: ReadonlyArray<TreeAssembly>,
  assembly: TreeAssembly,
): string =>
  assembly.name !== undefined && assembly.name.trim() !== ''
    ? assembly.name.trim()
    : defaultAssemblyName(assemblies, assembly)

/**
 * What a stack is called while nobody has named it.
 *
 * The name a naming field is typed *over* rather than into — the placeholder is
 * what the stack would go on being called — so it is a function of its own
 * rather than something the field reinvents.
 */
export const defaultAssemblyName = (
  assemblies: ReadonlyArray<TreeAssembly>,
  assembly: TreeAssembly,
): string =>
  assembly.role === 'cut'
    ? `Assembly ${String(assemblies.indexOf(assembly) + 1)}`
    : ROLE_LABEL[assembly.role]

/**
 * One stack called what a shop calls it.
 *
 * Empty puts the name back rather than storing one, so clearing the field is
 * the way back to `Assembly 2` — there is no second control for un-naming a
 * stack, and a stored empty name would read as named everywhere but on screen.
 */
export const renameAssembly = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string,
  name: string,
): Array<TreeAssembly> =>
  assemblies.map((each) => {
    if (each.id !== id) {
      return each
    }
    const trimmed = name.trim()
    if (trimmed === '') {
      const { name: _dropped, ...rest } = each
      return rest
    }
    return { ...each, name: trimmed }
  })

/**
 * The stacks of this feature holding a component, by name.
 *
 * `except` is the stack being filled — the table's own selected row already
 * says that one, and a badge repeating it is noise on the row somebody just
 * clicked.
 */
export const heldIn = (
  assemblies: ReadonlyArray<TreeAssembly>,
  guid: string,
  except: string | null = null,
): Array<string> =>
  assemblies
    .filter(
      (each) =>
        each.id !== except &&
        (each.toolGuid === guid || each.holderGuid === guid || each.colletGuid === guid),
    )
    .map((each) => assemblyName(assemblies, each))

export const assemblyNamed = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string | null,
): TreeAssembly | null => (id === null ? null : (assemblies.find((each) => each.id === id) ?? null))

/**
 * The stack a line of the bill stands for, by the tool it was ordered as.
 *
 * `orderedTool` is what a stack stands as on the order list, so it is asked
 * first; a tree written before that field existed answers by the tool standing
 * in it. Swapping the cutter therefore keeps the line pointing at its own
 * stack — which is what lets a press on a line of the order list reach the
 * assembly it came from.
 *
 * One rule in one place: the order list names a line's assembly with it
 * ({@link assemblyName}), the badges say where a component is already spoken
 * for (`component-usage.ts`), and a press on that line opens it. Three answers
 * to "which stack is this line" is how a badge and a tree come to name the same
 * stack differently.
 */
export const orderedAs = (
  assemblies: ReadonlyArray<TreeAssembly>,
  toolGuid: string,
): TreeAssembly | null =>
  assemblies.find((each) => (each.orderedTool ?? each.toolGuid) === toolGuid) ?? null

/**
 * The first slot worth opening on a tree nobody has clicked into.
 *
 * The first empty slot of the first assembly that has one, so selecting a
 * feature lands on the question being asked rather than on a heading. A tree
 * with every slot filled opens on its first tool, which is what somebody
 * revisiting a finished feature wants to look at.
 */
export const firstNode = (assemblies: ReadonlyArray<TreeAssembly>): TreeNode | null => {
  for (const assembly of assemblies) {
    for (const slot of SLOTS) {
      if (guidAt(assembly, slot) === null) {
        return { assemblyId: assembly.id, slot }
      }
    }
  }
  const first = assemblies[0]
  return first === undefined ? null : { assemblyId: first.id, slot: 'tool' }
}

/* ------------------------------- the bill -------------------------------- */

/**
 * The tree as lines on the setup sheet: every assembly that has a tool.
 *
 * **The tree is where a stack is built and the sheet is still the bill.** An
 * assembly with a holder and no tool is a question in progress — there is
 * nothing to order and nothing to put on the part — so it lives in the tree and
 * nowhere else. The moment a tool lands in it, it is a line, and
 * `FEATURE-LIST.md` §9's rule holds: nothing reaches the bill except because a
 * row put it there.
 */
export const linesOf = (assemblies: ReadonlyArray<TreeAssembly>): Array<Choice> =>
  assemblies
    .filter(
      (assembly): assembly is TreeAssembly & { toolGuid: string } => assembly.toolGuid !== null,
    )
    .map((assembly) => ({
      toolGuid: assembly.toolGuid,
      ...(assembly.holderGuid === null ? {} : { holderGuid: assembly.holderGuid }),
      ...(assembly.colletGuid === null ? {} : { colletGuid: assembly.colletGuid }),
    }))

/**
 * A tree read back off the bill, for a feature that has lines but no tree.
 *
 * The two ways that happens are a part answered before this shape existed and a
 * part answered with the flag off, and both should open on what is already
 * there rather than on an empty stack.
 */
export const treeFromLines = (
  lines: ReadonlyArray<Choice>,
  threaded: boolean,
  /**
   * Whether a line's tool is a tap, where the caller can say.
   *
   * **The bill is not in the tree's order.** Roles were handed out by position
   * — first line the tap, second the drill — so a threaded hole whose drill was
   * chosen first came back with the drill labelled `TAP`, opening the tap list
   * on a drill and hanging the tap under it. Which line is the tap is a fact
   * about the tool, and only the route can read a form off a guid.
   */
  isTap?: (toolGuid: string) => boolean,
): Array<TreeAssembly> => {
  if (lines.length === 0) {
    return defaultAssemblies(threaded)
  }
  const roles: ReadonlyArray<Role> = threaded ? ['tap', 'drill'] : []
  const ordered =
    !threaded || isTap === undefined
      ? lines
      : // Stable, so two drills or two taps keep the order the bill has them in.
        [...lines].sort((a, b) => Number(isTap(b.toolGuid)) - Number(isTap(a.toolGuid)))
  return ordered.map((line, index) => ({
    /* The stack that wrote the line, where it said so — a tree read back off
       the bill has to come back with the ids the bill's lines name, or every
       stack of it reads as one nobody has ordered. */
    id: line.assemblyId ?? `assembly-${String(index + 1)}`,
    role: roles[index] ?? 'cut',
    toolGuid: line.toolGuid,
    holderGuid: line.holderGuid ?? null,
    colletGuid: line.colletGuid ?? null,
    // Read off the bill, so the bill is what each of them stands as.
    orderedTool: line.toolGuid,
  }))
}

/**
 * The same component standing in more than one stack of this tree, said in one
 * phrase — or null where it stands in only the one.
 *
 * **A shop should see the double-up while it is making it** (Paul, 2026-09-10:
 * "would it be possible to flag duplicates when they are added, even if an
 * assembly has not been added to the list yet? Show a (×2, used in Assembly 1)
 * in the feature dialog"). The table already marks a component another stack is
 * on — but only for components *ordered* elsewhere, and only in the list you
 * happen to be looking at. The stack being built is where the decision is, and a
 * second assembly given the first's collet is either deliberate (two setups,
 * two collets to buy) or a slip, and neither is visible until the bill is read.
 *
 * Counted over the whole tree, so the phrase reads the same on every stack that
 * shares the component: `×2, used in Assembly 1` on the second, `×2, used in
 * Assembly 2` on the first. What it names is the *others*, because the stack it
 * is drawn on is the one the reader is already looking at.
 *
 * Empty slots are not duplicates of each other: nothing chosen is not a choice
 * made twice.
 */
export const sharedWith = (
  assemblies: ReadonlyArray<TreeAssembly>,
  id: string,
  slot: Slot,
): { readonly count: number; readonly others: ReadonlyArray<string> } | null => {
  const here = assemblies.find((each) => each.id === id)
  const guid = here === undefined ? null : guidAt(here, slot)
  if (guid === null) {
    return null
  }
  /*
    Every slot of every stack, not the same slot: a collet is a collet whichever
    row it is drawn on, and one bought twice is two collets whether the second
    went into a holder slot or a collet slot. `guidAt` over `SLOTS` is what makes
    that true without a rule per slot.
  */
  const holders = assemblies.flatMap((each) =>
    SLOTS.some((at) => guidAt(each, at) === guid) ? [each] : [],
  )
  if (holders.length < 2) {
    return null
  }
  return {
    count: holders.length,
    others: holders.filter((each) => each.id !== id).map((each) => assemblyName(assemblies, each)),
  }
}

/**
 * {@link sharedWith} in the words the row wears: `×2, used in Assembly 1`.
 *
 * The count first, because how many to buy is the fact a shop acts on, and the
 * stacks after it because *which* is what tells a deliberate second setup from a
 * slip. Null passes straight through, so a caller can hand this whatever the
 * rule returned.
 */
export const sharedPhrase = (
  shared: { readonly count: number; readonly others: ReadonlyArray<string> } | null,
): string | null => {
  if (shared === null) {
    return null
  }
  const [first, ...rest] = shared.others
  if (first === undefined) {
    return `×${String(shared.count)}`
  }
  const last = rest.at(-1)
  const named =
    last === undefined ? first : `${[first, ...rest.slice(0, -1)].join(', ')} and ${last}`
  return `×${String(shared.count)}, used in ${named}`
}

/* --------------------------- kept in the browser -------------------------- */

/** Every list item's tree, for one part. */
export type Trees = Readonly<Record<string, ReadonlyArray<TreeAssembly>>>

/**
 * The key a tree is kept under while the row it belongs to does not exist yet.
 *
 * **A feature being created has a tree before it has an id** (Paul,
 * 2026-09-07). Every list id is `feature-N` or `group-N`, so this can never
 * collide with one; confirming the draft moves the stacks onto the id the row
 * is given, and cancelling drops them.
 */
export const DRAFT_TREE = 'draft'

/**
 * The key a question that is not a row yet keeps its stacks under.
 *
 * **Keyed by what is being asked, not by "a draft".** A single `draft` key made
 * every unconfirmed question share one tree, so a holder picked while reading
 * one face was still standing in the tree after clicking another — components
 * selected for a feature that was never confirmed (Paul, 2026-09-07). Keyed by
 * the tags, each face gets its own scratch stack and switching between two goes
 * back to what each had.
 *
 * Sorted, because the same set of features asked in a different order is the
 * same question.
 */
export const draftKeyFor = (tags: ReadonlyArray<string>): string =>
  `${DRAFT_TREE}:${[...tags].sort().join('|')}`

const KEY = (partId: string) => `tool-catalog.trees.${partId}`

const isAssembly = (value: unknown): value is TreeAssembly => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const assembly = value as TreeAssembly
  return (
    typeof assembly.id === 'string' &&
    (assembly.role === 'cut' || assembly.role === 'tap' || assembly.role === 'drill') &&
    (assembly.toolGuid === null || typeof assembly.toolGuid === 'string') &&
    (assembly.holderGuid === null || typeof assembly.holderGuid === 'string') &&
    (assembly.colletGuid === null || typeof assembly.colletGuid === 'string') &&
    // Absent on every tree stored before the field existed, which reads as
    // "not on the order list" — the honest answer for a tree with no line.
    (assembly.orderedTool === undefined ||
      assembly.orderedTool === null ||
      typeof assembly.orderedTool === 'string') &&
    // Absent on every tree stored before the field existed, which reads as
    // nothing overridden — see `TreeAssembly.overrides`.
    (assembly.overrides === undefined ||
      (Array.isArray(assembly.overrides) &&
        assembly.overrides.every((slot) => SLOTS.includes(slot)))) &&
    // Absent on every tree stored before the field existed, which reads as
    // unnamed — see `TreeAssembly.name`.
    (assembly.name === undefined || typeof assembly.name === 'string')
  )
}

export const readTrees = (storage: Pick<Storage, 'getItem'> | null, partId: string): Trees => {
  const raw = storage?.getItem(KEY(partId))
  if (!raw) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    const trees: Record<string, ReadonlyArray<TreeAssembly>> = {}
    for (const [itemId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every(isAssembly)) {
        trees[itemId] = value
      }
    }
    return trees
  } catch {
    return {}
  }
}

export const writeTrees = (
  storage: Pick<Storage, 'setItem'> | null,
  partId: string,
  trees: Trees,
): void => {
  storage?.setItem(KEY(partId), JSON.stringify(trees))
}

/** The trees for one part, kept in this browser — `useFeatureList`'s twin. */
export const useAssemblyTrees = (partId: string) => {
  const [trees, setTrees] = useState<Trees>({})
  /**
   * The trees as they stand, for an update written from the one before it: a
   * `localStorage` write inside a state updater is a side effect in a pure
   * function, and React calls an updater twice in development.
   */
  const held = useRef<Trees>({})

  useEffect(() => {
    const kept = readTrees(globalThis.localStorage ?? null, partId)
    held.current = kept
    setTrees(kept)
  }, [partId])

  const commit = useCallback(
    (itemId: string, assemblies: ReadonlyArray<TreeAssembly>) => {
      const made = { ...held.current, [itemId]: assemblies }
      held.current = made
      setTrees(made)
      writeTrees(globalThis.localStorage ?? null, partId, made)
    },
    [partId],
  )

  const forget = useCallback(
    (itemId: string) => {
      const made = { ...held.current }
      delete made[itemId]
      held.current = made
      setTrees(made)
      writeTrees(globalThis.localStorage ?? null, partId, made)
    },
    [partId],
  )

  /**
   * One tree as it stands *now*, off the ref rather than the render's state.
   *
   * **A press that writes a tree and then reads it back is the same tick.**
   * Confirming a stack marks what it stands as on the order list and then makes
   * the row that carries it; `trees` in that handler's closure is the value
   * before the mark, so the carry would move the unmarked stacks and the link
   * to the line would be lost the moment somebody swapped the cutter.
   */
  const read = useCallback((itemId: string) => held.current[itemId], [])

  return { trees, read, commit, forget }
}
