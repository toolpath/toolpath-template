import { TOOL_FORMS } from '@toolpath/catalog-data'

/**
 * What a tool *is*, in one phrase, with the shank in the name where it is
 * narrower than the cut: `Reduced shank bull nose end mill`.
 *
 * **The shank is not a question of its own any more** (Paul, 2026-09-08: "for
 * Shank, we should roll those into tool type"). It was a filter beside the
 * type — Full or Reduced — which meant picking a bull nose end mill with a
 * neck took two controls and reading one took two columns. It is one axis now:
 * the words the Type column shows are the values the Type filter offers.
 *
 * This is the one place the phrase is built, because it is both what a cell
 * says and what a filter matches on; two functions would drift and a row would
 * stop answering the filter that names it.
 */

/** Lower case, one space between words, so `Bull_nose-mill` finds its form. */
export const normalise = (toolType: string): string =>
  toolType
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The forms the shank says nothing about, so the phrase is left off them.
 *
 * A slot mill — a keyseat or woodruff cutter — is a disc of teeth on a neck;
 * there is no full-shank one to tell it apart from, and "Reduced shank slot
 * mill" is two words of noise on every one of them (Paul, 2026-09-01).
 *
 * **A tap is the same** (Paul, 2026-09-08: "taps should not show reduced
 * shank"). Its shank is sized to the tapping chuck rather than to the thread
 * it cuts, so it sits under the major diameter as a matter of course: 6,925 of
 * the 11,566 taps in the scrape, 59% of them, which is a phrase on the majority
 * of a list saying nothing that tells one tap from another.
 */
const SHANK_IS_THE_TYPE: ReadonlySet<string> = new Set([
  'slot mill',
  'tap',
  'tap left hand',
  'tap right hand',
])

/**
 * What each form is called and whether its shank is worth saying, worked out
 * once per name.
 *
 * **The phrase is read for every tool in the catalog, several times over.** The
 * `type` axis is a filter and a column, so choosing one runs {@link typeLabel}
 * across 38,114 tools inside `prepareMatch`, and the `…` row's own value list
 * runs it across them again — three regular expressions and a linear search
 * through the vocabulary each time, measured at 48 ms a pass. A form is one of
 * about twenty-five names, so the answer is worth keeping.
 */
const WORDS = new Map<string, { readonly label: string; readonly shankIsType: boolean }>()

const wordsFor = (toolType: string) => {
  const had = WORDS.get(toolType)
  if (had !== undefined) {
    return had
  }
  const name = normalise(toolType)
  const made = {
    label: TOOL_FORMS.find((each) => each.value === name)?.label ?? toolType,
    shankIsType: SHANK_IS_THE_TYPE.has(name),
  }
  WORDS.set(toolType, made)
  return made
}

/** What a name is called in the library's vocabulary, where it has a proper one. */
export const toolTypeLabel = (toolType: string): string => wordsFor(toolType).label

/**
 * Whether the shank behind the cut is thinner than the cut.
 *
 * **Paul's rule, and only his** (2026-09-08: "use my reduced shank rule rather
 * than the old one"): `SFDM < DC`, a 12 mm cutter on a 10 mm shank.
 *
 * The rule it replaces was `shankOf`, `@toolpath/tool-support`'s reading of a
 * *neck* — a shoulder narrower than the cut, standing back from the flutes —
 * and the two are all but disjoint over the 38,114-tool scrape: 7,499 tools
 * against 6,378, with exactly **one** tool satisfying both, because a necked
 * tool usually keeps a full-width shank behind the neck. So this is a real
 * change of population and not a refinement: 6,378 necked tools no longer say
 * "Reduced shank", and of the tools that now do, all but 574 are taps — which
 * {@link SHANK_IS_THE_TYPE} then leaves alone.
 *
 * `shankOf` is untouched and still answers the `shank` axis, which is parked;
 * this is the reading the words on screen are built from.
 */
export const reducedShank = (tool: {
  readonly form: string
  readonly geometry: Readonly<Record<string, number>>
}): boolean => {
  const { DC, SFDM } = tool.geometry
  return DC !== undefined && SFDM !== undefined && SFDM < DC - 1e-9
}

/**
 * The phrase: the form in the library's words, led by the shank where it is
 * narrower than the cut.
 *
 * Paul's call (2026-08-30) — a neck is not a kind of tool, but it is the first
 * thing a shop wants to know about one, so it leads. Except where every tool of
 * that form has one; see {@link SHANK_IS_THE_TYPE}.
 */
export const typeLabel = (tool: {
  readonly form: string
  readonly geometry: Readonly<Record<string, number>>
}): string => {
  const { label, shankIsType } = wordsFor(tool.form)
  return reducedShank(tool) && !shankIsType ? `Reduced shank ${label.toLowerCase()}` : label
}

/**
 * The form behind a phrase: {@link typeLabel} read backwards.
 *
 * **A type ticked in a column is a form asked for** (Paul, 2026-09-08: "there
 * is no way to show end mills if I can't find a drill … End mills are
 * technically a valid tool to predrill for the tap"). The Type column narrows
 * on the phrase, and the phrase is all it has; what decides whether a tool is
 * ever *judged* is the `form` filter, which is a different vocabulary. Without
 * a way back from one to the other, ticking `Flat end mill` on a threaded hole
 * narrowed a list of drills to nothing instead of asking for end mills.
 *
 * Here rather than anywhere else because {@link typeLabel} is here: two places
 * building and unbuilding one phrase is how a tick stops finding its own tools.
 * `null` where the phrase is not one this catalog builds — a vendor's own
 * `toolType` passed through, say — because guessing a form from a word nobody
 * put in the vocabulary is how a filter asks for something that does not exist.
 */
export const formOfTypeLabel = (label: string): string | null => {
  const plain = normalise(label.replace(/^Reduced shank /i, ''))
  const found = TOOL_FORMS.find((form) => normalise(form.label) === plain || form.value === plain)
  return found?.value ?? null
}

/**
 * The `form` filter after a change to the chosen types.
 *
 * **A tick adds its form and an untick takes it back**, so the Type column can
 * widen a question the geometry narrowed without becoming a switch nobody can
 * find their way back out of — the `form` axis has no control of its own
 * (`column-filters.ts` § `AXES_PARKED`).
 *
 * `base` is what the geometry asked for and is never taken away: on a threaded
 * hole it is the drill and the taps, so unticking `Drill` narrows the list to
 * nothing for as long as that tick is off and puts the drills back when it
 * comes off again — rather than emptying the form filter and with it the list.
 * Everything else in the filter is left exactly as it was, which is what keeps
 * the predrill press's own additions standing.
 */
export const formsAsking = (
  forms: ReadonlyArray<string>,
  base: ReadonlyArray<string>,
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): Array<string> => {
  const never = new Set(base)
  const formsOf = (types: ReadonlyArray<string>): Array<string> =>
    types.flatMap((type) => {
      const form = formOfTypeLabel(type)
      return form === null ? [] : [form]
    })
  const asked = formsOf(after)
  const dropped = new Set(
    formsOf(before).filter((form) => !never.has(form) && !asked.includes(form)),
  )
  const kept = forms.filter((form) => !dropped.has(form))
  // Two phrases of one form — `Flat end mill` and its reduced-shank twin — are
  // one thing to ask for, so the filter says it once.
  return [...new Set([...kept, ...asked])]
}
