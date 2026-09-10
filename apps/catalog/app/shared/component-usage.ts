import { assemblyName, type TreeAssembly } from './assembly-tree'
import type { Choice } from './setup-sheet'

/**
 * Where a component is already spoken for, said in the words a shop uses.
 *
 * **A row has to say which feature and which assembly** (Paul, 2026-09-07: "if a
 * tool, holder, or collet is used on a different feature, it should note which
 * feature and assembly they are used in in the badge"). The tool list said only
 * *on list* and the racks said only *in Assembly 2* — of this feature — so the
 * question somebody actually has in front of a rack of 500 chucks, "am I already
 * buying one of these, and for what", had no answer on the row.
 *
 * The bill is keyed by feature tag and holds lines; a line is a tool with its
 * holding. Which *stack* a line belongs to is the tree's to say, and the tree is
 * keyed by row — so a use is assembled here from the three, and nowhere else, so
 * that a badge and the tree cannot name the same stack differently.
 */

export interface Use {
  /** The row on the feature list — what it is called there. */
  readonly feature: string
  /** The stack within that row: `Assembly 2`, `TAP`, `DRILL`. */
  readonly assembly: string
  /** The row's id, so a caller can tell this feature's uses from another's. */
  readonly itemId: string
}

/** One row of the feature list, with what it has ordered and how it is built. */
export interface UsedRow {
  readonly itemId: string
  readonly name: string
  readonly lines: ReadonlyArray<Choice>
  readonly stacks: ReadonlyArray<TreeAssembly>
}

/**
 * The stack a line belongs to, by the tool it was ordered as.
 *
 * `orderedTool` is what a stack stands as on the order list, so it is the first
 * thing asked; a tree written before that field existed answers by the tool
 * standing in it. A line with no stack at all — a part answered with the flag
 * off, or a tree the browser has since forgotten — is still a use, and it takes
 * the tool's own name rather than inventing a stack that is not there.
 */
const stackFor = (stacks: ReadonlyArray<TreeAssembly>, line: Choice): TreeAssembly | undefined =>
  stacks.find((each) => (each.orderedTool ?? each.toolGuid) === line.toolGuid)

/**
 * Every component on the bill, by guid, with where it is used.
 *
 * One walk of the list rather than a lookup per row drawn: a rack of 500 holders
 * would otherwise ask this question 500 times, each time walking every feature.
 */
export const usesByGuid = (rows: ReadonlyArray<UsedRow>): Map<string, Array<Use>> => {
  const uses = new Map<string, Array<Use>>()
  for (const row of rows) {
    for (const line of row.lines) {
      const stack = stackFor(row.stacks, line)
      const use: Use = {
        feature: row.name,
        assembly: stack === undefined ? '' : assemblyName(row.stacks, stack),
        itemId: row.itemId,
      }
      for (const guid of [line.toolGuid, line.holderGuid, line.colletGuid]) {
        if (guid === undefined || guid === null) {
          continue
        }
        const held = uses.get(guid)
        if (held === undefined) {
          uses.set(guid, [use])
          continue
        }
        /*
          A component used twice in one stack is one use, and the same holder on
          eight identical holes is one row of the list saying so once.
        */
        if (!held.some((each) => each.itemId === use.itemId && each.assembly === use.assembly)) {
          held.push(use)
        }
      }
    }
  }
  return uses
}

/**
 * A use in one line, for the badge.
 *
 * The feature and the stack within it, where the stack has a name — a line with
 * no tree behind it says the feature alone rather than a dangling separator.
 */
export const sayUse = (use: Use): string =>
  use.assembly === '' ? use.feature : `${use.feature} · ${use.assembly}`

/**
 * What a row's badge says, and what its tooltip says, for uses on other rows.
 *
 * The first use in full and a count for the rest: a badge is read at a glance,
 * and the tool that answers six features is the one whose badge would otherwise
 * be longer than the row it sits on.
 */
export const usedElsewhere = (
  uses: ReadonlyArray<Use>,
  here: string | null,
): { readonly label: string; readonly title: string } | null => {
  const others = uses.filter((use) => use.itemId !== here)
  const [first, ...rest] = others
  if (first === undefined) {
    return null
  }
  return {
    label:
      rest.length === 0 ? `on ${sayUse(first)}` : `on ${sayUse(first)} +${String(rest.length)}`,
    title: `Already on the order list for ${others.map(sayUse).join(', ')}`,
  }
}
