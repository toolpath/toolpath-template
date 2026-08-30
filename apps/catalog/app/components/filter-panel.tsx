import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookmarkSimpleIcon,
  BookmarksSimpleIcon,
  BroomIcon,
  CaretDownIcon,
  CircleIcon,
  CubeIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  RulerIcon,
  TagIcon,
  WrenchIcon,
  XIcon,
} from '@phosphor-icons/react'
import type { Facets } from '@toolpath/catalog-data'
import { MATERIAL_GROUPS, TOOL_FORMS } from '@toolpath/catalog-data'
import { classNames } from '@toolpath/domain/class-names'
import type { Unit } from '@toolpath/domain/units'
import { cycleTerm, toggleTerm, type ToolQuery } from 'shared/filter'
import type { SavedFilter } from 'shared/saved-filters'
import { Chip, ChipGroup } from './chip'
import { RangeFilter, type Bound, type Kind } from './column-filter'
import { ColletIcon, HolderIcon, ToolTypeIcon } from './tool-icons'

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
 * Vendors this catalog does not hold yet.
 *
 * Listed at the end of the brand picker, greyed and not pressable. A shop
 * looking at three names cannot tell whether this application knows about
 * three tooling vendors or three hundred, and the answer decides whether they
 * bother ingesting their own library. These say: the shelf is this wide, and
 * yours goes here.
 *
 * They are **not filters**. Offering one would return nothing, which is the
 * kind of empty list that reads as a broken feature rather than an absent
 * vendor.
 */
const BRAND_PLACEHOLDERS = [
  'Sandvik Coromant',
  'Iscar',
  'Seco',
  'Walter',
  'Guhring',
  'OSG',
  'Harvey Tool',
  'Helical',
  'Emuge',
  'Mitsubishi',
] as const

/** How many tiles a picker shows before the rest go behind `…`. */
const FRONT_TILES = 6

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
 *   under it does the confirming.
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
  /** For tiles: how one is drawn. */
  readonly tile?: (value: string) => ReactNode
  /** For tiles: which values stand in front. The rest go behind `…`. */
  readonly front?: 'held' | 'counted'
  /** For tiles: a search box in the popover, for a list that will grow. */
  readonly search?: boolean
  /** For tiles: names shown greyed at the end, as the shelf this catalog will fill. */
  readonly placeholders?: ReadonlyArray<string>
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

const Monogram = ({ brand, muted = false }: { brand: string; muted?: boolean }) => (
  <span
    className={classNames(
      'grid size-6 place-items-center rounded-sm text-[0.6rem] font-bold',
      muted ? 'bg-zinc-900 text-zinc-600' : 'bg-zinc-800 text-current',
    )}
  >
    {monogram(brand)}
  </span>
)

const QUICK_FILTERS: ReadonlyArray<QuickFilter> = [
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
    icon: <RulerIcon />,
    shape: 'range',
    mode: 'range',
    span: 1,
    kind: 'length',
  },
  {
    key: 'NOF',
    label: 'Flutes',
    icon: <WrenchIcon />,
    shape: 'range',
    mode: 'range',
    span: 1,
    kind: 'count',
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
    key: 'shank',
    label: 'Shank',
    icon: <RulerIcon />,
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
    key: 'colletSeries',
    label: 'Collet',
    icon: <ColletIcon />,
    shape: 'chips',
    mode: 'single-term',
    span: 1,
    values: 'collets',
  },
  {
    // `form`, not `toolType`: the catalog's own coarse type says `endmill`
    // where this picker says `bull nose end mill`, and a picker asking in one
    // vocabulary about data kept in another counted zero for everything but
    // `drill` — the one name the two happened to share.
    key: 'form',
    label: 'Tool type',
    icon: <WrenchIcon />,
    shape: 'tiles',
    mode: 'multi',
    span: 1,
    // Every form the library names, not only the ones ingested so far: the
    // question "does this know about dovetail cutters" is answered by opening
    // the `…`, and the ones this catalog holds stand in front.
    values: TOOL_FORMS.map((each) => ({ value: each.value, label: each.label, group: each.group })),
    tile: (value) => <ToolTypeIcon toolType={value} className="size-6" />,
    front: 'held',
  },
  {
    key: 'brand',
    label: 'Brand',
    icon: <TagIcon />,
    shape: 'tiles',
    mode: 'multi',
    span: 1,
    tile: (value) => <Monogram brand={value} />,
    front: 'counted',
    search: true,
    placeholders: BRAND_PLACEHOLDERS,
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
  rank,
  count,
  onToggle,
}: {
  option: TileOption
  icon: ReactNode
  pressed: boolean
  /** Its place in the priority order, from one; the badge on the tile. */
  rank?: number
  count: number
  onToggle: () => void
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    aria-label={rank === undefined ? option.label : `${option.label}, priority ${String(rank)}`}
    title={
      count > 0
        ? `${option.label} — ${String(count)} of the tools listed`
        : `${option.label} — none in this list`
    }
    onClick={onToggle}
    className={classNames(
      'relative flex min-w-0 flex-col items-center gap-1 rounded-md border px-1 py-1.5 transition',
      'focus-visible:ring-info/60 focus-visible:ring-1 focus-visible:outline-none',
      pressed
        ? 'border-info/60 bg-info/15 text-info'
        : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100',
      // Pressable still — it is how somebody finds out there is nothing — but
      // not looking like one of the answers.
      count === 0 && !pressed && 'opacity-40',
    )}
  >
    {rank === undefined ? null : (
      <span
        aria-hidden="true"
        className="bg-info absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full text-[0.6rem] font-bold text-zinc-950"
      >
        {rank}
      </span>
    )}
    {icon}
    <span className="w-full truncate text-center text-[0.6rem] leading-tight">{option.label}</span>
  </button>
)

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
}: {
  filter: QuickFilter
  options: ReadonlyArray<TileOption>
  chosen: ReadonlyArray<string>
  /** Over the tools on screen: what pressing a tile would leave. */
  counts: ReadonlyMap<string, number>
  /** Over the whole catalog: what this shop has at all. */
  held: ReadonlyMap<string, number>
  onToggle: (value: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const box = useCloseOnOutside(open, () => setOpen(false))

  const front = useMemo(() => {
    const ranked =
      filter.front === 'counted'
        ? [...options].sort((a, b) => (counts.get(b.value) ?? 0) - (counts.get(a.value) ?? 0))
        : options.filter((each) => (held.get(each.value) ?? 0) > 0)
    const lead = ranked.slice(0, FRONT_TILES).map((each) => each.value)
    return options.filter((each) => lead.includes(each.value) || chosen.includes(each.value))
  }, [filter.front, options, counts, held, chosen])

  const behind = useMemo(() => {
    const term = search.trim().toLowerCase()
    return options.filter(
      (each) => !front.includes(each) && (term === '' || each.label.toLowerCase().includes(term)),
    )
  }, [options, front, search])

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
      rank={
        filter.key === 'brand' && chosen.includes(option.value)
          ? chosen.indexOf(option.value) + 1
          : undefined
      }
      count={counts.get(option.value) ?? 0}
      onToggle={() => onToggle(option.value)}
    />
  )

  const rest = options.length - front.length
  const placeholders = (filter.placeholders ?? []).filter(
    (name) => !options.some((each) => each.value.toLowerCase() === name.toLowerCase()),
  )

  return (
    <div ref={box} className="relative">
      <div
        role="group"
        aria-label={filter.label}
        className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1"
      >
        {front.map(tile)}
        {rest > 0 || placeholders.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Every ${filter.label.toLowerCase()}`}
            title={`${String(rest)} more`}
            onClick={() => setOpen(!open)}
            className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-zinc-800 px-1 py-1.5 text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <DotsThreeIcon weight="bold" className="size-6" />
            <span className="text-[0.6rem] leading-tight">
              {rest > 0 ? `${String(rest)} more` : 'more'}
            </span>
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute top-full left-0 z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
          {filter.search ? (
            <label className="mb-2 flex items-center gap-1.5 rounded border border-zinc-800 px-2 py-1">
              <MagnifyingGlassIcon className="shrink-0 text-zinc-600" />
              <input
                autoFocus
                type="search"
                aria-label={`Find a ${filter.label.toLowerCase()}`}
                placeholder={`Find a ${filter.label.toLowerCase()}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="text-2xs min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
              />
            </label>
          ) : null}

          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {behind.length === 0 && placeholders.length === 0 ? (
              <p className="text-2xs px-1 py-1 text-zinc-600">Nothing else by that name.</p>
            ) : null}
            {groups.map(([group, members]) => (
              <section key={group}>
                {group ? (
                  <h5 className="text-2xs mb-1 px-0.5 tracking-wide text-zinc-600 uppercase">
                    {group}
                  </h5>
                ) : null}
                <div className="grid grid-cols-4 gap-1">{members.map(tile)}</div>
              </section>
            ))}
            {placeholders.length > 0 ? (
              <section>
                <h5 className="text-2xs mb-1 px-0.5 tracking-wide text-zinc-600 uppercase">
                  Not in this catalog yet
                </h5>
                <div className="grid grid-cols-4 gap-1">
                  {placeholders.map((name) => (
                    <span
                      key={name}
                      aria-disabled="true"
                      title={`${name} — not in this catalog yet`}
                      className="flex min-w-0 cursor-default flex-col items-center gap-1 rounded-md border border-dashed border-zinc-800/80 px-1 py-1.5 text-zinc-700"
                    >
                      <Monogram brand={name} muted />
                      <span className="w-full truncate text-center text-[0.6rem] leading-tight">
                        {name}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
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
    // A brand tile walks its priority — first, second, third, off — because
    // brand order is the one rank the sheet reads from the page. A tool-type
    // tile is on or off: which type is best is the rules sheet's `form in
    // order` rows, by Paul's call, never a number on a tile.
    onQuery(
      filter.key === 'brand'
        ? cycleTerm(query, filter.key, value)
        : toggleTerm(query, filter.key, value),
    )
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

  const optionsFor = (filter: QuickFilter): ReadonlyArray<TileOption & { title?: string }> => {
    if (filter.values === 'holders') {
      return holding.tapers.map((each) => ({ value: each, label: each }))
    }
    if (filter.values === 'collets') {
      return holding.series.map((each) => ({ value: each, label: each }))
    }
    if (filter.values) {
      return filter.values
    }
    const known = facets.terms.find((axis) => axis.key === filter.key)
    return (known?.values ?? []).map((each) => ({ value: each.value, label: each.value }))
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

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {shownFilters.map((filter) => {
          const counted = counts(filter.key)

          if (filter.shape === 'range') {
            return (
              <Field key={filter.key} icon={filter.icon} label={filter.label} span={filter.span}>
                <RangeFilter
                  label={filter.label}
                  bound={query.ranges[filter.key]}
                  onBound={(bound) => setBound(filter.key, bound)}
                  unit={unit}
                  kind={filter.kind ?? 'length'}
                />
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
                />
              </Field>
            )
          }

          return (
            <Field key={filter.key} icon={filter.icon} label={label} span={filter.span}>
              <ChipGroup label={filter.label}>
                {filter.mode === 'single' || filter.mode === 'single-term' ? (
                  <Chip
                    pressed={chosen.length === 0}
                    onClick={() => {
                      if (filter.mode === 'single') {
                        onMaterial(null)
                        return
                      }
                      setTerm(filter.key, [])
                    }}
                  >
                    Any
                  </Chip>
                ) : null}
                {options.map((option) => (
                  <Chip
                    key={option.value}
                    pressed={chosen.includes(option.value)}
                    // The count is over what is on screen: a zero says this
                    // value is incompatible with the rest of the selection,
                    // which is worth knowing before pressing it.
                    title={
                      option.title ??
                      `${String(counted.get(option.value) ?? 0)} of the tools listed`
                    }
                    onClick={() => toggle(filter, option.value)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </ChipGroup>
            </Field>
          )
        })}
      </div>
    </div>
  )
}
