import { TOOL_FORMS, shankOf } from '@toolpath/catalog-data'

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
 * The forms whose shank is reduced by definition, so saying so adds nothing.
 *
 * A slot mill — a keyseat or woodruff cutter — is a disc of teeth on a neck;
 * there is no full-shank one to tell it apart from, and "Reduced shank slot
 * mill" is two words of noise on every one of them (Paul, 2026-09-01).
 */
const SHANK_IS_THE_TYPE: ReadonlySet<string> = new Set(['slot mill'])

/**
 * Whether the cut is wider than what is behind it, either way that happens.
 *
 * **Two rules, and they are all but disjoint.** `shankOf` is
 * `@toolpath/tool-support`'s reading of a *neck*: a shoulder narrower than the
 * cut, standing further back than the flutes. Paul's rule (2026-09-08) is the
 * *shank*: `SFDM < DC`, a 12 mm cutter on a 10 mm shank. Over the 38,114-tool
 * scrape the first finds 6,378 tools, the second 7,499 — and exactly **one**
 * tool satisfies both, because a necked tool usually keeps a full-width shank
 * behind the neck and a reduced-shank tool states no neck at all.
 *
 * So this is the union: dropping either one would take the phrase off
 * thousands of tools that are exactly what it describes.
 *
 * **What the shank rule does to taps, said out loud.** 6,925 of the 7,499 are
 * taps — 59% of every tap in the scrape — because a tap's shank is usually
 * under its thread's major diameter. They read `Reduced shank tap right hand`
 * now. That is the rule as it was given, applied everywhere; if it turns out
 * to be noise on a tap the way it is on a slot mill, the fix is one entry in
 * {@link SHANK_IS_THE_TYPE} rather than a second rule.
 */
export const reducedShank = (tool: {
  readonly form: string
  readonly geometry: Readonly<Record<string, number>>
}): boolean => {
  const { DC, SFDM } = tool.geometry
  const thinner = DC !== undefined && SFDM !== undefined && SFDM < DC - 1e-9
  return thinner || shankOf(tool) === 'reduced'
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
