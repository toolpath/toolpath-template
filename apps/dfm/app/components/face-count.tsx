/**
 * How many faces a reading has, and a way into them.
 *
 * A control, not a caption. A face is what a plan is made of — cut once,
 * counted by coverage, taken by a claim — so the count is the doorway to the
 * level below, and it says so by looking pressable.
 *
 * One component because it appears in three places that must agree: the mapping
 * lists, the confirmed directions, and the datasheet. Three copies of a number
 * that means "how much of this is being cut" is three chances for one of them
 * to still be counting what the reading *covers*.
 */

/** The pencil. A picture of the verb, so the row does not have to spell it. */
const Pencil = () => (
  <svg
    aria-hidden="true"
    className="size-3 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.4}
    viewBox="0 0 16 16"
  >
    <path d="M11.2 2.3a1.4 1.4 0 0 1 2 2L6 11.5l-2.6.7.7-2.6z" />
    <path d="M9.8 3.7l2.5 2.5" />
  </svg>
)

export const FaceCount = ({
  faces,
  cut,
  onShow,
}: {
  /** Every face the reading covers. */
  faces: number
  /** How many of them it is cutting in the pass being shown. */
  cut: number
  onShow: () => void
}) => {
  const whole = cut === faces

  /*
   * The words the button used to wear, moved into its name.
   *
   * It read `Edit Feature (14 regions)` on every row of a list where every row
   * has one, which is eleven characters of the same sentence repeated down the
   * panel — and on a part with long feature names it was the widest thing in
   * the row. The pencil says *edit* and the number says *how many*; nobody
   * needed to be told the number counts regions when the thing it opens is a
   * list of them.
   *
   * An `aria-label` is right here where it was wrong before: the visible label
   * is now a picture and a figure, so there is no text for it to disagree with
   * — and "(14)" on its own is not a control anybody could name.
   */
  const said = whole
    ? `Edit feature, ${String(faces)} regions`
    : `Edit feature, cutting ${String(cut)} of its ${String(faces)} regions — ${String(
        faces - cut,
      )} went to another reading`

  return (
    <button
      type="button"
      aria-label={said}
      title={said}
      onClick={onShow}
      /*
       * The same weight whether or not every face is being cut.
       *
       * A partial reading used to come as a filled amber chip, which made it
       * the loudest thing in its row — louder than the reading's own name — so
       * a press aimed at the feature landed here instead. The fact is worth
       * marking and is not worth shouting: the **count** carries it, in amber,
       * and the button stays a button.
       */
      className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-zinc-700 px-1.5 py-px text-2xs tabular-nums text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100"
    >
      <Pencil />
      {/* One element, not three text nodes around a span: the row is a flex
          box with a gap, and split up it drew `( 1 of 2 )`. */}
      <span className={whole ? undefined : 'text-warning'}>
        ({whole ? String(faces) : `${String(cut)} of ${String(faces)}`})
      </span>
    </button>
  )
}
