import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CatalogTool } from '@toolpath/catalog-data'
import { convertLength, formatLength, MODEL_UNIT, type Unit } from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  CheckIcon,
  InfoIcon,
  MagnifyingGlassPlusIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { ToolTypeIcon } from './tool-icons'
import { ColumnFilter, TermColumnFilter, type Bound } from './column-filter'
import type { GroupChoice, HolePlanRow } from 'shared/hole-plan'
import type { Verdict } from 'shared/judge'
import {
  NO_HOLE_FILTERS,
  filterHoleRows,
  holeFacet,
  nextHoleSort,
  sortHoleRows,
  type HoleFilters,
  type HoleSort,
} from 'shared/hole-rows'
import { THREADS, threadNamed, threadOptions, type HoleMode, type ThreadSpec } from 'shared/threads'

/**
 * Every hole on the part, by size, with what makes it.
 *
 * **Select all holes** (Paul, 2026-08-31): the mode a shop opens a part in
 * when the holes are the job. One row per size — not per hole, because eight
 * ⌀5 is one drill and one line on a bill.
 *
 * **The cells are sections, not notes** (Paul, 2026-09-01). The amber triangle
 * that says *no drill in the crib makes this size, so a mill that can
 * interpolate it is standing in* was the most important thing on the row and
 * was eight pixels wide. Now every cell that carries a decision carries the
 * evidence with it: the numbers the tool was chosen on, what the rules read
 * off it, and every warning written out as a sentence.
 *
 * **And every column sorts and filters**, from its own header, the way the
 * tool list does — a part with forty sizes of hole is read by narrowing.
 */

/** How a thread choice is written down: the thread and the way it is made. */
const asValue = (spec: ThreadSpec, mode: HoleMode): string => `${spec.name}|${mode}`

/** The ways to make a thread, as this table offers them. */
const WAYS: ReadonlyArray<{ mode: HoleMode; label: string }> = [
  { mode: 'cut tap', label: 'cut tap' },
  { mode: 'form tap', label: 'form tap' },
]

/** The numbers a drill or a tap is chosen on, beside its number. */
const numbers = (tool: CatalogTool, unit: Unit): string => {
  const say = (code: string): string | null => {
    const value = tool.geometry[code]
    return value === undefined ? null : formatLength(value, unit)
  }
  return [
    say('DC') === null ? null : `⌀${say('DC') ?? ''}`,
    say('LCF') === null ? null : `flute ${say('LCF') ?? ''}`,
    say('OAL') === null ? null : `OAL ${say('OAL') ?? ''}`,
  ]
    .filter((each): each is string => each !== null)
    .join(' · ')
}

export interface HoleTableProps {
  readonly rows: ReadonlyArray<HolePlanRow>
  readonly unit: Unit
  readonly onChoice: (key: string, choice: GroupChoice) => void
  /** Which tool is chosen for each row, by group key; absent is the best. */
  readonly chosen: Readonly<Record<string, string | undefined>>
  readonly onChoose: (key: string, guid: string) => void
  /** Which tap is chosen for each row, by group key. */
  readonly chosenMaker: Readonly<Record<string, string | undefined>>
  readonly onChooseMaker: (key: string, guid: string) => void
  readonly inBom: (tool: CatalogTool) => boolean
  readonly onBom: (tools: ReadonlyArray<CatalogTool>, features: ReadonlyArray<string>) => void
  readonly onRemoveBom: (tools: ReadonlyArray<CatalogTool>, features: ReadonlyArray<string>) => void
  /** The row being read, by group key — the holes the part lights up. */
  readonly selected?: string | null
  readonly onSelect?: (key: string) => void
  /**
   * Zoom the part to this size of hole.
   *
   * Pressed again it steps to the next hole of that size, because the viewer
   * frames one feature at a time and eight ⌀5 holes are eight features spread
   * over the part (Paul, 2026-09-01).
   */
  readonly onZoom?: (key: string) => void
  /** Which way up each size is being made, for the column that says so. */
  readonly directionOf?: (group: HolePlanRow['group']) => {
    readonly label: string
    readonly colour: string | null
  } | null
  /** Make this size from its other side instead. */
  readonly onOtherSide?: (key: string) => void
  /** Which hole of the group the next press would frame, 1-based, by group key. */
  readonly zoomAt?: Readonly<Record<string, number | undefined>>
}

/** Something checked and passed, in a few words. */
const Passed = ({ children }: { children: ReactNode }) => (
  <span className="text-2xs flex items-start gap-1 text-zinc-400">
    <CheckIcon aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-400" />
    <span className="min-w-0">{children}</span>
  </span>
)

/**
 * Something worth knowing that is not a problem — in the informational blue.
 *
 * **A thread this hole might be for is news, not a warning** (Paul,
 * 2026-09-01). Amber says *something here is wrong or has to be decided*, and
 * spending it on "this diameter is somebody's tap drill" costs the colour its
 * meaning by the second row.
 */
const Note = ({ children }: { children: ReactNode }) => (
  <span className="text-2xs text-info flex items-start gap-1">
    <InfoIcon weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
    <span className="min-w-0">{children}</span>
  </span>
)

/** Something a shop has to decide about, written out rather than hinted at. */
const Caution = ({ children }: { children: ReactNode }) => (
  <span className="text-2xs flex items-start gap-1 text-amber-300">
    <WarningIcon weight="fill" aria-hidden="true" className="mt-0.5 shrink-0" />
    <span className="min-w-0">{children}</span>
  </span>
)

/**
 * Keep one tool, or take it off the list.
 *
 * Small on purpose: the row's own *Add to list* is the decision, and these are
 * the two halves of it for a shop that already owns the other (Paul,
 * 2026-09-01).
 */
const Keep = ({ held, label, onClick }: { held: boolean; label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={classNames(
      'focus-visible:ring-info/60 shrink-0 rounded border p-0.5 text-xs transition focus-visible:ring-1 focus-visible:outline-none',
      held
        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
        : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-100',
    )}
  >
    {held ? <TrashIcon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
  </button>
)

/** A column header that sorts, with the filter for that column beside it. */
const Header = ({
  label,
  code,
  sort,
  onSort,
  filter,
  align = 'left',
  width,
}: {
  label: string
  code: string
  sort: HoleSort | null
  onSort: (next: HoleSort | null) => void
  filter?: ReactNode
  align?: 'left' | 'right'
  width?: string
}) => {
  const on = sort?.code === code
  return (
    <th
      scope="col"
      className={classNames(
        'px-3 py-2 font-semibold',
        width ?? '',
        align === 'right' ? 'text-right' : '',
      )}
    >
      {/*
        The label is the filter's — it prints one, and a header that printed it
        too read "Depth DEPTH". The sort is the caret beside it.
      */}
      <span
        className={classNames('flex items-center gap-1', align === 'right' ? 'justify-end' : '')}
      >
        {filter ?? <span>{label}</span>}
        <button
          type="button"
          onClick={() => onSort(nextHoleSort(sort, code))}
          aria-label={`Sort by ${label.toLowerCase()}`}
          title={`Sort by ${label.toLowerCase()}`}
          className={classNames(
            'focus-visible:ring-info/60 rounded p-0.5 transition hover:bg-zinc-800 focus-visible:ring-1 focus-visible:outline-none',
            on ? 'text-info' : 'text-zinc-600 hover:text-zinc-300',
          )}
        >
          {on && !sort.ascending ? (
            <CaretDownIcon aria-hidden="true" />
          ) : on ? (
            <CaretUpIcon aria-hidden="true" />
          ) : (
            <CaretUpDownIcon aria-hidden="true" />
          )}
        </button>
      </span>
    </th>
  )
}

/**
 * The thread, chosen from a menu that leads with what the hole reads as.
 *
 * **Its own menu rather than a `<select>`** (Paul, 2026-09-01): a native
 * option group cannot be coloured, and the *Potential thread matches* heading
 * is the point — it says *this hole is probably threaded, and here is the
 * evidence*, which is not a thing to leave to a grey label. Blue, because it
 * is news rather than a warning: amber is kept for the things that are wrong.
 */
const ThreadMenu = ({
  label,
  matches,
  spec,
  mode,
  onValue,
  unit,
  holeDiameter,
}: {
  label: string
  matches: ReturnType<typeof threadOptions>
  spec: ThreadSpec | null
  mode: HoleMode
  onValue: (choice: GroupChoice) => void
  unit: Unit
  holeDiameter: number
}) => {
  const [open, setOpen] = useState(false)
  const rest = THREADS.filter((each) => !matches.some((one) => one.spec.name === each.name))
  const choose = (next: GroupChoice) => {
    onValue(next)
    setOpen(false)
  }
  const Item = ({
    on,
    onClick,
    children,
  }: {
    on: boolean
    onClick: () => void
    children: ReactNode
  }) => (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onClick}
        className={classNames(
          'flex w-full items-center gap-3 px-2 py-1 text-left text-xs whitespace-nowrap',
          on ? 'bg-info/15 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900',
        )}
      >
        {children}
      </button>
    </li>
  )

  return (
    <span className="relative block">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={classNames(
          'focus-visible:ring-info/60 flex w-full items-center gap-1.5 rounded border bg-zinc-950 px-2 py-1 text-left text-xs focus-visible:ring-1 focus-visible:outline-none',
          spec === null && matches.length > 0
            ? 'border-info/50 text-info'
            : 'border-zinc-800 text-zinc-100',
        )}
      >
        <span className="min-w-0 flex-1 truncate font-mono">
          {spec === null ? 'No thread' : `${spec.name} ${mode}`}
        </span>
        <CaretDownIcon aria-hidden="true" className="shrink-0 text-zinc-500" />
      </button>
      {open ? (
        <ul className="absolute top-full left-0 z-30 mt-1 max-h-72 w-max min-w-full overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 py-0.5 shadow-xl">
          <Item on={spec === null} onClick={() => choose({ mode: 'plain', spec: null })}>
            No thread
          </Item>
          {matches.length === 0 ? null : (
            <>
              <li className="text-2xs text-info flex items-center gap-1 px-2 pt-1.5 pb-0.5 font-semibold tracking-wide uppercase">
                <InfoIcon weight="fill" aria-hidden="true" className="shrink-0" />
                Potential thread matches
              </li>
              {matches.flatMap((match) =>
                WAYS.map((way) => (
                  <Item
                    key={asValue(match.spec, way.mode)}
                    on={spec?.name === match.spec.name && mode === way.mode}
                    onClick={() => choose({ mode: way.mode, spec: match.spec })}
                  >
                    <span className="font-mono">
                      {match.spec.name} {way.label}
                    </span>
                    <span className="text-2xs text-info/80 ml-auto">
                      ⌀{formatLength(holeDiameter, unit)} is its {match.read}
                    </span>
                  </Item>
                )),
              )}
            </>
          )}
          <li className="text-2xs px-2 pt-1.5 pb-0.5 font-semibold tracking-wide text-zinc-500 uppercase">
            Every thread
          </li>
          {rest.flatMap((each) =>
            WAYS.map((way) => (
              <Item
                key={asValue(each, way.mode)}
                on={spec?.name === each.name && mode === way.mode}
                onClick={() => choose({ mode: way.mode, spec: each })}
              >
                <span className="font-mono">
                  {each.name} {way.label}
                </span>
              </Item>
            )),
          )}
        </ul>
      ) : null}
    </span>
  )
}

/** One tool cell: what is chosen, what it was chosen on, and what to watch. */
const ToolCell = ({
  label,
  options,
  value,
  onValue,
  unit,
  keep,
  facts,
  cautions,
  empty,
}: {
  label: string
  options: ReadonlyArray<CatalogTool>
  value: string | undefined
  onValue: (guid: string) => void
  unit: Unit
  keep: (tool: CatalogTool) => ReactNode
  facts: ReadonlyArray<string>
  cautions: ReadonlyArray<string>
  empty: string
}) => {
  const chosen = options.find((each) => each.guid === value) ?? options[0] ?? null
  if (chosen === null) {
    return <Caution>{empty}</Caution>
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-zinc-500">
          <ToolTypeIcon toolType={chosen.form} />
        </span>
        <select
          aria-label={label}
          value={chosen.guid}
          onChange={(event) => onValue(event.target.value)}
          className="focus-visible:ring-info/60 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 font-mono text-xs text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
        >
          {options.map((each) => (
            <option key={each.guid} value={each.guid}>
              {each.catalogNumber} · {numbers(each, unit)}
            </option>
          ))}
        </select>
        {keep(chosen)}
      </div>
      <span className="text-2xs font-mono text-zinc-400">{numbers(chosen, unit)}</span>
      {cautions.map((each) => (
        <Caution key={each}>{each}</Caution>
      ))}
      {facts.map((each) => (
        <Passed key={each}>{each}</Passed>
      ))}
    </div>
  )
}

/** What the rules read off the chosen drill, and what they warned about. */
const readingsOf = (verdict: Verdict | undefined): ReadonlyArray<string> =>
  verdict === undefined ? [] : verdict.readings.filter((each) => each.trim() !== '')

const cautionsOf = (verdict: Verdict | undefined): ReadonlyArray<string> =>
  verdict === undefined
    ? []
    : [...verdict.warned, ...verdict.demoted].map((each) => each.text).filter((each) => each !== '')

export const HoleTable = ({
  rows,
  unit,
  onChoice,
  chosen,
  onChoose,
  chosenMaker,
  onChooseMaker,
  inBom,
  onBom,
  onRemoveBom,
  selected = null,
  onSelect,
  onZoom,
  zoomAt = {},
  directionOf,
  onOtherSide,
}: HoleTableProps) => {
  /**
   * The row being read, brought into view.
   *
   * **Because the selection can come from the part** (Paul, 2026-09-01):
   * clicking a hole in the viewport picks its size, and on a part with thirty
   * sizes that row is very often below the fold. Scrolled to the nearest edge
   * rather than the middle, so a row already on screen does not jump.
   */
  const selectedRow = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (selected !== null) {
      // Called only where there is a viewport to scroll: jsdom has no such
      // method, and a component test is not a place to fail over it.
      selectedRow.current?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [selected])
  const [sort, setSort] = useState<HoleSort | null>(null)
  const [filters, setFilters] = useState<HoleFilters>(NO_HOLE_FILTERS)
  const shown = useMemo(
    () => sortHoleRows(filterHoleRows(rows, filters), sort),
    [rows, filters, sort],
  )
  /**
   * A band is entered in the page's unit and held in millimetres, the way
   * every other length in this application is.
   */
  const band = (bound: Bound | undefined): Bound | undefined =>
    bound === undefined
      ? undefined
      : {
          ...(bound.min === undefined ? {} : { min: convertLength(bound.min, unit, MODEL_UNIT) }),
          ...(bound.max === undefined ? {} : { max: convertLength(bound.max, unit, MODEL_UNIT) }),
        }
  const shownBand = (bound: Bound | undefined): Bound | undefined =>
    bound === undefined
      ? undefined
      : {
          ...(bound.min === undefined ? {} : { min: convertLength(bound.min, MODEL_UNIT, unit) }),
          ...(bound.max === undefined ? {} : { max: convertLength(bound.max, MODEL_UNIT, unit) }),
        }
  const terms = (code: 'thread' | 'drill' | 'tap') => holeFacet(rows, code)

  if (rows.length === 0) {
    return <p className="p-6 text-sm text-zinc-400">This part has no holes the kernel reported.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] table-fixed border-collapse text-sm">
        <caption className="sr-only">Every hole on the part, by size</caption>
        <thead>
          <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
            <Header
              label="Count"
              code="count"
              width="w-20"
              sort={sort}
              onSort={setSort}
              align="right"
              filter={
                <ColumnFilter
                  label="Count"
                  kind="count"
                  unit={unit}
                  bound={filters.count}
                  onBound={(bound) => setFilters((was) => ({ ...was, count: bound }))}
                />
              }
            />
            <Header
              label="Diameter"
              code="diameter"
              width="w-28"
              sort={sort}
              onSort={setSort}
              align="right"
              filter={
                <ColumnFilter
                  label="Diameter"
                  kind="length"
                  unit={unit}
                  bound={shownBand(filters.diameter)}
                  onBound={(bound) => setFilters((was) => ({ ...was, diameter: band(bound) }))}
                />
              }
            />
            <Header
              label="Depth"
              code="depth"
              width="w-28"
              sort={sort}
              onSort={setSort}
              align="right"
              filter={
                <ColumnFilter
                  label="Depth"
                  kind="length"
                  unit={unit}
                  bound={shownBand(filters.depth)}
                  onBound={(bound) => setFilters((was) => ({ ...was, depth: band(bound) }))}
                />
              }
            />
            <th scope="col" className="w-32 px-3 py-2 font-semibold">
              From
            </th>
            <Header
              label="Thread"
              code="thread"
              width="w-44"
              sort={sort}
              onSort={setSort}
              filter={
                <TermColumnFilter
                  label="Thread"
                  options={terms('thread')}
                  chosen={filters.thread ?? []}
                  onChosen={(values) => setFilters((was) => ({ ...was, thread: values }))}
                />
              }
            />
            <Header
              label="Drill"
              code="drill"
              width="w-[26%]"
              sort={sort}
              onSort={setSort}
              filter={
                <TermColumnFilter
                  label="Drill"
                  options={terms('drill')}
                  chosen={filters.drill ?? []}
                  onChosen={(values) => setFilters((was) => ({ ...was, drill: values }))}
                />
              }
            />
            <Header
              label="Tap"
              code="tap"
              width="w-[26%]"
              sort={sort}
              onSort={setSort}
              filter={
                <TermColumnFilter
                  label="Tap"
                  options={terms('tap')}
                  chosen={filters.tap ?? []}
                  onChosen={(values) => setFilters((was) => ({ ...was, tap: values }))}
                />
              }
            />
            <th scope="col" className="w-24 px-3 py-2 text-right font-semibold">
              <span className="sr-only">Order list</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => {
            const verdict =
              row.drills.find((each) => each.tool.guid === chosen[row.group.key]) ?? row.drills[0]
            const mill =
              row.endMills.find((each) => each.tool.guid === chosen[row.group.key]) ??
              row.endMills[0]
            const drill = (verdict ?? mill)?.tool ?? null
            const tap =
              row.makers.find((each) => each.guid === chosenMaker[row.group.key]) ??
              row.makers[0] ??
              null
            const kept = [drill, tap].filter((each): each is CatalogTool => each !== null)
            const tags = row.group.features.map((each) => each.featureTag)
            const held = kept.length > 0 && kept.every((each) => inBom(each))
            const on = selected === row.group.key
            const size = `⌀${formatLength(row.group.diameter, unit)}`
            const matches = threadOptions(row.group.diameter, 2)
            return (
              <tr
                key={row.group.key}
                ref={on ? selectedRow : undefined}
                aria-selected={on}
                /*
                 * **Clicking the row shows those holes on the part** (Paul,
                 * 2026-09-01). The controls in it are not the row: a click on
                 * a dropdown or a button is that control's, or picking a drill
                 * would swing the part as a side effect.
                 */
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('select, button, a, input')) {
                    return
                  }
                  onSelect?.(row.group.key)
                }}
                className={classNames(
                  'border-b border-zinc-900 align-top',
                  onSelect ? 'cursor-pointer' : '',
                  on ? 'bg-info/15' : 'hover:bg-info/10',
                )}
              >
                <th scope="row" className="px-3 py-2 text-right font-normal">
                  <span className="flex items-center justify-end gap-1">
                    <span className="font-mono text-zinc-100">{row.group.features.length}</span>
                    {onZoom === undefined ? null : (
                      <button
                        type="button"
                        onClick={() => onZoom(row.group.key)}
                        aria-label={
                          row.group.features.length === 1
                            ? `Zoom to the ${size} hole`
                            : `Zoom to ${size} hole ${String(zoomAt[row.group.key] ?? 1)} of ${String(row.group.features.length)}`
                        }
                        title={
                          row.group.features.length === 1
                            ? `Zoom to the ${size} hole`
                            : `Zoom to hole ${String(zoomAt[row.group.key] ?? 1)} of ${String(row.group.features.length)} — again for the next`
                        }
                        className="focus-visible:ring-info/60 rounded p-0.5 text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-200 focus-visible:ring-1 focus-visible:outline-none"
                      >
                        <MagnifyingGlassPlusIcon aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </th>
                <td className="px-3 py-2 text-right font-mono text-zinc-100">
                  {formatLength(row.group.diameter, unit)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-zinc-100">
                  {formatLength(row.group.depth, unit)}
                  {row.group.through ? (
                    <span className="text-2xs mt-0.5 block font-sans text-zinc-500">through</span>
                  ) : null}
                </td>
                {/*
                  **Which way up it is made, and what that costs** (Paul,
                  2026-09-01). A hole open at both ends is drilled from the
                  side that needs the shorter tool; the other side is offered
                  here rather than chosen for somebody.
                */}
                <td className="px-3 py-2">
                  {(() => {
                    const way = directionOf?.(row.group) ?? null
                    return (
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full border border-zinc-700"
                            style={
                              way?.colour == null
                                ? undefined
                                : { background: way.colour, borderColor: way.colour }
                            }
                          />
                          <span className="font-mono text-xs text-zinc-200">
                            {way?.label ?? '—'}
                          </span>
                        </span>
                        {row.group.reach === null ? null : (
                          <span className="text-2xs font-mono text-zinc-500">
                            {formatLength(row.group.reach, unit)} reach
                          </span>
                        )}
                        {row.group.other === null || onOtherSide === undefined ? null : (
                          <button
                            type="button"
                            onClick={() => onOtherSide(row.group.key)}
                            title={
                              row.group.other.reach === null
                                ? 'Make these from the other side'
                                : `The other side needs ${formatLength(row.group.other.reach, unit)} of reach`
                            }
                            className="text-2xs text-info self-start underline-offset-2 hover:underline"
                          >
                            machine from other side
                          </button>
                        )}
                      </div>
                    )
                  })()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <ThreadMenu
                      label={`Thread for the ${size} holes`}
                      matches={matches}
                      spec={row.thread}
                      mode={row.mode}
                      onValue={(choice) => onChoice(row.group.key, choice)}
                      unit={unit}
                      holeDiameter={row.group.diameter}
                    />
                    {row.thread === null && matches[0] ? (
                      <Note>
                        {size} is {matches[0].spec.name}&rsquo;s {matches[0].read} — these may be
                        threaded
                      </Note>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {row.drills.length === 0 && row.endMills.length > 0 ? (
                    /*
                      **"No compatible drills, see end mills"** (Paul,
                      2026-09-01). A mill standing in the drill's place said
                      the wrong thing; offered as its own list under a sentence
                      that names the problem, it says the right one.
                    */
                    <ToolCell
                      label={`End mill for the ${size} holes`}
                      options={row.endMills.map((each) => each.tool)}
                      value={chosen[row.group.key]}
                      onValue={(guid) => onChoose(row.group.key, guid)}
                      unit={unit}
                      keep={(each) => (
                        <Keep
                          held={inBom(each)}
                          label={
                            inBom(each)
                              ? `Remove ${each.catalogNumber} from the order list`
                              : `Add ${each.catalogNumber} to the order list`
                          }
                          onClick={() =>
                            inBom(each) ? onRemoveBom([each], tags) : onBom([each], tags)
                          }
                        />
                      )}
                      facts={readingsOf(mill)}
                      cautions={[
                        `No compatible drills — these end mills can interpolate the ${size} bore`,
                        ...cautionsOf(mill),
                      ]}
                      empty={`Nothing makes ${size} to ${formatLength(row.group.depth, unit)} deep`}
                    />
                  ) : (
                    <ToolCell
                      label={`Drill for the ${size} holes`}
                      options={row.drills.map((each) => each.tool)}
                      value={chosen[row.group.key]}
                      onValue={(guid) => onChoose(row.group.key, guid)}
                      unit={unit}
                      keep={(each) => (
                        <Keep
                          held={inBom(each)}
                          label={
                            inBom(each)
                              ? `Remove ${each.catalogNumber} from the order list`
                              : `Add ${each.catalogNumber} to the order list`
                          }
                          onClick={() =>
                            inBom(each) ? onRemoveBom([each], tags) : onBom([each], tags)
                          }
                        />
                      )}
                      facts={readingsOf(verdict)}
                      cautions={cautionsOf(verdict)}
                      empty={
                        row.thread === null
                          ? `No compatible drills, and no end mill reaches ${formatLength(row.group.depth, unit)} deep either`
                          : `No drill makes the ${size} hole this thread starts from`
                      }
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.thread === null ? (
                    <span className="text-2xs text-zinc-600">no thread</span>
                  ) : (
                    <ToolCell
                      label={`Tap for the ${size} holes`}
                      options={row.makers}
                      value={chosenMaker[row.group.key]}
                      onValue={(guid) => onChooseMaker(row.group.key, guid)}
                      unit={unit}
                      keep={(each) => (
                        <Keep
                          held={inBom(each)}
                          label={
                            inBom(each)
                              ? `Remove ${each.catalogNumber} from the order list`
                              : `Add ${each.catalogNumber} to the order list`
                          }
                          onClick={() =>
                            inBom(each) ? onRemoveBom([each], tags) : onBom([each], tags)
                          }
                        />
                      )}
                      facts={
                        tap !== null &&
                        tap.geometry.LCF !== undefined &&
                        tap.geometry.LCF >= row.group.depth
                          ? [`flutes cover the ${formatLength(row.group.depth, unit)} depth`]
                          : []
                      }
                      cautions={
                        tap !== null &&
                        tap.geometry.LCF !== undefined &&
                        tap.geometry.LCF < row.group.depth
                          ? [
                              `${formatLength(tap.geometry.LCF, unit)} of thread against ${formatLength(row.group.depth, unit)} of hole — it will not tap to the bottom`,
                            ]
                          : []
                      }
                      empty={`No ${row.thread.name} tap in the catalog`}
                    />
                  )}
                </td>
                {/*
                  The row's own decision, in the words and the shape every
                  other table uses for it (Paul, 2026-09-01).
                */}
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={kept.length === 0}
                    onClick={() => (held ? onRemoveBom(kept, tags) : onBom(kept, tags))}
                    aria-label={
                      held
                        ? `Remove the tools for the ${size} holes from the order list`
                        : `Add the tools for the ${size} holes to the order list`
                    }
                    className={classNames(
                      'text-2xs focus-visible:ring-info/60 rounded border px-1.5 py-1 whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700',
                      held
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-info/50 text-info hover:border-info/80 hover:bg-info/10 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-transparent dark:hover:text-zinc-100',
                    )}
                  >
                    {held ? (
                      <span className="flex items-center gap-1">
                        <TrashIcon aria-hidden="true" />
                        On list
                      </span>
                    ) : (
                      'Add to list'
                    )}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {shown.length === 0 ? (
        <p className="p-6 text-sm text-zinc-400">
          No size of hole matches these filters — {String(rows.length)} are hidden.
        </p>
      ) : null}
    </div>
  )
}
