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

/** What a name is called in the library's vocabulary, where it has a proper one. */
export const toolTypeLabel = (toolType: string): string =>
  TOOL_FORMS.find((each) => each.value === normalise(toolType))?.label ?? toolType

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
  const label = toolTypeLabel(tool.form)
  return reducedShank(tool) && !SHANK_IS_THE_TYPE.has(normalise(tool.form))
    ? `Reduced shank ${label.toLowerCase()}`
    : label
}
