import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Badge, Card, Panels } from '@toolpath/ui'
import {
  colletsFor,
  colletsForShank,
  toolCollisions,
  type CatalogTool,
  type Margins,
} from '@toolpath/catalog-data'
import { useAnalysisEvents } from '@toolpath/part-client'
import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { heldRegions } from '@toolpath/part-contracts/selection'
import { asNumber, asRecord } from '@toolpath/part-contracts/datasheet'
import { partTop } from '@toolpath/part-contracts/measurements'
import { directionColor, directionIndexOf } from '@toolpath/viewer'
import { classNames } from '@toolpath/domain/class-names'
import { formatLength } from '@toolpath/domain/units'
import { AppHeader } from 'components/app-header'
import { FeatureDetails } from 'components/feature-details'
import { FilterRail } from 'components/filter-rail'
import { ToolDetails } from 'components/tool-details'
import { TapTable } from 'components/tap-table'
import {
  addChoice,
  choicesFor,
  clearChoice,
  chosenFor,
  removeChoice,
  useSetupSheet,
} from 'shared/setup-sheet'
import { PartViewer } from 'components/part-viewer'
import { SelectionPanel } from 'components/selection-panel'
import { featureRow } from 'shared/feature-rows'
import {
  TOOL_COLUMNS,
  ToolTable,
  shownColumns,
  sortedBy,
  type Holding,
  type Sort,
} from 'components/tool-table'
import { ColumnPicker } from 'components/column-filter'
import { FACET_AXES } from 'components/filter-panel'
import { orderedCodes } from 'shared/column-order'
import { keptFirst } from 'shared/tool-order'
import {
  allTools as catalogTools,
  collets as allCollets,
  facets,
  holders as allHolders,
} from 'shared/catalog'
import { CLAMPING_KNOB, withClampingLength, type ClampingRule } from 'shared/clamping-length'
import {
  EMPTY_QUERY,
  countBy,
  countsByAxis,
  filterTools,
  queryFromSearch,
  searchWithQuery,
} from 'shared/filter'
import { useSavedFilters } from 'shared/saved-filters'
import { applySuggestions, suggestionsFor } from 'shared/suggest-filters'
import {
  DERIVED_AXES,
  HOLDING_AXES,
  colletSeries,
  holdableTools,
  splitHolding,
  tapers,
} from 'shared/holding'
import { sectionOf } from 'shared/section-of'
import { holdable, holderOptions, thresholdsFrom, type HolderOption } from 'shared/holder-choice'
import { closestMisses, type Format } from 'shared/judge'
import { cautionedTypes, marksFor, testedCodes } from 'shared/tool-marks'
import { knobValue, knobsWith } from 'shared/rules'
import { FloorAllowance } from 'components/floor-allowance'
import { DrillDeviation } from 'components/drill-deviation'
import { ClampingLength } from 'components/clamping-length'
import { OrderDialog } from 'components/order-dialog'
import { KeptCard } from 'components/kept-card'
import { closeCandidates, fittingTools, tightestRule } from 'shared/tool-fit'
import { useUnit } from 'shared/use-unit'
import { usePartMaterial, usePreferences } from 'shared/use-preferences'
import { recallPart, rememberPart } from 'shared/part-session'
import { IDLE, groupOf as holeGroupOf, interactionFor } from 'shared/part-interaction'
import { arrowsFor, byLargest, keptFeatures, partHighlight } from 'shared/part-selection'
import { holeAt, holeDepthOf, makersFor, shortfallOf } from 'shared/hole-mode'
import { hasSharpCorner } from 'shared/feature-defaults'
import { paneOf, threadPanes } from 'shared/thread-panes'
import { drillFor, type HoleMode, type ThreadSpec } from 'shared/threads'

/** How one hole is made, and for what thread: hole mode's answer per feature. */
interface HoleChoice {
  readonly mode: HoleMode
  readonly spec: ThreadSpec | null
}

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
      <AppHeader unit={unit} onUnit={setUnit} toolCount={catalogTools.length} />
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
  const navigate = useNavigate()
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
  /** The column the list is read in, and which way. Null is the sheet's own order. */
  const [sort, setSort] = useState<Sort | null>(null)
  /**
   * The tool being added to the order list, while the questions that
   * finish an assembly are being asked. Null when nothing is being added.
   */
  /**
   * The tool whose holder is being chosen, where the box sits, and **which
   * feature it is for** — a pencil on a card edits that card's feature, which
   * is not always the one being read (Paul, 2026-08-31).
   */
  const [adding, setAdding] = useState<{
    tool: CatalogTool
    at: DOMRect
    featureTag?: string
  } | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlyArray<string>>(
    TOOL_COLUMNS.filter((column) => !column.default).map((column) => column.code),
  )
  /**
   * The tip angle column, on by default **once drills are on the list**.
   *
   * It is the number a drill is chosen on, and dead weight for everything
   * else, so the list turns it on when a drill appears rather than asking
   * somebody to go and find it (Paul, 2026-08-31). Turned off by hand it
   * stays off: `touchedColumns` is what somebody has decided for themselves.
   */
  const touchedColumns = useRef(new Set<string>())
  /** The order the columns are drawn in, dragged in the column picker. */
  const [columnOrder, setColumnOrder] = useState<ReadonlyArray<string>>(() =>
    TOOL_COLUMNS.map((column) => column.code),
  )
  /** Narrowing the list by catalog number, as typed into the first column. */
  const [numberSearch, setNumberSearch] = useState('')

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
   * One arrow per way up the clicked face can be read from.
   *
   * Not the reading's own direction and not a scope: the *set* the face
   * offers, which is what makes pressing one of them a way to say which
   * reading you meant (Paul, 2026-08-31). With nothing picked the set is
   * empty and the part carries no arrows at all.
   */
  /** The kept readings themselves, for everything that asks what was selected. */
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
      // What this catalog reads off a tool rather than what a vendor states.
      ...DERIVED_AXES,
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
  /**
   * How much radius a floor the model draws sharp will take.
   *
   * The sheet's number until somebody raises it on the rail: it is the knob
   * the bull-nose rule reads, so raising it stops the caution rather than
   * hiding or showing any tool (Paul, 2026-08-31).
   */
  const sheetFloorRadius = knobValue('finishing radius limit') ?? 0
  const [floorRadius, setFloorRadius] = useState(sheetFloorRadius)
  /**
   * How far off the hole a drill may be — the sheet's two drill knobs, asked
   * as the one number a shop thinks in (Paul, 2026-08-31).
   */
  const sheetDrillDeviation = {
    over: knobValue('drill oversize') ?? 0,
    under: knobValue('drill undersize') ?? 0,
  }
  const [drillDeviation, setDrillDeviation] = useState(sheetDrillDeviation)
  /**
   * How far a tool is taken to stand out of its holder, in diameters.
   *
   * Applied to the catalog here, once, so nothing downstream has to know the
   * rule exists — the judge, the columns and the filters all read a tool whose
   * `LBH` is already this shop's (Paul, 2026-09-01).
   */
  const sheetClamping = knobValue(CLAMPING_KNOB) ?? 3
  const [clamping, setClamping] = useState<ClampingRule>({
    vendorSpec: true,
    perDiameter: sheetClamping,
  })
  const allTools = useMemo(() => withClampingLength(catalogTools, clamping), [clamping])
  /** The sheet's knobs with what the page sets, so the judge reads the same numbers. */
  const knobs = useMemo(
    () =>
      knobsWith({
        'radial holder clearance': margins.radial,
        'axial holder clearance': margins.axial,
        'finishing radius limit': floorRadius,
        'drill oversize': drillDeviation.over,
        'drill undersize': drillDeviation.under,
      }),
    [margins, floorRadius, drillDeviation.over, drillDeviation.under],
  )

  /**
   * Where an answer sits awkwardly with the feature.
   *
   * A bull nose asked for on a floor the model draws sharp is not wrong — the
   * sheet cautions and still lists it — but the question that admitted it
   * should say so (Paul, 2026-08-31).
   */
  /**
   * The hole the reading is, where it is one: what a drill's deviation is
   * measured from, and the reason the deviation control is on the rail at all.
   */
  const holeDiameter = useMemo(() => {
    if (reading === null) {
      return null
    }
    return asNumber(asRecord(reading.datasheet?.facts)?.diameter)
  }, [reading])

  /**
   * Hole mode: which thread each hole is for, as somebody said or the
   * application guessed.
   *
   * Kept per feature and not on the setup sheet: the sheet is what was chosen
   * to *buy*, and a thread is a reading of the part. It is seeded from the
   * hole's own diameter the first time a hole is read, so the question is
   * already answered when it is asked (Paul, 2026-08-31).
   */
  const [threads, setThreads] = useState<Readonly<Record<string, HoleChoice>>>({})
  const holeChoice: HoleChoice = (focused === null ? null : threads[focused]) ?? {
    mode: 'plain',
    spec: null,
  }
  const threadSpec = holeChoice.spec

  /**
   * A filter a column header asked for, until the rail has opened it.
   *
   * The rail's bubbles own their own open state; this is the ask, not the
   * state — cleared as soon as it is answered, so asking twice asks twice
   * (Paul, 2026-09-01).
   */
  const [askedFilter, setAskedFilter] = useState<string | null>(null)
  /**
   * The hole the part is zoomed to, and how far through each group's holes the
   * zoom has walked.
   *
   * The viewer frames one feature and frames it **when the tag changes**, so a
   * group of eight is walked rather than framed at once: press again, see the
   * next one (Paul, 2026-09-01).
   */

  /**
   * What the part lights up: **whole features**, not the face that was clicked.
   *
   * The clicked face is painted separately, as the thing a second click walks
   * from. What somebody selected is a feature, so the feature is what wears the
   * colour — every one on the list, and the one being read among them.
   */
  const highlighted = useMemo(() => partHighlight({ kept, focused, group: null }), [kept, focused])

  const arrows = useMemo(() => {
    // Named, so the answer is given: one arrow, the one it is cut from. Still
    // a guess, so the question stands: every way up the face can be read from
    // (Paul, 2026-08-31).
    const named =
      interaction.chose && focused !== null
        ? (candidates.find((each) => each.featureTag === focused) ?? null)
        : null
    const shown =
      named === null ? candidates.map((feature) => directionOf(feature)) : [directionOf(named)]
    return arrowsFor({
      candidateDirections: [...new Set(shown.flatMap((at) => (at === null || at < 0 ? [] : [at])))],
    })
  }, [candidates, directionOf, interaction.chose, focused])
  /**
   * How far under the top of the part the reading's bottom sits.
   *
   * The drills get this through the rules sheet; the taps are asked directly,
   * because the sheet's hole rules would refuse every tap on diameter before
   * reading anything about reach (Paul, 2026-08-31).
   */
  const readingRows = useMemo(() => {
    if (reading === null) {
      return { below: null }
    }
    const top = partTop(report.features, reading)
    const bottom = asNumber(reading.datasheet?.zMin)
    return { below: top === null || bottom === null ? null : top - bottom }
  }, [reading, report.features])

  /** The radius the model draws in the floor, where it draws one. */
  const floorFillet = useMemo(() => {
    if (reading === null) {
      return null
    }
    return asNumber(asRecord(reading.datasheet?.facts)?.filletRadius)
  }, [reading])

  /** The cone at the bottom of it, where it has one: what a drill point is cautioned against. */
  const tipAngle = useMemo(() => {
    if (reading === null) {
      return null
    }
    return asNumber(asRecord(reading.datasheet?.facts)?.fullConeDeg)
  }, [reading])

  /**
   * The tool forms the sheet cautions about for this feature.
   *
   * **Read in the list, not in the picker** (Paul, 2026-09-01: "we don't need
   * the colouring for bull nose here… they'll see the deviation in the tool
   * list"). It marks the corner-radius tick on a row; the type picker shows
   * every form the same.
   */
  const cautionedForms = useMemo(
    () => (reading === null ? [] : (cautionedTypes(reading, report.features)?.values ?? [])),
    [reading, report.features],
  )
  /**
   * The bore the drills are for: the thread's own tap drill where the hole is
   * threaded, and the hole as drawn where it is not.
   *
   * The same number the list is judged against, so the deviation a row shows
   * is measured from what refused it (Paul, 2026-09-01).
   */
  const drilledAt = useMemo(() => {
    const bore = threadSpec === null ? null : drillFor(threadSpec, holeChoice.mode)
    return bore ?? holeDiameter
  }, [threadSpec, holeChoice.mode, holeDiameter])

  /**
   * What the list is judged against.
   *
   * A threaded hole is drilled at the **tap drill**, and the model may be
   * drawn at the minor or the nominal size, so the drill half of hole mode is
   * judged against the hole the shop will actually make rather than the one
   * the model shows (Paul, 2026-08-31).
   */
  const judged = useMemo(() => {
    const bore = threadSpec === null ? null : drillFor(threadSpec, holeChoice.mode)
    return bore === null
      ? selectedFeatures
      : selectedFeatures.map((each) => (each.featureTag === focused ? holeAt(each, bore) : each))
  }, [selectedFeatures, threadSpec, holeChoice.mode, focused])
  const { fitting, excluded } = useMemo(
    () => fittingTools(judged, report.features, allTools, format, knobs),
    [judged, report.features, allTools, format, knobs],
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

  /** What makes the thread: taps for either tapping mode, mills for milling. */
  /** What the taps are measured against, so the table can say what fell short. */
  const threadReach = useMemo(() => {
    const depth = reading === null ? null : holeDepthOf(reading)
    if (depth === null) {
      return null
    }
    return {
      depth,
      below: readingRows.below ?? depth,
      ...(curve === null
        ? {}
        : { clears: (each: CatalogTool) => toolCollisions(each, curve, margins).length === 0 }),
    }
  }, [reading, readingRows.below, curve, margins])

  const makers = useMemo(() => {
    if (threadSpec === null) {
      return { made: [], short: false, unheld: false }
    }
    /**
     * The same sweep a drill gets: a tap in a hole at the bottom of an open
     * pocket has fresh air beside its shank, which the curve knows and a
     * length below the holder does not (Paul, 2026-08-31).
     */
    const made = makersFor(threadSpec, holeChoice.mode, allTools, threadReach)
    /**
     * **And the same holder question.** Reaching is about the tool's own body;
     * whether anything in the crib can *hold* it that far out — gripping the
     * shank, clearing the part at the stickout it needs, keeping enough of the
     * tool in the collet — is the stage every drill goes through and no tap
     * did (Paul, 2026-08-31: "at a reasonable stickout?"). Where none can be
     * held the list still shows them, and says so.
     */
    const held = made.made.filter((each) =>
      holdable(each, allHolders, allCollets, holderFilters, curve, margins, thresholds),
    )
    return held.length > 0 || made.made.length === 0
      ? { ...made, unheld: false }
      : { ...made, unheld: true }
  }, [
    threadSpec,
    holeChoice.mode,
    threadReach,
    allTools,
    holderFilters,
    curve,
    margins,
    thresholds,
  ])

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
  /**
   * The tools the **rules** admit that nothing in the crib can hold.
   *
   * They were dropped in silence, so a drill that is exactly the right size
   * and simply cannot be reached that deep looked like a drill that does not
   * exist (Paul, 2026-08-31: "I need to see why the heights don't work"). They
   * stand in when nothing fits, and the stickout column says what they need
   * against what the crib gives.
   */
  const outOfReach = useMemo(() => {
    if (held.length > 0) {
      return []
    }
    const heldGuids = new Set(held.map((verdict) => verdict.tool.guid))
    return narrowed.filter((verdict) => !heldGuids.has(verdict.tool.guid)).map((each) => each.tool)
  }, [narrowed, held])
  /**
   * With nothing selected there is no feature to judge a tool against, so the
   * panel lists **the catalog itself**, narrowed by the filters — which is
   * what its title has always said. It used to say it over a page of empty
   * space and a sentence (Paul, 2026-08-30).
   */
  const catalogList = useMemo(() => {
    const { tools: toolQuery, holding } = splitHolding(query)
    return holdableTools(filterTools(allTools, toolQuery), holding)
  }, [query, allTools])
  /**
   * Nothing fits, so the nearest misses stand in.
   *
   * Two holes of the same size and thread, one listing drills and the other
   * listing nothing, is a true answer told uselessly: the second is deeper
   * below the top of the part, so every drill that makes the first runs out
   * of reach on it (Paul, 2026-08-31). A list that says *which* tools are
   * closest, and by how much, is worth more than an empty one — the marks
   * already paint the failing column red and say by how much it missed.
   */
  const closest = useMemo(() => {
    if (reading === null || tools.length > 0) {
      return []
    }
    const near = [
      // What the rules allow but no holder reaches comes first: it is the
      // nearest miss there is, and the one somebody can do something about.
      ...outOfReach,
      ...closestMisses(closeCandidates(excluded, query), 8).map((verdict) => verdict.tool),
    ]
    /**
     * **A tapped hole is drilled.** The nearest misses are drawn from what the
     * rules removed, and a mill that could interpolate the bore is a near miss
     * by that measure — but not an answer to "what drills this thread"; the
     * hole has to be at size before the tap goes anywhere near it (Paul,
     * 2026-08-31: "when a hole is threaded, we DON'T show endmills").
     */
    return holeChoice.mode === 'plain' ? near : near.filter((each) => each.form === 'drill')
  }, [reading, tools.length, excluded, query, holeChoice.mode, outOfReach])
  /**
   * **A tapped hole is drilled, whatever the filters say.**
   *
   * Choosing a threading mode writes `form: drill` into the filters, which is
   * where it belongs — but a filter is somebody's to clear, and clearing it
   * put end mills back under a heading that says "Drills for the #4-40 UNC
   * hole". The mode is not a filter: it is what the hole *is*, so the list
   * enforces it too (Paul, 2026-08-31, twice).
   */
  const drillsOnly = holeChoice.mode !== 'plain'
  /**
   * What each axis would leave, counted against every other filter.
   *
   * This is what lets the panel narrow itself — a vendor chosen takes the
   * other vendors' families off the family axis — and it is measured without
   * the axis's own term, so choosing one vendor does not hide the rest
   * (Paul, 2026-09-01).
   */
  const axisCounts = useMemo(
    () => countsByAxis(reading === null ? allTools : tools, query, FACET_AXES),
    [reading, allTools, tools, query],
  )

  const listed = useMemo(() => {
    const shownTools = reading === null ? catalogList : tools.length > 0 ? tools : closest
    return drillsOnly ? shownTools.filter((each) => each.form === 'drill') : shownTools
  }, [reading, catalogList, tools, closest, drillsOnly])

  /**
   * A drill on the list brings its own column with it, and takes it away
   * again when the drills go — it is the number a drill is chosen on and dead
   * weight for everything else (Paul, 2026-08-31). Toggled by hand it stays
   * where it was put; `touchedColumns` is what somebody decided themselves.
   */
  const hasDrills = useMemo(() => listed.some((each) => each.form === 'drill'), [listed])
  useEffect(() => {
    if (touchedColumns.current.has('SIG')) {
      return
    }
    setHiddenColumns((current) =>
      hasDrills
        ? current.filter((code) => code !== 'SIG')
        : current.includes('SIG')
          ? current
          : [...current, 'SIG'],
    )
  }, [hasDrills])
  /**
   * The list narrowed by what was typed into the catalog number column.
   *
   * Substring, case-insensitive, on the number and the brand together — a
   * shop typing "TDMX" means the family and typing "widia" means the maker,
   * and neither is worth a second box.
   */
  const searched = useMemo(() => {
    const wanted = numberSearch.trim().toLowerCase()
    return wanted === ''
      ? listed
      : listed.filter((each) =>
          `${each.catalogNumber} ${each.brand}`.toLowerCase().includes(wanted),
        )
  }, [listed, numberSearch])

  /**
   * What the rules said about each tool, column by column — a tick on what
   * they read and passed, the field that failed in red, three words for why.
   */
  const tested = useMemo(
    () => (reading ? testedCodes(reading, report.features) : new Set<string>()),
    [reading, report.features],
  )
  const byGuid = useMemo(
    () => new Map([...fitting, ...excluded].map((verdict) => [verdict.tool.guid, verdict])),
    [fitting, excluded],
  )
  const marksOf = useCallback(
    (each: CatalogTool) => {
      const verdict = byGuid.get(each.guid)
      return verdict
        ? marksFor(verdict, tested, {
            format,
            cautionedForms,
            holeDiameter: drilledAt,
            measuredFrom: threadSpec === null ? 'the hole' : 'the specified tap drill',
            tipAngle,
            floorFillet,
          })
        : {}
    },
    [byGuid, tested, format, cautionedForms, drilledAt, threadSpec, tipAngle, floorFillet],
  )

  /**
   * The order list, which is the setup sheet read the other way round:
   * a feature's choice is a line on it. Nothing new is stored — a line is
   * guids, resolved through the catalog on every render (Justin Gray's rule,
   * kept since 2026-08-10).
   */
  const bom = useMemo(
    () =>
      new Set(
        Object.values(sheet.choices)
          .flat()
          .map((choice) => choice.toolGuid),
      ),
    [sheet],
  )

  /**
   * The order list as cards: **one per feature**.
   *
   * The bill groups by assembly because that is what gets bought; the part
   * groups by feature because that is what is being looked at (Paul,
   * 2026-08-31). A threaded hole is one card carrying its drill and its tap.
   *
   * A guid that no longer resolves is simply not on a card (Justin Gray's
   * rule: references live).
   */
  const keptCards = useMemo(
    () =>
      Object.entries(sheet.choices).flatMap(([featureTag, kept]) => {
        const tools = kept.flatMap((choice) => {
          const found = allTools.find((one) => one.guid === choice.toolGuid)
          return found ? [{ choice, tool: found }] : []
        })
        if (tools.length === 0) {
          return []
        }
        const feature = report.features.find((one) => one.featureTag === featureTag)
        const named = feature
          ? featureRow({ feature, features: report.features, regions: report.regions, unit }).type
          : 'the part'
        const holders = new Set(
          tools.map((each) => {
            const holder = allHolders.find((one) => one.guid === each.choice.holderGuid)
            const collet = allCollets.find((one) => one.guid === each.choice.colletGuid)
            return holder === undefined
              ? ''
              : `${holder.catalogNumber}${collet ? ` · ${collet.catalogNumber}` : ''}`
          }),
        )
        const mode = threads[featureTag]?.mode ?? 'plain'
        return [
          {
            featureTag,
            /** "Threaded Blind Hole": how it is made is part of what it is. */
            label: mode === 'plain' ? named : `Threaded ${named}`,
            tools: tools.map((each) => each.tool),
            holding: holders.size === 1 ? [...holders][0] || null : null,
          },
        ]
      }),
    [sheet, report.features, report.regions, unit, threads, allTools],
  )

  /** Which feature the choice is for: the one being read, or the part as a whole. */
  const choiceKey = focused ?? '*'

  /**
   * What is already kept for the feature being read.
   *
   * Reading a feature from its card is returning to a decision, so the tools
   * that decision holds go to the top of the list (Paul, 2026-08-31).
   */
  const keptHere = useMemo(
    () => new Set(choicesFor(sheet, choiceKey).map((choice) => choice.toolGuid)),
    [sheet, choiceKey],
  )

  /**
   * The rows the table draws, in their order.
   *
   * Memoised because both steps copy the whole list: sorting by a column and
   * pulling the kept rows to the top each rebuild an array as long as the
   * filtered catalog, and drawn inline they did it on every render — every
   * keystroke in the search box, every hover.
   */
  const shownRows = useMemo(
    () => keptFirst(sortedBy(searched, sort), keptHere),
    [searched, sort, keptHere],
  )

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

  /**
   * The holder and collet for a tool: the columns, the stickout column, and
   * the panel beside the part all ask the same question.
   *
   * Grading every holder in the crib against a tool is real work, so it is
   * done **per tool that asks**, cached for as long as the crib and the
   * clearances hold still. Nothing is graded until something calls for it, so
   * the panel's one tool costs one tool, and a list of two hundred pays only
   * for the columns that are actually ticked.
   */
  const optionsFor = useMemo(() => {
    const cache = new Map<string, Array<HolderOption>>()
    return (each: CatalogTool): Array<HolderOption> => {
      const had = cache.get(each.guid)
      if (had) {
        return had
      }
      const made = holderOptions(
        each,
        allHolders,
        allCollets,
        holderFilters,
        curve,
        margins,
        thresholds,
      )
      cache.set(each.guid, made)
      return made
    }
  }, [holderFilters, curve, margins, thresholds])
  const holding = useMemo<Holding>(() => {
    return {
      /**
       * **A collet chosen first puts its own chucks at the top** (Paul,
       * 2026-09-01: "then all holders are shown but we show the ones that work
       * with that collet at the top"). Every holder is still offered — the
       * collet is a preference, not a filter — and the ones of its series lead.
       */
      holdersFor: (each) => {
        const series = allCollets.find(
          (collet) => collet.guid === picked[each.guid]?.colletGuid,
        )?.series
        const options = optionsFor(each)
        const ordered =
          series === undefined
            ? options
            : [
                ...options.filter((option) => option.holder.colletSeries === series),
                ...options.filter((option) => option.holder.colletSeries !== series),
              ]
        return ordered.map((option) => ({
          guid: option.holder.guid,
          label:
            option.holder.colletSeries === series
              ? `${option.holder.catalogNumber} · takes this collet`
              : option.holder.catalogNumber,
          holder: option.holder,
          trouble:
            option.clears === false
              ? 'collision with geometry'
              : option.band === 'bad'
                ? 'too little grip'
                : null,
        }))
      },
      /**
       * With a holder: the collets of its series that close on the shank.
       * **Without one: every collet that closes on the shank**, whatever series
       * it belongs to, each saying which series that is — the dropdown used to
       * be empty until a holder was picked, which read as broken (Paul,
       * 2026-09-01).
       */
      colletsFor: (each, holderGuid) => {
        const holder = optionsFor(each).find((option) => option.holder.guid === holderGuid)?.holder
        if (holder === undefined) {
          return colletsForShank(each, allCollets).map((collet) => ({
            guid: collet.guid,
            label: `${collet.catalogNumber} · ${collet.series}`,
          }))
        }
        return colletsFor(each, holder, allCollets).map((collet) => ({
          guid: collet.guid,
          label: collet.catalogNumber,
        }))
      },
      chosen: (each) => ({
        holderGuid: picked[each.guid]?.holderGuid ?? null,
        colletGuid: picked[each.guid]?.colletGuid ?? null,
      }),
      /** What the chosen stack stands out at: the person's, or the option's own. */
      stickoutFor: (each) => {
        const holderGuid = picked[each.guid]?.holderGuid ?? null
        return (
          picked[each.guid]?.stickout ??
          optionsFor(each).find((option) => option.holder.guid === holderGuid)?.stickout ??
          null
        )
      },
      requiredStickout: (each) => {
        const holderGuid = picked[each.guid]?.holderGuid ?? null
        if (holderGuid === null) {
          return null
        }
        return (
          optionsFor(each).find((option) => option.holder.guid === holderGuid)?.required ?? null
        )
      },
      /**
       * Why nothing in the crib can hold it, in one line.
       *
       * The holder stage drops a tool for one of two reasons and said neither:
       * every stack fouls the part at the stickout this feature needs, or the
       * tool is too short to stand out that far and keep hold. Both are about
       * a length, and a length is what somebody can go and change.
       */
      reachNote: (each) => {
        const options = optionsFor(each)
        /**
         * **Never "no holder grips this shank"** (Paul, 2026-09-01: "means
         * nothing, never show it"). It said the crib holds nothing that takes
         * this shank, which is a fact about the crib rather than about the
         * length the cell is for — and it stood in that cell against every
         * tool of a size nobody has a collet for, which is most of a
         * seventeen-thousand-tool catalog.
         */
        if (options.length === 0) {
          return null
        }
        if (options.some((option) => option.grade !== 'bad')) {
          return null
        }
        /**
         * **One stack's story, not two halves of two.**
         *
         * Taking the least required stickout from one holder and the longest
         * grip from another read as "needs 53 mm out; holds at 55" — which
         * says it fits (Paul, 2026-08-31). The stack that comes closest is the
         * one worth quoting, and closest means the smallest gap between what
         * it needs and what it can hold.
         */
        const gaps = options.flatMap((option) => {
          const needs = option.required
          const most = option.range?.max ?? null
          return needs === null || most === null || needs <= most
            ? []
            : [{ needs, most, by: needs - most }]
        })
        const closestStack = gaps.sort((a, b) => a.by - b.by)[0]
        return closestStack === undefined
          ? 'no holder clears the part here'
          : `needs ${format(closestStack.needs, 'mm')} out, holds ${format(closestStack.most, 'mm')}`
      },
      onChoose: (each, choice) =>
        setPicked((current) => ({
          ...current,
          [each.guid]: { ...current[each.guid], ...choice },
        })),
    }
  }, [optionsFor, picked])

  /**
   * The list: the ten best, each as the assembly the rules recommend — and,
   * when fewer than ten fit, the nearest misses after them, marked
   * incompatible and saying by how much.
   */
  /**
   * The tool being read, and the holders for it.
   *
   * This was a ten-row table with a superlative badge on each, computed on
   * every render — and nothing has drawn that table since the list took its
   * place. What survives is the one thing the page still asks: which tool is
   * being read, and what can hold it (Paul, 2026-08-31, on a page running
   * slowly: ten `holderOptions` sweeps per render, thrown away).
   */
  /**
   * The row being drawn: the one clicked, or the first — the drawing is never
   * empty once a feature is read. From the full table, any tool at all.
   */
  const tool = useMemo(
    () =>
      allTools.find((each) => each.guid === chosenTool) ??
      (chosenTool === null ? (held[0]?.tool ?? null) : null),
    [chosenTool, held, allTools],
  )
  /**
   * Which half of a threaded feature the panel is reading: the drill or the
   * tap.
   *
   * **Two tools, so two tabs** (Paul, 2026-09-01: "it should open drill and tap
   * tabs in the right hand panel when working with a threaded feature"). A
   * threaded hole is a drill *and* a tap, and the panel is where either is
   * assembled and kept — so which one is on show is a state of the panel, set
   * by the list a tool was clicked in and switchable by hand.
   */
  const [pane, setPane] = useState<'drill' | 'tap'>('drill')
  const paneTools = useMemo(
    () => (threadSpec === null ? null : threadPanes(listed, makers.made, chosenTool)),
    [threadSpec, makers.made, listed, chosenTool],
  )

  const pick = useCallback(
    (
      guid: string,
      change: { holderGuid?: string | null; colletGuid?: string | null; stickout?: number | null },
    ) => setPicked((current) => ({ ...current, [guid]: { ...current[guid], ...change } })),
    [],
  )

  /** Save writes the drawn assembly to the sheet for this feature, and opens the strip. */
  const saveAssembly = useCallback(
    (saved: CatalogTool) => {
      const mine = picked[saved.guid]
      const options = holderOptions(
        saved,
        allHolders,
        allCollets,
        holderFilters,
        curve,
        margins,
        thresholds,
      )
      const option =
        options.find((each) => each.holder.guid === mine?.holderGuid) ??
        options.find((each) => each.recommended) ??
        options[0] ??
        null
      const stickout = mine?.stickout ?? option?.stickout ?? null
      commit(
        addChoice(sheet, choiceKey, {
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
    [picked, holderFilters, curve, margins, thresholds, commit, sheet, choiceKey],
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

      {/*
        Paul's layout (2026-08-31): the part takes the whole left, with the
        questions and the feature being read as cards over its top-left
        corner; the list runs under it; the drawing holds the right edge, full
        height. The filters had a column of their own beside the viewer, so
        the part paid for questions nobody was asking.
      */}
      {adding ? (
        <OrderDialog
          tool={adding.tool}
          at={adding.at}
          options={holderOptions(
            adding.tool,
            allHolders,
            allCollets,
            holderFilters,
            curve,
            margins,
            thresholds,
          )}
          feature={reading ? listTitle.replace(/^Cuts the /, '') : null}
          unit={unit}
          // What the row already had chosen in its Holder and Collet columns,
          // so the box opens on it rather than asking twice.
          // What the row had chosen, or what the bill already holds for it —
          // the pencil reopens the box on the decision it is editing.
          holderGuid={
            picked[adding.tool.guid]?.holderGuid ??
            chosenFor(sheet, adding.featureTag ?? choiceKey, adding.tool.guid)?.holderGuid ??
            null
          }
          colletGuid={
            picked[adding.tool.guid]?.colletGuid ??
            chosenFor(sheet, adding.featureTag ?? choiceKey, adding.tool.guid)?.colletGuid ??
            null
          }
          onCancel={() => setAdding(null)}
          onConfirm={({ holderGuid, colletGuid }) => {
            commit(
              addChoice(sheet, adding.featureTag ?? choiceKey, {
                toolGuid: adding.tool.guid,
                ...(holderGuid === null ? {} : { holderGuid }),
                ...(colletGuid === null ? {} : { colletGuid }),
              }),
            )
            setAdding(null)
            setChosenTool(adding.tool.guid)
          }}
        />
      ) : null}

      <Panels.Group className="min-h-0 flex-1 gap-1 p-3" orientation="horizontal">
        <Panels.Panel className="min-h-0 overflow-hidden" defaultSize="72%" minSize={520}>
          <Panels.Group className="size-full min-h-0 gap-1" orientation="vertical">
            <Panels.Panel className="min-h-0 overflow-hidden" defaultSize="55%" minSize={260}>
              <PartViewer
                report={report}
                jobId={jobId}
                selected={new Set(highlighted)}
                heldRegions={heldRegions(selection)}
                arrows={arrows}
                onPickDirection={(direction) => dispatch({ type: 'arm', direction })}
                directionColor={
                  // The reading wears the colour of the way up it is cut from,
                  // so the arrow and the feature read as one claim.
                  (activeDirection ?? focusedDirection ?? -1) >= 0
                    ? directionColor((activeDirection ?? focusedDirection) as number)
                    : null
                }
                aside={keptCards.map((card) => (
                  <KeptCard
                    key={card.featureTag}
                    feature={card.label}
                    tools={card.tools}
                    holding={card.holding}
                    reading={focused === card.featureTag}
                    onRead={() => dispatch({ type: 'read', featureTag: card.featureTag })}
                    onOpenList={() =>
                      navigate(
                        `/parts/${encodeURIComponent(report.partId)}/order-list?job=${encodeURIComponent(jobId)}`,
                      )
                    }
                    onEdit={(each, at) =>
                      setAdding({ tool: each, at, featureTag: card.featureTag })
                    }
                    // The card stands for the feature, so it takes everything
                    // kept for it off together.
                    onRemove={() => commit(clearChoice(sheet, card.featureTag))}
                  />
                ))}
                tooled={keptCards.map((card) => card.featureTag)}
                overlay={
                  <>
                    <div className="flex w-fit flex-col gap-1">
                      <FilterRail
                        open={askedFilter}
                        onOpened={() => setAskedFilter(null)}
                        facets={facets}
                        query={query}
                        onQuery={apply}
                        counts={(key) => axisCounts.get(key) ?? countBy(listed, key)}
                        unit={unit}
                        holding={{ tapers, series: colletSeries }}
                        materialGroup={materialGroup}
                        onMaterial={chooseMaterial}
                        saved={saved}
                        onSave={(name) => save(name, query)}
                        onApply={apply}
                        onForget={forget}
                        onClear={() => apply(EMPTY_QUERY)}
                      />
                      <FloorAllowance
                        value={floorRadius}
                        onChange={setFloorRadius}
                        sheetValue={sheetFloorRadius}
                        unit={unit}
                      />
                      <ClampingLength
                        rule={clamping}
                        onChange={setClamping}
                        sheet={sheetClamping}
                      />
                      {/* Only where there is a hole to be off by. */}
                      {holeDiameter === null ? null : (
                        <DrillDeviation
                          over={drillDeviation.over}
                          under={drillDeviation.under}
                          onChange={setDrillDeviation}
                          sheet={sheetDrillDeviation}
                          unit={unit}
                        />
                      )}
                    </div>
                    {/*
                      Outlined while nothing is read, because an empty box
                      says nothing about whose turn it is. The border is the
                      prompt: click the part (Paul, 2026-08-31).
                    */}
                    <Card
                      /*
                       * The same solid ground the filter bubbles wear, and no
                       * coloured outline: the box sits in their column and a
                       * ring made it a different kind of thing (Paul,
                       * 2026-08-31). What says "nothing is read yet" is the
                       * dashed field inside it, which is where the answer goes.
                       */
                      /*
                       * **Never a scrollbar** (Paul, 2026-09-01): the box is
                       * read at a glance, and a panel that hides half of
                       * itself behind a scroll is not. It sizes to what is in
                       * it, which is what keeps the contents worth trimming.
                       */
                      className="filter-off min-h-32 w-80 shrink-0 self-start"
                    >
                      <SelectionPanel
                        feature={reading}
                        features={report.features}
                        regions={report.regions}
                        unit={unit}
                        siblings={focused === null ? 1 : groupOf(focused).length}
                        onInfo={() => setInfo(focused)}
                        candidates={candidates}
                        onRead={(featureTag) => dispatch({ type: 'read', featureTag })}
                        directionOf={(feature) => directionOf(feature)}
                        colourOf={(feature) => {
                          const at = directionOf(feature)
                          return at === null || at < 0
                            ? null
                            : `#${directionColor(at).toString(16).padStart(6, '0')}`
                        }}
                        chose={interaction.chose}
                        {...(holeDiameter === null
                          ? {}
                          : {
                              thread: {
                                holeDiameter,
                                mode: holeChoice.mode,
                                spec: threadSpec,
                                onChange: (choice: HoleChoice) => {
                                  setThreads((current) => ({
                                    ...current,
                                    ...(focused === null ? {} : { [focused]: choice }),
                                  }))
                                  /**
                                   * A threaded hole is drilled, not milled.
                                   *
                                   * Written into the **filters** rather than
                                   * hidden inside the list, because the
                                   * filters are the last word and somebody
                                   * who wants to interpolate one anyway has
                                   * to be able to see what stopped them and
                                   * undo it (Paul, 2026-08-31).
                                   */
                                  applyTerm('form', choice.mode === 'plain' ? [] : ['drill'])
                                },
                              },
                            })}
                      />
                    </Card>
                  </>
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
                onClear={() => dispatch({ type: 'miss' })}
                onPickFace={(pick) => dispatch({ type: 'click', pick })}
              />
            </Panels.Panel>

            <Panels.Separator className={separator} />

            <Panels.Panel className="min-h-0 overflow-hidden" minSize={180}>
              {/* The list leads with assemblies: the ten best tools, each with
                  the holder the rules recommend, changeable in place. The full
                  table is a flip away, and the filters overlay it. */}
              <Card className="relative flex size-full min-h-0 flex-col overflow-hidden">
                {/* The panel measures itself here: `Card` takes no ref. */}
                {/*
                  **Hole mode, taps first** (Paul, 2026-09-01: "when I define a
                  hole as threaded, I should select the tap before the drill —
                  taps should be shown at the top of the list"). The thread is
                  the decision; the drill follows from it, and reading them the
                  other way round asks for the bore before anybody has said what
                  it is for.

                  Two sections rather than one list: they are chosen on
                  different numbers, and a single ranking would compare a
                  diameter that means the thread against one that means the
                  bore (Paul, 2026-08-31).
                */}
                {threadSpec === null ? null : (
                  // A shade lighter than the drills under it, so the two
                  // sections read apart at a glance (Paul, 2026-08-31).
                  <div className="flex min-h-0 shrink grow-0 basis-auto flex-col overflow-hidden border-b border-zinc-800 bg-zinc-900/40">
                    <TapTable
                      makers={makers.made}
                      short={makers.short}
                      unheld={makers.unheld}
                      mode={holeChoice.mode}
                      spec={threadSpec}
                      unit={unit}
                      chosen={tool?.guid ?? null}
                      onChoose={(each) => {
                        setChosenTool(each.guid)
                        setPane(paneOf(each))
                      }}
                      shortfall={(each) => shortfallOf(each, threadReach)}
                      columns={shownColumns(hiddenColumns, columnOrder)}
                    />
                  </div>
                )}
                <div
                  className={classNames(
                    'flex min-h-0 min-w-0 flex-col overflow-hidden',
                    /*
                     * **Each section is as tall as its own rows.** A fixed
                     * three-fifths share held the panel open under two drills
                     * and put the taps half a screen below them (Paul,
                     * 2026-09-01: "we don't need the white space here"). At
                     * `flex: 0 1 auto` both sections size to their content and
                     * only shrink when together they overflow — and shrinking
                     * is weighted by content, so the long list gives up the
                     * space and scrolls while the short one keeps its rows.
                     */
                    threadSpec === null ? 'flex-1' : 'shrink basis-auto grow-0',
                  )}
                >
                  <p
                    data-list-chrome
                    className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-200">
                      {threadSpec === null ? listTitle : `Drills for the ${threadSpec.name} hole`}
                    </span>
                    <Badge variant={listed.length === 0 ? 'danger' : 'secondary'}>
                      {listed.length}
                    </Badge>
                    {reading === null ? (
                      <span className="text-2xs text-zinc-500">
                        click a feature on the part for the ones that cut it
                      </span>
                    ) : null}
                    {/*
                      **A corner no mill can leave** (Paul, 2026-09-01): the
                      model draws it sharp, and every cutter leaves its own
                      radius. Said once, plainly, rather than left for somebody
                      to work out from a list of tools that all miss it.
                    */}
                    {reading !== null && hasSharpCorner(reading) ? (
                      <span className="text-2xs text-amber-300">
                        this feature has a sharp corner, and no milling tool can cut the geometry
                      </span>
                    ) : null}
                    {closest.length > 0 ? (
                      <span className="text-2xs text-amber-300">
                        nothing in the crib fits — the closest are shown, with what stops each
                      </span>
                    ) : null}
                    {excluded.length > 0 && reading !== null ? (
                      <span className="text-2xs text-zinc-500" title={tightest ?? undefined}>
                        {excluded.length} removed by the rules
                        {tightest ? ` — most by ${tightest}` : ''}
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
                      <ColumnPicker
                        columns={orderedCodes(
                          TOOL_COLUMNS.map((column) => column.code),
                          columnOrder,
                        ).flatMap((code) =>
                          TOOL_COLUMNS.filter((column) => column.code === code).map((column) => ({
                            code: column.code,
                            label: column.label,
                          })),
                        )}
                        shown={TOOL_COLUMNS.filter(
                          (column) => !hiddenColumns.includes(column.code),
                        ).map((column) => column.code)}
                        onToggle={(code) => {
                          touchedColumns.current.add(code)
                          setHiddenColumns((current) =>
                            current.includes(code)
                              ? current.filter((each) => each !== code)
                              : [...current, code],
                          )
                        }}
                        onReorder={setColumnOrder}
                      />
                    </span>
                  </p>
                  <div
                    // Each section scrolls in its own share of the panel, the
                    // way the list does when it has the panel to itself.
                    className="min-h-0 flex-1 overflow-auto"
                  >
                    <ToolTable
                      // Kept for this feature, then the sheet's order or
                      // whatever column the list is sorted by.
                      tools={shownRows}
                      // Nothing fits, so every row is a near miss: the list
                      // says so on each of them, not only in its heading.
                      nearest={reading !== null && tools.length === 0 && closest.length > 0}
                      /*
                          The rail asks these questions too, so the column
                          headers hand them over rather than opening a second
                          control for the same filter.
                        */
                      onRailFilter={setAskedFilter}
                      railKeys={{ DC: 'DC', LCF: 'LCF', NOF: 'NOF', form: 'form' }}
                      unit={unit}
                      chosen={tool?.guid ?? null}
                      onChoose={(each) => {
                        setChosenTool(each.guid)
                        setPane(paneOf(each))
                      }}
                      ranges={query.ranges}
                      onRange={applyRange}
                      terms={query.terms}
                      onTerm={applyTerm}
                      hiddenColumns={hiddenColumns}
                      columnOrder={columnOrder}
                      marks={marksOf}
                      sort={sort}
                      onSort={setSort}
                      holding={holding}
                      search={numberSearch}
                      onSearch={setNumberSearch}
                      /*
                       * Only in hole mode, where a tap section is under it.
                       *
                       * **Expanded, the section shows everything and scrolls.**
                       * A panel three rows tall cannot answer "show me the rest"
                       * by drawing four; the press has to hand the section the
                       * whole panel, and the one scrollbar that comes with it is
                       * not the two competing ones that made this rule
                       * (Paul, 2026-08-31).
                       */
                      // **Nothing is kept from the list any more** (Paul,
                      // 2026-09-01): a row is a tool to read, and what gets
                      // ordered is a tool with its holding — which is
                      // decided in the panel, so the button lives there.
                      inBom={(each) => keptHere.has(each.guid)}
                      keptElsewhere={(each) => bom.has(each.guid) && !keptHere.has(each.guid)}
                    />
                  </div>
                </div>
              </Card>
            </Panels.Panel>
          </Panels.Group>
        </Panels.Panel>

        <Panels.Separator className={separator} />

        {/*
          The tool's own numbers. The assembly was drawn here until
          2026-08-31; Paul took the drawing out while the holder half of it is
          being sorted out, and the panel is the tool alone in the meantime.
        */}
        <Panels.Panel className="min-h-0 overflow-hidden" minSize={280}>
          {paneTools ? (
            /*
              **A threaded hole is two tools** (Paul, 2026-09-01: "it should
              open drill and tap tabs in the right hand panel when working with
              a threaded feature"). The drill and the tap are chosen on
              different numbers and kept separately, and the panel is where
              either one is assembled — so it is two tabs rather than whichever
              list was clicked last.
            */
            <Card className="flex size-full min-h-0 flex-col overflow-hidden">
              <div className="flex gap-1 border-b border-zinc-900 px-2 py-1.5">
                {(
                  [
                    ['drill', 'Drill', paneTools.drill],
                    ['tap', 'Tap', paneTools.tap],
                  ] as const
                ).map(([key, label, each]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={pane === key}
                    disabled={each === null}
                    onClick={() => {
                      setPane(key)
                      if (each) {
                        setChosenTool(each.guid)
                      }
                    }}
                    className={classNames(
                      'text-2xs focus-visible:ring-info/60 rounded border px-2 py-0.5 transition focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700',
                      pane === key && each !== null
                        ? 'border-info/60 bg-info/15 text-info'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                    )}
                  >
                    {label}
                    {each === null ? <span className="ml-1 text-zinc-600">none</span> : null}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {(() => {
                  const reading = pane === 'tap' ? paneTools.tap : paneTools.drill
                  return reading === null ? (
                    <p className="p-6 text-center text-sm text-zinc-400">
                      {pane === 'tap'
                        ? 'Nothing in the catalog cuts this thread.'
                        : 'Nothing in the catalog drills this hole.'}
                    </p>
                  ) : (
                    <ToolDetails
                      tool={reading}
                      unit={unit}
                      holding={holding}
                      saved={keptHere.has(reading.guid)}
                      onSave={() => {
                        const held = holding.chosen(reading)
                        commit(
                          addChoice(sheet, choiceKey, {
                            toolGuid: reading.guid,
                            ...(held.holderGuid === null ? {} : { holderGuid: held.holderGuid }),
                            ...(held.colletGuid === null ? {} : { colletGuid: held.colletGuid }),
                          }),
                        )
                      }}
                      onRemove={() => commit(removeChoice(sheet, choiceKey, reading.guid))}
                    />
                  )
                })()}
              </div>
            </Card>
          ) : tool ? (
            <Card className="size-full overflow-auto">
              <ToolDetails
                tool={tool}
                unit={unit}
                holding={holding}
                saved={keptHere.has(tool.guid)}
                /*
                  **No dialog** (Paul, 2026-09-01): the holder and the collet
                  are chosen in this panel, above the button, so asking again
                  in a box is asking a question already answered.
                */
                onSave={() => {
                  const held = holding.chosen(tool)
                  commit(
                    addChoice(sheet, choiceKey, {
                      toolGuid: tool.guid,
                      ...(held.holderGuid === null ? {} : { holderGuid: held.holderGuid }),
                      ...(held.colletGuid === null ? {} : { colletGuid: held.colletGuid }),
                    }),
                  )
                }}
                onRemove={() => commit(removeChoice(sheet, choiceKey, tool.guid))}
              />
            </Card>
          ) : (
            <Card className="grid size-full place-items-center p-6 text-center text-sm text-zinc-400">
              Click a tool in the list to assemble it here.
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

/**
 * Which page this part gets, **decided once and then left alone**.
 *
 * `recallPart` starts answering the moment the part is remembered, so asking
 * it on every render made this component change its mind: the first render
 * returned `Analysing` and every render after it returned `Inspecting`. Two
 * different components in the same position is an unmount, so React threw the
 * page away and built a new one — and with it went every piece of state the
 * page holds. The trigger was the URL, because a chosen feature writes the
 * filters it suggests into it: **click a feature and the click that selected
 * it destroyed the selection**, leaving its filters behind in the query
 * string. That is the stickiness of 2026-08-30 — a first click that appeared
 * to do nothing, arrows back to their opening state, and the last feature's
 * filters standing over a part with nothing selected.
 *
 * Deciding at mount keeps one component for the whole visit. The key sees to
 * the one case where the answer must change: another part, which is another
 * page and should be built new.
 */
const Working = ({ partId, jobId }: { partId: string; jobId: string }) => {
  const [remembered] = useState(() => recallPart(partId, jobId))
  return remembered ? (
    <Inspecting report={remembered.report} jobId={jobId} />
  ) : (
    <Analysing partId={partId} jobId={jobId} />
  )
}

const Part = () => {
  const { partId } = useParams()
  const [search] = useSearchParams()
  const jobId = search.get('job')

  if (!partId || !jobId) {
    return <Failed message="No analysis job was supplied for this part." />
  }

  return <Working key={`${partId}:${jobId}`} partId={partId} jobId={jobId} />
}

export default Part
