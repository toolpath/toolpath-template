import { cn } from '@toolpath/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CaretRightIcon, XIcon } from '@phosphor-icons/react'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import type { ToolQuery } from 'shared/filter'
import { FilterPanel, QUICK_FILTERS, type FilterPanelProps } from './filter-panel'

/**
 * The filters as a rail of buttons over the part.
 *
 * Paul's layout (2026-08-31). The panel they came from was a column of its
 * own beside the viewer, so the part was always paying for questions nobody
 * was asking. Here each question is one button, and it costs nothing until it
 * is pressed: the part gets the room, and the answer — up to three of them —
 * is written on the button itself, so what is set can be read without opening
 * anything.
 *
 * One opens at a time, to the right, because the rail is on the left edge and
 * a panel over the part is better than a panel off the screen.
 */

/** Up to this many answers on the button; the rest are a count. */
const SHOWN = 3

/** A range in the words its own control uses: `≤ 6.00 mm`, `4 – 8`, `= 3`. */
const describeBound = (
  bound: { readonly min?: number; readonly max?: number } | undefined,
  kind: 'length' | 'count',
  unit: UnitSystem,
): Array<string> => {
  if (!bound || (bound.min === undefined && bound.max === undefined)) {
    return []
  }
  const say = (value: number) => (kind === 'length' ? formatLength(value, unit) : String(value))
  if (bound.min !== undefined && bound.max !== undefined) {
    return [
      bound.min === bound.max ? `= ${say(bound.min)}` : `${say(bound.min)} – ${say(bound.max)}`,
    ]
  }
  return [bound.max !== undefined ? `≤ ${say(bound.max)}` : `≥ ${say(bound.min ?? 0)}`]
}

/** What a filter is set to, in the words the picker uses for it. */
const answersFor = (
  filter: (typeof QUICK_FILTERS)[number],
  query: ToolQuery,
  materialGroup: string | null,
  unit: UnitSystem,
): Array<string> => {
  if (filter.shape === 'range') {
    return describeBound(
      query.ranges[filter.key],
      filter.kind === 'count' ? 'count' : 'length',
      unit,
    )
  }
  const chosen =
    filter.mode === 'single'
      ? materialGroup === null
        ? []
        : [materialGroup]
      : (query.terms[filter.key] ?? [])
  const named = Array.isArray(filter.values) ? filter.values : null
  return chosen.map((value) => named?.find((each) => each.value === value)?.label ?? value)
}

/** Clearing one question, without opening it. */
const clearedOf = (filter: (typeof QUICK_FILTERS)[number], query: ToolQuery): ToolQuery => {
  if (filter.shape === 'range') {
    const ranges = { ...query.ranges }
    delete ranges[filter.key]
    return { ...query, ranges }
  }
  const terms = { ...query.terms }
  delete terms[filter.key]
  return { ...query, terms }
}

/**
 * One bubble on the rail: a labelled button that opens a panel beside it.
 *
 * Exported because the rail is not only the filters — an allowance the rules
 * read is asked the same way, and asking it differently would make it look
 * like a different kind of thing (Paul, 2026-08-31).
 */
export const RailBubble = ({
  icon,
  label,
  value,
  onClear,
  children,
  openedFrom,
  onOpened,
}: {
  icon: ReactNode
  label: string
  /** What it is set to, in the words its own control uses. Empty means unset. */
  value?: ReadonlyArray<string>
  onClear?: (() => void) | undefined
  /** The panel, given the width it opens at. */
  children: ReactNode
  /**
   * Opened from somewhere else — a column header asking this very question.
   *
   * **One filter, one place to answer it** (Paul, 2026-09-01). A column that
   * opened a picker of its own left two controls for one question, and no way
   * to see that they were the same one. The header presses this instead, and
   * the answer appears where every other answer is.
   */
  openedFrom?: boolean
  onOpened?: () => void
}) => {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const mine = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (openedFrom === true) {
      setOpen(true)
      onOpened?.()
    }
    // Only on the ask itself: this opens the panel, it does not hold it open.
  }, [openedFrom])
  const answers = value ?? []
  const set = answers.length > 0

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      // The panel is `fixed` but still a descendant of its bubble, so one
      // question answers both: which bubble was this press on? Anything that
      // is not this one — the part, another question — puts this one away,
      // which is what keeps two panels from standing open over each other
      // (Paul, 2026-08-31: "they are stacking up").
      const item = (event.target as Element | null)?.closest('[data-rail-item]') ?? null
      if (item !== mine.current) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={mine} data-rail-item className="group pointer-events-auto relative">
      <button
        type="button"
        aria-expanded={open}
        aria-pressed={set}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          // Opened all the way, a picker is about this tall. Sat here, the
          // whole of one is on the screen and it never has to scroll.
          const room = 460
          setAt({
            top: Math.max(8, Math.min(rect.top, window.innerHeight - room - 8)),
            left: rect.right + 4,
          })
          setOpen((was) => !was)
        }}
        className={cn(
          'flex w-52 items-start gap-2 rounded-md border px-2.5 py-1.5 text-left transition',
          'focus-visible:ring-info/60 focus-visible:ring-1 focus-visible:outline-none',
          set
            ? 'filter-on border-info/60 text-info'
            : 'filter-off border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100',
        )}
      >
        <span className="mt-px shrink-0 opacity-70">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="text-2xs block font-semibold tracking-wide uppercase">{label}</span>
          {set ? (
            <span className="text-2xs mt-0.5 block truncate">
              {answers.slice(0, SHOWN).join(', ')}
              {answers.length > SHOWN ? ` +${String(answers.length - SHOWN)} more…` : ''}
            </span>
          ) : null}
        </span>
        <CaretRightIcon
          aria-hidden="true"
          className={cn('mt-0.5 shrink-0 transition', open && 'rotate-90')}
        />
      </button>
      {/*
        Clearing one question without opening it. On the button rather than
        inside the panel, because "I did not mean that one" is a thing
        somebody knows from the rail (Paul, 2026-08-31).
      */}
      {set && onClear ? (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          title={`Clear ${label.toLowerCase()}`}
          onClick={onClear}
          className="focus-visible:ring-info/60 absolute top-1/2 left-full z-10 ml-1 -translate-y-1/2 rounded border border-zinc-800 bg-zinc-950/90 p-1 text-zinc-400 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:border-zinc-700 hover:text-zinc-100 focus-visible:opacity-100 focus-visible:ring-1 focus-visible:outline-none"
        >
          <XIcon aria-hidden="true" />
        </button>
      ) : null}
      {open && at ? (
        // No height of its own and nothing to scroll: opening the rest of a
        // picker grows the panel down and to the right from where it already
        // is (Paul, 2026-08-31).
        <div
          style={{ top: at.top, left: at.left }}
          className="fixed z-40 w-max max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-800 bg-zinc-950/95 p-2.5 shadow-xl backdrop-blur"
        >
          {/*
            **Clearing is an × in the corner** (Paul, 2026-09-01: "clear
            filters buttons take up too much space — they should be an X in the
            top right"). A full-width button under a two-line picker was a
            third of the popover spent on undo.
          */}
          {set && onClear ? (
            <button
              type="button"
              aria-label={`Clear ${label.toLowerCase()}`}
              title={`Clear ${label.toLowerCase()}`}
              onClick={onClear}
              className="focus-visible:ring-info/60 absolute top-1.5 right-1.5 rounded p-1 text-zinc-500 transition hover:text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              <XIcon aria-hidden="true" />
            </button>
          ) : null}
          {/*
            **As wide as its answers, no wider.** A fixed 18 rem left the shank
            picker two thirds empty and wrapped its third chip; a picker with
            forty forms still wants a ceiling (Paul, 2026-08-31).
          */}
          <div className="w-max max-w-[32rem] min-w-56">{children}</div>
        </div>
      ) : null}
    </div>
  )
}

export interface FilterRailProps extends Omit<FilterPanelProps, 'only' | 'compact'> {
  /** Which questions the rail asks, by key. Omitted, it asks all of them. */
  readonly only?: ReadonlyArray<string>
  /**
   * Which answers want a second look, by filter key.
   *
   * Not a rule and not a filter: the sheet still lists the tool and the list
   * still shows it. It is shown **where somebody is choosing** — inside the
   * open panel and on the answers themselves — and never on the bubble, which
   * is on screen whether or not anybody is asking (Paul, 2026-08-31).
   */
  /**
   * A filter somebody asked for from somewhere else — a column header.
   *
   * The bubble for that key opens; everything else is left alone. Cleared by
   * `onOpened`, so asking twice asks twice.
   */
  readonly open?: string | null
  readonly onOpened?: () => void
}

export const FilterRail = (props: FilterRailProps) => {
  const { query, materialGroup, unit, only, open = null, onOpened } = props

  const clear = (filter: (typeof QUICK_FILTERS)[number]) => {
    if (filter.mode === 'single') {
      props.onMaterial(null)
      return
    }
    props.onQuery(clearedOf(filter, query))
  }

  const asked = only ? QUICK_FILTERS.filter((each) => only.includes(each.key)) : QUICK_FILTERS

  /**
   * **No container of its own**, deliberately.
   *
   * The buttons are laid out by whatever holds them — over the part that is a
   * column which wraps into another column when it runs out of height. A
   * wrapper here would be one indivisible block, so it would either clip its
   * last button or claim the whole column and push everything else sideways
   * (Paul, 2026-08-31, both ways round).
   */
  return (
    <>
      {asked.map((filter) => {
        const answers = answersFor(filter, query, materialGroup, unit)
        return (
          <RailBubble
            key={filter.key}
            icon={filter.icon}
            label={filter.label}
            value={answers}
            onClear={answers.length > 0 ? () => clear(filter) : undefined}
            openedFrom={open === filter.key}
            {...(onOpened ? { onOpened } : {})}
          >
            <FilterPanel {...props} only={[filter.key]} compact />
          </RailBubble>
        )
      })}
    </>
  )
}
