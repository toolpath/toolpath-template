/**
 * What a tool *is*, in the words a CAM library uses.
 *
 * The scraper hands over a coarse `toolType` — `endmill`, `drill`, `tap` — and
 * that is the right seam: it is what a vendor's family table says. But a shop
 * choosing a tool for a filleted pocket is not choosing "an endmill", it is
 * choosing a bull nose, and the difference is one number the vendor did state:
 * the corner radius. So the finer name is **derived where the dataset is
 * built**, from `toolType` and geometry, and carried on every tool as `form`.
 *
 * The vocabulary is Fusion's own library, so a tool exported there lands on the
 * type it already has. The list is the single source: the icons draw from it,
 * the filter panel offers it, and the suggestions speak it.
 */
export const TOOL_FORMS = [
  { value: 'ball end mill', label: 'Ball end mill', group: 'Milling' },
  { value: 'bull nose end mill', label: 'Bull nose end mill', group: 'Milling' },
  { value: 'flat end mill', label: 'Flat end mill', group: 'Milling' },
  { value: 'face mill', label: 'Face mill', group: 'Milling' },
  { value: 'tapered mill', label: 'Tapered mill', group: 'Milling' },
  { value: 'radius mill', label: 'Radius mill', group: 'Milling' },
  { value: 'chamfer mill', label: 'Engrave/chamfer mill', group: 'Milling' },
  { value: 'dovetail mill', label: 'Dovetail mill', group: 'Milling' },
  { value: 'lollipop mill', label: 'Lollipop mill', group: 'Milling' },
  { value: 'slot mill', label: 'Slot mill', group: 'Milling' },
  { value: 'thread mill', label: 'Thread mill', group: 'Milling' },
  { value: 'circle segment barrel', label: 'Circle segment barrel', group: 'Milling' },
  { value: 'circle segment lens', label: 'Circle segment lens', group: 'Milling' },
  { value: 'circle segment oval', label: 'Circle segment oval', group: 'Milling' },
  { value: 'circle segment taper', label: 'Circle segment taper', group: 'Milling' },
  { value: 'boring bar', label: 'Boring bar', group: 'Hole making' },
  { value: 'counter bore', label: 'Counter bore', group: 'Hole making' },
  { value: 'drill', label: 'Drill', group: 'Hole making' },
  { value: 'center drill', label: 'Center drill', group: 'Hole making' },
  { value: 'spot drill', label: 'Spot drill', group: 'Hole making' },
  { value: 'reamer', label: 'Reamer', group: 'Hole making' },
  { value: 'counter sink', label: 'Counter sink', group: 'Hole making' },
  { value: 'tap left hand', label: 'Tap left hand', group: 'Hole making' },
  { value: 'tap right hand', label: 'Tap right hand', group: 'Hole making' },
] as const

export type ToolForm = (typeof TOOL_FORMS)[number]['value'] | 'other'

/** The forms that mill — the ones a flute-count suggestion makes sense for. */
export const MILLING_FORMS: ReadonlySet<ToolForm> = new Set(
  TOOL_FORMS.filter((form) => form.group === 'Milling').map((form) => form.value),
)

export const isToolForm = (value: string): value is ToolForm =>
  value === 'other' || TOOL_FORMS.some((form) => form.value === value)

/**
 * The families whose form the vendor states and the scraper's `kind` does not.
 *
 * `ToolKind` has three values — `drill`, `tap`, `endmill` — and Harvey files
 * its twelve keyseat-cutter families under `endmill`, because a keyseat cutter
 * maps onto the endmill contract exactly: a cutting diameter, a width of cut,
 * a shank, an overall length. What that loses is what the vendor's own page
 * title says outright, *"Keyseat Cutters - Square - Reduced Shank"*.
 *
 * Derived from the kind alone they come out as flat end mills with a corner
 * radius of zero, which is how a 22 mm cutter with 1.6 mm of flute and twelve
 * teeth ends up offered to finish a pocket floor (Paul, 2026-09-01: "are you
 * sure this is a flat endmill?").
 *
 * Matched on the scraper's **own family id**, not on a page title this
 * repository would have to keep a copy of. `slot mill` is what a CAM library
 * calls the tool — Fusion's own type for a keyseat or woodruff cutter — and it
 * is the vocabulary {@link TOOL_FORMS} speaks.
 *
 * **This belongs upstream.** A kind of its own in the scraper's family table
 * would state it once for every consumer; `FamilyFacts.profile` is not it —
 * that is the *end* profile (`Ball`, `Square`, `Corner Radius`), which a
 * keyseat cutter has as well. Until the scraper has one, it is stated here,
 * from the vendor's own words, in one place, with `forms.test.ts` failing when
 * a keyseat family arrives that this does not match.
 */
const STATED_FORMS: ReadonlyArray<{
  readonly brand: string
  readonly id: RegExp
  readonly form: ToolForm
}> = [{ brand: 'harvey', id: /^keyseat-/, form: 'slot mill' }]

/** What a family's tools are where the vendor said and the kind cannot. */
export const statedForm = (brand: string, familyId: string): ToolForm | null =>
  STATED_FORMS.find((stated) => stated.brand === brand && stated.id.test(familyId))?.form ?? null

export type Shank = 'reduced' | 'full'

/**
 * Whether the shank behind the flutes is reduced — Paul's definition
 * (2026-08-30): a real relief, a section immediately above the flutes that
 * is a smaller diameter than the flute diameter *and has a length*. The
 * vendors state it as a shoulder diameter and length. In the data, 74
 * Kennametal end mills have one; 171 Destiny end mills state a shoulder
 * narrower than the cut with a shoulder length equal to the flute length —
 * no section to draw or sweep — and are not called reduced until that data
 * is settled. Named in the tool's label and offered as a filter of its own.
 * Null where no shoulder is stated.
 */
export const shankOf = (tool: {
  readonly geometry: Readonly<Record<string, number>>
}): Shank | null => {
  const { DC, LCF } = tool.geometry
  const shoulder = tool.geometry['shoulder-diameter']
  const length = tool.geometry['shoulder-length']
  if (DC === undefined || shoulder === undefined) {
    return null
  }
  const narrower = shoulder < DC - 1e-6
  const real = length !== undefined && LCF !== undefined && length > LCF + 1e-6
  return narrower && real ? 'reduced' : 'full'
}

/**
 * Whether the section between the flutes and the shank is a neck to draw and
 * sweep: a stated shoulder past the flutes, narrower than the shank. A collet
 * cannot close on it, so the tool stands out to its shoulder at least, and
 * the sweep meets the wall with it at its own radius. Wider than the cut it
 * is still a relief the drawing shows, but not a *reduced* shank by Paul's
 * definition: 860 end mills have such a relief, 245 of them under the cut.
 */
export const hasNeck = (tool: { readonly geometry: Readonly<Record<string, number>> }): boolean => {
  const { LCF, SFDM, DC } = tool.geometry
  const shoulder = tool.geometry['shoulder-length']
  const relief = tool.geometry['shoulder-diameter']
  if (shoulder === undefined || relief === undefined || LCF === undefined || shoulder <= LCF) {
    return false
  }
  const shank = SFDM ?? DC
  return shank === undefined ? true : relief < shank - 1e-6
}
