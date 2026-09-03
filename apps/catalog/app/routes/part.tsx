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
import { Badge, Button, Card, Panels } from '@toolpath/ui'
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
import { PartUploadOverlay, type ReplacementAnalysis } from 'components/part-upload-overlay'
import { FeatureDetails } from 'components/feature-details'
import { KindIcon } from 'components/feature-icons'
import { CursorClickIcon } from '@phosphor-icons/react'
import { FilterPanel } from 'components/filter-panel'
import { ToolDetails } from 'components/tool-details'
import {
  addChoice,
  choicesFor,
  clearChoice,
  chosenFor,
  removeChoice,
  useSetupSheet,
  type SetupSheet,
} from 'shared/setup-sheet'
import { PartViewer } from 'components/part-viewer'
import { SelectionPanel } from 'components/selection-panel'
import { FeatureListPanel } from 'components/feature-list-panel'
import { GroupEditor } from 'components/group-editor'
import {
  addItem,
  asked,
  itemNamed,
  nextId,
  removeItem,
  replaceItem,
  typeButtons,
  useFeatureList,
  type ListItem,
  type Results,
} from 'shared/feature-list'
import { recommendationRows, type Answer } from 'shared/recommendations'
import { toolActionLabel, toolActions, type ToolAction } from 'shared/tool-actions'
import { featureRow } from 'shared/feature-rows'
import {
  TAP_COLUMNS,
  TOOL_COLUMNS,
  PartToolTable,
  ToolTableToolbar,
  hiddenByDefault,
  type Holding,
} from 'components/part-tool-table'
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
import { cautionedTypes, marksFor, shortfallMarks, testedCodes } from 'shared/tool-marks'
import { knobValue, knobsWith } from 'shared/rules'
import { OrderDialog } from 'components/order-dialog'
import { closeCandidates, fittingTools, tightestRule } from 'shared/tool-fit'
import { useUnit } from 'shared/use-unit'
import { usePartMaterial, usePreferences } from 'shared/use-preferences'
import { partHref, recallPart, rememberPart } from 'shared/part-session'
import { usePartUpload, type StartedPartUpload } from 'client/use-part-upload'
import { IDLE, groupOf as holeGroupOf, interactionFor } from 'shared/part-interaction'
import { arrowsFor, byLargest, keptFeatures, partHighlight } from 'shared/part-selection'
import {
  THREADED_FORMS,
  drillsFirst,
  formsWithMills,
  holeAt,
  holeDepthOf,
  makersFor,
  millsLabel,
  millsShown,
} from 'shared/hole-mode'
import { hasSharpCorner } from 'shared/feature-defaults'
import { threadPanes } from 'shared/thread-panes'
import { drillFor, minorOf, type HoleMode, type ThreadSpec } from 'shared/threads'

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

/** Follows a replacement job without taking the current part off screen. */
const ReplacementProgress = ({
  part,
  onReady,
  onFailed,
}: {
  part: StartedPartUpload
  onReady: (report: PublicInspectionReport, jobId: string) => void
  onFailed: (message: string) => void
}) => {
  const state = useAnalysisEvents(part.partId, part.jobId)

  useEffect(() => {
    if (state.status === 'ready') {
      onReady(state.report, part.jobId)
      return
    }
    if (state.status === 'failed') {
      onFailed(state.message)
    }
  }, [onFailed, onReady, part.jobId, state])

  const analysis: ReplacementAnalysis =
    state.status === 'pending'
      ? { message: state.message, progress: state.progress }
      : state.status === 'failed'
        ? { message: state.message, progress: null }
        : { message: 'Opening the replacement part…', progress: 1 }
  return (
    <PartUploadOverlay
      full
      status="idle"
      error={null}
      analysis={analysis}
      onUpload={() => {}}
      onClose={() => {}}
    />
  )
}

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
  const navigate = useNavigate()
  const [uploadOpen, setUploadOpen] = useState(() => search.get('upload') === '1')
  const [replacement, setReplacement] = useState<StartedPartUpload | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const {
    status: uploadStatus,
    error: uploadError,
    upload: uploadPart,
    reset: resetUpload,
  } = usePartUpload({
    onStarted: (part) => setReplacement(part),
  })
  const startReplacement = (file: File) => {
    setAnalysisError(null)
    void uploadPart(file)
  }
  const finishReplacement = useCallback(
    (next: PublicInspectionReport, nextJobId: string) => {
      rememberPart({ partId: next.partId, jobId: nextJobId, report: next })
      void navigate(partHref({ partId: next.partId, jobId: nextJobId, report: next }))
    },
    [navigate],
  )
  const failReplacement = useCallback(
    (message: string) => {
      setReplacement(null)
      setAnalysisError(message)
      resetUpload()
    },
    [resetUpload],
  )
  const closeUpload = () => {
    resetUpload()
    setAnalysisError(null)
    setUploadOpen(false)
    if (search.has('upload')) {
      const next = new URLSearchParams(search)
      next.delete('upload')
      setSearch(next)
    }
  }
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
    hiddenByDefault(TOOL_COLUMNS),
  )
  /**
   * The tap list's columns, kept apart from the tool list's.
   *
   * The two lists offer different columns — a tap has no corner radius and no
   * point angle — so they cannot share one hidden set: a code hidden in one
   * would mean nothing in the other, and the picker in the corner edits
   * whichever list is open (Paul, 2026-09-02: "allow me to use those columns
   * if I edit the tap table").
   */
  const [hiddenTapColumns, setHiddenTapColumns] = useState<ReadonlyArray<string>>(
    hiddenByDefault(TAP_COLUMNS),
  )
  const [tapColumnOrder, setTapColumnOrder] = useState<ReadonlyArray<string>>(() =>
    TAP_COLUMNS.map((column) => column.code),
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
      if (typing || target?.closest('[data-part-tool-table]')) {
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
  /**
   * The list somebody built: what they have asked about, on screen.
   *
   * **The selection used to be invisible** (Paul, 2026-09-02). Clicking a face
   * put its hole group into `kept` and the tool list was judged against
   * everything in it, with nothing saying what "everything" was. `kept` is now
   * the *working* set — the face under the mouse, or the group being built —
   * and this is the work.
   */
  const { list, setList } = useFeatureList(report.partId)
  /** The row whose tools are on screen; null while the list answers for itself. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * One feature *inside* a group, picked from the summary table.
   *
   * A group asked for one tool each answers in rows, and a row is a way in: it
   * asks that feature's own question in full without taking the group apart.
   */
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  /**
   * The thing being added, while it is being added.
   *
   * A feature draft is the page as it always was — click a face, confirm — so
   * it carries nothing but its own existence. A group draft carries what it
   * will be asked for, because that is the one thing about a group a click
   * cannot say.
   */
  const [draft, setDraft] = useState<{
    readonly kind: 'feature' | 'group'
    readonly results: Results
    /** The row being edited, where this is an edit rather than a new one. */
    readonly editing: string | null
  } | null>(null)
  /** The groups standing open in the list. */
  const [openItems, setOpenItems] = useState<ReadonlyArray<string>>([])

  const selectedItem = useMemo(() => itemNamed(list, selectedId), [list, selectedId])

  /**
   * What the bottom of the page is being asked — `shared/feature-list` holds
   * the order the four possible answers win in.
   */
  const askedNow = useMemo(
    () =>
      asked({
        draft: draft?.kind === 'group' ? { tags: kept, results: draft.results } : null,
        selected:
          selectedTag === null
            ? selectedItem
            : // A feature picked inside a group is its own question, asked in
              // full, without the group being taken apart to ask it.
              { kind: 'feature', id: `${selectedId ?? ''}:${selectedTag}`, tags: [selectedTag] },
        preview: kept,
      }),
    [draft, kept, selectedItem, selectedTag, selectedId],
  )

  /**
   * Whether anything at all is being asked about.
   *
   * **Not "is a reading focused"** (Paul, 2026-09-02, seeing the catalog under
   * a group he was building). A group is picked out with the quick buttons
   * without any one feature being read, so the list gated on the focus fell
   * back to the whole catalog while the page had a perfectly good question in
   * front of it.
   */
  const asking = askedNow.tags.length > 0
  /**
   * A group being built that answers **per feature**.
   *
   * There is no one list to show it: the question is one per feature, and the
   * answers arrive when the group does (Paul, 2026-09-02: "when many features
   * are selected with tools for each feature, the table should not show a
   * list"). So the panel says what will happen instead of listing tools for a
   * choice nobody has to make.
   */
  const perFeature = asking && askedNow.results === 'each'

  /** The features the tool list is judged against, whichever of the four is asking. */
  const selectedFeatures = useMemo(
    () => keptFeatures(report.features, askedNow.tags),
    [report.features, askedNow.tags],
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
   * Whether the drill half of a threaded hole also offers the mills that can
   * interpolate its predrill.
   *
   * **Read off the filter rather than kept beside it** (Paul, 2026-09-02: "the
   * button will turn on the flat and bull nose end mill tool types in the
   * global filters and show them in the drill list"). Held as a state of its
   * own it was a second answer to one question: choosing a thread rewrites the
   * form filter, and the button would have gone on claiming mills were shown
   * while the filter that decides had dropped them.
   */
  const predrillMills = useMemo(() => millsShown(query.terms.form ?? []), [query.terms.form])
  /**
   * What that list admits: drills, and the mills where the filter says so.
   *
   * The predrill is a hole like any other, and the rules sheet already ranks
   * `drill; flat end mill; bull nose end mill` for one — what kept a mill off
   * a threaded hole was this line (Paul, 2026-09-02).
   */
  const predrillForms = useMemo(() => ['drill', ...predrillMills], [predrillMills])

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
  /** Material is held with the part preferences, but it is still a tool filter. */
  const effectiveQuery = useMemo(
    () =>
      materialGroup === null
        ? query
        : { ...query, terms: { ...query.terms, materialGroups: [materialGroup] } },
    [query, materialGroup],
  )
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
  /**
   * What the part lights up: **everything the question is about**.
   *
   * It was the working set — the face under the mouse, or the group being
   * built — so selecting a group of thirty-nine holes lit the one the click
   * happened to read (Paul, 2026-09-02: "when I select a group in the list, it
   * should highlight all the features in that group"). `asked` already knows
   * which features are being asked about in every one of its four cases, and a
   * preview or a draft is exactly the working set, so nothing else changes.
   */
  const highlighted = useMemo(
    () => partHighlight({ kept: askedNow.tags, focused, group: null }),
    [askedNow.tags, focused],
  )

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
    if (bore === null || focused === null) {
      return selectedFeatures
    }
    /**
     * **The whole group, not the one that was clicked** (Paul, 2026-09-02:
     * "full tap drill matches should be shown first — lead with green checks
     * not i icons").
     *
     * Clicking a hole keeps its group: eight holes on a bolt circle are one
     * decision, and the list is judged against every one of them. Only the
     * *focused* one was stood in at the tap drill, so the rest went on being
     * judged at the size the model draws — and `foldVerdicts` takes its rank
     * key from the first feature in the fold, which is whichever the kernel
     * happened to report first. An M3×0.5 whose model is drawn at ⌀0.102
     * therefore ranked a ⌀0.102 drill above the ⌀0.098 that is actually its
     * tap drill, while the deviation column — which reads the predrill
     * directly — said the ⌀0.098 was the exact one.
     *
     * They are the same hole by definition: same diameter, same depth, same
     * way up. One predrill.
     */
    const group = new Set(holeGroupOf(report.features, focused))
    return selectedFeatures.map((each) => (group.has(each.featureTag) ? holeAt(each, bore) : each))
  }, [selectedFeatures, threadSpec, holeChoice.mode, focused, report.features])
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
    const { tools: toolQuery, holding } = splitHolding(effectiveQuery)
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
  }, [fitting, effectiveQuery])
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
    const { tools: toolQuery, holding } = splitHolding(effectiveQuery)
    return holdableTools(filterTools(allTools, toolQuery), holding)
  }, [effectiveQuery, allTools])
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
    if (!asking || tools.length > 0) {
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
     * 2026-08-31: "when a hole is threaded, we DON'T show endmills"). Unless
     * this hole's shop has asked for them (Paul, 2026-09-02), in which case
     * they are in the list and its near misses alike, behind the drills.
     */
    return holeChoice.mode === 'plain'
      ? near
      : drillsFirst(near.filter((each) => predrillForms.includes(each.form)))
  }, [asking, tools.length, excluded, query, holeChoice.mode, outOfReach, predrillForms])
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
    () => countsByAxis(asking ? tools : allTools, effectiveQuery, FACET_AXES),
    [asking, allTools, tools, effectiveQuery],
  )

  const listed = useMemo(() => {
    const shownTools = !asking ? catalogList : tools.length > 0 ? tools : closest
    if (!drillsOnly) {
      return shownTools
    }
    // Drills lead: a mill that lands on the predrill would otherwise outrank
    // every drill on the sheet's "closest to the hole diameter" row.
    return drillsFirst(shownTools.filter((each) => predrillForms.includes(each.form)))
  }, [asking, catalogList, tools, closest, drillsOnly, predrillForms])

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
            measuredFrom: threadSpec === null ? 'the hole' : 'the tap drill',
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
   * The features with a tool on the bill, for the part to mark.
   *
   * All that is left of the cards that used to float beside the part (Paul,
   * 2026-09-02): what they said is on the feature list now, and what they
   * painted is this.
   *
   * A guid that no longer resolves is not tooled — Justin Gray's rule that a
   * reference lives, kept from the cards.
   */
  const tooled = useMemo(
    () =>
      Object.entries(sheet.choices).flatMap(([featureTag, kept]) =>
        kept.some((choice) => allTools.some((one) => one.guid === choice.toolGuid))
          ? [featureTag]
          : [],
      ),
    [sheet, allTools],
  )

  /** Which feature the choice is for: the one being read, or the part as a whole. */
  /**
   * Which feature the choice is for: the one being read, or the part as a whole.
   *
   * **The group's own tag, not the sibling that happened to be clicked** (Paul,
   * 2026-09-02: "if a tool is on the list and a holder is added to it, it
   * should update the existing tool on the BOM rather than create a new one").
   * Eight identical holes are one decision everywhere else on this page; keyed
   * by whichever of them was under the mouse, the panel wrote a second line
   * beside the one the feature list had already put there.
   */
  const choiceKey = focused === null ? '*' : (holeGroupOf(report.features, focused)[0] ?? focused)

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
  const shownRows = useMemo(() => keptFirst(searched, keptHere), [searched, keptHere])

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
  /** A tool a press asked for, kept across the reading it also asked for. */
  const wantedTool = useRef<string | null>(null)
  useEffect(() => {
    setPicked({})
    setChosenTool(wantedTool.current)
    wantedTool.current = null
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
          trouble: option.unstocked
            ? `no ${option.holder.colletSeries ?? 'matching'} collet stocked`
            : option.clears === false
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
   * Which half of a threaded feature the **list** is showing: the taps, or the
   * drills under them.
   *
   * **Taps first** (Paul, 2026-09-02: "I'd like to have the tabs in the tool
   * table, showing taps first by default, then the drill tab to the right to
   * switch to it"). They were two tables stacked and a second pair of tabs in
   * the panel on the right, which spent the panel twice. The thread is the
   * decision and the drill follows from it, so the taps are the tab somebody
   * lands on; the panel then reads whichever tool was clicked, in either tab.
   */
  const [pane, setPane] = useState<'drill' | 'tap'>('tap')
  /**
   * **A threaded hole opens on its taps** (Paul, 2026-09-02: "taps should be
   * active, which should be the default when a hole is defined as threaded").
   *
   * The tab is a state, so a hole read after somebody had flipped to the
   * drills opened on the drills — and so did a hole that had just been given a
   * thread. Reading a feature and choosing a thread are both new decisions,
   * and the tap is the one they start from.
   */
  useEffect(() => {
    setPane('tap')
  }, [focused, threadSpec?.name])
  /** True while the list is showing the taps rather than the tools. */
  const tapping = threadSpec !== null && pane === 'tap'

  /**
   * The taps, read the way the tool list is read.
   *
   * The same search box, the same sorted-by-a-column order — the list is one
   * table now, so a tap list narrowed by catalog number or sorted by flute
   * count behaves like every other list rather than like a section that
   * happens to sit under one (Paul, 2026-09-02: "the taps table needs to use
   * the same format as drills or the usual tables").
   */
  const tapRows = useMemo(() => {
    const wanted = numberSearch.trim().toLowerCase()
    const narrowedTaps =
      wanted === ''
        ? makers.made
        : makers.made.filter((each) =>
            `${each.catalogNumber} ${each.brand}`.toLowerCase().includes(wanted),
          )
    return narrowedTaps
  }, [makers.made, numberSearch])

  /**
   * What is wrong with a tap, in the column it is about — the red the tap
   * table painted itself, said the way every other row says it.
   */
  const tapMarksOf = useCallback(
    (each: CatalogTool) => shortfallMarks(each, threadReach, format),
    [threadReach, format],
  )

  /**
   * What the panel on the right assembles.
   *
   * **Whichever tool is selected** (Paul, 2026-09-02: "whichever tool is
   * selected shows in the right hand panel"). A click in either tab wins; with
   * nothing clicked it is the head of the tab on show, so a threaded hole opens
   * on the tap it is for rather than on the drill under it.
   */
  const panelTool = useMemo(() => {
    /**
     * **Whatever row the list is drawing, even a near miss** (Paul, 2026-09-02:
     * "whatever row is highlighted in the list is selected"). `tool` is the
     * first tool that *fits*, so on a feature nothing in the crib fits — where
     * the list is showing the closest misses and what stops each — there was no
     * highlighted row and nothing for *Use this tool* to use.
     */
    if (chosenTool !== null || threadSpec === null) {
      return tool ?? shownRows[0] ?? null
    }
    /*
      The rows **as the table draws them**, so the tool the panel opens on is
      the row at the top of the open tab — sorted by a column or narrowed by
      the search box, the head of the list is whatever is on the first line
      (Paul, 2026-09-02: "the first row should be selected, and the tap should
      be shown in the right hand panel").
    */
    const panes = threadPanes(shownRows, tapRows, chosenTool)
    return (pane === 'tap' ? panes.tap : panes.drill) ?? tool ?? shownRows[0] ?? null
  }, [chosenTool, threadSpec, tool, shownRows, tapRows, pane])

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

  /** What one feature is called, drawn with, and cut from — the list's three columns. */
  const nameOf = useCallback(
    (featureTag: string) => {
      const feature = report.features.find((each) => each.featureTag === featureTag)
      return feature
        ? featureRow({ feature, features: report.features, regions: report.regions, unit }).type
        : 'Feature'
    },
    [report.features, report.regions, unit],
  )
  const iconOf = useCallback(
    (featureTag: string) => {
      const feature = report.features.find((each) => each.featureTag === featureTag)
      return feature ? (
        <KindIcon featureType={feature.featureType} kind={nameOf(featureTag)} />
      ) : null
    },
    [report.features, nameOf],
  )
  const wayUpOf = useCallback(
    (featureTag: string) => {
      const feature = report.features.find((each) => each.featureTag === featureTag)
      return feature
        ? featureRow({ feature, features: report.features, regions: report.regions, unit })
            .direction
        : null
    },
    [report.features, report.regions, unit],
  )

  /**
   * The features on the list the tool in the panel is already cutting.
   *
   * **A tool on the bill says what it is on the bill for** (Paul, 2026-09-02:
   * "if I open a tool that is mapped to features, I want to see which
   * features"), and they are what an assembly changed here is saved onto.
   */
  const mappedTags = useMemo(
    () =>
      panelTool === null
        ? []
        : Object.entries(sheet.choices).flatMap(([featureTag, kept]) =>
            kept.some((choice) => choice.toolGuid === panelTool.guid) ? [featureTag] : [],
          ),
    [sheet, panelTool],
  )

  /** The same, in the words the panel shows them in. */
  const mappedTo = useMemo(() => mappedTags.map(nameOf), [mappedTags, nameOf])

  /** Every kind of feature on the part, for the group editor's quick buttons. */
  const typeChoices = useMemo(() => typeButtons(report.features, nameOf), [report.features, nameOf])

  /**
   * The one tool the rules put first for a set of features.
   *
   * The whole pipeline the list runs, ending at the first row rather than at
   * two hundred: the rules, then the filters, then the crib — a recommendation
   * nothing in the shop can hold is not a recommendation. Threads count, so a
   * tapped hole in a group is judged against its predrill exactly as it is
   * when it is the one thing selected.
   */
  const topFor = useCallback(
    (tags: ReadonlyArray<string>): Answer | null => {
      /**
       * **What was chosen beats what is recommended** (Paul, 2026-09-02:
       * "holders and collets should also be shown with the tool in the feature
       * list"). Once a tool is on the bill for a feature, that — with whatever
       * it is held in — is the answer to this row; the rules' own pick stands
       * in only until somebody has made one.
       */
      const decided = tags[0] === undefined ? [] : choicesFor(sheet, tags[0])
      const picks = decided.flatMap((line) => {
        const kept = allTools.find((one) => one.guid === line.toolGuid)
        return kept === undefined
          ? []
          : [
              {
                tool: kept,
                holder:
                  allHolders.find((one) => one.guid === line.holderGuid)?.catalogNumber ?? null,
                collet:
                  allCollets.find((one) => one.guid === line.colletGuid)?.catalogNumber ?? null,
              },
            ]
      })
      if (picks.length > 0) {
        return { picks, chosen: true }
      }
      const features = keptFeatures(report.features, tags)
      if (features.length === 0) {
        return null
      }
      const stood = features.map((each) => {
        const choice = threads[each.featureTag]
        const bore = choice?.spec ? drillFor(choice.spec, choice.mode) : null
        return bore === null ? each : holeAt(each, bore)
      })
      /**
       * **Narrowed before it is judged, not after** (Paul, 2026-09-02: "adding
       * groups of holes is making it hang for a long time"). Every row of the
       * list costs a pass, and a group of thirty-nine holes is a dozen distinct
       * sizes — a dozen passes over seventeen thousand tools, then a filter
       * that threw most of the results away. The filters do not depend on the
       * rules, so applying them first is the same answer for a fraction of the
       * work: a threaded hole's list is drills, which is a few hundred.
       */
      const { tools: toolQuery, holding: crib } = splitHolding(effectiveQuery)
      const admitted = holdableTools(filterTools(allTools, toolQuery), crib)
      const { fitting: ranked } = fittingTools(stood, report.features, admitted, format, knobs)
      const first = features[0]
      const reach = first ? (sectionOf(first, report.features)?.curve ?? null) : null
      for (const verdict of ranked) {
        if (
          holdable(verdict.tool, allHolders, allCollets, holderFilters, reach, margins, thresholds)
        ) {
          return {
            picks: [{ tool: verdict.tool, holder: null, collet: null }],
            chosen: false,
          }
        }
      }
      return null
    },
    [
      sheet,
      report.features,
      threads,
      allTools,
      format,
      knobs,
      effectiveQuery,
      holderFilters,
      margins,
      thresholds,
    ],
  )

  /**
   * The rows of the list, answered.
   *
   * **Every row, always** — the answers live on the rows now, so they stay on
   * screen whatever is selected. It costs a judging pass per row whenever the
   * filters, the threads or the crib change; a list of a dozen is a dozen
   * passes over the catalog, which is the price of the answer being where the
   * question is (Paul, 2026-09-02).
   */
  /**
   * The distinct features in a set of tags: identical holes are one.
   *
   * The rule the rest of the page groups by — a bolt circle is one decision —
   * and it decides both what a group opens into and how many lines it puts on
   * the bill.
   */
  const distinctIn = useCallback(
    (tags: ReadonlyArray<string>): Array<ReadonlyArray<string>> => {
      const seen = new Set<string>()
      const parts: Array<ReadonlyArray<string>> = []
      for (const tag of tags) {
        if (seen.has(tag)) {
          continue
        }
        const together = groupOf(tag).filter((each) => tags.includes(each))
        for (const each of together) {
          seen.add(each)
        }
        parts.push(together.length > 0 ? together : [tag])
      }
      return parts
    },
    [groupOf],
  )

  /**
   * The same set of features is asked once, however many rows ask it.
   *
   * A part with three groups over the same bolt circle judged it three times,
   * and every render that changed nothing about the rules did it all again.
   * The cache is rebuilt whenever `topFor` is — which is whenever the filters,
   * the threads, the crib or the knobs move — so it can never answer with a
   * stale verdict (Paul, 2026-09-02, on the page hanging).
   */
  const answerFor = useMemo(() => {
    const known = new Map<string, Answer | null>()
    return (tags: ReadonlyArray<string>): Answer | null => {
      const key = tags.join('|')
      const had = known.get(key)
      if (had !== undefined) {
        return had
      }
      const made = topFor(tags)
      known.set(key, made)
      return made
    }
  }, [topFor])

  /**
   * The tools already on the bill for what is being asked about.
   *
   * **A feature can hold several** (Paul, 2026-09-02: "a feature or group can
   * have multiple tools saved to it, not just one") — a hole is a spot drill
   * and a drill — so this is a set rather than a tool, and what the panel
   * offers is decided from it.
   */
  const mappedHere = useMemo(() => {
    if (!asking) {
      return []
    }
    const guids = new Set<string>()
    for (const each of distinctIn(askedNow.tags)) {
      if (each[0] === undefined) {
        continue
      }
      for (const choice of choicesFor(sheet, each[0])) {
        guids.add(choice.toolGuid)
      }
    }
    return [...guids]
  }, [asking, askedNow.tags, distinctIn, sheet])

  const summaryRows = useMemo(
    () => recommendationRows(list, { topFor: answerFor, nameOf, split: distinctIn }),
    [list, answerFor, nameOf, distinctIn],
  )
  /**
   * Whether the bottom of the page is the list's answers rather than a tool
   * list.
   *
   * **Including when the list is empty** (Paul, 2026-09-02: "we should not be
   * showing the full list of catalog tools in the bottom row by default — it
   * should get back to the feature list based list"). It fell back to the whole
   * catalog there, which is what the panel did before there was a list to
   * answer with: seventeen thousand tools under a heading that says so, and an
   * answer to nothing. An empty list says what to do instead.
   */

  /* ----------------------- editing the feature list ----------------------- */

  const selectRow = useCallback(
    (id: string | null, tag: string | null = null, toolGuid?: string) => {
      /*
        **Pressing a tool on a row opens that tool** (Paul, 2026-09-02, on a
        feature holding several). Without it there is no way to reach the
        second one, and no way to remove it. Held in a ref as well because
        reading a feature clears the chosen tool on the next commit, and this
        press means to set one.
      */
      wantedTool.current = toolGuid ?? null
      setDraft(null)
      setSelectedId(id)
      setSelectedTag(tag)
      const item = itemNamed(list, id)
      const reading = tag ?? item?.tags[0] ?? null
      if (reading === null) {
        dispatch({ type: 'reset' })
        return
      }
      dispatch({ type: 'read', featureTag: reading })
      setChosenTool(toolGuid ?? null)
      if (tag === null && item?.kind === 'group' && item.results === 'each') {
        // A group that answers per feature is opened by selecting it: its
        // features are the answer, so hiding them behind a caret hides it.
        setOpenItems((current) => (current.includes(item.id) ? current : [...current, item.id]))
      }
    },
    [list],
  )

  const startAddGroup = useCallback(() => {
    setSelectedId(null)
    setSelectedTag(null)
    // Whatever is under the mouse seeds the draft: pressing "add group" with a
    // face already clicked should not throw that click away.
    setDraft({ kind: 'group', results: 'all', editing: null })
  }, [])

  const startEdit = useCallback(
    (id: string) => {
      const item = itemNamed(list, id)
      if (item === null) {
        return
      }
      setSelectedId(null)
      setSelectedTag(null)
      setDraft({
        kind: item.kind,
        results: item.kind === 'group' ? item.results : 'all',
        editing: id,
      })
      dispatch({ type: 'collect', tags: item.tags })
    },
    [list],
  )

  /**
   * The reading on screen, kept.
   *
   * Its own callback rather than a draft confirmed, because the prompt beside
   * a previewed face has nothing to set up first: what would be added is
   * already what is being looked at.
   */
  /**
   * The tool picked from the list, written onto the bill for what it cuts.
   *
   * **Choosing the tool is what adds it** (Paul, 2026-09-02: "I must select a
   * tool from the list when creating a feature, and that is what adds it to
   * the BOM"). One line per *distinct* feature — a group of four faces cut by
   * one end mill is four operations with one tool, and the order list groups by
   * assembly when it comes to buying them.
   */
  const billFor = useCallback(
    (tags: ReadonlyArray<string>, results: Results) => {
      /**
       * **A group asked for one tool each has already chosen them** (Paul,
       * 2026-09-02: "when 'the best tool for each' is selected for a group, it
       * should autoselect the tools rather than require them"). There is no one
       * tool to pick from the list — the question was six questions — and the
       * rules have answered every one of them on the rows. Asking somebody to
       * pick a seventh tool to stand for all of them was asking for the thing
       * that mode exists to avoid.
       */
      if (results === 'each') {
        commit(
          distinctIn(tags).reduce((current, each) => {
            const best = answerFor(each)?.picks[0]
            return best === undefined || each[0] === undefined
              ? current
              : addChoice(current, each[0], { toolGuid: best.tool.guid })
          }, sheet),
        )
        return
      }
      if (panelTool === null) {
        return
      }
      /**
       * **With whatever it is held in** (Paul, 2026-09-02: "if a holder and
       * collet are selected when a feature or group is confirmed, they should
       * be added to the BOM"). The holder is chosen on the row or in the panel
       * beside it and lives in `picked` until something writes it down; this is
       * one of the two things that write it down.
       */
      const held = picked[panelTool.guid]
      const line = {
        toolGuid: panelTool.guid,
        ...(held?.holderGuid ? { holderGuid: held.holderGuid } : {}),
        ...(held?.colletGuid ? { colletGuid: held.colletGuid } : {}),
        ...(typeof held?.stickout === 'number' ? { stickout: held.stickout } : {}),
      }
      commit(
        distinctIn(tags).reduce(
          (current, each) => (each[0] === undefined ? current : addChoice(current, each[0], line)),
          sheet,
        ),
      )
    },
    [panelTool, picked, commit, distinctIn, sheet, answerFor],
  )

  /**
   * What a row took off the list takes off the bill.
   *
   * **The list drives everything** (Paul, 2026-09-02: "the grey coloring is
   * showing up even after I've removed a feature or list, and the tool
   * assemblies from those features and groups are sticking around in the BOM").
   * The two were kept side by side and only one of them was being edited, so a
   * removed group went on being painted on the part and went on being ordered.
   */
  const unbill = useCallback(
    (tags: ReadonlyArray<string>) => {
      commit(
        distinctIn(tags).reduce(
          (current, each) => (each[0] === undefined ? current : clearChoice(current, each[0])),
          sheet,
        ),
      )
    },
    [commit, distinctIn, sheet],
  )

  const addFeature = useCallback(() => {
    if (kept.length === 0) {
      return
    }
    // One feature is one question, so it takes the tool that was picked for it.
    billFor(kept, 'all')
    const made: ListItem = { kind: 'feature', id: nextId(list, 'feature'), tags: [...kept] }
    setList((current) => addItem(current, made))
    setDraft(null)
    /**
     * **And it stays the thing being asked about** (Paul, 2026-09-02, on a
     * feature holding several tools). It used to put everything down, which
     * left nothing active — and with nothing active the panel beside the table
     * has nothing to add a second tool *to*. The row somebody has just made is
     * the row they are working on.
     */
    setSelectedId(made.id)
    setSelectedTag(null)
  }, [kept, billFor, list])

  const confirmDraft = useCallback(() => {
    if (draft === null || kept.length === 0) {
      return
    }
    if (draft.kind === 'feature' && draft.editing === null) {
      addFeature()
      return
    }
    const made: ListItem =
      draft.kind === 'group'
        ? {
            kind: 'group',
            id: draft.editing ?? nextId(list, 'group'),
            tags: [...kept],
            results: draft.results,
          }
        : { kind: 'feature', id: draft.editing ?? nextId(list, 'feature'), tags: [...kept] }
    // An edit that takes features out takes their lines off the bill with
    // them: the list drives everything (Paul, 2026-09-02).
    const before = itemNamed(list, draft.editing)
    if (before !== null) {
      unbill(before.tags.filter((tag) => !made.tags.includes(tag)))
    }
    billFor(made.tags, made.kind === 'group' ? made.results : 'all')
    setList((current) =>
      draft.editing === null ? addItem(current, made) : replaceItem(current, made),
    )
    setDraft(null)
    // The row somebody has just made is the row they are working on.
    setSelectedId(made.id)
    setSelectedTag(null)
  }, [draft, kept, list, addFeature, billFor, unbill])

  const cancelDraft = useCallback(() => {
    setDraft(null)
    dispatch({ type: 'reset' })
  }, [])

  /**
   * The row on the list the panel's buttons act on, where there is one.
   *
   * A previewed feature can already be on the list — clicking it on the part is
   * how somebody goes back to it — so this is not simply the selected row.
   */
  const activeItem = useMemo(
    () =>
      selectedItem ??
      list.find((item) => askedNow.tags.every((tag) => item.tags.includes(tag))) ??
      null,
    [selectedItem, list, askedNow.tags],
  )

  /**
   * What the panel beside the table offers for the tool it is showing.
   *
   * The rule is `shared/tool-actions`; this is what each of its answers does.
   * All five write through the same two places — the list and the sheet —
   * because the list drives everything (Paul, 2026-09-02).
   */
  const panelActions = useMemo(() => {
    if (panelTool === null) {
      return []
    }
    const held = holding.chosen(panelTool)
    const first = distinctIn(askedNow.tags)[0]?.[0]
    const line = first === undefined ? null : chosenFor(sheet, first, panelTool.guid)
    const wanted = toolActions({
      active: asking && !askedNow.summary,
      mapped: mappedHere.length,
      here: mappedHere.includes(panelTool.guid),
      assemblyChanged:
        line !== null &&
        ((line.holderGuid ?? null) !== held.holderGuid ||
          (line.colletGuid ?? null) !== held.colletGuid),
    })
    /** This tool, with whatever the panel has it held in. */
    const asLine = {
      toolGuid: panelTool.guid,
      ...(held.holderGuid === null ? {} : { holderGuid: held.holderGuid }),
      ...(held.colletGuid === null ? {} : { colletGuid: held.colletGuid }),
    }
    const across = (change: (sheet: SetupSheet, featureTag: string) => SetupSheet) =>
      commit(
        distinctIn(askedNow.tags).reduce(
          (current, each) => (each[0] === undefined ? current : change(current, each[0])),
          sheet,
        ),
      )
    const run: Record<ToolAction, () => void> = {
      add: () => {
        if (draft?.kind === 'group') {
          confirmDraft()
          return
        }
        addFeature()
      },
      // Cleared and written in one commit: two would each read the sheet this
      // render closed over, and the second would undo the first.
      replace: () => across((current, tag) => addChoice(clearChoice(current, tag), tag, asLine)),
      also: () => across((current, tag) => addChoice(current, tag, asLine)),
      update: () =>
        commit(
          mappedTags.reduce((current, tag) => {
            const had = chosenFor(current, tag, panelTool.guid)
            return had === null ? current : addChoice(current, tag, { ...had, ...asLine })
          }, sheet),
        ),
      /**
       * **And the row goes with its last tool** (Paul, 2026-09-02: "remove
       * tool, which would remove that tool from the list — and that feature
       * from the list if no other tools are mapped to it").
       */
      remove: () => {
        const next = distinctIn(askedNow.tags).reduce(
          (current, each) =>
            each[0] === undefined ? current : removeChoice(current, each[0], panelTool.guid),
          sheet,
        )
        commit(next)
        const left = distinctIn(askedNow.tags).some(
          (each) => each[0] !== undefined && choicesFor(next, each[0]).length > 0,
        )
        if (!left && activeItem !== null) {
          setList((current) => removeItem(current, activeItem.id))
          selectRow(null)
        }
      },
    }
    return wanted.map((action) => ({
      key: action,
      label: toolActionLabel(action, {
        // Named by the number a shop orders by, not by the guid it is keyed on.
        dropping: mappedHere.map(
          (guid) => allTools.find((one) => one.guid === guid)?.catalogNumber ?? guid,
        ),
      }),
      onClick: run[action],
      danger: action === 'remove',
    }))
  }, [
    panelTool,
    holding,
    distinctIn,
    askedNow,
    asking,
    sheet,
    mappedHere,
    mappedTags,
    commit,
    draft,
    confirmDraft,
    addFeature,
    activeItem,
    setList,
    selectRow,
    allTools,
  ])

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

  const listTitle = perFeature
    ? 'One tool per feature'
    : !asking
      ? 'Every tool in the catalog'
      : /*
        **A group is not a feature** (Paul, 2026-09-02, seeing "Every tool in
        the catalog" over a list judged against a group he had just built). The
        heading read off the *focused* reading, and a group picked out with the
        quick buttons focuses nothing — so a list of what cuts all sixteen walls
        was headed as the catalog.
      */
        selectedTag === null && (draft?.kind === 'group' || selectedItem?.kind === 'group')
        ? 'Cuts every feature in the group'
        : reading === null
          ? 'What fits what is selected'
          : `Cuts the ${featureRow({ feature: reading, features: report.features, regions: report.regions, unit }).type.toLowerCase()}`

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <AppHeader
        unit={unit}
        onUnit={setUnit}
        toolCount={allTools.length}
        onUploadPart={() => setUploadOpen(true)}
      />

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
        {/*
          **A form has to be finishable** (Paul, 2026-09-02: "make the selection
          dialog go over the table — the table is blocking me from confirming
          long lists right now"). Everything from the panel group down clips to
          its own box, which is right for a viewer and wrong for a box with a
          confirm button under a list somebody is still adding to. While one is
          open the two panels above the part stop clipping, and `overlaySpills`
          does the rest.
        */}
        <Panels.Panel
          className={classNames('min-h-0', draft === null ? 'overflow-hidden' : 'overflow-visible')}
          defaultSize="72%"
          minSize={520}
        >
          <Panels.Group className="size-full min-h-0 gap-1" orientation="vertical">
            <Panels.Panel
              /*
                `overflow-visible!` because the panel sets `overflow: auto`
                inline on the element this class lands on, and a class cannot
                beat an inline style without it. `relative z-50` is the other
                half: unclipped, the box would still be painted over by the
                panel that comes after it in the document.
              */
              className={classNames(
                'min-h-0',
                draft === null ? 'overflow-hidden' : 'relative z-50 overflow-visible!',
              )}
              defaultSize="55%"
              minSize={260}
            >
              <PartViewer
                report={report}
                jobId={jobId}
                /*
                  Also once there is a list: it stacks into columns rather than
                  scrolling, and a column of it is taller than the viewer long
                  before the window runs out (Paul, 2026-09-02).
                */
                overlaySpills={draft !== null}
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
                /*
                  **The cards are gone** (Paul, 2026-09-02: "you can get rid of
                  the old tool cards"). One card per feature floated up the
                  right edge of the part, saying what had been kept for it —
                  which is what the feature list says now, on the row that asked
                  the question. Two places showing the same decision is one
                  place too many, and the cards were the one nobody was
                  looking at.

                  The *painting* stays: a feature with a tool on the bill is
                  still marked on the part.
                */
                tooled={tooled}
                modal={
                  uploadOpen ? (
                    replacement ? (
                      <ReplacementProgress
                        part={replacement}
                        onReady={finishReplacement}
                        onFailed={failReplacement}
                      />
                    ) : (
                      <PartUploadOverlay
                        full
                        status={uploadStatus}
                        error={analysisError ?? uploadError}
                        analysis={null}
                        onUpload={startReplacement}
                        onClose={closeUpload}
                      />
                    )
                  ) : null
                }
                overlay={
                  <>
                    {/*
                      Outlined while nothing is read, because an empty box
                      says nothing about whose turn it is. The border is the
                      prompt: click the part (Paul, 2026-08-31).
                    */}
                    {/*
                      **Beneath while it fits, beside when it does not** (Paul,
                      2026-09-02: "the feature editor should go to the right when
                      the list is long enough that it can't fit beneath —
                      otherwise it should go beneath").

                      A wrapping column says exactly that and needs no
                      measurement: the two cards stack while the pair is shorter
                      than the viewer, and the second moves into a column beside
                      the first the moment it is not. The list caps itself at the
                      full height, so a long list is what stops the editor
                      fitting under it.
                    */}
                    <div className="flex h-full flex-col flex-wrap content-start gap-2">
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
                        /*
                        **Wider while a group is being built** (Paul,
                        2026-09-02). The chips, the quick buttons and two
                        result options each wrap at 320 px, which is a form
                        three times taller than the panel it replaces.
                      */
                        /*
                        **It fills the space it has, then scrolls** (Paul,
                        2026-09-02: "the list goes down to the top of the table
                        if it is shown … then is scrollable"). `max-h-full` is
                        the top of the table: the overlay is floored to the
                        viewer, and the viewer stops where the table starts.
                      */
                        className="filter-off flex max-h-full min-h-32 w-80 shrink-0 flex-col self-start overflow-hidden"
                      >
                        <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
                          <h4 className="text-2xs flex shrink-0 items-center gap-1.5 font-semibold tracking-wide text-zinc-500 uppercase">
                            <span className="text-zinc-600">
                              <CursorClickIcon />
                            </span>
                            Features
                          </h4>

                          {/*
                          **The list, and one control that grows it** (Paul,
                          2026-09-02: "I see a plus sign where the features
                          dialog is"). What was one field showing the face under
                          the mouse is now the work above and the reading below.
                        */}
                          <FeatureListPanel
                            items={list}
                            selectedId={selectedId}
                            selectedTag={selectedTag}
                            onSelect={(id, tag, toolGuid) => selectRow(id, tag ?? null, toolGuid)}
                            chosenTool={chosenTool}
                            /*
                            **The answer sits under the question** (Paul,
                            2026-09-02: "get rid of the bottom table and just
                            show the tool for the group or selected features in
                            the feature list, under the folder or feature").
                          */
                            answers={summaryRows}
                            unit={unit}
                            open={openItems}
                            onOpen={(id) =>
                              setOpenItems((current) =>
                                current.includes(id)
                                  ? current.filter((each) => each !== id)
                                  : [...current, id],
                              )
                            }
                            nameOf={nameOf}
                            iconOf={iconOf}
                            directionOf={wayUpOf}
                            addingFeature={draft?.kind === 'feature' && kept.length === 0}
                            onAddFeature={() => {
                              /*
                              Pressed with nothing being read it asks for a
                              face rather than refusing to be pressed (Paul,
                              2026-09-02); pressed with one, it adds it.
                            */
                              if (kept.length === 0) {
                                setSelectedId(null)
                                setSelectedTag(null)
                                setDraft({ kind: 'feature', results: 'all', editing: null })
                                return
                              }
                              if (draft === null) {
                                addFeature()
                                return
                              }
                              confirmDraft()
                            }}
                            onAddGroup={startAddGroup}
                            onEdit={startEdit}
                            onRemove={(id) => {
                              const going = itemNamed(list, id)
                              if (going !== null) {
                                unbill(going.tags)
                              }
                              setList((current) => removeItem(current, id))
                              if (selectedId === id) {
                                selectRow(null)
                              }
                            }}
                          />
                        </div>
                      </Card>

                      {/*
                      **Beside the list, not under it** (Paul, 2026-09-02: "show
                      the feature and group editor to the right of the feature
                      list"). The list is what has been asked and this is the
                      one thing being asked *now*; stacked, the second pushed
                      the first up until neither had room, and on a part with a
                      dozen rows the form somebody was filling in was the half
                      that went off the bottom.
                    */}
                      {draft?.kind === 'group' || reading !== null ? (
                        <Card
                          className={classNames(
                            'filter-off max-h-full shrink-0 self-start overflow-y-auto',
                            draft?.kind === 'group' ? 'w-[26rem]' : 'w-80',
                          )}
                        >
                          <div className="flex flex-col gap-1.5 p-2">
                            {draft?.kind === 'group' ? (
                              <GroupEditor
                                tags={kept}
                                results={draft.results}
                                onResults={(results) =>
                                  setDraft((current) =>
                                    current ? { ...current, results } : current,
                                  )
                                }
                                onDrop={(tag) => dispatch({ type: 'toggle', featureTag: tag })}
                                types={typeChoices}
                                onAddAll={(tags) =>
                                  dispatch({
                                    type: 'collect',
                                    tags: [...kept, ...tags.filter((tag) => !kept.includes(tag))],
                                  })
                                }
                                nameOf={nameOf}
                                onConfirm={confirmDraft}
                                onCancel={cancelDraft}
                                /*
                              **The tool is part of the answer** (Paul,
                              2026-09-02: "I must select a tool from the list
                              when creating a feature, and that is what adds it
                              to the BOM"). The list below is showing what fits
                              what is being built; picking a row there is what
                              finishes it.
                            */
                                picked={draft.results === 'each' || panelTool !== null}
                                editing={draft.editing !== null}
                              />
                            ) : (
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
                                          applyTerm(
                                            'form',
                                            choice.mode === 'plain' ? [] : THREADED_FORMS,
                                          )
                                        },
                                        deviation: drillDeviation,
                                      },
                                    })}
                              />
                            )}

                            {/*
                          **A feature is added on purpose** (Paul, 2026-09-02:
                          "need an 'add to list' button at the bottom right of
                          add feature once I've got it selected to confirm I
                          actually want to add it"). The button that starts the
                          add is at the top of the box and the reading it would
                          add is at the bottom of it, so the confirm belongs
                          under what it is confirming.
                        */}
                            {draft?.kind === 'feature' && kept.length > 0 ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button size="sm" variant="secondary" onClick={cancelDraft}>
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  /*
                                **The row the list is already showing** (Paul,
                                2026-09-02: "I should be able to 'Add this
                                feature' to select the preselected row — it
                                makes me reclick the row now"). The table opens
                                with its first row highlighted and the panel
                                beside it assembling that very tool, and the
                                button asked for the click again anyway.

                                "Use this tool" rather than "Add this feature",
                                because that is what pressing it does — and
                                because the assembly panel on the right already
                                has a button called *Add to list*.
                              */
                                  disabled={panelTool === null}
                                  onClick={draft.editing === null ? addFeature : confirmDraft}
                                >
                                  {draft.editing === null ? 'Use this tool' : 'Save this tool'}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </Card>
                      ) : null}
                    </div>
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
                onClear={() => {
                  if (draft === null) {
                    setSelectedId(null)
                    setSelectedTag(null)
                  }
                  dispatch({ type: 'miss' })
                }}
                /*
                  **A click while a group is being built is a toggle** (Paul,
                  2026-09-02: "it is not letting me actually multi-select"). An
                  ordinary click swaps the guess for whatever was clicked last,
                  which is right when the click is the question and wrong while
                  somebody is picking out six features one at a time.
                */
                onPickFace={(pick) => {
                  /*
                    **A click on the part is a new question** (Paul,
                    2026-09-02: "clicking in the right screen needs to remove
                    focus from the selected row in the feature list"). A row
                    selected outranks whatever is under the mouse — which is
                    right until somebody clicks the part, at which point the
                    page went on answering the row and the click did nothing
                    anybody could see.
                  */
                  if (draft === null) {
                    setSelectedId(null)
                    setSelectedTag(null)
                  }
                  dispatch({ type: 'click', pick, collecting: draft?.kind === 'group' })
                }}
              />
            </Panels.Panel>

            {/*
              **The list is always there** (Paul, 2026-09-02: "list of tools
              should be on by default and show the all tools"). It was hidden
              until a tool was pressed, which left half the page empty on a part
              nobody had asked anything about yet — and the catalog, narrowed by
              the filters, is a list worth reading on its own.
            */}
            <Panels.Separator className={separator} />

            <Panels.Panel className="min-h-0 overflow-hidden" minSize={180}>
              {/* The list leads with assemblies: the ten best tools, each with
                  the holder the rules recommend, changeable in place. The full
                  table is a flip away, and the filters overlay it. */}
              <Card className="relative flex size-full min-h-0 flex-col overflow-hidden">
                {/* The panel measures itself here: `Card` takes no ref. */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <div
                    data-list-chrome
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 border-b border-zinc-900 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 min-h-8 flex-wrap items-center gap-2">
                      {/*
                      **Two tabs on the list, taps first** (Paul, 2026-09-02:
                      "I'd like to have the tabs in the tool table, showing taps
                      first by default, then the drill tab to the right to
                      switch to it"). They were two tables stacked, which spent
                      the panel twice and made the reading order a layout
                      question. The thread is the decision and the drill follows
                      from it, so the taps are the tab somebody lands on;
                      whichever tool is clicked, in either tab, is the one the
                      panel on the right assembles.
                    */}
                      {/*
                      The tabs are two lists of tools for one hole; the list's
                      own answers are neither, so they take the plain heading.
                    */}
                      {threadSpec === null || perFeature ? (
                        <span className="text-zinc-200">{listTitle}</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          {(
                            [
                              ['tap', `Taps for ${threadSpec.name}`, makers.made.length],
                              ['drill', 'Drills', listed.length],
                            ] as const
                          ).map(([key, label, many]) => (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={pane === key}
                              onClick={() => setPane(key)}
                              className={classNames(
                                'focus-visible:ring-info/60 flex items-center gap-1.5 rounded border px-2 py-0.5 text-sm transition focus-visible:ring-1 focus-visible:outline-none',
                                pane === key
                                  ? 'border-info/60 bg-info/15 text-info'
                                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                              )}
                            >
                              {label}
                              <span className="text-2xs text-zinc-500">{many}</span>
                            </button>
                          ))}
                          {/*
                          **A hole can be interpolated** (Paul, 2026-09-02: "I
                          need to be able to use an end mill on a threaded hole
                          in place of a drill… a quick option in the drills
                          section to 'Show compatible endmills'"). Beside the
                          list it changes and nowhere else, because it is a
                          question about *this* hole's predrill.

                          It presses the filter rather than hiding a list of
                          its own: the two mill forms go into the type filter,
                          where the rail shows them and where somebody can take
                          them off again — the same reason choosing a thread
                          writes its own forms there (Paul, 2026-08-31).
                        */}
                          {pane === 'drill' ? (
                            <button
                              type="button"
                              aria-pressed={predrillMills.length > 0}
                              title={
                                predrillMills.length > 0
                                  ? 'Showing the end mills that can interpolate this predrill, after the drills — press to take them off'
                                  : 'Also show the flat and bull nose end mills that can interpolate this predrill'
                              }
                              onClick={() => {
                                const forms = query.terms.form ?? []
                                applyTerm(
                                  'form',
                                  // Nothing ticked means every form, so turning
                                  // the mills on has to name the drills and taps
                                  // as well or the press would hide them.
                                  formsWithMills(
                                    forms.length === 0 ? THREADED_FORMS : forms,
                                    predrillMills.length === 0,
                                  ),
                                )
                              }}
                              className={classNames(
                                'focus-visible:ring-info/60 text-2xs ml-1 rounded border px-2 py-1 transition focus-visible:ring-1 focus-visible:outline-none',
                                predrillMills.length > 0
                                  ? 'border-info/60 bg-info/15 text-info'
                                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                              )}
                            >
                              {millsLabel(query.terms.form ?? [])}
                            </button>
                          ) : null}
                        </span>
                      )}
                      {/* Nothing to count where nothing has been asked of this
                        panel: a number beside "nothing selected" reads as a
                        count of tools that are not there. */}
                      {threadSpec !== null || perFeature ? null : (
                        <Badge variant={listed.length === 0 ? 'danger' : 'secondary'}>
                          {listed.length}
                        </Badge>
                      )}
                      {/*
                      **The notes are about the list on show** (Paul,
                      2026-09-02). What the rules took off the drill list is
                      true of the drills and says nothing about the taps, and
                      it was printed over both. The tap tab says what its own
                      list was matched on, and what is wrong with it.
                    */}
                      {/* None of them are about a panel that is waiting to be
                        asked: they describe a list that is not on screen. */}
                      {perFeature ? null : tapping && threadSpec !== null ? (
                        <>
                          <span className="text-2xs text-zinc-500">
                            {holeChoice.mode === 'thread mill'
                              ? `inside the ⌀${formatLength(minorOf(threadSpec), unit)} minor diameter`
                              : `matched on ⌀${formatLength(threadSpec.major, unit)} — this catalog holds no pitch, so check it`}
                          </span>
                          {makers.short ? (
                            <span className="text-2xs text-amber-300">
                              none reach the bottom — the closest are shown
                            </span>
                          ) : null}
                          {makers.unheld ? (
                            <span className="text-2xs text-amber-300">
                              nothing in the crib holds one at the stickout this needs
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
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
                              this feature has a sharp corner, and no milling tool can cut the
                              geometry
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
                        </>
                      )}
                      {/*
                      **The picker edits the list that is open** (Paul,
                      2026-09-02: "allow me to use those columns if I edit the
                      tap table"). A tap offers the seven numbers it states and
                      the tool list offers its own, so which set is on offer —
                      and which hidden set a tick lands in — follows the tab.
                    */}
                    </div>
                    <ToolTableToolbar
                      onClear={() => apply(EMPTY_QUERY)}
                      filters={
                        <FilterPanel
                          facets={facets}
                          query={query}
                          onQuery={apply}
                          counts={(key) => axisCounts.get(key) ?? countBy(listed, key)}
                          unit={unit}
                          holding={{ tapers, series: colletSeries }}
                          materialGroup={materialGroup}
                          onMaterial={chooseMaterial}
                          catalogNumberSearch={{ value: numberSearch, onChange: setNumberSearch }}
                          matching={{
                            floor: {
                              value: floorRadius,
                              onChange: setFloorRadius,
                              sheetValue: sheetFloorRadius,
                            },
                            clamping: {
                              rule: clamping,
                              onChange: setClamping,
                              sheet: sheetClamping,
                            },
                            ...(holeDiameter === null
                              ? {}
                              : {
                                  drill: {
                                    over: drillDeviation.over,
                                    under: drillDeviation.under,
                                    onChange: setDrillDeviation,
                                    sheet: sheetDrillDeviation,
                                  },
                                }),
                          }}
                          toolbar
                        />
                      }
                      actions={
                        <ColumnPicker
                          columns={orderedCodes(
                            (tapping ? TAP_COLUMNS : TOOL_COLUMNS).map((column) => column.code),
                            tapping ? tapColumnOrder : columnOrder,
                          ).flatMap((code) =>
                            (tapping ? TAP_COLUMNS : TOOL_COLUMNS)
                              .filter((column) => column.code === code)
                              .map((column) => ({ code: column.code, label: column.label })),
                          )}
                          shown={(tapping ? TAP_COLUMNS : TOOL_COLUMNS)
                            .filter(
                              (column) =>
                                !(tapping ? hiddenTapColumns : hiddenColumns).includes(column.code),
                            )
                            .map((column) => column.code)}
                          onToggle={(code) => {
                            if (tapping) {
                              setHiddenTapColumns((current) =>
                                current.includes(code)
                                  ? current.filter((each) => each !== code)
                                  : [...current, code],
                              )
                              return
                            }
                            touchedColumns.current.add(code)
                            setHiddenColumns((current) =>
                              current.includes(code)
                                ? current.filter((each) => each !== code)
                                : [...current, code],
                            )
                          }}
                          onReorder={tapping ? setTapColumnOrder : setColumnOrder}
                        />
                      }
                    />
                  </div>
                  <div
                    // The UI table owns the panel's virtualized scroll area.
                    className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
                  >
                    {perFeature ? (
                      <p className="p-4 text-sm text-zinc-500">
                        Tools will automatically be selected for each feature. After creating the
                        group, click on a feature in the list to see all compatible tools.
                      </p>
                    ) : tapping ? (
                      /*
                        **The same table, with the taps' own columns** (Paul,
                        2026-09-02: "why do these all look a little different?").
                        It was a table of its own — no vendor column, no sorting,
                        no search, no filters, and a dash under the two columns a
                        tap does not have. What is different about a tap list is
                        which columns it offers, and that is now the only thing
                        that is different about it.
                      */
                      <PartToolTable
                        tools={tapRows}
                        columns={TAP_COLUMNS}
                        /*
                          **The row the panel is reading is the row that looks
                          chosen** (Paul, 2026-09-02: "we are preselecting the
                          first row in drills and other features correctly, but
                          not in taps"). The highlight followed the *drill*
                          list's head, which is not on this list at all, so the
                          tap tab opened with its first row unmarked while the
                          panel beside it assembled that very tap.
                        */
                        hiddenColumns={hiddenTapColumns}
                        columnOrder={tapColumnOrder}
                        marks={tapMarksOf}
                        empty={
                          holeChoice.mode === 'thread mill'
                            ? 'No thread mill in the catalog fits inside this hole. The hole can still be drilled.'
                            : 'No tap of that size in the catalog. The hole can still be drilled.'
                        }
                        unit={unit}
                        chosen={panelTool?.guid ?? null}
                        onChoose={(each) => setChosenTool(each.guid)}
                        holding={holding}
                        inBom={(each) => keptHere.has(each.guid)}
                        keptElsewhere={(each) => bom.has(each.guid) && !keptHere.has(each.guid)}
                      />
                    ) : (
                      <PartToolTable
                        // Kept for this feature, then the sheet's order or
                        // whatever column the list is sorted by.
                        tools={shownRows}
                        unit={unit}
                        chosen={panelTool?.guid ?? null}
                        onChoose={(each) => setChosenTool(each.guid)}
                        hiddenColumns={hiddenColumns}
                        columnOrder={columnOrder}
                        marks={marksOf}
                        holding={holding}
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
                    )}
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
          {panelTool ? (
            <Card className="size-full overflow-auto">
              <ToolDetails
                tool={panelTool}
                unit={unit}
                holding={holding}
                /*
                  **Nothing is added from here any more** (Paul, 2026-09-02:
                  "Add to list button can go away — we are now adding tools to
                  the BOM by confirming the feature/tool mapping"). What the
                  panel still owns is the *assembly*: a holder, a collet and, in
                  time, a stickout, changed on a decision already made.
                */
                mappedTo={mappedTo}
                /*
                  **Nothing is worked out here** (Paul, 2026-09-02, on a feature
                  holding more than one tool). Which of the five actions apply
                  is four sentences about the list, and `shared/tool-actions`
                  is where they are said and tested.
                */
                actions={panelActions}
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
