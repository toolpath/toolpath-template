import type { ListItem } from './feature-list'

/**
 * Whether a hole being read is offered as the group of identical holes it
 * belongs to, and what taking the offer would act on.
 *
 * **Identical holes group in a group and nowhere else** (Paul, 2026-09-09: "the
 * current hole grouping should only be applied in GROUP. In Add Feature, I
 * should be able to select a single hole"). `part-interaction` § `groupOf` used
 * to expand a hole into its siblings on every path, so a bolt circle was one
 * row whether or not anybody chose it that way; the expansion is gated on
 * `Interaction.collecting` now, and this is the offer that replaced it.
 *
 * Here rather than in the route because *when* it is offered is four rules
 * about four different things, and each is a sentence somebody can be wrong
 * about — as the first version was, withholding it from every selected row and
 * so making *Just this hole* look permanent.
 */
export interface GroupAsk {
  /** How many holes on the part are identical to this one, this one included. */
  readonly siblings: number
  /** Whether *Just this hole* was pressed for the reading being held. */
  readonly dismissed: boolean
  /** What is being built, where anything is. */
  readonly building: ListItem['kind'] | null
  /**
   * The row this reading belongs to — the one selected, or the one being
   * edited — where there is one.
   */
  readonly row: ListItem | null
  /** Whether that row is the one open in the editor rather than merely selected. */
  readonly editing: boolean
  /** Whether that row already has lines on the order list. */
  readonly ordered: boolean
}

export interface GroupOffer {
  /** The number the press names: every identical hole, this one included. */
  readonly count: number
  /**
   * The row taking the offer would turn into a group, or `null` for a reading
   * that is not on the list yet — where it opens a new group instead.
   *
   * Editing rather than adding, because a group beside the feature it came from
   * is two rows for one decision, which is what the list exists to prevent.
   */
  readonly rowId: string | null
}

export const groupOffer = (asked: GroupAsk): GroupOffer | null => {
  // Nothing like it on the part, so there is no group to offer.
  if (asked.siblings < 2) {
    return null
  }
  /*
    **Turned down for as long as this reading is held** (Paul, 2026-09-09: "if I
    choose 'just this hole' but then exit without adding a tool assembly to the
    order list, clicking the same hole again does not show the group again. It
    should"). Whose reading that is belongs to the caller; this only reads the
    answer.
  */
  if (asked.dismissed) {
    return null
  }
  // A group is already the thing being built, and a part-level assembly answers
  // no feature at all: neither has anything to be offered.
  if (asked.building === 'group' || asked.building === 'assembly') {
    return null
  }
  // A group row is what the offer makes, so it is never made about one.
  if (asked.row !== null && asked.row.kind !== 'feature') {
    return null
  }
  /*
    **Offered while the decision is open** (Paul, 2026-09-09: "when I'm editing
    the feature, I should have the option to change it to a group always, or
    when I select a hole with no tools applied, it should show both options").
    A feature with tools on the order list is a decision somebody is buying
    against, and a standing invitation to redo it is noise; a feature open in
    the editor is exactly the moment for changing one's mind, whatever it holds.
  */
  if (asked.row !== null && !asked.editing && asked.ordered) {
    return null
  }
  return { count: asked.siblings, rowId: asked.row?.id ?? null }
}
