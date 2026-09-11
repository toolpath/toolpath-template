/**
 * The type system, as the three recipes that were being retyped.
 *
 * The **sizes** are settled elsewhere and by a sensor: four of them, pinned by
 * `app/type-scale.test.ts`. What had drifted is everything else — the face, the
 * weight and the caps treatment — because each of those was typed out at every
 * site rather than named once. On 2026-09-11 the section label existed in six
 * versions, a catalog number was a title at three different weights, and the
 * heading face the application downloads was rendering nowhere at all.
 *
 * So the rules are:
 *
 * - **Three faces, by role.** Nunito (`font-display`) is headings; Open Sans is
 *   everything else and needs no class; Roboto Mono (`font-mono`) is an
 *   identifier or a measured value and nothing else.
 * - **Three weights.** `font-bold` belongs to a display heading, `font-semibold`
 *   is emphasis in the body face, and 400 is the rest. `font-normal` is a reset
 *   for a `<th>`, not a choice.
 * - **Mono never takes a weight.** `root.tsx` asks Google for Roboto Mono at 400
 *   and nothing else, so `font-mono font-bold` is a weight the browser
 *   *synthesises* — a smeared outline rather than a bold cut. Size and colour
 *   carry the emphasis instead; if a real bold mono is ever wanted, the weight
 *   goes in the font request first and this comment comes out.
 *
 * **A dialog says a thing one way.** The three boxes over the part — a feature,
 * a group, a tool assembly — had fifteen recipes between them: three sizes, two
 * faces, two weights and six greys, with the same job done differently in each
 * (Paul, 2026-09-11: "can we get less text sizes and types in the feature,
 * group, and tool assembly dialogs?"). `DIALOG_*` below is the whole vocabulary
 * they are allowed, and `type-scale.test.ts` § "names no type of its own" is the
 * sensor: those components write no `text-*` or `font-*` class at all, so a
 * sixteenth recipe cannot be typed into one of them.
 *
 * `app/type-scale.test.ts` is the sensor for all of it, in the same file that
 * pins the scale — a rule about type without a check on it is how this drifted.
 */

/**
 * A heading: the display face, the top of the scale, the brightest ink.
 *
 * The application's `<h1>`s and `<h2>`s. Nunito is loaded for exactly this and
 * was reaching none of them, because the class every one of them carried was
 * `font-heading` — which is not a token `@toolpath/ui`'s theme defines, so it
 * compiled to nothing and each heading quietly fell back to body copy.
 */
export const HEADING = 'font-display text-lg font-bold text-zinc-100'

/**
 * A section label: the small capitals over a group of controls.
 *
 * Twenty-seven of them, in six recipes. This is the one the majority already
 * wore — the others were a half-step brighter, a half-step heavier, or a step
 * wider, none of which was saying anything the other twenty-six were not.
 */
export const SECTION_LABEL = 'text-2xs font-semibold tracking-wide text-zinc-500 uppercase'

/**
 * The face a table is set in — **one, for the whole grid**.
 *
 * A row used to change font mid-way and change back: the catalog number was
 * mono, the vendor, family and type were body, and the six measured columns
 * were mono again, so reading across one tool crossed the seam five times
 * (Paul, 2026-09-11: "it's still back and forth in the table — I think choose
 * one font in the tables").
 *
 * **The body face, not mono** (Paul, 2026-09-11: "this is too techy and doesn't
 * fit in"). A grid of part numbers and measurements is the one place mono is
 * traditionally reached for, and setting the whole table in it made the table
 * read as a terminal window bolted onto an application that is Open Sans
 * everywhere else. The catalog is a thing a shop reads, not a log.
 *
 * **`tabular-nums` holds on to what mono was actually for here.** The reason
 * those six columns were mono is that a column of figures has to line up.
 * Open Sans draws its digits on one advance width already — measured on
 * 2026-09-11, `1111111111` and `0000000000` set to the same 91.5px with the
 * feature on *or* off — so this buys nothing today and guarantees it tomorrow:
 * it is the alignment stated as a requirement rather than inherited from a
 * property of one typeface, and the next face swapped in here cannot quietly
 * take it away.
 *
 * It is declared **once, on the container**, and nothing inside a table names a
 * face of its own — that is what makes one font a fact about the grid rather
 * than fifteen cells agreeing. `type-scale.test.ts` § "set a table in one face"
 * is the check, and it reads the table components for any `font-*` family class
 * at all.
 */
export const TABLE_FACE = 'font-body tabular-nums'

/**
 * The ink a table's rows are set in — **one, for every column**.
 *
 * The face was not the only thing changing across a row (Paul, 2026-09-11: "it
 * needs to be consistent, some of those columns are different text than
 * others"). Four greys were in play at once — the catalog number at `zinc-100`,
 * the vendor and family at `zinc-400`, the type and the measurements at
 * `zinc-300` — so half the columns read as emphasised and the other half as
 * secondary, on a grid where every column is equally the answer.
 *
 * Colour in a cell now means something happened to that value: an amber or red
 * mark against a rule, or `zinc-600` where there is no value at all. Nothing is
 * dimmed merely for being prose.
 */
export const TABLE_INK = 'text-zinc-300'

/**
 * The heading row's ground — the accent, because that row is where the
 * answering happens.
 *
 * Every column heading sorts the list and opens the filter that narrows it, so
 * the row of them is the one strip of a table a shop presses rather than reads
 * (Paul, 2026-09-11: "blue is our selection color and that's a spot to make
 * selections"). `--table-head` in `styles.css` is the colour and carries the
 * reasoning; this is the pair of classes that reaches it.
 *
 * **Both halves, and both with `!`.** `@toolpath/ui`'s `HeaderRow` paints
 * itself `!bg-white dark:!bg-zinc-900`, and the table library sets a third
 * background through its own theme. `cn` is `twMerge`, so naming the same two
 * variants takes the kit's pair off — one of them alone would leave the other
 * theme's white or zinc standing.
 */
export const TABLE_HEAD = '!bg-(--table-head) dark:!bg-(--table-head)'

/**
 * The title of a dialog: the one thing the box is about.
 *
 * The reading's name in the feature box, and nothing else — a box has one
 * subject, so a second thing set this way is a second subject.
 */
export const DIALOG_TITLE = 'text-sm font-semibold text-zinc-100'

/**
 * An answer inside a dialog: a measured value, a catalog number, a thing chosen.
 *
 * Add `font-mono` where it is a number or an identifier; the face is the only
 * thing a value ever varies by. The ink is the page's brightest because a value
 * is what somebody opened the box to read.
 */
export const DIALOG_VALUE = 'text-xs text-zinc-100'

/**
 * A sentence the box says to somebody — an offer, a caution, an explanation.
 *
 * Distinct from {@link DIALOG_NOTE} by ink alone, and the distinction is the
 * job: this is prose addressed to a reader, that is a caption attached to a
 * value. Prose is the brighter of the two because it is read rather than
 * glanced at, and because both of the boxes it sits in have a ground of their
 * own under it.
 */
export const DIALOG_TEXT = 'text-2xs text-zinc-300'

/**
 * A caption, a hint or a status: whatever names or qualifies an answer.
 *
 * The label under a measurement, the machining direction beside a name, the
 * line saying what is still missing before a stack can be ordered.
 */
export const DIALOG_NOTE = 'text-2xs text-zinc-500'

/**
 * Where there is no value at all — **an ink, over one of the recipes above**.
 *
 * The same rule the tables keep (`TABLE_INK`): colour in a dialog means
 * something happened to that value, and the one thing that happens most often
 * is that there is nothing there yet. An empty slot and an empty group are the
 * same fact, so they are the same grey.
 */
export const DIALOG_EMPTY = 'text-zinc-600'
