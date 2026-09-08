import type { Choice } from './setup-sheet'
import { isEmpty, type TreeAssembly } from './assembly-tree'

/**
 * What a stack offers, under the stack itself in the tree.
 *
 * **A component is picked in the table and the stack is confirmed in the tree**
 * (Paul, 2026-09-07: "I need to see the context aware changes I'm making, or I
 * just need one button to confirm what is selected in the tool assembly"). The
 * tree is where a stack is built up — a holder can stand in it with no tool yet,
 * which is the whole point of being able to start from a holder — and the sheet
 * is still the bill, so something has to say when the one becomes the other.
 *
 * **One button, under the components it is about.** It stood in the panel on the
 * right, a table away from the stack it described; a tick per component replaced
 * it for an afternoon and said only whether each was on, never what pressing it
 * would change. The button is both: one press for the whole assembly, and its
 * label is the change.
 *
 * **Nothing is chosen for a feature until it is confirmed here** (Paul,
 * 2026-09-07: "right now it selects them for a feature even if a feature is not
 * confirmed", and "it should also no longer autoselect the tool component row
 * that I click on"). Clicking a row in the table puts a component into the stack
 * on screen and nowhere else; this is where that stack becomes a feature on the
 * list with an assembly against it.
 *
 * Where the feature is not a row yet, **one press does both**. There is no
 * order in which you confirm the feature and then confirm its tools: they are
 * one decision, and splitting them left a stack somebody had built with no
 * button to press at all.
 *
 * | The stack                                     | Offered                      |
 * | --------------------------------------------- | ---------------------------- |
 * | nothing chosen in it                          | nothing to confirm           |
 * | no tool yet — a holder or collet on its own   | nothing to confirm, and why  |
 * | a tool, and not a row on the list yet         | **Add to order list**, and   |
 * |                                               | it makes the row as well     |
 * | a tool, not on the bill for this feature      | **Add to order list**        |
 * | ordered, and a different cutter in it now     | **Replace A with B**, Cancel |
 * | on the bill, and the holding has changed      | **the change**, and Cancel   |
 * | on the bill, unchanged                        | **Remove from order list**   |
 *
 * **A stack is the line's identity, not its tool** (Paul, 2026-09-07: "when
 * editing an already active assembly, a tool not in the order list should say
 * 'replace' in the active assembly. Right now it is adding a new assembly to
 * the feature"). `orderedTool` on the stack is what makes that possible: the
 * sheet keys a line by its tool, so without it a swapped cutter looked like a
 * stack nobody had ordered, and the press offered to add a second one.
 *
 * **Named for where it puts the tool** (Paul, 2026-09-07: "I should just have an
 * 'add to order list' button (or update, context aware), at the top level of
 * each tool assembly"). "Add to feature" named the row it wrote against; the
 * order list is the page that press is *for*, and it is the word a shop uses.
 *
 * A button that saves what is already saved is one somebody presses to find out
 * whether it did anything, so the change appears only when there is a difference
 * — the rule the tool panel already follows.
 *
 * **The button says what pressing it changes** (Paul, 2026-09-07: "if I already
 * have a tool, holder, and collet mapped, then go to the holder in the tree and
 * select a different one, it should say 'change holder from x to y'"). The stack
 * is drawn once and the button sits under it, so the one thing left for the
 * button to say is what is different about it — and "Update assembly" says
 * nothing at all. The second half of the
 * same sentence is the flag: a holder change takes the collet with it
 * (`setSlot`), and a button that silently drops a collet somebody chose is the
 * defect this note exists to prevent.
 *
 * **A change can be backed out of** (Paul, 2026-09-07: "have a way to back out
 * — tell it I don't want to make any changes"). A stack that differs from the
 * bill is an unsaved edit, and the only way out of one used to be remembering
 * what had been there and finding it again in a table of two hundred. Cancel
 * appears exactly when the update does, because they are the two answers to the
 * same question, and it names what it would keep.
 */

export type AssemblyActionKind = 'confirm' | 'add' | 'replace' | 'update' | 'revert' | 'remove'

export interface AssemblyAction {
  readonly kind: AssemblyActionKind
  readonly label: string
  readonly danger?: boolean
  /** Drawn as the quiet one: a way back, beside the press that goes forward. */
  readonly quiet?: boolean
  /** What else changes with it, where pressing the button moves more than one slot. */
  readonly note?: string
}

/** The line this stack would write, or null while it has no tool to write one for. */
export const lineOf = (assembly: TreeAssembly): Choice | null =>
  assembly.toolGuid === null
    ? null
    : {
        toolGuid: assembly.toolGuid,
        ...(assembly.holderGuid === null ? {} : { holderGuid: assembly.holderGuid }),
        ...(assembly.colletGuid === null ? {} : { colletGuid: assembly.colletGuid }),
      }

const sameLine = (a: Choice, b: Choice): boolean =>
  a.toolGuid === b.toolGuid &&
  (a.holderGuid ?? null) === (b.holderGuid ?? null) &&
  (a.colletGuid ?? null) === (b.colletGuid ?? null)

/**
 * Why there is nothing to confirm yet, in one line, or null where there is.
 *
 * An empty stack says nothing — it is the state every feature opens in, and a
 * notice under an untouched tree is noise. A stack with holding and no tool is
 * worth a sentence, because it looks finished and is not.
 */
export const nothingToConfirm = (assembly: TreeAssembly): string | null => {
  if (assembly.toolGuid !== null) {
    return null
  }
  return isEmpty(assembly)
    ? null
    : 'Pick a tool for this assembly. A holder on its own is not something to order for a feature.'
}

/* ------------------------- what pressing it changes ------------------------ */

/** One slot's difference between what is on the bill and what is in the tree. */
export interface HoldingChange {
  readonly slot: 'holder' | 'collet'
  readonly from: string | null
  readonly to: string | null
}

/**
 * The slots that differ between the bill's line and the stack on screen.
 *
 * Holder first, because a collet change is usually the holder change's
 * consequence rather than a decision of its own — `setSlot` clears the collet
 * whenever the holder moves, since a collet is an interface to one holder's
 * series. The tool is never here: a line is found on the bill *by* its tool, so
 * an update is by definition the same cutter held differently.
 */
export const holdingChanges = (had: Choice, wanted: Choice): Array<HoldingChange> =>
  (['holder', 'collet'] as const).flatMap((slot) => {
    const from = (slot === 'holder' ? had.holderGuid : had.colletGuid) ?? null
    const to = (slot === 'holder' ? wanted.holderGuid : wanted.colletGuid) ?? null
    return from === to ? [] : [{ slot, from, to }]
  })

/**
 * The line the bill already holds for this stack, or null where it holds none.
 *
 * **Found by what the stack was ordered as, and only then by what it holds now**
 * (Paul, 2026-09-07: "when editing an already active assembly, a tool not in the
 * order list should say 'replace' in the active assembly. Right now it is adding
 * a new assembly to the feature"). A line is keyed on the sheet by its tool, so
 * looking one up by the tool standing in the stack found nothing the moment
 * somebody swapped the cutter — and an active assembly with a new tool in it
 * read as a stack nobody had ordered.
 *
 * `orderedTool` is the link, written onto the stack by the press that put the
 * line there. It is also what the table marks a row with — the holder somebody
 * confirmed for this feature has to be visible in the list, or backing out means
 * recognising it by memory.
 */
export const savedFor = (assembly: TreeAssembly, onSheet: ReadonlyArray<Choice>): Choice | null => {
  const wanted = assembly.orderedTool ?? assembly.toolGuid
  return wanted === null ? null : (onSheet.find((each) => each.toolGuid === wanted) ?? null)
}

/** How a component is named on the button, or null where the caller cannot name it. */
export type NameOf = (guid: string) => string | null

/**
 * One change said in words, for the button that would make it.
 *
 * A name the caller cannot resolve degrades the sentence rather than printing a
 * guid: a shop reads catalog numbers, and a uuid on a button is worse than the
 * shorter sentence without it.
 */
const said = (change: HoldingChange, nameOf: NameOf): string => {
  const from = change.from === null ? null : nameOf(change.from)
  const to = change.to === null ? null : nameOf(change.to)
  if (change.to === null) {
    return from === null ? `Take the ${change.slot} off` : `Take ${change.slot} ${from} off`
  }
  if (change.from === null) {
    return to === null ? `Add the ${change.slot}` : `Add ${change.slot} ${to}`
  }
  if (from === null || to === null) {
    return `Change the ${change.slot}`
  }
  return `Change ${change.slot} from ${from} to ${to}`
}

/**
 * What else moves when the button is pressed, where more than one slot does.
 *
 * The flag Paul asked for: with the holder named on the button, the collet it
 * drags along has to be said out loud, because the tree beside it will show an
 * empty collet slot a second after the press and nothing would explain why.
 */
const alsoSaid = (change: HoldingChange, nameOf: NameOf): string => {
  const from = change.from === null ? null : nameOf(change.from)
  const to = change.to === null ? null : nameOf(change.to)
  if (change.to === null) {
    return `The ${change.slot} comes off with it${from === null ? '' : ` — ${from} does not fit the new holder`}. Pick one that does.`
  }
  if (change.from === null) {
    return `The ${change.slot} changes with it: ${to ?? 'a new one'} goes on.`
  }
  return `The ${change.slot} changes with it: ${from ?? 'the old one'} → ${to ?? 'a new one'}.`
}

/**
 * The way back: the stack as the bill has it.
 *
 * It names what it keeps where one slot moved, because "Cancel" beside "Change
 * holder from A to B" reads as cancelling the *feature* otherwise. Where two
 * slots moved there is no single thing to name, and the plain word is honest.
 */
const revertAction = (changes: Array<HoldingChange>, nameOf: NameOf): AssemblyAction => {
  const only = changes.length === 1 ? changes[0] : undefined
  const from = only?.from ?? null
  const keeping = from === null ? null : nameOf(from)
  return {
    kind: 'revert',
    quiet: true,
    label: keeping === null ? 'Cancel' : `Cancel — keep ${keeping}`,
  }
}

/**
 * The press for a stack that is on the order list with a different cutter in it.
 *
 * It names both tools, the way the update names both holders: what a shop needs
 * to see before pressing is which tool leaves the list and which takes its
 * place. Whatever moved with it — the holder, the collet — is said under it
 * rather than folded into the sentence, because the tool is the change and the
 * rest is its consequence.
 */
const replaceAction = (
  had: Choice,
  wanted: Choice,
  changes: Array<HoldingChange>,
  nameOf: NameOf,
): AssemblyAction => {
  const from = nameOf(had.toolGuid)
  const to = nameOf(wanted.toolGuid)
  const notes = changes.map((each) => alsoSaid(each, nameOf))
  return {
    kind: 'replace',
    label:
      from === null || to === null
        ? 'Replace the tool on the order list'
        : `Replace ${from} with ${to}`,
    ...(notes.length === 0 ? {} : { note: notes.join(' ') }),
  }
}

/** The one action that writes a changed stack back onto the bill. */
const updateAction = (changes: Array<HoldingChange>, nameOf: NameOf): AssemblyAction => {
  const [first, ...rest] = changes
  if (first === undefined) {
    return { kind: 'update', label: 'Update assembly' }
  }
  const notes = rest.map((each) => alsoSaid(each, nameOf))
  return {
    kind: 'update',
    label: said(first, nameOf),
    ...(notes.length === 0 ? {} : { note: notes.join(' ') }),
  }
}

export const assemblyActions = (
  assembly: TreeAssembly,
  onSheet: ReadonlyArray<Choice>,
  /** Whether what is being answered is already a row on the list. */
  onList = true,
  /** What confirming would create, for the button that creates it. */
  subject: 'feature' | 'group' = 'feature',
  /** How to name a component on the button, where the caller can. */
  nameOf: NameOf = () => null,
): Array<AssemblyAction> => {
  const line = lineOf(assembly)
  if (line === null) {
    return []
  }
  /*
    Not a row yet, so there is nothing to add *to*: one press makes the feature
    and puts this stack against it.
  */
  if (!onList) {
    return [
      {
        kind: 'confirm',
        label: 'Add to order list',
        note: `Adds the ${subject} to the feature list as well — it is not on it yet.`,
      },
    ]
  }
  const had = savedFor(assembly, onSheet)
  if (had === null) {
    return [{ kind: 'add', label: 'Add to order list' }]
  }
  const changes = holdingChanges(had, line)
  /*
    **A different cutter in an ordered stack is a replacement.** The line stays
    this stack's line — one assembly is one thing to buy — so the press swaps
    what is on it rather than putting a second assembly on the feature beside it.
  */
  if (had.toolGuid !== line.toolGuid) {
    return [replaceAction(had, line, changes, nameOf), revertAction(changes, nameOf)]
  }
  return [
    ...(sameLine(had, line) ? [] : [updateAction(changes, nameOf), revertAction(changes, nameOf)]),
    { kind: 'remove', label: 'Remove from order list', danger: true },
  ]
}
