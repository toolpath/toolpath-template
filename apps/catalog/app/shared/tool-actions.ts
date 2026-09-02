/**
 * What the panel beside the tool list offers, for the tool it is showing.
 *
 * **A feature or a group can hold more than one tool** (Paul, 2026-09-02). A
 * hole is a spot drill and a drill; a pocket is a rougher and a finisher. The
 * sheet has always been able to say so — a feature's choices are a list — and
 * the page treated it as one, which made the second tool for a feature a thing
 * nobody could add.
 *
 * With more than one allowed, "what does this button do" stops being obvious
 * and becomes four different questions, so the answer is a rule rather than a
 * shape of JSX:
 *
 * - nothing is being asked about — nothing to add it *to*;
 * - what is being asked has no tools yet — **add** this one;
 * - this tool is one of its tools — **update** what holds it, where that has
 *   changed, and **remove** it;
 * - it has tools and this is not one of them — **replace** them with this one,
 *   or **add** it beside them.
 *
 * Pure, and tested here, because it is four sentences somebody can be wrong
 * about and no part of it is layout.
 */
export type ToolAction = 'add' | 'update' | 'remove' | 'replace' | 'also'

export interface ToolActionsAsked {
  /** Whether a feature or a group is being asked about at all. */
  readonly active: boolean
  /** How many tools it already has on the bill. */
  readonly mapped: number
  /** Whether the tool in the panel is one of them. */
  readonly here: boolean
  /**
   * Whether the holder or collet in the panel differs from what was saved.
   *
   * The update is offered on a change rather than always: a button that saves
   * what is already saved is one somebody presses to find out whether it did
   * anything (Paul, 2026-09-02: "update tool assembly *if* a holder or collet
   * is added, edited, or removed").
   */
  readonly assemblyChanged: boolean
}

export const toolActions = ({
  active,
  mapped,
  here,
  assemblyChanged,
}: ToolActionsAsked): Array<ToolAction> => {
  if (!active) {
    return []
  }
  if (mapped === 0) {
    return ['add']
  }
  if (here) {
    return assemblyChanged ? ['update', 'remove'] : ['remove']
  }
  return ['replace', 'also']
}

/**
 * What each button says.
 *
 * **Replace names the tool it drops** (Paul, 2026-09-02), because with several
 * mapped there is otherwise no telling which one goes — and where several go,
 * it says that instead of naming one of them.
 */
export const toolActionLabel = (
  action: ToolAction,
  { dropping = [] }: { readonly dropping?: ReadonlyArray<string> } = {},
): string => {
  switch (action) {
    case 'add':
      return 'Add tool'
    case 'update':
      return 'Update tool assembly'
    case 'remove':
      return 'Remove tool'
    case 'also':
      return 'Add this tool'
    case 'replace':
      return dropping.length === 1 ? `Replace ${dropping[0] ?? ''}` : 'Replace all tools'
  }
}
