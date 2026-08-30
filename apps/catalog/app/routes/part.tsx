import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge, Card, Panels } from '@toolpath/ui'
import {
  emptyBuildSelection,
  type BuildSelection,
  type CatalogTool,
  type Margins,
} from '@toolpath/catalog-data'
import { useAnalysisEvents } from '@toolpath/part-client'
import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { heldRegions } from '@toolpath/part-contracts/selection'
import { directionColor, directionIndexOf } from '@toolpath/viewer'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { AppHeader } from 'components/app-header'
import { FeatureDetails } from 'components/feature-details'
import { FilterPanel } from 'components/filter-panel'
import { DrawingCard } from 'components/drawing-card'
import { ToolSheet } from 'components/tool-sheet'
import { setChoice, useSetupSheet } from 'shared/setup-sheet'
import { Chip, ChipGroup } from 'components/chip'
import { PartViewer } from 'components/part-viewer'
import { SelectionPanel } from 'components/selection-panel'
import { featureRow } from 'shared/feature-rows'
import { TOOL_COLUMNS, ToolTable } from 'components/tool-table'
import { RecommendationTable, type RecommendationRow } from 'components/recommendation-table'
import { ColumnPicker } from 'components/column-filter'
import { allTools, collets as allCollets, facets, holders as allHolders } from 'shared/catalog'
import { EMPTY_QUERY, countBy, filterTools, queryFromSearch, searchWithQuery } from 'shared/filter'
import { useSavedFilters } from 'shared/saved-filters'
import { applySuggestions, suggestionsFor } from 'shared/suggest-filters'
import { HOLDING_AXES, colletSeries, holdableTools, splitHolding, tapers } from 'shared/holding'
import { sectionOf } from 'shared/section-of'
import { holdable, holderOptions, thresholdsFrom } from 'shared/holder-choice'
import { drawnAssembly } from 'shared/drawn-assembly'
import type { AssemblyPlacement } from 'components/assembly-model'
import { closestMisses, standingOf, type Format } from 'shared/judge'
import { knobValue, knobsWith } from 'shared/rules'
import { closeCandidates, fittingTools, tightestRule } from 'shared/tool-fit'
import { useUnit } from 'shared/use-unit'
import { usePartMaterial, usePreferences } from 'shared/use-preferences'
import { recallPart, rememberPart } from 'shared/part-session'
import { IDLE, groupOf as holeGroupOf, interactionFor } from 'shared/part-interaction'
import { arrowsFor, byLargest, keptFeatures, partHighlight } from 'shared/part-selection'

/**
 * A gap rather than a line.
 *
 * The panels read as cards sitting over the part, and a rule between them turns
 * that back into a grid. It still has to be grabbable, so the separator keeps
 * its width and shows itself only under the pointer.
 */
/**
 * A gap rather than a line.
 *
 * The panels read as cards over the part, and a rule between them turns that
 * back into a grid. `Panels.Separator` draws `border-r`/`border-t` of its own,
 * so the zero-width sides here are what actually removes it — a background
 * colour never touched it.
 *
 * It still has to be grabbable, so it keeps its width and shows itself only
 * under the pointer.
 */
const separator =
  'border-0 border-r-0 border-t-0 bg-transparent transition-colors hover:bg-zinc-700/60 data-[orientation=horizontal]:w-2 data-[orientation=vertical]:h-2'

const Shell = ({ children }: { children: ReactNode }) => {
  const [unit, setUnit] = useUnit()
  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />
      {children}
    </main>
  )
}

const Failed = ({ message }: { message: string }) => (
  <Shell>
    <div className="p-6">
      <p role="alert" className="text-danger text-sm">
        {message}
      </p>
      <Link to="/parts" className="mt-2 inline-block text-sm text-zinc-200 hover:underline">
        Upload another part
      </Link>
    </div>
  </Shell>
)

/**
 * Working a part: the viewer, what is selected on it, and what cuts it.
 *
 * Four panels, every one resizable, because each is somebody's main panel at
 * some point in the job — reading the part, reading a tool list, reading one
 * tool's numbers. A fixed grid makes the application decide which of those
 * matters most, and it is never the same answer twice.
 */
const Inspecting = ({ report, jobId }: { report: PublicInspectionReport; jobId: string }) => {
  const [unit, setUnit] = useUnit()
  const [search, setSearch] = useSearchParams()
  /**
   * What a click on the part means, all of it, in `shared/part-interaction`.
   *
   * The page dispatches and reads; it decides nothing about arrows, faces or
   * the kept group. Every rule in there is a unit test rather than a click.
   */
  const reduce = useMemo(() => interactionFor(report), [report])
  const [interaction, dispatch] = useReducer(reduce, IDLE)
  const { selection, activeDirection, focused, kept, guessed } = interaction

  /** A feature under the pointer, asked of the part as a hover. */
  const [hovered] = useState<string | null>(null)
  /** The feature whose full record is open, if any. */
  const [info, setInfo] = useState<string | null>(null)
  const [chosenTool, setChosenTool] = useState<string | null>(null)
  /**
   * The assembly belongs to the feature.
   *
   * The DFM catalog's rule (Justin Gray, 2026-08-10): a tool, a holder and a
   * collet chosen for a feature are stored on a setup sheet as guids — never
   * geometry — and resolved through the catalog on every render. The four
   * holder filters are *not* on the sheet: a filter is how you found the
   * holder, not part of it, and it stays sticky across features so nobody
   * re-ticks "face contact" for every pocket on the part.
   */
  const { sheet, commit } = useSetupSheet(report.partId)
  /**
   * Columns left out of the tool table.
   *
   * Held here rather than in the table so the control that edits them can sit
   * in the panel's own corner: a button inside the header row needed a column
   * of its own, which cost every row real width and left an empty cell under it
   * on every line.
   */
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlyArray<string>>(
    TOOL_COLUMNS.filter((column) => !column.default).map((column) => column.code),
  )

  const { preferences } = usePreferences()
  const { saved, save, forget } = useSavedFilters()
  const { materialGroup, choose } = usePartMaterial(report.partId)

  // Remembered after render rather than during it: this is a side effect, and a
  // concurrent render that is thrown away must not leave a part behind.
  useEffect(() => {
    rememberPart({ partId: report.partId, jobId, report })
  }, [report, jobId])

  /**
   * Escape and the arrow keys belong to the page, not to a panel.
   *
   * On the document because the 3D canvas takes focus the moment somebody
   * touches the part: a handler on a wrapper only fires once they have clicked
   * the right element first, which is exactly the "it needs a click to start"
   * this replaces.
   *
   * Anything typed into a field is left alone — the search box and the range
   * inputs need their own arrow keys.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')
      if (typing) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        escapeRef.current()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        stepRef.current(event.key === 'ArrowDown' ? 1 : -1)
        return
      }
      // Space puts the row being read on the list, or takes it off — the same
      // thing its checkbox does, without reaching for the mouse.
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        keepRef.current()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /**
   * The readings that own the clicked face, biggest first.
   *
   * `candidates` is already narrowed by the direction the click snapped to, so
   * this is "what this face could be cut as" and nothing wider.
   */
  /** Every reading that owns the clicked face, the most useful first. */
  const candidates = useMemo(() => {
    const byTag = new Map(report.features.map((feature) => [feature.featureTag, feature]))
    const found = selection.candidates.flatMap((tag) => {
      const feature = byTag.get(tag)
      return feature ? [feature] : []
    })
    return byLargest(found)
  }, [report.features, selection.candidates])

  const keptTags = useMemo(() => new Set(kept), [kept])
  const keptDirections = useMemo(
    () =>
      [
        ...new Set(
          keptFeatures(report.features, kept).map((feature) =>
            directionIndexOf(report, feature.machiningDirection),
          ),
        ),
      ].filter((index) => index >= 0),
    [report, kept],
  )
  const directionOf = useCallback(
    (feature: PartFeature) => directionIndexOf(report, feature.machiningDirection),
    [report],
  )
  const focusedDirection = useMemo(() => {
    const feature = report.features.find((each) => each.featureTag === focused)
    return feature ? directionOf(feature) : null
  }, [report.features, focused, directionOf])

  /**
   * The way up being *drawn* is not the way up being *held*.
   *
   * `focusedDirection` is where the reading on screen is cut from, and an arrow
   * is drawn for it. `activeDirection` is a scope somebody set by pressing an
   * arrow, and it narrows what a click can resolve to. Collapsing the two made
   * every face click silently hold a direction, so the next click was scoped to
   * whatever the last one happened to land on.
   */
  const arrows = useMemo(
    () => arrowsFor({ activeDirection, focusedDirection }),
    [activeDirection, focusedDirection],
  )

  /**
   * What the part lights up: **whole features**, not the face that was clicked.
   *
   * The clicked face is painted separately, as the thing a second click walks
   * from. What somebody selected is a feature, so the feature is what wears the
   * colour — every one on the list, and the one being read among them.
   */
  const highlighted = useMemo(() => partHighlight({ kept, focused }), [kept, focused])
  const selectedFeatures = useMemo(
    () => keptFeatures(report.features, kept),
    [report.features, kept],
  )

  const axes = useMemo(
    () => [
      ...facets.terms.map((axis) => axis.key),
      ...facets.ranges.map((axis) => axis.key),
      // Holding is a filter like any other as far as the URL is concerned; what
      // it narrows is the crib rather than the tool.
      ...HOLDING_AXES,
    ],
    [],
  )
  /**
   * The kept group, painted by what each feature is.
   *
   * Everything selected in one colour says only "these" — the part should
   * answer the same question the list does, which is what each of them *is*.
   * Direction colouring overrides it when that is the question being asked.
   */
  /**
   * What the part paints.
   *
   * Only what is kept, minus what has been hidden — and when exactly one thing
   * is being read, only that. Colouring a dozen features while somebody is
   * looking at one of them buries the one they are looking at.
   */
  /**
   * The list: everything clicked, plus everything already asked for.
   *
   * One list rather than two — a feature given a pass has not become a
   * different kind of thing, and the chips on its row already say it is in.
   * Kept features stay on it even when the current offer no longer includes
   * them, so nothing somebody has decided about can scroll out of existence.
   */
  const rows = useMemo(() => {
    const seen = new Set<string>()
    return [...candidates, ...selectedFeatures].filter((feature) => {
      if (seen.has(feature.featureTag)) {
        return false
      }
      seen.add(feature.featureTag)
      return true
    })
  }, [candidates, selectedFeatures])

  /**
   * What the part paints: exactly what the list holds.
   *
   * All of it stays lit — the point of clicking six faces is seeing the six —
   * and the row being read is painted harder rather than alone. It is `rows`
   * itself rather than a second derivation of the same set, because two
   * derivations are how a list and a part stop agreeing.
   */
  const reading = useMemo(
    () => report.features.find((each) => each.featureTag === focused) ?? null,
    [report.features, focused],
  )

  const shown = rows

  const query = useMemo(() => queryFromSearch(search, axes), [search, axes])

  /**
   * A chosen feature fills the blanks in the filters.
   *
   * Written into the URL like every other filter, so it is somebody's to change
   * or clear — the app never holds a filter they cannot see.
   */
  /**
   * What the last feature suggested, so a stale suggestion can be told from an
   * answer. Without it, clicking a hole and then a pocket left the hole's drill
   * in the filters: it was no longer blank, so the pocket filled nothing.
   */
  const suggested = useRef(suggestionsFor(null, null))

  useEffect(() => {
    const next = applySuggestions(query, suggested.current, reading, materialGroup, report.features)
    suggested.current = suggestionsFor(reading, materialGroup, report.features)
    if (searchWithQuery(search, next, axes).toString() === search.toString()) {
      return
    }
    setSearch(searchWithQuery(search, next, axes), {
      replace: true,
      preventScrollReset: true,
    })
    // Only when the feature or the material changes: re-running on every query
    // edit would put back a filter somebody has just cleared.
  }, [reading, materialGroup])

  /** Writing the filters back to the URL, which is where they live. */
  const apply = useCallback(
    (next: typeof query) =>
      // Through `searchWithQuery`, so this page's own `?job=` survives being
      // filtered.
      setSearch(searchWithQuery(search, next, axes), {
        replace: true,
        preventScrollReset: true,
      }),
    [search, axes, setSearch],
  )

  /** One column's limit, folded into the same `ranges` everything else reads. */
  const applyRange = useCallback(
    (code: string, bound: { min?: number; max?: number } | undefined) => {
      const ranges = { ...query.ranges }
      if (bound === undefined || (bound.min === undefined && bound.max === undefined)) {
        delete ranges[code]
      } else {
        ranges[code] = bound
      }
      apply({ ...query, ranges })
    },
    [query, apply],
  )

  /** One column's names, folded into the same `terms` everything else reads. */
  const applyTerm = useCallback(
    (key: string, values: ReadonlyArray<string>) => {
      const terms = { ...query.terms }
      if (values.length === 0) {
        delete terms[key]
      } else {
        terms[key] = values
      }
      apply({ ...query, terms })
    },
    [query, apply],
  )

  /**
   * Choosing the material is one act, not two.
   *
   * It is what the part is made of — which orders the list — *and* a filter on
   * what the tools are indexed for. Two controls for that read as two
   * questions, and one of them was always left saying something else.
   */
  /**
   * The part material is remembered for the part and sets the flute count
   * through the suggestions; it is not a term over the vendors' material
   * tags, which most of the catalog does not state (Paul's spec, 2026-08-29).
   */
  const chooseMaterial = useCallback((group: string | null) => choose(group), [choose])

  // Reach is measured from the top of the part, so the whole feature list goes
  // in even when three of them are selected.
  // The rules sheet judges every tool against the selection; the brand tiles'
  // order is the one rank row that is the page's rather than the sheet's.
  const brandOrder = query.terms.brand ?? []
  /** Every number in a reason or a reading, in the unit the page is in. */
  const format = useCallback<Format>(
    (value, numberUnit) => {
      switch (numberUnit) {
        case 'mm':
          return formatLength(value, unit)
        case 'deg':
          return `${value.toFixed(1)}°`
        case '%':
          return `${String(Math.round(value))} %`
        default:
          return Number.isInteger(value) ? String(value) : value.toFixed(2)
      }
    },
    [unit],
  )
  /**
   * The room to keep between the stack and the part: entered on the drawing
   * card, seeded from the knobs. The hold thresholds are the sheet's.
   */
  const [margins, setMargins] = useState<Margins>(() => ({
    radial: knobValue('radial holder clearance') ?? 0,
    axial: knobValue('axial holder clearance') ?? 0,
  }))
  /** The sheet's knobs with the card's clearances, so the judge sweeps the tool's body by the same room the holder sweep keeps. */
  const knobs = useMemo(
    () =>
      knobsWith({
        'radial holder clearance': margins.radial,
        'axial holder clearance': margins.axial,
      }),
    [margins],
  )
  const { fitting, excluded } = useMemo(
    () => fittingTools(selectedFeatures, report.features, brandOrder, allTools, format, knobs),
    [selectedFeatures, report.features, brandOrder, format, knobs],
  )
  const tightest = useMemo(() => tightestRule(excluded), [excluded])

  /**
   * The sheet's order, narrowed by the filters. Nothing here widens it, and
   * nothing here reorders by tool type: that is the sheet's `form in order`
   * rows, by Paul's call. Two questions, intersected: what a tool *is*, and
   * whether this crib can put it in a spindle — the second is not a tool
   * field, so it cannot go through `filterTools`.
   */
  const narrowed = useMemo(() => {
    const { tools: toolQuery, holding } = splitHolding(query)
    const kept = new Set(
      holdableTools(
        filterTools(
          fitting.map((verdict) => verdict.tool),
          toolQuery,
        ),
        holding,
      ).map((each) => each.guid),
    )
    return fitting.filter((verdict) => kept.has(verdict.tool.guid))
  }, [fitting, query])
  /** The reach curve the holders are swept over, read off the feature. */
  const curve = useMemo(
    () => (reading ? (sectionOf(reading, report.features)?.curve ?? null) : null),
    [reading, report.features],
  )

  const thresholds = useMemo(() => thresholdsFrom(), [])
  const holderFilters = useMemo(
    () => ({ taper: query.terms.taper ?? [], colletSeries: query.terms.colletSeries ?? [] }),
    [query.terms.taper, query.terms.colletSeries],
  )

  /**
   * The list without the tools nothing in the crib can put to this feature —
   * Paul's rule: a tool with no holder that grips it, clears the part and
   * keeps hold is not shown. Asked of the whole narrowed list, because the
   * ten best are the ten best *holdable* tools; `holdable` stops at the
   * first holder that works, so it stays quick.
   */
  const held = useMemo(
    () =>
      narrowed.filter((verdict) =>
        holdable(verdict.tool, allHolders, allCollets, holderFilters, curve, margins, thresholds),
      ),
    [narrowed, holderFilters, curve, margins, thresholds],
  )
  const unheld = narrowed.length - held.length
  const tools = useMemo(() => held.map((verdict) => verdict.tool), [held])

  /** Which feature the choice is for: the one being read, or the part as a whole. */
  const choiceKey = focused ?? '*'

  /**
   * Holder, collet and stickout picked on a row, per tool, for the feature
   * being read — the person's, until Save writes them to the sheet. Cleared
   * when the reading changes: a holder picked for a pocket is not a holder
   * picked for a hole.
   */
  const [picked, setPicked] = useState<
    Readonly<
      Record<
        string,
        { holderGuid?: string | null; colletGuid?: string | null; stickout?: number | null }
      >
    >
  >({})
  useEffect(() => {
    setPicked({})
    setChosenTool(null)
  }, [focused])

  const [fullTable, setFullTable] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(true)

  /**
   * The list: the ten best, each as the assembly the rules recommend — and,
   * when fewer than ten fit, the nearest misses after them, marked
   * incompatible and saying by how much.
   */
  const recommendations = useMemo<Array<RecommendationRow>>(() => {
    const TOP = 10
    const best = held.slice(0, TOP)
    const optionsOf = (verdict: (typeof held)[number]) =>
      holderOptions(verdict.tool, allHolders, allCollets, holderFilters, curve, margins, thresholds)
    // The fill obeys the same rule: a near miss nothing can hold is not offered either.
    const wanted = TOP - best.length
    const close =
      wanted > 0
        ? closestMisses(closeCandidates(excluded, query), wanted * 3)
            .filter((verdict) =>
              holdable(
                verdict.tool,
                allHolders,
                allCollets,
                holderFilters,
                curve,
                margins,
                thresholds,
              ),
            )
            .slice(0, wanted)
        : []
    const choice = sheet.choices[choiceKey]
    const row = (verdict: (typeof held)[number], standing: RecommendationRow['standing']) => {
      const mine = picked[verdict.tool.guid]
      const savedHere = choice?.toolGuid === verdict.tool.guid
      return {
        verdict,
        standing,
        options: optionsOf(verdict),
        holderGuid: mine?.holderGuid ?? (savedHere ? (choice.holderGuid ?? null) : null),
        colletGuid: mine?.colletGuid ?? (savedHere ? (choice.colletGuid ?? null) : null),
        saved: savedHere,
      }
    }
    return [
      ...best.map((verdict) => row(verdict, standingOf(verdict) as RecommendationRow['standing'])),
      ...close.map((verdict) => row(verdict, 'close')),
    ]
  }, [held, excluded, query, sheet, choiceKey, picked, holderFilters, curve, margins, thresholds])

  /**
   * The row being drawn: the one clicked, or the first — the drawing is never
   * empty once a feature is read. From the full table, any tool at all.
   */
  const chosenRow = useMemo(
    () =>
      recommendations.find((each) => each.verdict.tool.guid === chosenTool) ??
      (chosenTool === null ? (recommendations[0] ?? null) : null),
    [recommendations, chosenTool],
  )
  const tool = useMemo(
    () => chosenRow?.verdict.tool ?? allTools.find((each) => each.guid === chosenTool) ?? null,
    [chosenRow, chosenTool],
  )
  const drawnOptions = useMemo(
    () =>
      chosenRow?.options ??
      (tool
        ? holderOptions(tool, allHolders, allCollets, holderFilters, curve, margins, thresholds)
        : []),
    [chosenRow, tool, holderFilters, curve, margins, thresholds],
  )

  /**
   * The selection the drawing reads: the row's holder and collet — picked,
   * saved, or recommended — and the stickout, picked or the card's default.
   */
  const assemblySelection = useMemo<BuildSelection>(() => {
    const mine = tool ? picked[tool.guid] : undefined
    const choice = sheet.choices[choiceKey]
    const savedHere = tool !== null && choice?.toolGuid === tool.guid
    const holderGuid =
      mine?.holderGuid ??
      (savedHere ? (choice.holderGuid ?? null) : null) ??
      drawnOptions.find((each) => each.recommended)?.holder.guid ??
      drawnOptions[0]?.holder.guid ??
      null
    const option = drawnOptions.find((each) => each.holder.guid === holderGuid) ?? null
    return {
      ...emptyBuildSelection(),
      ...holderFilters,
      holder: holderGuid,
      collet:
        mine?.colletGuid ??
        (savedHere ? (choice.colletGuid ?? null) : null) ??
        option?.collet?.guid ??
        null,
      stickout: mine?.stickout ?? (savedHere ? (choice.stickout ?? null) : null),
    }
  }, [tool, picked, sheet, choiceKey, drawnOptions, holderFilters])

  const pick = useCallback(
    (
      guid: string,
      change: { holderGuid?: string | null; colletGuid?: string | null; stickout?: number | null },
    ) => setPicked((current) => ({ ...current, [guid]: { ...current[guid], ...change } })),
    [],
  )

  /**
   * The drawn stack in the scene: the feature's regions as triangle ranges,
   * the way up it is cut from, and its bottom. Where exactly it stands is the
   * model's to work out from the mesh — the centre of the feature's floor —
   * so it is the same place whatever was clicked, and cannot be moved.
   */
  const placement = useMemo<AssemblyPlacement | null>(() => {
    if (!tool || !reading) {
      return null
    }
    const drawn = drawnAssembly(tool, assemblySelection, curve, margins, thresholds)
    const bottom = reading.datasheet?.zMin
    if (!drawn.assembly || typeof bottom !== 'number') {
      return null
    }
    const owned = new Set(reading.regionIdxs)
    const triangles = report.regions
      .filter((region) => owned.has(region.idx))
      .map((region) => ({ start: region.triangleStart, end: region.triangleEnd }))
    return {
      assembly: drawn.assembly,
      direction: reading.machiningDirection,
      bottom,
      triangles,
      hit: new Set(drawn.collisions.map((each) => each.part)),
      margins,
    }
  }, [tool, reading, report.regions, assemblySelection, curve, margins, thresholds])

  /** The drawing card changes the stickout; the filters it carries are the page's chips. */
  const onSelection = useCallback(
    (next: BuildSelection) => {
      if (tool === null) {
        return
      }
      pick(tool.guid, { holderGuid: next.holder, colletGuid: next.collet, stickout: next.stickout })
    },
    [tool, pick],
  )

  /** Save writes the drawn assembly to the sheet for this feature, and opens the strip. */
  const saveAssembly = useCallback(
    (saved: CatalogTool) => {
      const mine = picked[saved.guid]
      const options =
        recommendations.find((each) => each.verdict.tool.guid === saved.guid)?.options ??
        holderOptions(saved, allHolders, allCollets, holderFilters, curve, margins, thresholds)
      const option =
        options.find((each) => each.holder.guid === mine?.holderGuid) ??
        options.find((each) => each.recommended) ??
        options[0] ??
        null
      const stickout = mine?.stickout ?? option?.stickout ?? null
      commit(
        setChoice(sheet, choiceKey, {
          toolGuid: saved.guid,
          ...(option ? { holderGuid: option.holder.guid } : {}),
          ...(mine?.colletGuid
            ? { colletGuid: mine.colletGuid }
            : option?.collet
              ? { colletGuid: option.collet.guid }
              : {}),
          ...(stickout === null ? {} : { stickout }),
        }),
      )
    },
    [picked, recommendations, holderFilters, curve, margins, thresholds, commit, sheet, choiceKey],
  )

  /** Identical holes are one decision — `shared/part-interaction` says why. */
  const groupOf = useCallback(
    (featureTag: string) => holeGroupOf(report.features, featureTag),
    [report.features],
  )

  /**
   * The keys act on the list on screen, from anywhere on the page.
   *
   * Held in refs because the document listener is registered once: a stale
   * closure would walk yesterday's list.
   */
  const escapeRef = useRef(() => {})
  const stepRef = useRef((_step: number) => {})
  const keepRef = useRef(() => {})
  escapeRef.current = () => dispatch({ type: 'escape' })
  stepRef.current = (step: number) =>
    dispatch({ type: 'step', order: rows.map((each) => each.featureTag), by: step > 0 ? 1 : -1 })
  keepRef.current = () => {
    // Nothing being read yet: the first press takes the first row, so a fresh
    // list is one key rather than a click and a key.
    const tag = focused ?? rows[0]?.featureTag ?? null
    if (tag !== null) {
      dispatch({ type: 'toggle', featureTag: tag })
    }
  }

  const listTitle =
    reading === null
      ? 'Every tool in the catalog'
      : `Cuts the ${featureRow({ feature: reading, features: report.features, regions: report.regions, unit }).type.toLowerCase()}`

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      <Panels.Group className="min-h-0 flex-1 gap-1 p-3" orientation="horizontal">
        <Panels.Panel className="min-h-0 overflow-hidden" defaultSize="72%" minSize={520}>
          <Panels.Group className="size-full min-h-0 gap-1" orientation="vertical">
            <Panels.Panel className="min-h-0 overflow-hidden" defaultSize="52%" minSize={220}>
              <Panels.Group className="size-full min-h-0 gap-1" orientation="horizontal">
                <Panels.Panel className="min-h-0 overflow-hidden" defaultSize="36%" minSize={280}>
                  {/* What is being asked: which feature, in what material, held
                      how. The two inputs that matter are the material and the
                      feature; the holder and collet chips are always there;
                      the rest of the filters fill the column below them (the
                      rules set what they can on a click) and fold to the
                      three on "Hide filters" — Paul's layout, 2026-08-29/30. */}
                  <Card className="flex size-full min-h-0 flex-col overflow-auto">
                    <SelectionPanel
                      feature={reading}
                      features={report.features}
                      regions={report.regions}
                      unit={unit}
                      siblings={focused === null ? 1 : groupOf(focused).length}
                      onInfo={() => setInfo(focused)}
                    />
                    <div className="border-t border-zinc-900 p-3">
                      <FilterPanel
                        facets={facets}
                        query={query}
                        onQuery={apply}
                        counts={(key) => countBy(tools, key)}
                        unit={unit}
                        holding={{ tapers, series: colletSeries }}
                        materialGroup={materialGroup}
                        onMaterial={chooseMaterial}
                        saved={saved}
                        onSave={(name) => save(name, query)}
                        onApply={apply}
                        onForget={forget}
                        onClear={() => apply(EMPTY_QUERY)}
                        {...(filtersOpen
                          ? {}
                          : { only: ['materialGroups', 'taper', 'colletSeries'] })}
                        compact
                      />
                    </div>
                    <div className="mt-auto border-t border-zinc-900 px-3 py-2">
                      <Chip
                        pressed={filtersOpen}
                        title="Every filter, or only the material and the holder. The rules set what they can from the feature."
                        onClick={() => setFiltersOpen((open) => !open)}
                      >
                        {filtersOpen ? 'Hide filters' : 'More filters'}
                      </Chip>
                    </div>
                  </Card>
                </Panels.Panel>

                <Panels.Separator className={separator} />

                <Panels.Panel className="min-h-0 overflow-hidden" minSize={300}>
                  <PartViewer
                    report={report}
                    jobId={jobId}
                    selected={new Set(highlighted)}
                    heldRegions={heldRegions(selection)}
                    hovered={hovered}
                    arrows={arrows}
                    onPickDirection={(direction) => dispatch({ type: 'arm', direction })}
                    directionColor={
                      // The reading wears the colour of the way up it is cut from,
                      // so the arrow and the feature read as one claim.
                      (activeDirection ?? focusedDirection ?? -1) >= 0
                        ? directionColor((activeDirection ?? focusedDirection) as number)
                        : null
                    }
                    details={
                      info === null ? null : (
                        <FeatureDetails
                          features={report.features.filter((each) => each.featureTag === info)}
                          allFeatures={report.features}
                          regions={report.regions}
                          unit={unit}
                          siblings={groupOf(info).length}
                        />
                      )
                    }
                    onCloseDetails={() => setInfo(null)}
                    assembly={placement}
                    onClear={() => dispatch({ type: 'miss' })}
                    onPickFace={(pick) => dispatch({ type: 'click', pick })}
                  />
                </Panels.Panel>
              </Panels.Group>
            </Panels.Panel>

            <Panels.Separator className={separator} />

            <Panels.Panel className="min-h-0 overflow-hidden" minSize={180}>
              {/* The list leads with assemblies: the ten best tools, each with
                  the holder the rules recommend, changeable in place. The full
                  table is a flip away, and the filters overlay it. */}
              <Card className="relative flex size-full min-h-0 flex-col overflow-hidden">
                <p className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2 text-sm">
                  <span className="text-zinc-200">{listTitle}</span>
                  <Badge variant={tools.length === 0 ? 'danger' : 'secondary'}>
                    {tools.length}
                  </Badge>
                  {excluded.length > 0 && reading !== null ? (
                    <span className="text-2xs text-zinc-500" title={tightest ?? undefined}>
                      {excluded.length} removed by the rules
                      {tightest && recommendations.some((row) => row.standing === 'close')
                        ? ` — most by ${tightest}`
                        : ''}
                    </span>
                  ) : null}
                  {fitting.length > narrowed.length ? (
                    <span className="text-2xs text-amber-300/80">
                      {fitting.length - narrowed.length} that fit are hidden by the filters
                    </span>
                  ) : null}
                  {unheld > 0 ? (
                    <span
                      className="text-2xs text-zinc-500"
                      title="A tool with no holder in the crib that grips it, clears the part and keeps hold is not offered"
                    >
                      {unheld} with no holder that clears
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-1">
                    <Chip
                      pressed={fullTable}
                      title="Every tool that fits, with every column, instead of the ten best as assemblies"
                      onClick={() => setFullTable((full) => !full)}
                    >
                      {fullTable ? 'Best as assemblies' : 'Full table'}
                    </Chip>
                    {fullTable ? (
                      <ColumnPicker
                        columns={TOOL_COLUMNS.map((column) => ({
                          code: column.code,
                          label: column.label,
                        }))}
                        shown={TOOL_COLUMNS.filter(
                          (column) => !hiddenColumns.includes(column.code),
                        ).map((column) => column.code)}
                        onToggle={(code) =>
                          setHiddenColumns((current) =>
                            current.includes(code)
                              ? current.filter((each) => each !== code)
                              : [...current, code],
                          )
                        }
                      />
                    ) : null}
                  </span>
                </p>
                <div className="min-h-0 flex-1 overflow-auto">
                  {fullTable ? (
                    <ToolTable
                      tools={tools}
                      unit={unit}
                      chosen={tool?.guid ?? null}
                      onChoose={(each) => setChosenTool(each.guid)}
                      ranges={query.ranges}
                      onRange={applyRange}
                      terms={query.terms}
                      onTerm={applyTerm}
                      hiddenColumns={hiddenColumns}
                    />
                  ) : reading === null ? (
                    <p className="p-3 text-sm text-zinc-400">
                      Click a feature on the part to get the tools that cut it, as assemblies.
                    </p>
                  ) : recommendations.length === 0 ? (
                    <p className="p-3 text-sm text-zinc-400">
                      Nothing in the catalog clears this feature
                      {tightest ? (
                        <>
                          {' '}
                          — <span className="font-mono text-zinc-300">{tightest}</span> is what
                          rules them out
                        </>
                      ) : null}
                      .
                    </p>
                  ) : (
                    <RecommendationTable
                      rows={recommendations}
                      unit={unit}
                      chosen={tool?.guid ?? null}
                      onChoose={(each) => setChosenTool(each.guid)}
                      onHolder={(each, holderGuid) =>
                        pick(each.guid, { holderGuid, colletGuid: null, stickout: null })
                      }
                      onCollet={(each, colletGuid) => pick(each.guid, { colletGuid })}
                      onSave={saveAssembly}
                    />
                  )}
                </div>
              </Card>
            </Panels.Panel>
          </Panels.Group>
        </Panels.Panel>

        <Panels.Separator className={separator} />

        {/* The assembly, drawn large — the tool alone fills the panel — with
            the tool's own numbers listed under it. */}
        <Panels.Panel className="min-h-0 overflow-hidden" minSize={280}>
          {tool ? (
            <div className="flex size-full min-h-0 flex-col gap-1">
              <div className="min-h-0 flex-1">
                <DrawingCard
                  tool={tool}
                  unit={unit}
                  selection={assemblySelection}
                  onChange={onSelection}
                  curve={curve}
                  margins={margins}
                  onMargins={setMargins}
                />
              </div>
              <Card className="shrink-0 overflow-auto">
                <ToolSheet tool={tool} unit={unit} compact />
              </Card>
            </div>
          ) : (
            <Card className="grid size-full place-items-center p-6 text-center text-sm text-zinc-400">
              Click a feature on the part; the best assembly for it is drawn here.
            </Card>
          )}
        </Panels.Panel>
      </Panels.Group>
    </main>
  )
}

const Analysing = ({ partId, jobId }: { partId: string; jobId: string }) => {
  const state = useAnalysisEvents(partId, jobId)

  if (state.status === 'ready') {
    return <Inspecting report={state.report} jobId={jobId} />
  }
  if (state.status === 'failed') {
    return <Failed message={state.message} />
  }
  return (
    <Shell>
      <div className="p-6">
        <Card className="max-w-md p-6">
          <p role="status" className="text-sm text-zinc-200">
            {state.message}
          </p>
          {state.progress === null ? null : (
            <p className="mt-2 font-mono text-xs text-zinc-500">
              {Math.round(state.progress * 100)}%
            </p>
          )}
        </Card>
      </div>
    </Shell>
  )
}

const Part = () => {
  const { partId } = useParams()
  const [search] = useSearchParams()
  const jobId = search.get('job')

  if (!partId || !jobId) {
    return <Failed message="No analysis job was supplied for this part." />
  }

  // Already loaded in this tab: show it rather than re-running the analysis
  // stream, which is what makes leaving for the catalog and coming back free.
  const loaded = recallPart(partId, jobId)
  if (loaded) {
    return <Inspecting report={loaded.report} jobId={jobId} />
  }

  return <Analysing partId={partId} jobId={jobId} />
}

export default Part
