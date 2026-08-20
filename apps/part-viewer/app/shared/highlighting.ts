/**
 * Which features the lists ask the part to light up.
 *
 * Three things can want the part painted at once — an open type in the summary,
 * a row under the pointer, and the feature that was clicked — and they are not
 * equal. The click is the most recent thing somebody said, and a type is the
 * oldest: it was opened to find something, and once something is found the type
 * has served its purpose.
 *
 * So the type steps aside for anything more specific. A row under the pointer
 * replaces it, because that is a question being asked right now, and the
 * pointer over the part removes it, since sixty lit faces standing between
 * somebody and the face they are reaching for is the type highlight outliving
 * its usefulness.
 *
 * Whether the open type is *still* the question is the caller's to decide, and
 * it hands over an empty list once it is not: a click of any kind puts the
 * question down, and opening a type afterwards picks a new one up. Deciding it
 * here on "is anything selected" would make a type opened after a click paint
 * nothing at all.
 */
export function listHighlight({
  hovered,
  ofType,
  pointerOnPart,
}: {
  /** Features under the pointer in a list. */
  hovered: readonly string[]
  /** The open type's features, empty once it has stopped being the question. */
  ofType: readonly string[]
  /** Whether the pointer is over the part itself. */
  pointerOnPart: boolean
}): string[] {
  if (hovered.length > 0) return [...hovered]
  if (pointerOnPart) return []
  return [...ofType]
}
