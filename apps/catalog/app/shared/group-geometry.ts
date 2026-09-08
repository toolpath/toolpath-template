import type { PartFeature } from '@toolpath/part-contracts'
import { FIELDS, defaultsFor, readingsFor, type GroupBound, type Unit } from './feature-defaults'

/**
 * What a group measures, when the group is asked as one question.
 *
 * **A group is one tool for all of them** (`docs/FEATURE-LIST.md` § A group is
 * one question), so the number that matters about six features is not any one
 * of their numbers — it is the hardest of them, and which feature it came from
 * (Paul, 2026-09-08). A group whose deepest feature is 40 mm down and whose
 * tightest corner admits a ⌀4 cutter needs a ⌀4 tool 40 mm long, and neither
 * half of that sentence is readable off the feature boxes one at a time.
 *
 * **The fields are the ones the feature box already shows**, per feature, from
 * `feature-defaults.csv`: the group's strip is the union of its features'
 * strips in the order they were first asked for, so the panel beside the list
 * and the panel above it are reading the same sheet. A field a feature does not
 * report is left out of its side of the comparison rather than counted as zero.
 *
 * **Which end is hard is the field's own to say** — `GroupBound` in
 * `feature-defaults.ts`. This module only folds.
 */

/** What one feature in the group reads for one field. */
export interface GroupValue {
  readonly featureTag: string
  readonly value: number | string
}

export interface GroupReading {
  readonly name: string
  readonly unit: Unit
  readonly icon: string
  readonly bound: GroupBound
  /**
   * The binding value across the group.
   *
   * `null` where nothing binds: a `match` field whose features disagree has no
   * worst case, it has no one tool — two holes of different diameters take two
   * drills, and saying "⌀6" about them would be picking one and hiding the
   * other.
   */
  readonly value: number | string | null
  /**
   * The feature the value was read off, or `null` where every feature in the
   * group read the same and there is nothing to attribute.
   */
  readonly featureTag: string | null
  /** What each feature that reports this field reads, in the group's order. */
  readonly per: ReadonlyArray<GroupValue>
}

/** Whether every reading is the same one. */
const agreeing = (per: ReadonlyArray<GroupValue>): boolean =>
  per.every((each) => each.value === per[0]?.value)

/**
 * The hardest of the group's readings for one field.
 *
 * A ceiling is a limit on the tool, so the smallest is what it has to clear; a
 * floor is a demand, so the largest is. Mixed strings and numbers — a field
 * that reads text on one feature and a number on another — are treated as a
 * `match`, since there is no ordering between the two.
 */
const worst = (
  bound: GroupBound,
  per: ReadonlyArray<GroupValue>,
): Pick<GroupReading, 'value' | 'featureTag'> => {
  const first = per[0]
  if (!first) {
    return { value: null, featureTag: null }
  }
  if (agreeing(per)) {
    return { value: first.value, featureTag: null }
  }

  const numbers = per.filter(
    (each): each is { featureTag: string; value: number } => typeof each.value === 'number',
  )
  if (bound === 'match' || numbers.length !== per.length) {
    return { value: null, featureTag: null }
  }

  const binding = numbers.reduce((held, each) =>
    bound === 'ceiling'
      ? each.value < held.value
        ? each
        : held
      : each.value > held.value
        ? each
        : held,
  )
  return { value: binding.value, featureTag: binding.featureTag }
}

/**
 * Every field the group's features are shown by, folded to its worst case.
 *
 * @param selected the features in the group
 * @param all every feature on the part, so depth is measured from its top
 */
export const groupReadings = (
  selected: ReadonlyArray<PartFeature>,
  all: ReadonlyArray<PartFeature> = selected,
): Array<GroupReading> => {
  const found = new Map<string, Array<GroupValue>>()

  for (const feature of selected) {
    const row = defaultsFor(feature, all)
    if (!row) {
      continue
    }
    for (const reading of readingsFor(feature, all, row.show)) {
      const held = found.get(reading.name)
      const value = { featureTag: feature.featureTag, value: reading.value }
      if (held) {
        held.push(value)
      } else {
        found.set(reading.name, [value])
      }
    }
  }

  return [...found].flatMap(([name, per]) => {
    const field = FIELDS[name]
    if (!field) {
      return []
    }
    return [
      {
        name,
        unit: field.unit,
        icon: field.icon,
        bound: field.bound,
        per,
        ...worst(field.bound, per),
      },
    ]
  })
}
