import { useState } from 'react'
import {
  CaretDownIcon,
  CaretRightIcon,
  PushPinIcon,
  RulerIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { Button, Input, cn } from '@toolpath/ui'
import { convertLength, decimalsFor, type UnitSystem } from '@toolpath/tool-support'
import {
  shownIn,
  type ClearanceBox,
  type ClearanceBoxes,
  type ClearanceEdit,
  type ClearanceField,
} from 'shared/clearance-entry'
import { readEntry } from 'shared/range-entry'
import { MeasurementIcon } from './feature-icons'
import { SECTION_LABEL } from 'shared/type'

/**
 * The three numbers under the drawing, any one of which can be the stated one.
 *
 * **What this replaces is a sentence** — "at 0.625 in below the holder ·
 * 0.135 in above the wall at the body" — which said all three numbers and let a
 * shop set none of them. The clearances were the sheet's knobs, 0.020 in, with
 * no control anywhere on the page; the length was whatever those knobs made
 * necessary. Paul, 2026-09-11: the three decide each other, so state whichever
 * one you know and read the other two off the stack it produces.
 *
 * `shared/clearance-entry.ts` is the whole of the rule — which direction an
 * edit solves in, and what each box then says. This is the typing: a draft per
 * box, the page's unit going in and coming out, and the caption under each box
 * naming which of the three roles its number is playing.
 *
 * **It sits on `@toolpath/tool-drawing` rather than inside it.** The drawing
 * package draws a stack and the clearance around it; deciding a stack is the
 * application's, and the production application is going to want the same
 * sheet under a different set of controls.
 */

/** The three, in the order they are read: the length, then the room it buys. */
const FIELDS: ReadonlyArray<ClearanceField> = ['below', 'axial', 'radial']

export interface ClearanceEntryProps {
  readonly boxes: ClearanceBoxes
  readonly unit: UnitSystem
  readonly edit: ClearanceEdit | null
  readonly onEdit: (edit: ClearanceEdit | null) => void
}

/** The words over each box, and what an empty one is measuring. */
const LABEL: Record<ClearanceField, string> = {
  below: 'Below holder',
  axial: 'Axial',
  radial: 'Radial',
}

/**
 * The drawing for each of the three, folded or open.
 *
 * `LBH` is the panel's own icon for the length below the holder, so the folded
 * row and the table of numbers under it name that measurement the same way; the
 * two clearances are drawn beside it in `feature-icons.tsx` rather than picked
 * out of an icon set, for the same reason.
 */
const MEASURES: Record<ClearanceField, string> = {
  below: 'LBH',
  axial: 'axialClearance',
  radial: 'radialClearance',
}

const TITLE: Record<ClearanceField, string> = {
  below: 'How far the tool stands out of the holder. State it, or read what the clearances need.',
  axial: 'Room between the holder nose and the material above the cut.',
  radial: 'Room between the stack and a wall standing taller than the cut.',
}

/** A number in the unit being read in, bare, because the box is labelled. */
const draftOf = (millimetres: number | null, unit: UnitSystem): string =>
  millimetres === null
    ? ''
    : convertLength(millimetres, 'millimeters', unit).toFixed(decimalsFor(unit))

/**
 * What one box is, said with an icon in the field rather than a line under it.
 *
 * **The words came out** (Paul, 2026-09-11: "get rid of the lines of text below
 * and use icons in the text entry area to show if calculated or entered"). A
 * caption under each of three boxes was three sentences in a third of a panel
 * each — "what clearing needs", "measured", "under 0.51 mm" — which wrapped,
 * pushed the sheet up, and said in six words what a pin says. The words are the
 * field's `title` now, so the reading is still there for anybody who wants it.
 *
 * Three states, three marks: a pin for the number a shop stated, a rule for one
 * the app worked out, and a warning for one that does not meet what it is being
 * held to. Only the last is coloured, by the kit's own `invalid`, so it says the
 * same thing in either theme.
 */
interface Mark {
  readonly icon: typeof RulerIcon
  /** What it would have said in words, which is what the field is titled with. */
  readonly said: string
  readonly amiss: boolean
}

const markForBelow = (
  boxes: ClearanceBoxes,
  edit: ClearanceEdit | null,
  say: (millimetres: number | null) => string,
): Mark => {
  const { below } = boxes
  if (below.overLimit) {
    return { icon: WarningIcon, said: 'past this tool’s limit', amiss: true }
  }
  if (below.clamped) {
    return {
      icon: WarningIcon,
      said: `this tool cannot be set there — it holds at ${say(below.value)}`,
      amiss: true,
    }
  }
  if (below.entered !== null) {
    return { icon: PushPinIcon, said: 'set here', amiss: false }
  }
  if (edit?.field === 'axial' || edit?.field === 'radial') {
    return { icon: RulerIcon, said: 'the least that leaves that room', amiss: false }
  }
  return { icon: RulerIcon, said: 'what clearing the part needs', amiss: false }
}

const markFor = (box: ClearanceBox, say: (millimetres: number | null) => string): Mark => {
  /*
    The entry stands and the stack could not meet it. Which way it missed is
    worth saying, because the two have different answers: more room than asked
    means the tool is already as short as it goes, and less means nothing this
    stack can be set to clears by that much.
  */
  if (box.held === 'more') {
    return {
      icon: WarningIcon,
      said: `this tool cannot be set shorter — it leaves ${say(box.value)}`,
      amiss: true,
    }
  }
  if (box.held === 'less') {
    return {
      icon: WarningIcon,
      said: `this stack cannot clear by that much — it leaves ${say(box.value)}`,
      amiss: true,
    }
  }
  if (box.value === null) {
    return { icon: RulerIcon, said: 'nothing stands taller', amiss: false }
  }
  if (box.short) {
    return { icon: WarningIcon, said: `under the ${say(box.asked)} wanted`, amiss: true }
  }
  if (box.entered !== null) {
    return { icon: PushPinIcon, said: 'set here', amiss: false }
  }
  return { icon: RulerIcon, said: 'measured at this length', amiss: false }
}

export const ClearanceEntry = ({ boxes, unit, edit, onEdit }: ClearanceEntryProps) => {
  /**
   * The box being typed in, and nothing else.
   *
   * One draft rather than three kept in step: every other box is showing a
   * number the stack just worked out, and a state of its own would only be a
   * chance for it to show a stale one. The draft goes the moment it commits.
   */
  const [draft, setDraft] = useState<{
    readonly field: ClearanceField
    readonly text: string
  } | null>(null)
  const say = (millimetres: number | null) =>
    millimetres === null ? '—' : `${draftOf(millimetres, unit)} ${unit === 'inches' ? 'in' : 'mm'}`

  const commit = (field: ClearanceField, raw: string) => {
    setDraft(null)
    const text = raw.trim()
    if (text === '') {
      onEdit(null)
      return
    }
    const value = readEntry(text, 'min', unit, 'length').min
    if (value === undefined) {
      return
    }
    onEdit({ field, value })
  }

  const box = (field: ClearanceField, value: number | null, mark: Mark) => (
    <div key={field} className="min-w-0">
      <span className={cn(SECTION_LABEL, 'block truncate')} title={TITLE[field]}>
        {LABEL[field]}
      </span>
      <Input
        id={`clearance-${field}`}
        name={`clearance-${field}`}
        type="text"
        inputMode="decimal"
        aria-label={`${LABEL[field]} — ${mark.said}`}
        title={`${TITLE[field]} — ${mark.said}`}
        icon={mark.icon}
        iconPosition="left"
        invalid={mark.amiss}
        value={draft?.field === field ? draft.text : draftOf(value, unit)}
        onValueChange={(next) => setDraft({ field, text: next ?? '' })}
        onBlur={() => {
          if (draft?.field === field) {
            commit(field, draft.text)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && draft?.field === field) {
            commit(field, draft.text)
          }
          if (event.key === 'Escape' && draft?.field === field) {
            setDraft(null)
          }
        }}
        variant="ghost"
        size="md"
        textEnd
        className="inline-flex w-full rounded border border-zinc-800 px-1.5 py-1 font-mono focus-within:border-zinc-600"
      />
    </div>
  )

  /**
   * **Folded to begin with** (Paul, 2026-09-11).
   *
   * The panel is a column with a sheet in it, and most of the time a shop is
   * reading tools rather than setting one up — so the room goes to the drawing
   * until somebody asks for it. Folded, the three numbers stay on the header
   * with the pin if one of them was stated: a fold that hides the answer is a
   * fold nobody opens twice.
   */
  const [open, setOpen] = useState(false)

  const marks = {
    below: markForBelow(boxes, edit, say),
    axial: markFor(boxes.axial, say),
    radial: markFor(boxes.radial, say),
  }
  /** The first of the three with something wrong, which is what gets the line. */
  const amiss = FIELDS.map((field) => marks[field]).find((mark) => mark.amiss)

  return (
    <div className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
      <Button
        type="button"
        variant="muted"
        size="sm"
        aria-expanded={open}
        aria-controls="clearance-boxes"
        title={open ? 'Fold the clearance numbers away' : 'Show the clearance numbers'}
        onClick={() => setOpen(!open)}
        className={cn(
          SECTION_LABEL,
          'flex w-full items-center justify-between gap-2 px-0 py-0 whitespace-nowrap transition hover:text-zinc-300',
        )}
      >
        <span className="flex shrink-0 items-center gap-1.5">
          {open ? <CaretDownIcon /> : <CaretRightIcon />}
          Clearance
        </span>
        {/*
          **Folded, it is still the three numbers** (Paul, 2026-09-11): each one
          under its own drawing, in three equal shares of what the label leaves,
          so they line up with the three boxes that open under them. A fold that
          hides the answer is a fold nobody opens twice.
        */}
        {open ? null : (
          <span className="text-2xs grid min-w-0 flex-1 grid-cols-3 items-center gap-2 font-mono text-zinc-400 normal-case">
            {FIELDS.map((field) => (
              <span key={field} className="flex min-w-0 items-center justify-end gap-1">
                <MeasurementIcon measurement={MEASURES[field]} />
                <span className="truncate">{say(shownIn(boxes[field]))}</span>
                {edit?.field === field ? (
                  <PushPinIcon weight="fill" className="shrink-0" aria-label="stated here" />
                ) : null}
              </span>
            ))}
          </span>
        )}
      </Button>
      <div
        id="clearance-boxes"
        className={cn('mt-1.5 grid grid-cols-3 gap-2', open ? '' : 'hidden')}
      >
        {box('below', shownIn(boxes.below), marks.below)}
        {box('axial', shownIn(boxes.axial), marks.axial)}
        {box('radial', shownIn(boxes.radial), marks.radial)}
      </div>
      {/*
        **A warning gets words, and only a warning does** (Paul, 2026-09-11: "I
        don't think it's reading out the messaging").

        The captions under every box came out because three sentences in a third
        of a panel each is noise on a row that is usually just telling you three
        numbers. A stack that cannot be set where it was asked is the other case
        — the one moment the row has something to say an icon cannot — and
        putting it in a `title` meant it was said only to whoever thought to
        hover. One line under the row, for the first thing that is amiss.
      */}
      {open && amiss !== undefined ? (
        <p className="text-2xs mt-1.5 leading-tight text-amber-400">{amiss.said}</p>
      ) : null}
      {/*
        The way back to the app's own answer. Emptying the box that was typed
        into does the same thing, and this is for the shop that has typed in two
        of them in turn and wants the stack it started with.
      */}
      {edit === null || !open ? null : (
        <Button
          variant="muted"
          size="sm"
          className="text-2xs mt-1.5 h-auto px-0 py-0 text-zinc-500 hover:text-zinc-300"
          onClick={() => {
            setDraft(null)
            onEdit(null)
          }}
        >
          Back to defaults
        </Button>
      )}
    </div>
  )
}
