import { Button, Checkbox, IconButton, Input, cn } from '@toolpath/ui'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckIcon,
  DotsSixVerticalIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  PencilSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import {
  UNIT_ABBREVIATION,
  type UnitSystem,
  convertLength,
  decimalsFor,
} from '@toolpath/tool-support'
import { movedBy, movedTo } from 'shared/column-order'
import { sameBound } from 'shared/filter'
import { readEntry, readRange, type Side } from 'shared/range-entry'
import { LAYER_COLUMN_FILTER, useEscape, useKeyLayer } from 'shared/use-escape'
import { SECTION_LABEL } from 'shared/type'

/**
 * Asking about one number: its two ends, and no operator to choose first.
 *
 * **The operator is typed, not picked off a list** (Paul, 2026-09-11: "it's
 * weird showing the drop down then having to enter text"). Narrowing Diameter
 * to "at least 6" cost four presses before the first keystroke — the funnel,
 * the operator list, the operator, and the box that only then existed, because
 * the menu opened on "Any" and "Any" draws no box. Both ends are now on screen
 * from the start and the caret is already in the lower one, so the whole of the
 * gesture is: open it, type.
 *
 * Everything that list offered is still sayable, in the shorthand a shop
 * already writes: `6-12`, `>6`, `<12`, `=6`. `shared/range-entry.ts` is the
 * rule, and it reads a box that states the *other* box's end — `<12` typed
 * into the lower one — so the cursor never has to be in the right place first.
 * That list was also the one popover inside `FilterMenu`, and the reason both
 * its press-outside and its Enter handler carry a `[data-base-ui-portal]`
 * exception. Nothing a filter draws opens a kit popover any more; the two
 * exceptions stay because the next filter to need one would need them again.
 *
 * **A box holds what was typed, not what was stored.** A controlled input that
 * re-formats through millimetres on every keystroke turns "1." into "1.000"
 * under the cursor. So each box keeps its own text and commits when the text
 * says a number; the stored value only writes back into a box when it has
 * actually changed — a suggestion, a saved filter, Clear — or when the box is
 * left, which is where shorthand is written back out in longhand.
 */

export interface Bound {
  readonly min?: number
  readonly max?: number
}

export type Compare = 'any' | 'equals' | 'over' | 'range' | 'under'

/** Counts, angles and ratios are not lengths, and are never converted. */
export type Kind = 'length' | 'count' | 'deg' | 'ratio'

/**
 * The shape a stored bound has.
 *
 * No longer what any control is set to — nothing on screen has a shape any
 * more — but still what a column is *asking*, which is what fills its funnel
 * and what decides whether there is a rule left to overrule.
 */
export const compareOf = (bound: Bound | undefined): Compare => {
  if (!bound || (bound.min === undefined && bound.max === undefined)) {
    return 'any'
  }
  if (bound.min !== undefined && bound.max !== undefined) {
    return bound.min === bound.max ? 'equals' : 'range'
  }
  return bound.max === undefined ? 'over' : 'under'
}

/** A stored value as text in the unit being read in, for a box that has none yet. */
const toDraft = (value: number | undefined, unit: UnitSystem, kind: Kind): string => {
  if (value === undefined) {
    return ''
  }
  if (kind === 'length') {
    return convertLength(value, 'millimeters', unit).toFixed(decimalsFor(unit))
  }
  return String(value)
}

/** Whether a box already states this end, so its text is left alone. */
const says = (
  draft: string,
  side: Side,
  value: number | undefined,
  unit: UnitSystem,
  kind: Kind,
): boolean => {
  const entry = readEntry(draft, side, unit, kind)
  const meant = side === 'min' ? entry.min : entry.max
  if (meant === undefined || value === undefined) {
    return meant === value
  }
  return Math.abs(meant - value) < 1e-9
}

/**
 * What the boxes take besides a number, for the one place it is said.
 *
 * **On the box, not under it** (Paul, 2026-09-11: "it's a good party trick but
 * maybe hide the note"). This stood as a line of its own while the caret was in
 * either box, and a line of bare symbols is a line that has to be explained —
 * `>6` and `=6` say nothing about which end they are without their words, and
 * the boxes already say min and max on their own. So the shorthand is a
 * shortcut somebody finds rather than a legend everybody reads past.
 */
const howToType = (kind: Kind): string =>
  kind === 'length' ? 'A number — or 6-12, >6, <12, =6, 1/4"' : 'A number — or 6-12, >6, <12, =6'

export interface RangeFilterProps {
  readonly label: string
  readonly bound: Bound | undefined
  readonly onBound: (bound: Bound | undefined) => void
  readonly unit: UnitSystem
  readonly kind: Kind
  /**
   * Whether the lower box takes the caret as it is drawn.
   *
   * True where this filter *is* the dialog somebody just opened, and false in
   * the filter panel, where a dozen of these are mounted at once and one of
   * them stealing the focus would be a page that scrolls itself on load.
   */
  readonly opened?: boolean
}

export const RangeFilter = ({
  label,
  bound,
  onBound,
  unit,
  kind,
  opened = false,
}: RangeFilterProps) => {
  const [lower, setLower] = useState(() => toDraft(bound?.min, unit, kind))
  const [upper, setUpper] = useState(() => toDraft(bound?.max, unit, kind))
  const first = useRef<HTMLInputElement>(null)

  const min = bound?.min
  const max = bound?.max

  useEffect(() => {
    if (!opened) {
      return
    }
    /*
      Opened *by* a press somebody has just made, so the caret belongs in it —
      the rule `name-field.tsx` states for the same reason. Selected rather than
      appended to, because the press after "not 6" is usually "8".

      **On the next frame, because that press is still in flight.** The funnel
      opens this menu on `pointerdown` (see `FilterFunnel` for why), and the
      browser focuses the funnel itself as the default action of the `mousedown`
      that follows — after this effect has run. Focusing straight away put the
      caret in the box and the press took it back out, so the dialog opened on a
      box nobody could type into.
    */
    const frame = requestAnimationFrame(() => {
      first.current?.focus()
      first.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [opened])

  /**
   * The stored bound changed under us — a suggestion, a saved filter, Clear.
   *
   * **A bound this component wrote is left exactly as it is.** The test is
   * whether the two boxes on screen add up to what is stored; if they do, the
   * store is only echoing them and nothing moves. That is what keeps a
   * half-typed `6-` where it was typed, and what keeps the other box's text
   * while one of them is emptied on the way to the next number.
   *
   * Only a bound that could not have come from this screen is adopted, and
   * then only into the boxes that do not already say it.
   */
  useEffect(() => {
    const stored = min === undefined && max === undefined ? undefined : { min, max }
    if (sameBound(readRange(lower, upper, unit, kind), stored)) {
      return
    }
    if (!says(lower, 'min', min, unit, kind)) {
      setLower(toDraft(min, unit, kind))
    }
    if (!says(upper, 'max', max, unit, kind)) {
      setUpper(toDraft(max, unit, kind))
    }
    // The drafts are read, not depended on: this runs when the *stored* bound
    // moves, and re-running it on every keystroke is the bug it exists to fix.
  }, [min, max])

  const commit = (nextLower: string, nextUpper: string) => {
    setLower(nextLower)
    setUpper(nextUpper)
    onBound(readRange(nextLower, nextUpper, unit, kind))
  }

  /**
   * What a box settles on once it is finished with.
   *
   * The bound is already right — every keystroke commits one — so this is only
   * the text: `6-12` written back out as a 6 in one box and a 12 in the other,
   * and `1.` as `1.00`. **Only the box being left is rewritten**, unless what
   * it said belongs somewhere else, because canonicalising the far box while
   * the caret is arriving in it is the "1." to "1.000" defect wearing a hat.
   */
  const settle = (side: Side) => {
    const entry = readEntry(side === 'min' ? lower : upper, side, unit, kind)
    const displaced = side === 'min' ? entry.max !== undefined : entry.min !== undefined
    const read = readRange(lower, upper, unit, kind)
    if (displaced || side === 'min') {
      setLower(toDraft(read?.min, unit, kind))
    }
    if (displaced || side === 'max') {
      setUpper(toDraft(read?.max, unit, kind))
    }
  }

  const box = (side: Side, value: string, onValue: (raw: string) => void) => (
    <Input
      id={`${label}-${side}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}
      name={`range-${side}`}
      type="text"
      inputMode="decimal"
      aria-label={`${label} — ${side}`}
      placeholder={side}
      title={howToType(kind)}
      value={value}
      {...(side === 'min' ? { ref: first } : {})}
      onValueChange={(next) => onValue(next ?? '')}
      onBlur={() => settle(side)}
      onKeyDown={(event) => {
        /*
          Inside a `FilterMenu` this never fires: that dialog answers Enter on
          the document, on the way down, and takes the press for itself. Here
          for the panel, where these boxes stand on the page with no dialog
          over them and Enter is the only way to finish without moving the
          mouse.
        */
        if (event.key === 'Enter') {
          settle(side)
        }
      }}
      variant="ghost"
      size="md"
      textEnd
      className="inline-flex w-16 rounded border border-zinc-800 px-1.5 py-1 font-mono text-zinc-100 focus-within:border-zinc-600"
    />
  )

  return (
    <div className="flex flex-wrap items-center gap-1">
      {box('min', lower, (raw) => commit(raw, upper))}
      <span className="text-2xs text-zinc-600">–</span>
      {box('max', upper, (raw) => commit(lower, raw))}
      {kind === 'length' ? (
        <span className="text-2xs text-zinc-600">{UNIT_ABBREVIATION[unit]}</span>
      ) : null}
    </div>
  )
}

/**
 * What a column offers when the number in it no longer matches the geometry's.
 *
 * **The warning belongs on the filter that caused it, and it asks before it
 * acts** (Paul, 2026-09-08: "it should recognize if I enter something to
 * override the rules and warn me to confirm it … when I override a
 * geometry-set filter, it should warn me there").
 *
 * The suggested bound was written from the same `must` rows that go on to judge
 * every tool, so changing it asks for precisely what the rules then remove.
 * That is a decision a shop is entitled to make — a larger cutter than the
 * geometry needs is an ordinary thing to run — and it is not one to make by
 * accident, so the change is what raises the warning and a press is what acts
 * on it. **This column only:** forgiving the diameter says nothing about the
 * flute length, and the count is the tools this column alone is holding back.
 */
export interface ColumnOverride {
  /** What the geometry asked for here, or nothing where it asked nothing. */
  readonly suggested: Bound | undefined
  /** How many tools only this column's rules are keeping off the list. */
  readonly available: number
  readonly on: boolean
  /**
   * Setting this column's rules aside, which the tick is what does.
   *
   * One direction only: the way back out of an override is the number itself —
   * cleared, or typed back to what the geometry asked for — because the number
   * and the forgiveness are one decision (`part.tsx` § `overrideFor`). A press
   * that dropped the forgiveness and left the widened number standing was the
   * dead end this control exists to remove.
   */
  readonly onOverride: () => void
  /** The suggested bound in the words the boxes above are using. */
  readonly say: (bound: Bound) => string
}

/**
 * Whether this column has an answer of somebody's own in it.
 *
 * **A filter is somebody's answer the moment it is not the geometry's.** Typing
 * a bound where the geometry suggested one is the case this started from; typing
 * one where it suggested nothing is the same act, and gating on a suggestion
 * meant a column the sheet happens not to bound could never be overruled at all
 * even while its rules were holding tools off the list.
 *
 * **And an empty box is an answer too, where the geometry put a number there**
 * (Paul, 2026-09-11: "when I remove a value for min or max, it is not showing
 * tools down to the smallest or largest tool in the library"). Clearing is the
 * loosest thing a column can say, so `part.tsx` § `released` sets that column's
 * rules aside on the spot — and this is what puts the sentence saying so on
 * screen. Gated on `compareOf` alone, the dialog said nothing at all in the one
 * state where the list had just widened underneath it.
 *
 * With no bound and no suggestion there is nothing to overrule: the rules are
 * the only thing narrowing that number, which is the ordinary state of the page.
 */
export const overrideOffered = (
  bound: Bound | undefined,
  override: ColumnOverride | undefined,
): override is ColumnOverride =>
  override !== undefined &&
  (compareOf(bound) !== 'any' || override.suggested !== undefined) &&
  !sameBound(bound, override.suggested)

/**
 * The sentence under the boxes: what the geometry asked for, what changing it
 * does not do, and what the tick will do about it.
 *
 * **Quiet** (Paul, 2026-09-08: "the colouring on the messaging should be less
 * dramatic and not yellow"). A shop running a larger cutter than the geometry
 * needs is doing an ordinary thing; an alarm-coloured panel around it said it
 * had done something wrong.
 *
 * **It is the warning, and it is the only thing in the dialog saying this**
 * (Paul, 2026-09-09: "the button shouldn't be a button, it should be a warning,
 * then I confirm if I want to do it by clicking the check"). There was a chip
 * in the chrome beside the tick until then; it said the same thing this
 * sentence says and asked for a second press to do what closing the dialog
 * could just as well have done. So the warning stands alone and names the tick,
 * and `FilterMenu` § `confirm` is the tick doing it.
 */
export const OverrideNotice = ({
  label,
  bound,
  override,
}: {
  readonly label: string
  readonly bound: Bound | undefined
  readonly override: ColumnOverride
}) => {
  const { suggested, available, on, say } = override
  if (!overrideOffered(bound, override)) {
    return null
  }
  const named = label.toLowerCase()
  return (
    <p
      role="note"
      data-column-override
      className="text-2xs mt-2 max-w-64 border-l border-zinc-700 pl-2 leading-snug text-zinc-400"
    >
      {/*
        "Changing it does not change the rules" is true only while they still
        hold: once they are set aside the sentence below says so, and saying
        both was the dialog contradicting itself in the one state where the
        list had just widened underneath it.
      */}
      {suggested === undefined
        ? `The rules still judge the ${named} whatever this says.`
        : on
          ? `The geometry asked for ${say(suggested)}.`
          : `The geometry asked for ${say(suggested)}. Changing it does not change the rules.`}{' '}
      {available === 0 ? (
        <>Nothing is being held back by the {named} rules alone.</>
      ) : on ? (
        <>
          The {named} rules are set aside: {available} tools they turn down are listed, marked.
          Putting the {named} back to {suggested === undefined ? 'no bound at all' : say(suggested)}{' '}
          takes them off again.
        </>
      ) : (
        <>
          {available} tools only the {named} rules turn down are off this list.{' '}
          <span className="text-zinc-300">Keep this number and list them</span> — the ✓ above — sets
          those rules aside for the {named} alone.
        </>
      )}
    </p>
  )
}

/** Room kept between the menu and the edge of the screen. */
const MENU_EDGE = 12

/**
 * The least room worth opening downwards into.
 *
 * Below this the menu opens upwards instead. It is a floor on the height as
 * well: a menu squeezed into eighty pixels is one nobody can read, so it takes
 * this much and overhangs rather than becoming a slot.
 */
const MENU_LEAST = 220

/**
 * How tall a box opened off a button may be, and which way it opens.
 *
 * **A menu is as tall as the screen leaves it** (Paul, 2026-09-10, of the Type
 * filter and then of the column picker: "the edit columns drop down list should
 * be scrollable if it runs off the screen"). Both boxes are opened from a
 * header that can sit anywhere down the page, and both were drawn at whatever
 * height their contents came to, so the rows past the bottom edge were
 * unreachable — the column picker's last column could not be ticked at all.
 *
 * One rule for both: the room under the button is measured, the box takes it
 * and scrolls inside itself, and where what is left under the button is a strip
 * it opens upwards into the larger room instead.
 */
export const menuRoom = (
  button: { readonly top: number; readonly bottom: number },
  viewport: number,
): { readonly upwards: boolean; readonly height: number } => {
  const below = viewport - button.bottom - MENU_EDGE
  const above = button.top - MENU_EDGE
  const upwards = below < MENU_LEAST && above > below
  return { upwards, height: Math.max(MENU_LEAST, upwards ? above : below) }
}

/** Where the menu stands: by its top, or by its bottom where it opened upwards. */
type Placed = {
  readonly top: number | null
  readonly bottom: number | null
  readonly left: number
  /** The most it may be, which is the room the screen left it. */
  readonly height: number
}

/**
 * The box a column's funnel opens, drawn over the page and away from the table.
 *
 * **A menu inside the table is a menu nobody can read.** The kit's table is a
 * scroll container on both axes, so a box positioned inside a header cell is
 * clipped at the header's own edge — which is why a filter on a header could
 * not be built out of an absolutely positioned `div`. This is a portal, placed
 * against the funnel that opened it and kept inside the window, so a filter on
 * the last column opens leftwards instead of off the screen.
 *
 * **It is rendered by the table, not by the heading** (Paul, 2026-09-08: "the
 * filter options clear immediately when I make a selection … they should stay
 * active until I click outside of them"). A virtualized table hands
 * `react-window` an `innerElementType` it builds inline, so every render of the
 * list reaches React as a new component type and the whole inner tree — the
 * header row with it — is thrown away and built again. A menu held open by a
 * heading therefore closed itself on the press that narrowed the list, which is
 * the one press it exists for: a second vendor could not be ticked, a number
 * could not be typed past its first digit. Nothing about that is fixable from
 * inside a header cell, so what has to survive lives outside one.
 */
export const FilterMenu = ({
  label,
  code,
  anchors,
  align,
  onClose,
  onClear,
  confirm,
  children,
}: {
  readonly label: string
  /** The column, which is how the funnel to measure against is found. */
  readonly code: string
  /** The table this menu belongs to, so two lists' funnels are never confused. */
  readonly anchors: RefObject<HTMLElement | null>
  /** Which edge of the funnel the menu lines up with. */
  readonly align: 'left' | 'right'
  readonly onClose: () => void
  /**
   * Taking this column's whole answer back, where there is one to take.
   *
   * Absent while the column narrows nothing, and absent on a bound the list was
   * swept on: an × over a filter nobody set is an × that does nothing, and a
   * number the part stated is not this menu's to drop.
   */
  readonly onClear?: () => void
  /**
   * What the tick does besides closing, where this filter has something to
   * confirm.
   *
   * **The warning is the warning, and the tick is the answer to it** (Paul,
   * 2026-09-09: "the button shouldn't be a button, it should be a warning, then
   * I confirm if I want to do it by clicking the check"). A press that
   * overruled the rules standing beside a press that closed the dialog made two
   * controls out of one decision — and the one that acted looked optional, so
   * the dialog could be closed on a number whose own list was empty. There is
   * one way out of this dialog, and where a change needs confirming it is what
   * confirms it.
   */
  readonly confirm?: {
    /** What the tick is called while it is confirming, for a screen reader. */
    readonly label: string
    readonly title: string
    readonly onConfirm: () => void
  }
  readonly children: ReactNode
}) => {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<Placed>({ top: 0, bottom: null, left: 0, height: MENU_LEAST })

  useLayoutEffect(() => {
    // Found rather than held: the funnel is inside a header the table rebuilds
    // under this menu, so the element measured a moment ago is not the one on
    // screen now.
    const funnel = () => {
      const anchor = anchors.current?.querySelector<HTMLElement>(`[data-column-funnel="${code}"]`)
      if (anchor === undefined || anchor === null || anchor.checkVisibility?.() === false) {
        return null
      }
      return anchor
    }

    let looking = 0
    const place = () => {
      const anchor = funnel()
      if (anchor === null) {
        /*
          **A funnel that is missing this instant is not a column that has
          gone** (Paul, 2026-09-09: "it is taking me out of the filter once I've
          entered a certain number of characters"). This runs on every scroll
          anywhere on the page — a narrow box scrolls itself as soon as the text
          outgrows it — and on every render of the list, which is a list that
          throws its header away and builds it again. One lookup landing between
          the two closed the menu mid-word, and nothing about that is the column
          being taken off the table.

          So a miss is looked at twice. What the second look is for is a funnel
          that is *really* gone — hidden by the column picker, or behind
          whichever list the table switched to — which is still gone a frame
          later, where a rebuild is not.
        */
        cancelAnimationFrame(looking)
        looking = requestAnimationFrame(() => {
          if (funnel() === null) {
            onClose()
            return
          }
          place()
        })
        return
      }
      const button = anchor.getBoundingClientRect()
      const width = box.current?.getBoundingClientRect().width ?? 0
      const wanted = align === 'right' ? button.right - width : button.left
      const left = Math.max(8, Math.min(wanted, window.innerWidth - width - 8))
      /*
        `menuRoom` is the rule — and where it says upwards the menu is anchored
        by its bottom rather than placed by a height it has not been measured at
        yet, which is the one way to flip a box without a frame of it in the
        wrong place.
      */
      const room = menuRoom(button, window.innerHeight)
      setAt({
        top: room.upwards ? null : button.bottom + 4,
        bottom: room.upwards ? window.innerHeight - button.top + 4 : null,
        left,
        height: room.height,
      })
    }

    /**
     * A scroll inside this menu is the menu's own business.
     *
     * The listener below captures every scroll on the page, and an `<input>`
     * scrolls itself the moment what is typed outgrows the box — four or five
     * characters in one of the number boxes. Measuring the header again because
     * somebody typed is work for nothing, and it put the whole of the placing
     * above on the end of a keystroke.
     */
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && box.current?.contains(event.target) === true) {
        return
      }
      place()
    }

    place()
    window.addEventListener('resize', place)
    // Capturing, so the table scrolling under an open menu moves it with the
    // header it belongs to rather than leaving it behind over the rows.
    window.addEventListener('scroll', onScroll, true)
    return () => {
      cancelAnimationFrame(looking)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchors, code, align, onClose])

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target === null || box.current?.contains(target) === true) {
        return
      }
      // A press on a funnel is that button's own business: it opens its column
      // or closes this one, and closing here first would undo its own press.
      if (target.closest('[data-column-funnel]') !== null) {
        return
      }
      /*
        **A dropdown opened from inside this menu is inside it.** The kit draws
        a popover in a portal of its own, so choosing an operator for a range
        read as a press on the page and shut the filter before the box to type
        in had been drawn. That operator list is gone — `RangeFilter` says why
        — and this stays for the next filter that opens one.
      */
      if (target.closest('[data-base-ui-portal]') !== null) {
        return
      }
      // TEMPORARY diagnostic, 2026-09-09 — see the note in `place` above.
      console.warn('[filter-close] pointerdown outside', target.tagName, target.className)
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])

  /**
   * Escape puts it away, and Enter is the tick.
   *
   * Enter (Paul, 2026-09-09: "hitting enter with a filter dialog shown should
   * confirm it just like the check mark does"). A filter commits as it is
   * typed, so this closes rather than saves — and where the tick is confirming
   * something, it confirms the same thing.
   *
   * **On the document, and named, because the press it is competing with is on
   * the document** (Paul, 2026-09-10: "when a filter dialog is active
   * underneath a feature/group/tool assembly, hitting enter should confirm the
   * filter and close the filter dialog before it closes the feature/group/tool
   * assembly"). This menu is opened from a column header inside that box, so
   * the focus is usually still on the funnel or on the press that opened the
   * box — nowhere this menu can hear a React keydown from. The page's own Enter
   * ordered the whole assembly and took the filter down with it, unread.
   * `LAYER_COLUMN_FILTER` is how the page knows to stand down: this is the
   * newest thing on the screen and the press is its.
   *
   * **Enter is the dialog's, never a control's** (Paul, 2026-09-10: "the
   * keyboard focus is staying on the checkbox I used most recently in the drop
   * down filters — enter should never check or uncheck, it only works at the
   * dialog level"). A tick in this menu is the kit's `Checkbox`, which is a
   * `<button role="checkbox">`: the focus stays on the last one clicked, and
   * Enter fired that button's own default action instead of finishing the
   * filter. Exempting a focused control was tried on the way here and this is
   * what it cost. `preventDefault` is what holds the activation back — the
   * default runs after the press has finished propagating, so a listener on the
   * document is still in time to cancel it.
   *
   * The one press left alone is one inside a popover the kit drew, which is a
   * portal of its own rather than anything inside this box — the same escape
   * hatch the press-outside rule above needs, and left standing for the same
   * reason: no filter draws such a popover today, and the next one would.
   */
  useKeyLayer(true, {
    name: LAYER_COLUMN_FILTER,
    onEscape: () => {
      // TEMPORARY diagnostic, 2026-09-09 — see the note in `place` above.
      console.warn('[filter-close] escape')
      onClose()
    },
    onEnter: (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (target !== null && target.closest('[data-base-ui-portal]') !== null) {
        return
      }
      /*
        Both, and on the way down: the press is this dialog's, so the control
        the focus happens to be on never sees it and never acts on it.
      */
      event.preventDefault()
      event.stopPropagation()
      confirm?.onConfirm()
      onClose()
    },
  })

  return createPortal(
    <div
      ref={box}
      role="group"
      aria-label={label}
      data-column-filter-menu
      style={{
        ...(at.top === null ? { bottom: at.bottom ?? 0 } : { top: at.top }),
        left: at.left,
        maxHeight: at.height,
      }}
      className="fixed z-50 flex flex-col rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-xl"
    >
      {/*
        **Every filter has a way out that is not a guess** (Paul, 2026-09-08: "I
        should have a check box icon to confirm filters on every filter, which
        just closes it saved at the current state"). A filter commits as it is
        typed, so there is nothing left to save — what was missing was somewhere
        to say *done* other than a click on the page, which is the one gesture
        that is indistinguishable from a misclick.
      */}
      <div className="mb-1.5 flex shrink-0 items-center gap-2">
        <p className={cn(SECTION_LABEL, 'flex-1')}>{label}</p>
        {/*
          **And a way back out that is not a guess either** (Paul, 2026-09-09:
          "can I get an X next to the check mark to clear all filters"). It
          drops everything this column is asking in one press and leaves the
          menu open, because the press after "not that" is usually "this
          instead". Clearing the last of them takes the × away with the
          narrowing it undid.
        */}
        {onClear === undefined ? null : (
          <IconButton
            size="md"
            variant="muted"
            aria-label={`Clear the ${label} filter`}
            title={`Clear the ${label} filter`}
            onClick={onClear}
            className="!size-5 rounded border-0 bg-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 [&_svg]:!size-3"
          >
            <XIcon aria-hidden="true" weight="bold" />
          </IconButton>
        )}
        <IconButton
          size="md"
          variant="muted"
          aria-label={confirm === undefined ? `Done filtering by ${label}` : confirm.label}
          title={confirm === undefined ? 'Done — keep this filter and close' : confirm.title}
          onClick={() => {
            confirm?.onConfirm()
            onClose()
          }}
          className="text-info !size-5 rounded border-0 bg-transparent hover:bg-zinc-800 [&_svg]:!size-3"
        >
          <CheckIcon aria-hidden="true" weight="bold" />
        </IconButton>
      </div>
      {/*
        The tick and the \u00d7 are what somebody reaches for once the list is long
        enough to scroll, so the header is held out of the scrolling half.
      */}
      <div data-column-filter-body className="min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>,
    document.body,
  )
}

/**
 * The funnel on a column header, which says whether the column narrows.
 *
 * Always drawn, filled when the column is narrowing the list: a filter nobody
 * can see is a filter nobody can find their way back out of, and the funnel is
 * the whole of the answer to "why is this list so short".
 *
 * Every press inside it is kept off the header, because the header is the sort:
 * a click that both opened the filter and re-sorted the table is one click
 * doing two things nobody asked for.
 *
 * Whether it is open is the **table's** to remember, for the reason
 * `FilterMenu` gives: this button does not outlive one press of itself.
 *
 * **It opens on the press rather than on the click**, for the same reason. A
 * `click` is only fired where the press and the release land on the same
 * element, and the header this button stands in is thrown away and built again
 * whenever the list re-renders — so a press while the matcher was answering
 * released onto a different button and no click was ever fired. The press is
 * the whole gesture; the keyboard has no press, so `detail === 0` — Enter or
 * Space on a focused button — is taken from the click instead.
 */
export const FilterFunnel = ({
  code,
  label,
  set,
  stated = false,
  open,
  onToggle,
}: {
  readonly code: string
  readonly label: string
  readonly set: boolean
  /**
   * Whether this column is narrowed by the part rather than by an answer.
   *
   * **A filter somebody set and a bound the thread set are not the same mark**
   * (Paul, 2026-09-09). A tap's thread diameter and thread length come from the
   * spec and the depth — `column-filters.ts` § `askOfTapColumn` — so they are
   * filled, because the list is genuinely narrowed on them, and grey rather than
   * lit, because there is no number here to type: pressing one says what it is
   * and where it came from.
   *
   * **Grey is not uncounted.** It still counts in `Clear n filters` (Paul,
   * 2026-09-09: "button should show to clear 3 filters not 1 in this
   * situation") — a mark on the table is a narrowing whoever set it, and a
   * figure that skipped these disagreed with the funnels from the other end.
   * Clearing a tap list returns it to what the part says, which is where these
   * two already are.
   */
  readonly stated?: boolean
  readonly open: boolean
  readonly onToggle: () => void
}) => (
  <span
    data-column-funnel={code}
    className="inline-flex items-center"
    onClick={(event) => event.stopPropagation()}
    onMouseDown={(event) => event.stopPropagation()}
    style={{ pointerEvents: 'auto' }}
  >
    <IconButton
      size="md"
      variant="muted"
      aria-label={`Filter by ${label}`}
      aria-expanded={open}
      title={
        stated
          ? `Narrowed by ${label} — set by what is being cut, not by a filter. Press to see why.`
          : set
            ? `Filtered by ${label}`
            : `Filter by ${label}`
      }
      onPointerDown={onToggle}
      onClick={(event) => {
        if (event.detail === 0) {
          onToggle()
        }
      }}
      /*
        **The table turns pointer events off inside a button.** Its own
        stylesheet says `button * { pointer-events: none }` so that a click
        anywhere in a sortable heading counts as a press on the heading —
        which swallowed every press on this funnel, sorting the column
        instead of opening the filter. An inline style is what beats it,
        the same way the kit's own `HeaderCellInteractive` does.
      */
      style={{ pointerEvents: 'auto' }}
      className={
        stated
          ? 'rounded p-0.5 text-zinc-400 hover:bg-zinc-800'
          : set
            ? 'text-info rounded p-0.5 hover:bg-zinc-800'
            : 'rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'
      }
    >
      {set ? <FunnelIcon weight="fill" /> : <FunnelSimpleIcon />}
    </IconButton>
  </span>
)

/**
 * Which of a term filter's options a typed word leaves.
 *
 * Substring, case-insensitive, on the words the list shows rather than on the
 * value behind them: a holder's type option reads `BT30 ER11 collet chuck` over
 * a value nobody has ever seen, so matching the value would answer `ER11` with
 * nothing. The value is matched as well, because a vendor's own code is
 * sometimes the only thing shorter than the phrase.
 */
export const optionsMatching = <Option extends { value: string; label: string }>(
  options: ReadonlyArray<Option>,
  search: string,
): ReadonlyArray<Option> => {
  const wanted = search.trim().toLowerCase()
  if (wanted === '') {
    return options
  }
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(wanted) || option.value.toLowerCase().includes(wanted),
  )
}

/**
 * Narrowing on a set of names rather than on a number.
 *
 * The Vendor and Type columns, and every word a holder or a collet is picked
 * on. Offered as checkboxes over what the list currently holds, with a count
 * beside each, so a value that would empty the list can be told from a rare one
 * before it is pressed. **Several of them, one after another**: the menu is the
 * table's and stays where it is until somebody presses off it.
 *
 * **A list of ticks is unusable once the axis is long** (Paul, 2026-09-08).
 * Family runs to hundreds of values and Type to dozens, so the box at the top
 * narrows the options themselves, and the button beside it ticks every option
 * the box is showing — which is how `HARVI` becomes one filter rather than
 * eleven presses down a scrolling list. Searching is not narrowing: what it
 * hides stays chosen, because a value ticked and then scrolled out of sight by
 * a second word is still a value the shop asked for.
 *
 * **A column can only offer what the list is holding, and that is not always
 * the whole question** (Paul, 2026-09-08: "there is no way to show end mills if
 * I can't find a drill. I should have the option to show endmills in the Type
 * filter, but it does not show up … I should always have a '...' row at the
 * bottom of the recommended filter options to expand any filter to show what
 * it's hiding from the list in any filter that is limited contextually").
 *
 * A threaded hole's list is drills, so the Type column offered `Drill` and
 * nothing else — and a shop that wanted to interpolate the predrill had no way
 * to say so. So the values a list happens to hold are the *recommendation*, and
 * the row under them opens the rest: everything the axis has that this list is
 * not showing, drawn greyed at nought because pressing one is how the question
 * widens. The same rule the filter panel has followed since 2026-09-01 — a
 * value that could return something stays pressable — reaching the values a
 * contextual list never offered at all.
 */
export const TermFilter = ({
  label,
  options,
  chosen,
  onChosen,
  hidden = [],
}: {
  /** The column, which is what the search box says it searches. */
  readonly label: string
  readonly options: ReadonlyArray<{ value: string; label: string; count: number }>
  readonly chosen: ReadonlyArray<string>
  readonly onChosen: (values: ReadonlyArray<string>) => void
  /**
   * What this axis has that the list is not showing — everything the context
   * narrowed away, behind the `…` row.
   */
  readonly hidden?: ReadonlyArray<{ value: string; label: string }>
}) => {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const rest = optionsMatching(hidden, search).map((option) => ({ ...option, count: 0 }))
  const offList = new Set(hidden.map((option) => option.value))
  const shown = [...optionsMatching(options, search), ...(expanded ? rest : [])]
  const values = shown.map((option) => option.value)
  /** Whether the button takes the shown options back off, which is its words. */
  const all = values.length > 0 && values.every((value) => chosen.includes(value))

  const toggle = (value: string) =>
    onChosen(chosen.includes(value) ? chosen.filter((each) => each !== value) : [...chosen, value])

  const toggleShown = () =>
    onChosen(
      all
        ? chosen.filter((each) => !values.includes(each))
        : [...chosen, ...values.filter((value) => !chosen.includes(value))],
    )

  return (
    <div className="min-w-44">
      {options.length === 0 && hidden.length === 0 ? null : (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Input
            id={`term-filter-search-${label}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}
            name="term-filter-search"
            type="search"
            value={search}
            onValueChange={(next) => setSearch(next ?? '')}
            placeholder="Search"
            aria-label={`Search ${label.toLowerCase()} values`}
            variant="ghost"
            size="md"
            className="h-8 w-40 rounded border border-zinc-800 px-2 font-sans text-zinc-100 normal-case"
          />
          <Button
            type="button"
            size="sm"
            variant="muted"
            disabled={shown.length === 0}
            onClick={toggleShown}
            className="text-2xs shrink-0 rounded px-1.5 py-1 whitespace-nowrap normal-case"
          >
            {all ? 'Clear shown' : `Select shown (${shown.length})`}
          </Button>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto">
        {options.length === 0 && hidden.length === 0 ? (
          <p className="text-2xs px-2 py-1.5 text-zinc-600">Nothing to narrow by.</p>
        ) : shown.length === 0 ? (
          <p className="text-2xs px-2 py-1.5 text-zinc-600">Nothing matches that.</p>
        ) : (
          shown.map((option) => {
            /*
              Off the list: a value the context narrowed away, drawn faintly at
              nought. Pressable like any other, because pressing it is how the
              question widens — the filter panel's own rule since 2026-09-01.
            */
            const off = offList.has(option.value)
            return (
              <div
                key={option.value}
                data-term-option={option.value}
                className="text-2xs flex cursor-pointer items-center gap-2 px-2 py-1 whitespace-nowrap normal-case hover:bg-zinc-900"
              >
                <Checkbox
                  name={`term-filter-${option.value}`}
                  checked={chosen.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  size="sm"
                  aria-label={off ? `${option.label} — not on this list` : option.label}
                />
                <span className={off ? 'text-zinc-500' : 'text-zinc-200'}>{option.label}</span>
                <span data-term-count className="ml-auto pl-3 font-mono tabular-nums text-zinc-600">
                  {option.count}
                </span>
              </div>
            )
          })
        )}
        {rest.length === 0 && !(expanded && hidden.length > 0) ? null : (
          <Button
            type="button"
            size="sm"
            variant="muted"
            data-expand-filter
            onClick={() => setExpanded(!expanded)}
            title={
              expanded
                ? `Offer only the ${label.toLowerCase()} values this list holds.`
                : `Every ${label.toLowerCase()} the catalog has, including what this list is not showing. Choosing one asks for it.`
            }
            className="text-2xs w-full justify-start rounded-none border-0 bg-transparent px-2 py-1.5 text-left whitespace-nowrap text-zinc-500 normal-case hover:bg-zinc-900 hover:text-zinc-300"
          >
            {expanded ? 'Fewer — only what this list holds' : `… ${String(rest.length)} more`}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Narrowing on what somebody types.
 *
 * The catalog number, which is the one column a shop arrives at already knowing
 * the answer to. It matches the number and the vendor together, so typing
 * `widia` finds the maker and typing `TDMX` finds the family, and it lives on
 * the column it reads rather than in a search box above a table with a Catalog
 * number heading two inches below it.
 */
export const TextFilter = ({
  label,
  value,
  onValue,
}: {
  readonly label: string
  readonly value: string
  readonly onValue: (value: string) => void
}) => (
  <Input
    id="column-filter-text"
    name="column-filter-text"
    type="search"
    value={value}
    onValueChange={(next) => onValue(next ?? '')}
    placeholder={label}
    aria-label={`Search by ${label.toLowerCase()}`}
    variant="ghost"
    size="md"
    className="h-8 w-40 rounded border border-zinc-800 px-2 font-sans text-zinc-100 normal-case"
  />
)

/**
 * Which columns are drawn, and in what order.
 *
 * A pencil in the corner of the table rather than a control in the header row:
 * a column of its own for the button that edits the columns took real width
 * from every row to hold one icon, and left an empty cell under it on every
 * line of the table.
 *
 * The list is the order — drag a row by the handle to its left and the table's
 * columns move with it (Paul, 2026-08-31). The handle is left of the tick
 * because the tick is the row's own control and dragging must not toggle it;
 * arrow keys on a focused handle do the same thing without a pointer.
 */
export const ColumnPicker = ({
  columns,
  shown,
  onToggle,
  onReorder,
}: {
  /** Every column, in the order the table draws them. */
  readonly columns: ReadonlyArray<{ code: string; label: string }>
  readonly shown: ReadonlyArray<string>
  readonly onToggle: (code: string) => void
  /** The whole order, after a move. Absent, the rows cannot be dragged. */
  readonly onReorder?: (codes: ReadonlyArray<string>) => void
}) => {
  const [open, setOpen] = useState(false)
  const [held, setHeld] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pencil = useRef<HTMLButtonElement>(null)
  const [room, setRoom] = useState({ upwards: false, height: MENU_LEAST })
  const order = columns.map((column) => column.code)

  const move = (code: string, index: number) => {
    const next = movedTo(order, code, index)
    if (next.join() !== order.join()) {
      onReorder?.(next)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  /*
    The list is as long as the table has columns — twenty on the tool list — and
    the pencil is at the top of a table that can sit anywhere down the page, so
    the bottom of the list ran off the screen and the columns there could not be
    ticked. `menuRoom` is the same rule the filter menus follow: take the room
    the screen leaves and scroll inside it, or open upwards where what is under
    the pencil is a strip.
  */
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const measure = () => {
      const button = pencil.current?.getBoundingClientRect()
      if (button !== undefined) {
        setRoom(menuRoom(button, window.innerHeight))
      }
    }
    // A scroll inside the list is the list's own business, exactly as it is
    // inside a filter menu.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && box.current?.contains(event.target) === true) {
        return
      }
      measure()
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // Escape puts it away as well, without going back to find the header.
  useEscape(open, () => setOpen(false))

  return (
    <div ref={box} className="relative">
      <IconButton
        ref={pencil}
        size="lg"
        variant="muted"
        aria-label="Which columns to show"
        aria-expanded={open}
        title="Which columns to show"
        onClick={() => setOpen(!open)}
        /* **A press keeps its own ground** (Paul, 2026-09-11: "the buttons
           shouldn't be transparent"). The chrome this stands in floats over the
           part now, so the pencil wears the same chip the buttons beside it
           wear rather than sitting bare on the geometry. */
        className="rounded border border-zinc-800 bg-zinc-900 p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <PencilSimpleIcon />
      </IconButton>
      {open ? (
        <div
          role="group"
          aria-label="Columns"
          style={{ maxHeight: room.height }}
          className={cn(
            'absolute right-0 z-30 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl',
            room.upwards ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {columns.map((column, at) => (
            <div
              key={column.code}
              // The row is the drop target; the handle is what starts the
              // drag, so a press on the tick still only ticks.
              onDragOver={(event) => {
                if (held !== null) {
                  event.preventDefault()
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (held !== null) {
                  move(held, at)
                  setHeld(null)
                }
              }}
              className={cn(
                'text-2xs flex items-center gap-1.5 px-2 py-1 whitespace-nowrap hover:bg-zinc-900',
                held === column.code && 'opacity-50',
              )}
            >
              {onReorder === undefined ? null : (
                <IconButton
                  size="md"
                  variant="muted"
                  draggable
                  aria-label={`Move ${column.label.toLowerCase()}`}
                  title="Drag to reorder, or use the arrow keys"
                  onDragStart={() => setHeld(column.code)}
                  onDragEnd={() => setHeld(null)}
                  onKeyDown={(event) => {
                    const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
                    if (by !== 0) {
                      event.preventDefault()
                      onReorder(movedBy(order, column.code, by))
                    }
                  }}
                  className="focus-visible:ring-info/60 shrink-0 cursor-grab rounded text-zinc-600 transition hover:text-zinc-300 focus-visible:ring-1 focus-visible:outline-none active:cursor-grabbing"
                >
                  <DotsSixVerticalIcon aria-hidden="true" />
                </IconButton>
              )}
              <div className="flex flex-1 cursor-pointer items-center gap-2">
                <Checkbox
                  name={`column-${column.code}`}
                  checked={shown.includes(column.code)}
                  onChange={() => onToggle(column.code)}
                  size="sm"
                  aria-label={column.label}
                />
                <span className="text-zinc-200">{column.label}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
