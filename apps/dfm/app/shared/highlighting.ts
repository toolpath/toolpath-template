import type { PartFeature } from './contracts'
import type { Pass, SetupPlan } from './setups'
import { coveredRegions, cutRegions, givenUp } from './setups'

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
export const listHighlight = ({
  hovered,
  ofType,
  pointerOnPart,
}: {
  /** Features under the pointer in a list. */
  hovered: ReadonlyArray<string>
  /** The open type's features, empty once it has stopped being the question. */
  ofType: ReadonlyArray<string>
  /** Whether the pointer is over the part itself. */
  pointerOnPart: boolean
}): Array<string> => {
  if (hovered.length > 0) {
    return [...hovered]
  }
  if (pointerOnPart) {
    return []
  }
  return [...ofType]
}

/**
 * Everything the part should light up, from every selection at once.
 *
 * The faces **picked** on the part ask "what could cut all of these", and the
 * readings being read say "this is the one". Both are the viewer's own
 * highlight, so they are gathered here — each was wired separately once and one
 * of them was simply never passed on.
 *
 * **Painting is not here.** A painted set is about this moment and gets its own
 * orange (`paintedWash`); routing it through the picked-face highlight painted
 * two different meanings in one colour, and neither could be told apart.
 */
export const partHighlight = ({
  selected,
  focused,
  picked,
}: {
  /** Readings ticked for a bulk action. */
  selected: Iterable<string>
  /** The reading being read, if any — painted unless it is already ticked. */
  focused: string | null
  /** Regions picked by clicking the part. */
  picked: Iterable<number>
}): { tags: Array<string>; regions: Array<number> } => {
  const tags = new Set(selected)
  if (focused) {
    tags.add(focused)
  }

  return {
    tags: [...tags],
    regions: [...new Set(picked)],
  }
}

/**
 * Feature-level paint, split from the readings that cut only part of themselves.
 *
 * The viewer paints a feature by expanding its tag to **every** region it
 * covers — which was the whole truth until a claim could take one face and leave
 * the rest. Now a reading that gave three faces away still lights all twelve
 * when it is selected, and the three it no longer cuts light up as though the
 * plan still held them.
 *
 * So a part-cut reading is painted by **face** instead: the same colour, named
 * region by region. Whole readings keep their tag, which is cheaper and is
 * still what almost every reading is.
 *
 * A reading **handed** a face has the same problem from the other side: the tag
 * expands to what the Engine reported, so a face added by hand was in the plan,
 * in the editor's list and on none of the paint. The tag cannot say it, so such
 * a reading is painted by face too.
 */
export const paintByCut = (
  tags: Iterable<string>,
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass,
): { whole: Array<string>; faces: Array<number> } => {
  const whole: Array<string> = []
  const faces: Array<number> = []
  const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))

  for (const tag of tags) {
    const feature = byTag.get(tag)
    if (!feature) {
      whole.push(tag)
      continue
    }

    const covers = coveredRegions(plan, feature)

    // Cutting all of what it covers, and covering exactly what was reported:
    // the tag says it, and the viewer knows how to expand it.
    if (givenUp(plan, feature, pass).length === 0 && covers.length === feature.regionIdxs.length) {
      whole.push(tag)
      continue
    }

    /*
     * Nothing cut in this pass, but something to say all the same — a reading
     * assigned only in the other one, or not at all. It falls here rather than
     * to the tag because it has been handed a face, and painting nothing would
     * be worse than painting the tag was: a selected reading that lights up
     * nowhere reads as a click that missed.
     */
    const cut = cutRegions(plan, feature, pass)
    faces.push(...(cut.length === 0 ? covers : cut))
  }

  return { whole, faces }
}
