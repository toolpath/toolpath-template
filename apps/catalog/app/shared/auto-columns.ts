/**
 * The two columns the tool list turns on because of what is on it.
 *
 * Tip angle is the number a drill is chosen on and dead weight beside a mill;
 * corner radius is the number a mill is chosen on and a dash beside a drill.
 * Neither is worth a permanent column, and neither is worth making somebody go
 * and find in the picker, so the list follows what it is showing (Paul,
 * 2026-08-31 for the drill, 2026-09-10 for the mill: "Tip angle on by default
 * for drills, corner radius on by default for end mills. If filters show both,
 * show both").
 *
 * Both are ordinary columns in the picker. Toggled by hand one stays where it
 * was put — that is what `touched` carries — because a list that undoes a
 * choice on the next keystroke is worse than one that never made it.
 *
 * Here rather than in the route because it is a rule about codes and forms and
 * nothing else, which is the whole of what makes it testable.
 */

import { MILLING_FORMS, isToolForm } from '@toolpath/catalog-data'

/** The forms with a point: a tip angle is a number these state and others do not. */
const POINTED_FORMS: ReadonlyArray<string> = ['drill', 'spot drill', 'center drill']

/** A column, and what has to be on the list for the list to draw it. */
const AUTO: ReadonlyArray<{ readonly code: string; readonly asks: (form: string) => boolean }> = [
  { code: 'SIG', asks: (form) => POINTED_FORMS.includes(form) },
  { code: 'RE', asks: (form) => isToolForm(form) && MILLING_FORMS.has(form) },
]

/** The codes this rule owns, in the order the columns are declared in. */
export const AUTO_CODES: ReadonlyArray<string> = AUTO.map((column) => column.code)

/** Which of them the forms on the list call for — both, where both are there. */
export const autoColumnsFor = (forms: ReadonlyArray<string>): Array<string> =>
  AUTO.filter((column) => forms.some((form) => column.asks(form))).map((column) => column.code)

/**
 * The hidden set after the list has had its say, or the same set unchanged.
 *
 * Returning the argument itself where nothing moved is what keeps this out of
 * a render loop: React bails out of a state update that sets the same value,
 * and a fresh array with the same strings in it is not the same value.
 */
export const hiddenAfterAuto = (
  hidden: ReadonlyArray<string>,
  forms: ReadonlyArray<string>,
  touched: ReadonlySet<string>,
): ReadonlyArray<string> => {
  const wanted = new Set(autoColumnsFor(forms))
  const mine = AUTO_CODES.filter((code) => !touched.has(code))
  const kept = hidden.filter((code) => !(mine.includes(code) && wanted.has(code)))
  const added = mine.filter((code) => !wanted.has(code) && !kept.includes(code))
  const next = [...kept, ...added]
  const unchanged = next.length === hidden.length && next.every((code, at) => code === hidden[at])
  return unchanged ? hidden : next
}
