/**
 * What a tool *is*, in the words a CAM library uses, and what its shank does.
 *
 * **The vocabulary and both shank tests now live in `@toolpath/tool-support`**
 * and are re-exported here. `hasNeck` in particular had a twin in
 * `@toolpath/tool-drawing`, and the note beside this copy said what that cost:
 * *"If the rule ever changes, it changes in both places or the picture and the
 * verdict disagree about the same tool."* There is one rule now.
 *
 * What stays is {@link statedForm}, which is this application's stopgap for a
 * fact the scraper does not yet publish.
 */

export {
  MILLING_FORMS,
  TOOL_FORMS,
  hasNeck,
  isToolForm,
  shankOf,
  type Shank,
  type ToolForm,
} from '@toolpath/tool-support'

import type { ToolForm } from '@toolpath/tool-support'

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
