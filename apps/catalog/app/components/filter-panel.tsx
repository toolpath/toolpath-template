import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookmarkSimpleIcon,
  BookmarksSimpleIcon,
  BroomIcon,
  CaretDownIcon,
  CircleIcon,
  CubeIcon,
  HashIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  StackSimpleIcon,
  TagIcon,
  WrenchIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { Facets } from '@toolpath/catalog-data'
import { MATERIAL_GROUPS, TOOL_FORMS } from '@toolpath/catalog-data'
import { classNames } from '@toolpath/domain/class-names'
import type { Unit } from '@toolpath/domain/units'
import { getFamily } from 'shared/catalog'
import { toggleTerm, type ToolQuery } from 'shared/filter'
import type { SavedFilter } from 'shared/saved-filters'
import { Chip, ChipGroup } from './chip'
import { RangeFilter, type Bound, type Kind } from './column-filter'
import {
  ColletIcon,
  FluteLengthIcon,
  HolderIcon,
  ReducedShankIcon,
  ToolTypeIcon,
} from './tool-icons'

/**
 * What each ISO 513 letter means at the machine.
 *
 * The letter stays in front of the word: a shop reads inserts and catalog pages
 * labelled P and M all day, and a panel that says only "Steel" makes them do
 * the translation back.
 */
const MATERIALS: Record<string, string> = {
  P: 'Steel',
  M: 'Stainless',
  K: 'Cast iron',
  N: 'Aluminium',
  S: 'Superalloy',
  H: 'Hardened',
  C: 'Composite',
}

/**
 * How many answers a picker shows before the rest go behind a `…`.
 *
 * Four, because four fit across without wrapping and a question with three
 * answers should read as one row rather than two (Paul, 2026-08-31). Past
 * four, the rest are one press away and the block grows to hold them rather
 * than scrolling inside itself.
 */
/**
 * How many values stand in front before the rest go behind "more".
 *
 * **Twelve, not four** (Paul, 2026-09-01: "I should almost never need to hit
 * show more — just show it all"). Four was sized for a shelf that was mostly
 * placeholders; every axis this catalog actually holds — six part materials,
 * the vendors, the tool types — fits in front of it now, and the ones that
 * genuinely do not (families, in the hundreds) still say how many more.
 */
const FRONT_TILES = 12

/** One thing a tile picker can offer. */
interface TileOption {
  readonly value: string
  readonly label: string
  /** For the picker's popover, where a long list is easier read in sections. */
  readonly group?: string
}

/**
 * One quick filter, described rather than written out.
 *
 * **This is the flexible part.** The panel is this array and one renderer, so
 * adding, dropping or reordering a question is an entry here — not a block of
 * markup to balance against the others by hand. Each entry says what it
 * narrows (`key`), how it is drawn (`shape`), how many answers it takes at
 * once (`mode`), and how much of the two-column grid it fills (`span`). The
 * values come from the catalog's facets unless the entry names its own.
 *
 * Four shapes cover every question asked so far:
 *
 * - `chips` — a short row of words: the part's material, a spindle taper.
 * - `range` — a number with an operator: diameter, flutes.
 * - `tiles` — a wall of drawings with the common ones in front and the rest
 *   behind a `…`: tool type, brand. The drawing does the finding and the word
 *   under it does the confirming. A wall wants the width, so both take a
 *   whole row.
 * - `holding` — chips whose values come from the crib rather than the tools.
 */
interface QuickFilter {
  /** The query key it narrows, which is also its facet key. */
  readonly key: string
  readonly label: string
  readonly icon: ReactNode
  readonly shape: 'chips' | 'range' | 'tiles'
  /**
   * `single` is a fact about the part, held outside the query; `single-term` is
   * one value of an ordinary term axis; `multi` is a shortlist; `range` is a
   * number with an operator.
   */
  readonly mode: 'single' | 'single-term' | 'multi' | 'range'
  /** How much of the two-column grid it takes. */
  readonly span: 1 | 2
  /** For a range: whether its numbers are lengths, which are the ones converted. */
  readonly kind?: Kind
  /** Values for an axis the catalog does not enumerate, or the crib's. */
  readonly values?: 'holders' | 'collets' | ReadonlyArray<TileOption & { title?: string }>
  /**
   * What a value is called, where the value is an id and not a name.
   *
   * The default is the value itself, which is right for a brand, a form or a
   * flute count — they *are* words. It is wrong for `familyId`, whose values
   * are the scrape's own keys: the picker read `godrill_3xd_metric` where the
   * vendor calls that family `GOdrill™ • 3xD • Metric`. Only the label
   * changes; the value stays the id the URL and the query are keyed by, and
   * {@link matching} searches both, so typing either finds it.
   */
  readonly labelOf?: (value: string) => string
  /** For tiles: how one is drawn. */
  readonly tile?: (value: string) => ReactNode
  /** For tiles: which values stand in front. The rest go behind `…`. */
  readonly front?: 'held' | 'counted'
  /** For tiles: a search box in the popover, for a list that will grow. */
  readonly search?: boolean
}

/** A brand's mark, until there is a real one: its own initials, set as a tile. */
const monogram = (brand: string): string => {
  const words = brand.split(/[\s-]+/).filter(Boolean)
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('')
  }
  return brand.slice(0, 2).toUpperCase()
}

const Monogram = ({ brand }: { brand: string }) => (
  <span className="grid size-6 place-items-center rounded-sm bg-zinc-800 text-[0.6rem] font-bold text-current">
    {monogram(brand)}
  </span>
)

/**
 * The questions, in the order Paul's layout asks them (2026-08-31): what the
 * part is, whose tools, which family, what kind — then the numbers, then how
 * it is held. The two ranges the rules fill in from the feature come last,
 * because they are usually already answered by the time anybody looks.
 */
/**
 * The axes whose options are narrowed by the rest of the query.
 *
 * The term axes that are properties of a tool, which is what a facet count can
 * be measured over. The holding axes — a spindle taper, a collet series — are
 * properties of the crib and are counted elsewhere (Paul, 2026-09-01).
 */
export const FACET_AXES: ReadonlyArray<string> = [
  'brand',
  'familyId',
  'productLine',
  'form',
  'materialGroups',
  'shank',
  'NOF',
]

export const QUICK_FILTERS: ReadonlyArray<QuickFilter> = [
  {
    key: 'materialGroups',
    label: 'Part material',
    icon: <CubeIcon />,
    shape: 'chips',
    mode: 'single',
    span: 2,
    values: MATERIAL_GROUPS.map((group) => ({
      value: group,
      label: `${group} · ${MATERIALS[group] ?? group}`,
      title: `ISO 513 group ${group}`,
    })),
  },
  {
    key: 'brand',
    label: 'Vendor',
    icon: <TagIcon />,
    shape: 'tiles',
    mode: 'multi',
    span: 2,
    tile: (value) => <Monogram brand={value} />,
    front: 'counted',
    search: true,
  },
  {
    // The vendor's own grouping — one family is one page in their catalogue,
    // and a shop that likes a family wants the rest of it.
    key: 'familyId',
    label: 'Family',
    icon: <BookmarksSimpleIcon />,
    shape: 'chips',
    mode: 'multi',
    span: 2,
    search: true,
    // The vendor's own title for it, where the scrape carried one. Falls back
    // to the id, which is what every family read as before the AEM family page
    // was fetched.
    labelOf: (value) => getFamily(value)?.name ?? value,
  },
  {
    // One line above the families: `KenCut™ FF` is square and ball nose,
    // metric and inch, and a shop that has settled on a line wants all of it.
    // A tool whose vendor names none is under no value here, so this narrows
    // and never silently drops the unnamed into a bucket.
    key: 'productLine',
    label: 'Product line',
    icon: <StackSimpleIcon />,
    shape: 'chips',
    mode: 'multi',
    span: 2,
    search: true,
  },
  {
    // `form`, not `toolType`: the catalog's own coarse type says `endmill`
    // where this picker says `bull nose end mill`, and a picker asking in one
    // vocabulary about data kept in another counted zero for everything but
    // `drill` — the one name the two happened to share.
    key: 'form',
    label: 'Type',
    icon: <ToolTypeIcon toolType="flat end mill" />,
    shape: 'tiles',
    mode: 'multi',
    span: 2,
    // Every form the library names, not only the ones ingested so far: the
    // question "does this know about dovetail cutters" is answered by opening
    // the `…`, and the ones this catalog holds stand in front.
    values: TOOL_FORMS.map((each) => ({ value: each.value, label: each.label, group: each.group })),
    tile: (value) => <ToolTypeIcon toolType={value} className="size-6" />,
    front: 'held',
  },
  {
    key: 'NOF',
    label: 'Flutes',
    icon: <HashIcon />,
    shape: 'range',
    mode: 'range',
    span: 1,
    kind: 'count',
  },
  {
    key: 'shank',
    label: 'Shank',
    icon: <ReducedShankIcon />,
    shape: 'chips',
    mode: 'single-term',
    span: 1,
    values: [
      { value: 'full', label: 'Full', title: 'The shank is as wide as the cut' },
      {
        value: 'reduced',
        label: 'Reduced',
        title: 'A neck narrower than the cut behind the flutes, for reach down a wall',
      },
    ],
  },
  {
    key: 'taper',
    label: 'Holder',
    icon: <HolderIcon />,
    shape: 'chips',
    mode: 'single-term',
    span: 1,
    values: 'holders',
  },
  {
    key: 'colletSeries',
    label: 'Collet',
    icon: <ColletIcon />,
    shape: 'chips',
    mode: 'single-term',
    span: 1,
    values: 'collets',
  },
  {
    key: 'DC',
    label: 'Diameter',
    icon: <CircleIcon />,
    shape: 'range',
    mode: 'range',
    span: 1,
    kind: 'length',
  },
  {
    key: 'LCF',
    label: 'Flute length',
    icon: <FluteLengthIcon />,
    shape: 'range',
    mode: 'range',
    span: 1,
    kind: 'length',
  },
]

export interface FilterPanelProps {
  readonly facets: Facets
  readonly query: ToolQuery
  readonly onQuery: (query: ToolQuery) => void
  /** Counts over the result set on screen, not over the whole catalog. */
  readonly counts: (key: string) => ReadonlyMap<string, number>
  readonly unit: Unit
  /**
   * What this crib can hold with, which is not a property of any tool.
   *
   * Passed in rather than read from the facets: a spindle taper belongs to a
   * holder and a series to a collet, and neither is a column of the tool table.
   */
  readonly holding: {
    readonly tapers: ReadonlyArray<string>
    readonly series: ReadonlyArray<string>
  }
  /** The part's own material, which is both a filter and what the ranking uses. */
  readonly materialGroup: string | null
  readonly onMaterial: (group: string | null) => void
  readonly saved: ReadonlyArray<SavedFilter>
  readonly onSave: (name: string) => void
  readonly onApply: (query: ToolQuery) => void
  readonly onForget: (name: string) => void
  readonly onClear: () => void
  /**
   * Only these quick filters, by key — the always-visible few on the part
   * page (material, holder, collet) rather than the whole panel.
   */
  readonly only?: ReadonlyArray<string>
  /** No title row, no saved menu: the filters and nothing else. */
  readonly compact?: boolean
  /** Which answers want a second look, by filter key. */
}

/** A labelled block. The icon is what is found at a glance, not the word. */
const Field = ({
  icon,
  label,
  span,
  children,
}: {
  icon: ReactNode
  label: string
  span: 1 | 2
  children: ReactNode
}) => (
  <section className={classNames('min-w-0', span === 2 && 'col-span-full')}>
    <h4 className="text-2xs mb-1 flex items-center gap-1.5 font-semibold tracking-wide text-zinc-500 uppercase">
      <span className="text-zinc-600">{icon}</span>
      {label}
    </h4>
    {children}
  </section>
)

/** Closes a popover on a pointer down anywhere outside it. */
const useCloseOnOutside = (open: boolean, close: () => void) => {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])
  return box
}

/** One pressable drawing with its name under it. */
const Tile = ({
  option,
  icon,
  pressed,
  count,
  onToggle,
}: {
  option: TileOption
  icon: ReactNode
  pressed: boolean
  count: number
  onToggle: () => void
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    aria-label={option.label}
    title={
      count > 0
        ? `${option.label} — ${String(count)} of the tools listed`
        : `${option.label} — none in this list`
    }
    onClick={onToggle}
    className={classNames(
      'relative flex min-w-0 flex-col items-center gap-1 rounded-md border px-1 py-1.5 transition',
      'focus-visible:ring-info/60 focus-visible:ring-1 focus-visible:outline-none',
      /*
        **One colour for a chosen answer** (Paul, 2026-09-01: "we don't need
        the colouring for bull nose here — even though it leaves a deviation
        for the feature, show it the same as the others. They'll see the
        deviation in the tool list"). An amber tile in the type picker warned
        about a tool before anybody had chosen one, in a place where every
        other tile means "press me".
      */
      pressed
        ? 'border-info/60 bg-info/15 text-info'
        : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100',
      // Pressable still — it is how somebody finds out there is nothing — but
      // not looking like one of the answers.
      count === 0 && !pressed && 'opacity-40',
    )}
  >
    {icon}
    <span className="w-full truncate text-center text-[0.6rem] leading-tight">{option.label}</span>
  </button>
)

/**
 * Type to narrow, on every picker that has answers to narrow.
 *
 * Paul (2026-08-31): a shop looking for a Kennametal part number, a family or
 * a dovetail cutter should type it rather than hunt for it. Shown once a
 * question has more answers than fit across, because searching three of them
 * is slower than reading them.
 */
const Find = ({
  label,
  value,
  onChange,
  onAll,
  count = 0,
}: {
  label: string
  value: string
  onChange: (text: string) => void
  /** Take everything the word matched, where taking several makes sense. */
  onAll?: (() => void) | undefined
  count?: number
}) => (
  <div className="mb-1 flex items-center gap-1">
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-zinc-800 px-2 py-1">
      <MagnifyingGlassIcon className="shrink-0 text-zinc-600" />
      <input
        type="search"
        aria-label={`Find a ${label.toLowerCase()}`}
        placeholder={`Find a ${label.toLowerCase()}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-2xs min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
      />
    </label>
    {onAll ? (
      <button
        type="button"
        onClick={onAll}
        className="text-2xs focus-visible:ring-info/60 shrink-0 rounded border border-zinc-700 px-1.5 py-1 whitespace-nowrap text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
      >
        All {count}
      </button>
    ) : null}
  </div>
)

/** What a typed word matches: the words on screen, not the codes behind them. */
const matching = <T extends { value: string; label: string }>(
  options: ReadonlyArray<T>,
  text: string,
): ReadonlyArray<T> => {
  const term = text.trim().toLowerCase()
  return term === ''
    ? options
    : options.filter(
        (each) =>
          each.label.toLowerCase().includes(term) || each.value.toLowerCase().includes(term),
      )
}

/**
 * A row of words, the common ones in front and the rest behind a press.
 *
 * The same rule as the tiles, and for the same reason: four answers fit
 * across without wrapping, so a question with three reads as one row rather
 * than two (Paul, 2026-08-31). Past four the rest are one press away, and
 * pressing grows the block — nothing scrolls inside itself.
 */
const ChipPicker = ({
  filter,
  options,
  chosen,
  counted,
  onAny,
  onToggle,
  onAll,
}: {
  filter: QuickFilter
  options: ReadonlyArray<TileOption & { title?: string }>
  chosen: ReadonlyArray<string>
  counted: ReadonlyMap<string, number>
  onAny: () => void
  onToggle: (value: string) => void
  onAll: (values: ReadonlyArray<string>) => void
}) => {
  const [all, setAll] = useState(false)
  const [find, setFind] = useState('')
  const single = filter.mode === 'single' || filter.mode === 'single-term'
  const found = matching(options, find)
  // "Any" is an answer too, so it counts against the four.
  const room = FRONT_TILES - (single ? 1 : 0)
  // Anything already pressed stays in front whatever the room, or the only
  // way to unpress it would be to know where it went.
  const front =
    all || find.trim() !== ''
      ? found
      : found.filter((each, index) => index < room || chosen.includes(each.value))
  const rest = found.length - front.length

  return (
    <>
      {options.length > FRONT_TILES ? (
        <Find
          label={filter.label}
          value={find}
          onChange={setFind}
          // Typed a word and meant all of them: one press rather than nine.
          onAll={
            single || find.trim() === '' || found.length < 2
              ? undefined
              : () => onAll(found.map((each) => each.value))
          }
          count={found.length}
        />
      ) : null}
      {/*
        **A grid, not a paragraph of chips** (Paul, 2026-09-01: "instead of the
        messy text, do a nice grid for the potential options in all of the
        multiple choice filters"). Wrapped in a row, six part materials came out
        ragged and read as a sentence; on a grid every answer is the same width
        and the eye goes down the column.
      */}
      <ChipGroup label={filter.label} className="grid! min-w-[19rem] grid-cols-2 items-stretch">
        {single ? (
          <Chip pressed={chosen.length === 0} onClick={onAny}>
            Any
          </Chip>
        ) : null}
        {front.map((option) => {
          const many = counted.get(option.value) ?? 0
          return (
            <Chip
              key={option.value}
              pressed={chosen.includes(option.value)}
              // The count is over what is on screen: a zero says this value is
              // incompatible with the rest of the selection, which is worth
              // knowing before pressing it — and it is drawn faint rather than
              // taken away, because pressing it is how the question widens
              // (Paul, 2026-09-01).
              className={many === 0 && !chosen.includes(option.value) ? 'opacity-40' : ''}
              title={
                option.title ??
                (many === 0
                  ? `${option.label} — none in this list`
                  : `${String(many)} of the tools listed`)
              }
              onClick={() => onToggle(option.value)}
            >
              {option.label}
            </Chip>
          )
        })}
        {rest > 0 ? (
          <Chip title={`${String(rest)} more`} onClick={() => setAll(true)}>
            <DotsThreeIcon weight="bold" />
            {rest} more
          </Chip>
        ) : null}
      </ChipGroup>
    </>
  )
}

/**
 * A wall of drawings, the common ones in front and the rest behind `…`.
 *
 * Twenty-four labelled tiles is a page; six is a glance. What stands in front
 * is data-driven — the forms this catalog holds, the brands with the most tools
 * in the list — so the panel shows a shop *its* shelf rather than the whole
 * trade's. Anything already pressed stays in front whatever the count, or the
 * only way to unpress it would be to know where it went.
 */
const TilePicker = ({
  filter,
  options,
  chosen,
  counts,
  held,
  onToggle,
  onAll,
}: {
  filter: QuickFilter
  options: ReadonlyArray<TileOption>
  chosen: ReadonlyArray<string>
  /** Over the tools on screen: what pressing a tile would leave. */
  counts: ReadonlyMap<string, number>
  /** Over the whole catalog: what this shop has at all. */
  held: ReadonlyMap<string, number>
  onToggle: (value: string) => void
  onAll: (values: ReadonlyArray<string>) => void
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const box = useCloseOnOutside(open, () => setOpen(false))

  const found = useMemo(() => matching(options, search), [options, search])
  const front = useMemo(() => {
    if (search.trim() !== '') {
      return found
    }
    const ranked =
      filter.front === 'counted'
        ? [...options].sort((a, b) => (counts.get(b.value) ?? 0) - (counts.get(a.value) ?? 0))
        : options.filter((each) => (held.get(each.value) ?? 0) > 0)
    const lead = ranked.slice(0, FRONT_TILES).map((each) => each.value)
    return options.filter((each) => lead.includes(each.value) || chosen.includes(each.value))
  }, [filter.front, options, counts, held, chosen, search, found])

  const behind = useMemo(() => found.filter((each) => !front.includes(each)), [found, front])

  const groups = useMemo(() => {
    const byGroup = new Map<string, Array<TileOption>>()
    for (const each of behind) {
      const list = byGroup.get(each.group ?? '') ?? []
      list.push(each)
      byGroup.set(each.group ?? '', list)
    }
    return [...byGroup]
  }, [behind])

  const tile = (option: TileOption) => (
    <Tile
      key={option.value}
      option={option}
      icon={filter.tile?.(option.value)}
      pressed={chosen.includes(option.value)}
      count={counts.get(option.value) ?? 0}
      onToggle={() => onToggle(option.value)}
    />
  )

  const rest = options.length - front.length

  return (
    <div ref={box}>
      {options.length > FRONT_TILES ? (
        <Find
          label={filter.label}
          value={search}
          onChange={setSearch}
          onAll={
            search.trim() === '' || found.length < 2
              ? undefined
              : () => onAll(found.map((each) => each.value))
          }
          count={found.length}
        />
      ) : null}
      <div
        role="group"
        aria-label={filter.label}
        className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-1"
      >
        {front.map(tile)}
        {rest > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Every ${filter.label.toLowerCase()}`}
            title={`${String(rest)} more`}
            onClick={() => setOpen(!open)}
            className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-zinc-800 px-1 py-1.5 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <DotsThreeIcon weight="bold" className="size-6" />
            <span className="text-[0.6rem] leading-tight">{String(rest)} more</span>
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-1 w-[34rem] max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-800 bg-zinc-950 p-2">
          <div className="flex flex-col gap-2">
            {behind.length === 0 ? (
              <p className="text-2xs px-1 py-1 text-zinc-600">Nothing else by that name.</p>
            ) : null}
            {groups.map(([group, members]) => (
              <section key={group}>
                {group ? (
                  <h5 className="text-2xs mb-1 px-0.5 tracking-wide text-zinc-600 uppercase">
                    {group}
                  </h5>
                ) : null}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-1">
                  {members.map(tile)}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The filters somebody has kept, under the button that keeps them.
 *
 * They were chips that appeared only once one existed, which is a feature
 * nobody finds. A button that is always there — and says "nothing yet" when
 * that is the answer — is one.
 */
const SavedMenu = ({
  saved,
  onApply,
  onForget,
}: {
  saved: ReadonlyArray<SavedFilter>
  onApply: (query: ToolQuery) => void
  onForget: (name: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const box = useCloseOnOutside(open, () => setOpen(false))

  return (
    <div ref={box} className="relative">
      <Chip
        title="Filters kept under a name"
        pressed={open}
        onClick={() => setOpen(!open)}
        label={`Saved filters, ${String(saved.length)}`}
      >
        <BookmarksSimpleIcon />
        Saved{saved.length > 0 ? ` · ${String(saved.length)}` : ''}
        <CaretDownIcon />
      </Chip>
      {open ? (
        <div
          role="menu"
          aria-label="Saved filters"
          className="absolute top-full right-0 z-30 mt-1 min-w-48 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
        >
          {saved.length === 0 ? (
            <p className="text-2xs px-2 py-1.5 text-zinc-500">
              Nothing saved yet. Set some filters and press Save.
            </p>
          ) : (
            saved.map((each) => (
              <div
                key={each.name}
                className="text-2xs flex items-center gap-2 px-2 py-1 hover:bg-zinc-900"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onApply(each.query)
                    setOpen(false)
                  }}
                  className="min-w-0 flex-1 truncate text-left text-zinc-200"
                >
                  {each.name}
                </button>
                <button
                  type="button"
                  aria-label={`Forget ${each.name}`}
                  title="Forget it"
                  onClick={() => onForget(each.name)}
                  className="rounded p-0.5 text-zinc-600 hover:text-zinc-200"
                >
                  <XIcon />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The first cut: which material, what size, held how, which kind, and whose.
 *
 * **It has to fit without scrolling.** A panel somebody scrolls to see what they
 * have already asked is one where filters get set twice and cleared never. So
 * the questions with short answers share rows, and the two with long ones —
 * tool type and brand — take the bottom row between them, as tiles with the
 * common ones in front.
 *
 * The material and the two numbers are what the feature and material fill in
 * by themselves (`shared/suggest-filters`); everything is somebody's to change.
 */
export const FilterPanel = ({
  facets,
  query,
  onQuery,
  counts,
  unit,
  holding,
  materialGroup,
  onMaterial,
  saved,
  onSave,
  onApply,
  onForget,
  onClear,
  only,
  compact = false,
}: FilterPanelProps) => {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  /** What the whole catalog holds of each axis, whatever is on screen. */
  const held = (key: string): ReadonlyMap<string, number> =>
    new Map(
      (facets.terms.find((axis) => axis.key === key)?.values ?? []).map((each) => [
        each.value,
        each.count,
      ]),
    )

  /**
   * `single` means the part itself, which this application holds one of.
   *
   * It is the material, and there is exactly one such filter — a part is not
   * two materials. Written as a rule rather than a special case in the markup
   * so that the renderer below stays one loop.
   */
  const chosenFor = (filter: QuickFilter): ReadonlyArray<string> =>
    filter.mode === 'single'
      ? materialGroup === null
        ? []
        : [materialGroup]
      : (query.terms[filter.key] ?? [])

  const setTerm = (key: string, values: ReadonlyArray<string>) => {
    const terms = { ...query.terms }
    if (values.length === 0) {
      delete terms[key]
    } else {
      terms[key] = values
    }
    onQuery({ ...query, terms })
  }

  const toggle = (filter: QuickFilter, value: string) => {
    if (filter.mode === 'single') {
      onMaterial(materialGroup === value ? null : value)
      return
    }
    if (filter.mode === 'single-term') {
      // A spindle is one interface and a collet holder takes one series, so
      // choosing a second replaces the first rather than widening to both.
      setTerm(filter.key, chosenFor(filter).includes(value) ? [] : [value])
      return
    }
    // On or off. A vendor used to walk a priority — first, second, third —
    // which the sheet read as a rank row; both are gone (Paul, 2026-08-31).
    // Which type is best is the sheet's `form in order` rows, never a number
    // on a tile.
    onQuery(toggleTerm(query, filter.key, value))
  }

  const setBound = (key: string, bound: Bound | undefined) => {
    const ranges = { ...query.ranges }
    if (bound === undefined || (bound.min === undefined && bound.max === undefined)) {
      delete ranges[key]
    } else {
      ranges[key] = bound
    }
    onQuery({ ...query, ranges })
  }

  /**
   * **Every value, always — the count says what is left** (Paul, 2026-09-01:
   * "I can't get filters back after removing them! … All of the filter dialogs
   * should ALWAYS show everything that is available so I could activate them
   * (the additional options show as disabled to begin with but can be clicked
   * to activate them)").
   *
   * They used to be dropped at a count of zero, which is fine until the count
   * reaches zero *because of what you just chose*: with ball end mills the only
   * type left, the bull noses were not on the panel to put back, and the way
   * out was the browser's back button.
   *
   * So a zero is drawn rather than removed — greyed, and still pressable,
   * because pressing it is how somebody widens the question. The counts
   * themselves are measured against every filter but this axis's own, so an
   * axis never narrows itself.
   */
  const narrowed = (
    _filter: QuickFilter,
    options: ReadonlyArray<TileOption & { title?: string }>,
  ): ReadonlyArray<TileOption & { title?: string }> => options

  const optionsFor = (filter: QuickFilter): ReadonlyArray<TileOption & { title?: string }> => {
    if (filter.values === 'holders') {
      return holding.tapers.map((each) => ({ value: each, label: each }))
    }
    if (filter.values === 'collets') {
      return holding.series.map((each) => ({ value: each, label: each }))
    }
    if (filter.values) {
      return narrowed(filter, filter.values)
    }
    const known = facets.terms.find((axis) => axis.key === filter.key)
    const named = (known?.values ?? []).map((each) => ({
      value: each.value,
      label: filter.labelOf?.(each.value) ?? each.value,
    }))
    // `facetsFor` sorts an axis by its **value**, which is the same thing as
    // its label everywhere but here. With a `labelOf` the two part company,
    // and the four chips standing in front then read as an arbitrary handful:
    // the family picker led with `destinytool end mills inch` and
    // `emuge taps` — ids beginning with d and e — while every named family
    // sat behind the `…`. Sorted by what is on the chip, so the order a
    // reader sees is the order they can predict.
    if (filter.labelOf) {
      named.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
    }
    return narrowed(filter, named)
  }

  const shownFilters = only
    ? QUICK_FILTERS.filter((filter) => only.includes(filter.key))
    : QUICK_FILTERS

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {compact ? null : (
        <div className="flex items-center gap-2">
          <h3 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">Filters</h3>
          <span className="ml-auto flex items-center gap-1">
            <SavedMenu saved={saved} onApply={onApply} onForget={onForget} />
            {naming ? (
              <input
                autoFocus
                aria-label="Name for this filter"
                placeholder="Name it, then Enter"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSave(name)
                    setName('')
                    setNaming(false)
                  }
                  if (event.key === 'Escape') {
                    setNaming(false)
                  }
                }}
                onBlur={() => setNaming(false)}
                className="text-2xs w-32 rounded border border-zinc-700 bg-transparent px-1.5 py-0.5 text-zinc-100 outline-none"
              />
            ) : (
              <Chip title="Keep what is set now, under a name" onClick={() => setNaming(true)}>
                <BookmarkSimpleIcon />
                Save
              </Chip>
            )}
            <Chip title="Clear every filter" onClick={onClear}>
              <BroomIcon />
              Clear
            </Chip>
          </span>
        </div>
      )}

      {/*
        **One question, one column.** The panel is two columns when it holds
        the lot, and a rail popover holds exactly one — where half of 18 rem is
        too narrow for three chips, so "Reduced" wrapped under "Any Full" for
        no reason (Paul, 2026-08-31: "should read horizontally").
      */}
      <div
        className={classNames(compact ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-x-4 gap-y-3')}
      >
        {shownFilters.map((filter) => {
          const counted = counts(filter.key)

          if (filter.shape === 'range') {
            /**
             * **A count says which counts there are** (Paul, 2026-09-01).
             *
             * Flutes are a handful of whole numbers, and which of them exist
             * depends on everything else already chosen — a vendor, a family,
             * a type. So the ones left are offered as chips beside the range,
             * counted the same way every other axis is: against every filter
             * but this one.
             */
            const present =
              filter.kind === 'count'
                ? [...counted.entries()]
                    .map(([value, count]) => ({ value: Number(value), count }))
                    .filter((each) => Number.isFinite(each.value) && each.count > 0)
                    .sort((a, b) => a.value - b.value)
                : []
            const bound = query.ranges[filter.key]
            const exactly = (value: number) => bound?.min === value && bound.max === value
            return (
              <Field key={filter.key} icon={filter.icon} label={filter.label} span={filter.span}>
                <div className="flex flex-col gap-1">
                  <RangeFilter
                    label={filter.label}
                    bound={bound}
                    onBound={(next) => setBound(filter.key, next)}
                    unit={unit}
                    kind={filter.kind ?? 'length'}
                  />
                  {present.length === 0 ? null : (
                    <div className="flex flex-wrap gap-1">
                      {present.map((each) => (
                        <button
                          key={each.value}
                          type="button"
                          aria-pressed={exactly(each.value)}
                          title={`${String(each.count)} of what is left`}
                          onClick={() =>
                            setBound(
                              filter.key,
                              exactly(each.value)
                                ? undefined
                                : { min: each.value, max: each.value },
                            )
                          }
                          className={classNames(
                            'text-2xs rounded border px-1.5 py-0.5 transition',
                            exactly(each.value)
                              ? 'border-info/60 bg-info/15 text-info'
                              : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                          )}
                        >
                          {/*
                            **The count of flutes, and the count of tools, are
                            two numbers** (Paul, 2026-09-01: "differentiate the
                            count in # flutes"). Side by side and in the same
                            type, "3 5688" read as one figure. The tally is the
                            small print, in brackets, the way every other count
                            on this panel is set.
                          */}
                          <span className="font-mono">{each.value}</span>
                          <span className="ml-1 text-[0.65em] text-zinc-500">({each.count})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            )
          }

          const options = optionsFor(filter)
          if (options.length === 0) {
            return null
          }
          const chosen = chosenFor(filter)
          const label =
            filter.mode === 'multi' && chosen.length > 0
              ? `${filter.label} · ${String(chosen.length)}`
              : filter.label

          if (filter.shape === 'tiles') {
            return (
              <Field key={filter.key} icon={filter.icon} label={label} span={filter.span}>
                <TilePicker
                  filter={filter}
                  options={options}
                  chosen={chosen}
                  counts={counted}
                  held={held(filter.key)}
                  onToggle={(value) => toggle(filter, value)}
                  onAll={(values) =>
                    setTerm(filter.key, [...new Set([...chosenFor(filter), ...values])])
                  }
                />
              </Field>
            )
          }

          return (
            <Field key={filter.key} icon={filter.icon} label={label} span={filter.span}>
              <ChipPicker
                filter={filter}
                options={options}
                chosen={chosen}
                counted={counted}
                onAny={() => {
                  if (filter.mode === 'single') {
                    onMaterial(null)
                    return
                  }
                  setTerm(filter.key, [])
                }}
                onToggle={(value) => toggle(filter, value)}
                onAll={(values) =>
                  setTerm(filter.key, [...new Set([...chosenFor(filter), ...values])])
                }
              />
            </Field>
          )
        })}
      </div>
    </div>
  )
}
