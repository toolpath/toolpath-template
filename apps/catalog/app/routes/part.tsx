import {
  useCallback,
  useEffect,
  useDeferredValue,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Badge, Button, Card, IconButton, cn, Panels } from '@toolpath/ui'
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
import { formatLength } from '@toolpath/tool-support'
import { AppHeader } from 'components/app-header'
import { PartUploadOverlay, type ReplacementAnalysis } from 'components/part-upload-overlay'
import { FeatureDetails } from 'components/feature-details'
import { KindIcon } from 'components/feature-icons'
import { CursorClickIcon, ListBulletsIcon, TreeStructureIcon, XIcon } from '@phosphor-icons/react'
import { FilterPanel } from 'components/filter-panel'
import { ToolDetails } from 'components/tool-details'
import {
  addChoice,
  clearChoice,
  chosenFor,
  removeChoice,
  useSetupSheet,
  type SetupSheet,
} from 'shared/setup-sheet'
import { PartViewer } from 'components/part-viewer'
import { SelectionPanel } from 'components/selection-panel'
import { PredrillChoice } from 'components/predrill-choice'
import { FeatureListPanel } from 'components/feature-list-panel'
import { AddBar } from 'components/add-bar'
import { ComponentTally, KIND_LABEL, type ComponentTallyRow } from 'components/component-tally'
import { ColletIcon, HolderIcon, ToolTypeIcon } from 'components/tool-icons'
import { GroupEditor } from 'components/group-editor'
import {
  addItem,
  asked,
  itemNamed,
  labelOf,
  nextId,
  removeItem,
  renameItem,
  replaceItem,
  sheetKeysOf,
  useFeatureList,
  type ListItem,
  type Results,
} from 'shared/feature-list'
import { recommendationRows, type RecommendationAnswer } from 'shared/recommendations'
import {
  clearKeys,
  componentTotals,
  isOrdered,
  linesFor,
  linesOf,
  listedItems,
  opensDescending,
  orderAssemblies,
  type ComponentSort,
} from 'shared/order-list'
import { groupReadings, sharedHoleDiameter } from 'shared/group-geometry'
import { groupOffer } from 'shared/group-offer'
import { usedElsewhere, usesByGuid } from 'shared/component-usage'
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
import { ColumnPicker, sameBound } from 'components/column-filter'
import { BUTTON_FILTERS, FACET_AXES } from 'components/filter-panel'
import { orderedCodes } from 'shared/column-order'
import { capRows, firstBy, keptFirst, oneEach } from 'shared/tool-order'
import {
  allTools as catalogTools,
  collets as allCollets,
  facets,
  familyName,
  getCollet,
  getHolder,
  getProfile,
  getTool,
  holders as allHolders,
} from 'shared/catalog'
import { useEscape } from 'shared/use-escape'
import {
  DRAFT_TREE,
  assemblyName,
  assemblyNamed,
  draftKeyFor,
  forThread,
  guidAt,
  defaultAssemblies,
  firstNode,
  isOverride,
  setSlot,
  heldIn,
  addAssembly,
  markOrdered,
  removeAssembly,
  renameAssembly,
  restoreAssembly,
  SLOTS,
  treeFromLines,
  useAssemblyTrees,
  type Slot,
  type TreeAssembly,
  type TreeNode,
} from 'shared/assembly-tree'
import { groupActions, lineOf, nothingToConfirm, savedFor } from 'shared/assembly-actions'
import {
  byShank,
  colletGapFor,
  holdersToOffer,
  narrowCollets,
  narrowTools,
  whyEmpty,
} from 'shared/assembly-narrowing'
import {
  COLLET_COLUMNS,
  HOLDER_COLUMNS,
  colletTypeLabel,
  hiddenByDefault as hiddenComponentColumns,
  holderTypeLabel,
} from 'shared/component-columns'
import { NO_QUERY, filterComponents, optionsOn, type ComponentQuery } from 'shared/component-query'
import { AssemblyTreePanel } from 'components/assembly-tree-panel'
import { AssemblyPanel } from 'components/assembly-panel'
import { ComponentTable } from 'components/component-table'
import { CLAMPING_KNOB, withClampingLength, type ClampingRule } from 'shared/clamping-length'
import {
  EMPTY_QUERY,
  countBy,
  countsByAxis,
  stillOffered,
  filterTools,
  queryFromSearch,
  searchWithQuery,
} from 'shared/filter'
import { applySuggestions, suggestionsFor } from 'shared/suggest-filters'
import {
  TOOL_TERM_AXES,
  askOfTapColumn,
  askOfToolColumn,
  narrowingNames,
  sayBound,
} from 'shared/column-filters'
import {
  DERIVED_AXES,
  HOLDING_AXES,
  colletSeries,
  holdableTools,
  splitHolding,
  tapers,
} from 'shared/holding'
import { sectionOf } from 'shared/section-of'
import { belowHolder, type BelowHolder } from 'shared/drawn-assembly'
import {
  drawable,
  holdable,
  holderOptions,
  policyOf,
  thresholdsFrom,
  type HolderOption,
} from 'shared/holder-choice'
import { closestMisses, closestPerForm, type Format } from 'shared/judge'
import {
  cautionedTypes,
  marksFor,
  overrideNote,
  shortfallMarks,
  testedCodes,
} from 'shared/tool-marks'
import { knobValue, knobsWith } from 'shared/rules'
import { OrderDialog } from 'components/order-dialog'
import { closeCandidates, tightestOf } from 'shared/tool-fit'
import { useUnit } from 'shared/use-unit'
import { usePartMaterial, usePreferences } from 'shared/use-preferences'
import { partHref, recallPart, rememberPart } from 'shared/part-session'
import { usePartUpload, type StartedPartUpload } from 'client/use-part-upload'
import { IDLE, groupOf as holeGroupOf, interactionFor } from 'shared/part-interaction'
import { arrowsFor, byLargest, keptFeatures, partHighlight } from 'shared/part-selection'
import {
  THREADED_FORMS,
  drillsFirst,
  formsAskingTaps,
  formsWithMills,
  tapBounds,
  boreOf,
  holeAt,
  holeDepthOf,
  holesAt,
  makersFor,
  PREDRILL_MILL_FORMS,
  millsShown,
  threadedFormsWith,
  predrillFormsOf,
} from 'shared/hole-mode'
import { hasSharpCorner } from 'shared/feature-defaults'
import { formOfTypeLabel, formsAsking, typeLabel, typesAsking } from 'shared/tool-type'
import { threadPanes } from 'shared/thread-panes'
import {
  drillFor,
  minorOf,
  millStandInNote,
  modeFor,
  predrillNote,
  threadNote,
  threadedName,
  type HoleMode,
  type ThreadSpec,
} from 'shared/threads'
import { useCatalogMatcher } from 'client/catalog-matcher'
import {
  matchKey,
  rehydrateVerdicts,
  type DetailedResult,
  type MatchContext,
  type MatchDemand,
} from 'shared/catalog-matcher'

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
/**
 * How many rows the tool table is handed at once.
 *
 * The kit's table sorts what it is given with a `concat` reduce — quadratic —
 * so the whole catalog costs seconds every time the table renders with new
 * data. Two thousand is a list somebody can work with and a cost nobody
 * notices; a feature's matched list is nearly always shorter, so this bites
 * while browsing rather than while answering. Raise or remove it once
 * `@toolpath/ui` fixes the reduce.
 */
const TABLE_ROW_CAP = 2000

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

/** A table-shaped first-load state; completed tables remain visible on later requests. */
const TablePlaceholder = ({ error }: { error: string | null }) => (
  <div
    role={error === null ? 'status' : 'alert'}
    className="relative flex min-h-0 flex-1 flex-col gap-px overflow-hidden bg-zinc-900/60"
  >
    {error === null ? (
      <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
        <span className="size-5 animate-spin rounded-full border-2 border-zinc-700 border-t-info" />
        <span className="sr-only">Finding compatible tools...</span>
      </div>
    ) : (
      <p className="relative z-10 p-4 text-sm text-danger">{error}</p>
    )}
    {Array.from({ length: 8 }, (_, index) => (
      <div
        key={index}
        className="grid h-10 grid-cols-[2fr_1fr_1fr_1fr] gap-6 bg-zinc-950 px-4 py-3"
      >
        <span className="animate-pulse rounded bg-zinc-800" />
        <span className="animate-pulse rounded bg-zinc-900" />
        <span className="animate-pulse rounded bg-zinc-900" />
        <span className="animate-pulse rounded bg-zinc-900" />
      </div>
    ))}
  </div>
)

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
/**
 * A key press the page must keep its hands off.
 *
 * Anything being typed into keeps its own keys, and so does the tool table:
 * its search box and its column filters answer for themselves.
 */
const busyTyping = (event: KeyboardEvent): boolean => {
  const target = event.target as HTMLElement | null
  const typing =
    target?.isContentEditable === true ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')
  return typing || target?.closest('[data-part-tool-table]') != null
}

/**
 * Whether a holder option has a silhouette to draw.
 *
 * **Only the holders that can be drawn are offered** (Paul, 2026-09-07:
 * "exclude any holders without models"). A record with no measured profile and
 * no published nose has no shape at all, so picking it draws a blank panel.
 * `drawable` is the rule and `holder-choice.ts` documents it; this is the one
 * place the catalog's own profile document is what answers it.
 *
 * The dropdown only. Whether a tool can be *held* is a different question from
 * whether its holder has a picture, and narrowing the tool list by this would
 * take tools off a shop's list because a vendor publishes no CAD.
 */
const hasPicture = (option: HolderOption): boolean =>
  drawable(option.holder, (guid: string) => getProfile(guid) !== null)

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
      void navigate(partHref({ partId: next.partId, jobId: nextJobId }))
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
   * The tool assembly tree — see the block below, which is where everything
   * derived from it lives.
   *
   * The hook sits here, beside the sheet it is the working half of, because
   * confirming a draft has to carry that draft's tree onto the row it becomes,
   * and `confirmDraft` is declared long before that block.
   */
  const {
    trees,
    read: treeNow,
    commit: commitTree,
    forget: forgetTree,
  } = useAssemblyTrees(report.partId)
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
   * Escape belongs to the page **only while nothing is open over it**.
   *
   * `useEscape` is a stack and the page is the bottom of it, so a dialog or a
   * filter panel opened over the part takes the press instead. Both used to
   * fire on one press, which put the panel away *and* dropped the reading
   * behind it.
   */
  useEscape(true, (event) => {
    if (busyTyping(event)) {
      return
    }
    escapeRef.current()
  })

  /**
   * The arrow keys belong to the page, not to a panel.
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
      if (busyTyping(event)) {
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
   * The part-level assembly being renamed, where one is.
   *
   * **Naming is offered, never demanded** (Paul, 2026-09-08: "it shouldn't
   * force me to name it immediately when I complete creating a tool assembly …
   * then I can rename if desired"). The press that makes the row is an order,
   * and a field opening over the row it just wrote made naming a step in
   * ordering; the row takes the name typed on the dialog's own card, or the
   * default, and right-click → *Rename…* is what sets this.
   */
  const [renamingId, setRenamingId] = useState<string | null>(null)
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
    /**
     * `assembly` is a stack the part needs and no feature asked for, being
     * built (Paul, 2026-09-08: "if I don't add anything to the order list when
     * creating a tool assembly, the command was cancelled and the empty tool
     * assembly row should not show"). It is a draft rather than a row for
     * exactly that reason: the press that puts it on the order list is what
     * makes the row, so backing out of one leaves nothing behind.
     */
    readonly kind: 'feature' | 'group' | 'assembly'
    readonly results: Results
    /** The row being edited, where this is an edit rather than a new one. */
    readonly editing: string | null
  } | null>(null)
  /** The groups standing open in the list. */
  const [openItems, setOpenItems] = useState<ReadonlyArray<string>>([])

  /**
   * What the group being built measures, at its worst.
   *
   * **A group is one tool for all of them**, so the numbers it is chosen
   * against are the hardest of its features' rather than any one feature's
   * (Paul, 2026-09-08) — and each says which feature it came from, because that
   * is the one to take back out when the answer is unacceptable. The fold is
   * `shared/group-geometry`; the whole part goes in so depth is still measured
   * from its top.
   */
  const draftReadings = useMemo(
    () =>
      draft?.kind === 'group'
        ? groupReadings(keptFeatures(report.features, kept), report.features)
        : [],
    [draft?.kind, kept, report.features],
  )

  /**
   * The features in the group being built, and the one bore they share.
   *
   * **A group of holes is threaded as a group** (Paul, 2026-09-09). The thread
   * is named on the reading panel and the group editor stands in its place, so
   * without this a bolt circle picked out there had to be taken apart again to
   * say it was tapped. A tap has one nominal size, so the control is offered
   * only where every feature in the group is a hole of one diameter — and where
   * they are holes that disagree, the box says so rather than going quiet.
   */
  const draftFeatures = useMemo(
    () => (draft?.kind === 'group' ? keptFeatures(report.features, kept) : []),
    [draft?.kind, kept, report.features],
  )
  const draftBore = useMemo(() => sharedHoleDiameter(draftFeatures), [draftFeatures])
  const draftMixedBores =
    draftBore === null &&
    draftFeatures.length > 1 &&
    draftFeatures.every((each) => boreOf(each) !== null)

  const selectedItem = useMemo(() => itemNamed(list, selectedId), [list, selectedId])

  /**
   * The row being worked on, which is the one exception to the rule below.
   *
   * A row selected, a row being edited, a row being named: each of them is a
   * decision somebody is in the middle of, and dropping it from under them
   * would take *+ Feature* with it — the row it makes has nothing ordered
   * against it until a tool is picked for it.
   */
  const workingIds = useMemo(
    () => [selectedId, draft?.editing ?? null, renamingId],
    [selectedId, draft?.editing, renamingId],
  )

  /**
   * The rows the order list draws.
   *
   * **Only what has been ordered** (Paul, 2026-09-09: "the list is only showing
   * confirmed tool assemblies that we have added to the order list explicitly,
   * not inferred assemblies for features that have had their assembly
   * removed"). A feature with nothing against it used to stay on the list and
   * be answered with the rules' own recommendation, which reads exactly like an
   * order and is not one — so removing every assembly from a feature left the
   * part page showing a tool the order-list page had never heard of.
   *
   * `shared/order-list` is the rule, and it is the same rule a part-level
   * assembly has followed since 2026-09-08.
   */
  const orderRows = useMemo(() => listedItems(list, sheet, workingIds), [list, sheet, workingIds])

  /**
   * Which way the list is read: the assemblies, or what they come to.
   *
   * **Two icons beside the heading** (Paul, 2026-09-09: "in the order list on
   * the parts page, this should be two icons next to ORDER LIST"). Buying is
   * not the same reading as planning — the same collet in six stacks is one
   * collet to order — and the page in the header offers the same two.
   */
  const [orderView, setOrderView] = useState<'assembly' | 'components'>('assembly')

  /**
   * Which column the components view is read by (Paul, 2026-09-09).
   *
   * Held here rather than in the panel: the panel is redrawn whenever the part
   * is, and a sort kept inside it would go with the redraw.
   */
  const [orderSort, setOrderSort] = useState<{
    readonly by: ComponentSort
    readonly descending: boolean
  }>({ by: 'kind', descending: false })

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
        /*
          **An assembly draft answers no face.** It is a stack for the part
          rather than for a feature, so a face clicked while one is open must
          not turn the table under it into that face's tools — the stack being
          built would be judged against a feature nobody chose it for.
        */
        preview: draft?.kind === 'assembly' ? null : kept,
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

  /**
   * The features the tool list is judged against, whichever of the four is
   * asking. Matching is intentionally deferred: the chips and the part
   * selection can paint before a large catalog calculation catches up.
   */
  const deferredAskedTags = useDeferredValue(askedNow.tags)
  const selectedFeatures = useMemo(
    () => keptFeatures(report.features, deferredAskedTags),
    [report.features, deferredAskedTags],
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
      // The two the columns ask, both of them phrases this catalog builds
      // rather than facets a vendor publishes: the type with its shank, and
      // the family with its product line. An axis the page does not declare is
      // dropped as somebody else's query parameter, which is how a filter set
      // in a header would fail to survive a reload.
      'type',
      'family',
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
  /**
   * **And whatever else the filter asks for** (Paul, 2026-09-08: "End mills are
   * technically a valid tool to predrill for the tap, just usually not the
   * first choice"). It was this list and the two forms the press writes, so a
   * type asked for in the Type column was judged, fitted, and then dropped on
   * its way to the screen. `predrillFormsOf` is the rule.
   */
  const predrillForms = useMemo(() => predrillFormsOf(query.terms.form ?? []), [query.terms.form])

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
  const [threads, setThreads] = useState<Readonly<Record<string, HoleChoice>>>({})

  /**
   * The hole the **filters** are written from: stood in at its predrill.
   *
   * **A threaded hole is filtered on the hole it will be drilled at, not the
   * one it is drawn at** (Paul, 2026-09-09: "shouldn't there be some closest
   * match drills shown here? There are certainly drills that meet the diameter
   * and flute length requirements"). They did meet them. The list is *judged*
   * against the predrill — `tableDemand` carries it as the feature's bore — and
   * was *filtered* by bounds `rangesFromRules` read off the modelled hole, so
   * on a #4-40 drawn at ⌀0.089 in the Diameter filter capped at ⌀0.093 in while
   * the form tap's predrill is ⌀0.099 in. Every drill that fits was cut by the
   * filter before a rule ever saw it, and the ⌀0.080 in end mills that sat
   * under the cap were the whole list — twelve drills in the catalog reach that
   * hole at that size.
   *
   * The mode is in it, so pressing *Form Tap* rewrites the bound the same way
   * choosing the thread wrote it: the two predrills are a different question
   * and the filters are what says so.
   */
  const askedThread = useMemo(
    () => (focused === null ? null : (threads[focused] ?? null)),
    [focused, threads],
  )

  const predrilled = useMemo(() => {
    const bore = askedThread?.spec == null ? null : drillFor(askedThread.spec, askedThread.mode)
    return reading === null || bore === null ? reading : holeAt(reading, bore)
  }, [reading, askedThread])

  const suggested = useRef(suggestionsFor(null, null))

  useEffect(() => {
    const next = applySuggestions(
      query,
      suggested.current,
      predrilled,
      materialGroup,
      report.features,
    )
    const made = suggestionsFor(predrilled, materialGroup, report.features)
    /**
     * **A threaded hole's forms are the thread's, and this write must not
     * overrule them** (Paul, 2026-09-09: "the tap type is no longer
     * automatically being enabled in tapped holes. It needs to be to show the
     * taps!").
     *
     * `applySuggestions` overrules `form` outright — which forms can cut a
     * thing is a fact about the thing — and the feature's own row says drills
     * and mills, because a hole is a hole before anybody threads it. That was
     * harmless while this effect ran on the feature alone; standing the hole in
     * at its predrill put the thread in its dependencies, so choosing the
     * thread now re-ran the write that erased the taps it had just added.
     *
     * The mills already ticked survive it, or the pair of effects would take
     * turns: this one putting the thread's forms back and the one below turning
     * the predrill mills back on.
     */
    const threaded =
      askedThread !== null && askedThread.mode !== 'plain' && askedThread.spec !== null
        ? threadedFormsWith(query.terms.form ?? [])
        : null
    const asked = threaded === null ? next : { ...next, terms: { ...next.terms, form: threaded } }
    suggested.current =
      threaded === null ? made : { ...made, terms: { ...made.terms, form: threaded } }
    if (searchWithQuery(search, asked, axes).toString() === search.toString()) {
      return
    }
    setSearch(searchWithQuery(search, asked, axes), {
      replace: true,
      preventScrollReset: true,
    })
    // Only when the feature, the predrill or the material changes: re-running on
    // every query edit would put back a filter somebody has just cleared. The
    // predrill is in it because cut and form are two different questions about
    // the same hole, and the bound that answers one is wrong for the other.
  }, [predrilled, askedThread, materialGroup])

  /**
   * What this feature asks of the filters, as a value rather than as a write.
   *
   * The ref above exists to tell a stale suggestion from somebody's answer, and
   * is deliberately not state. The filter dialog needs the same numbers on
   * screen — "the geometry asked for at most ⌀8.00 mm" — so it reads them
   * fresh: `suggestionsFor` is pure and this is the same call the effect makes.
   */
  const suggestions = useMemo(
    () => suggestionsFor(predrilled, materialGroup, report.features),
    [predrilled, materialGroup, report.features],
  )

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
  /**
   * The floor and the step `LBH` is worked out on, from the same sheet the
   * stickout control reads. Handed in rather than defaulted so the column, the
   * drawing and the stickout slider are one number: `LBH` is the setup length
   * since 2026-09-03, and a page re-deriving it under a different policy from
   * the one the assembly uses would put the disagreement straight back.
   */
  const stickoutPolicy = useMemo(() => policyOf(thresholdsFrom()), [])
  const allTools = useMemo(
    () => withClampingLength(catalogTools, clamping, stickoutPolicy),
    [clamping, stickoutPolicy],
  )
  const toolsByGuid = useMemo(() => new Map(allTools.map((tool) => [tool.guid, tool])), [allTools])
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
  const holeChoice: HoleChoice = (focused === null ? null : threads[focused]) ?? {
    mode: 'plain',
    spec: null,
  }
  const threadSpec = holeChoice.spec

  /**
   * A thread applies to **what is selected**, and to the holes in it (Paul,
   * 2026-09-09).
   *
   * It used to be written across `groupOf(focused)` — every hole on the part
   * identical to this one — which was right while a hole always stood for its
   * siblings and is wrong now that one can be asked about alone: threading the
   * hole somebody picked out would have named the other thirty-eight after a
   * thread nobody chose for them. So the scope is the row or the draft being
   * asked about, which is the whole group where the group is what is selected,
   * and the one hole where it is not.
   *
   * The bore is what keeps it off the pockets: `holesAt` says why.
   */
  const writeThread = useCallback(
    (choice: HoleChoice, over: ReadonlyArray<string>, bore: number) => {
      const scope = holesAt(report.features, over, bore)
      if (scope.length === 0) {
        return
      }
      setThreads((current) => {
        const made = { ...current }
        for (const tag of scope) {
          made[tag] = choice
        }
        return made
      })
    },
    [report.features],
  )

  /**
   * The tags one thread choice made on the reading applies to.
   *
   * The row or draft being asked about where the hole being read is part of it,
   * and the hole alone where it is not — a hole previewed on the part is asking
   * about itself.
   */
  const threadScope = useMemo(
    () =>
      focused === null
        ? []
        : askedNow.tags.includes(focused)
          ? askedNow.tags
          : ([focused] as const),
    [focused, askedNow.tags],
  )

  /**
   * What the group being built is threaded for.
   *
   * Read off the first hole in it that has an answer: the choice is written
   * across every hole of that bore in one go, so any one of them speaks for the
   * group. Plain until one of them says otherwise.
   */
  const draftThread: HoleChoice = kept.reduce<HoleChoice | null>(
    (held, tag) => held ?? threads[tag] ?? null,
    null,
  ) ?? { mode: 'plain', spec: null }

  /**
   * The hole whose offer of a group has been turned down.
   *
   * **Kept per reading** (Paul, 2026-09-09, asking for a *Just this hole*
   * beside the offer): the answer is about this hole, so walking to another one
   * asks again. Nothing is written by it — turning the offer down is simply not
   * taking it, and the footer's *Add this feature* is what it leaves behind.
   */
  const [aloneFor, setAloneFor] = useState<string | null>(null)
  /*
    **And it lasts exactly as long as that reading is held** (Paul, 2026-09-09:
    "if I choose 'just this hole' but then exit without adding a tool assembly
    to the order list, clicking the same hole again does not show the group
    again. It should"). Turning the offer down quiets it while somebody works on
    the hole in front of them; it is not an answer about the part, and a hole
    put down and clicked again is the question being asked afresh.
  */
  useEffect(() => {
    setAloneFor((current) => (current === null || current === focused ? current : null))
  }, [focused])

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

  /**
   * What the part is painted with, held still between renders.
   *
   * **The viewer repaints on identity** (Paul, 2026-09-07: "everything is quite
   * laggy now — the 3d model sticks"). Both of these were built in the middle of
   * the JSX — `new Set(highlighted)` and `heldRegions(selection)` — so every
   * render of this route handed the part two objects it had never seen before: a
   * keystroke in the search box, a hover on a table row, a tick of the matcher.
   * They now change when what they are derived from changes, which is what they
   * were always meant to mean.
   */
  const paintedSet = useMemo(() => new Set(highlighted), [highlighted])
  const heldRegionList = useMemo(() => heldRegions(selection), [selection])

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
   * Matching owns the expensive rules and holder sweep, so this route only
   * builds a cloneable question and rehydrates the worker's compact verdicts.
   */
  const {
    ready: matcherReady,
    table: tableMatch,
    recommendations: recommendationMatch,
    matchTable,
    matchRecommendations,
  } = useCatalogMatcher()
  /**
   * The geometry columns whose rules have been set aside, by code.
   *
   * **The filters are the last word, one column at a time** (Paul, 2026-09-08:
   * "I need the ability to override the geometric filters created by the
   * geometry — for example, I may want to use a larger tool than required …
   * the override the rules button should be in the filter dialog rather than
   * always shown, and should only override for that specific rule").
   *
   * The suggested ranges are written from the same `must` rows that go on to
   * judge every tool, so widening one asks for precisely the tools the rules
   * then remove — and the two together answered a deliberate question with an
   * empty table. Forgiving a column is confirmed in that column's own dialog,
   * and forgives that column alone: a tool the flute-length rows also turned
   * down stays off the list until somebody looks at that question too.
   *
   * Per question, and reset when the question changes: tools that do not fit
   * are not an answer to the next feature.
   */
  const [overriding, setOverriding] = useState<ReadonlyArray<string>>([])
  const overrideOn = useCallback(
    (code: string, on: boolean) =>
      setOverriding((current) =>
        on
          ? current.includes(code)
            ? current
            : [...current, code]
          : current.filter((each) => each !== code),
      ),
    [],
  )
  const tableContext = useMemo<MatchContext>(
    () => ({
      features: report.features,
      query: effectiveQuery,
      knobs,
      clamping,
      unit,
      holderFilters,
      margins,
      thresholds,
      overrides: overriding,
    }),
    [
      report.features,
      effectiveQuery,
      knobs,
      clamping,
      unit,
      holderFilters,
      margins,
      thresholds,
      overriding,
    ],
  )
  const tableDemand = useMemo<MatchDemand | null>(() => {
    if (!asking || perFeature) {
      return null
    }
    const bore = threadSpec === null ? null : drillFor(threadSpec, holeChoice.mode)
    const threaded = bore === null || focused === null ? [] : holeGroupOf(report.features, focused)
    const bores: Record<string, number> = {}
    if (bore !== null) {
      for (const tag of threaded) {
        if (askedNow.tags.includes(tag)) {
          bores[tag] = bore
        }
      }
    }
    return {
      demandKey: `table:${askedNow.tags.join('|')}`,
      tags: askedNow.tags,
      ...(Object.keys(bores).length === 0 ? {} : { bores }),
      reachTag: focused,
    }
  }, [asking, perFeature, threadSpec, holeChoice.mode, focused, report.features, askedNow.tags])
  const tableKey = useMemo(
    () => (tableDemand === null ? null : matchKey('table', tableContext, [tableDemand])),
    [tableContext, tableDemand],
  )
  useEffect(() => {
    if (matcherReady && tableDemand !== null) {
      matchTable(tableContext, [tableDemand])
    }
  }, [matcherReady, matchTable, tableContext, tableDemand])
  const answered =
    tableMatch.status === 'ready' && tableMatch.key === tableKey
      ? (tableMatch.results[0] ?? null)
      : null
  /**
   * The answer on screen, which is the last one until the next one lands.
   *
   * **A filter must not take the table away** (Paul, 2026-09-08: "when I am
   * actively creating an assembly for a feature, it still closes after the first
   * selection"). Narrowing a column rebuilds the matcher's question, and the
   * table was swapped for the loading skeleton for as long as the worker took —
   * which unmounts the list, and with it the filter menu the list is holding
   * open. One tick was the last tick.
   *
   * So an answer is kept for as long as the question is the same feature's, and
   * the list stays on screen under the pending veil below while the next answer
   * is worked out. A *different* feature is a different question and gets the
   * skeleton, because last feature's tools under this feature's name is a lie
   * rather than a stale reading.
   */
  const keptAnswer = useRef<{ ask: string; result: DetailedResult } | null>(null)
  const ask = tableDemand?.demandKey ?? null
  if (answered !== null && ask !== null) {
    keptAnswer.current = { ask, result: answered }
  }
  const detailed = answered ?? (keptAnswer.current?.ask === ask ? keptAnswer.current.result : null)
  const tableError =
    tableMatch.status === 'error' && tableMatch.key === tableKey ? tableMatch.message : null
  const fitting = useMemo(
    () => (detailed === null ? [] : rehydrateVerdicts(detailed.fitting, allTools)),
    [detailed, allTools],
  )
  /**
   * The removed tools that came closest — a slice, not the whole set: the
   * worker keeps the rest and sends the count and the tally instead.
   */
  const nearMisses = useMemo(
    () => (detailed === null ? [] : rehydrateVerdicts(detailed.nearMisses, allTools)),
    [detailed, allTools],
  )
  const narrowed = useMemo(() => {
    const kept = new Set(detailed?.narrowedGuids ?? [])
    return fitting.filter((verdict) => kept.has(verdict.tool.guid))
  }, [detailed, fitting])
  const held = useMemo(() => {
    const kept = new Set(detailed?.heldGuids ?? [])
    return fitting.filter((verdict) => kept.has(verdict.tool.guid))
  }, [detailed, fitting])
  const tightest = useMemo(() => tightestOf(detailed?.ruleTally ?? {}), [detailed])
  useEffect(() => setOverriding([]), [ask])
  const overridable = useMemo(
    () => (detailed === null ? [] : rehydrateVerdicts(detailed.overridable, allTools)),
    [detailed, allTools],
  )
  const overrideTools = useMemo(() => overridable.map((verdict) => verdict.tool), [overridable])
  /** The overridden columns in the words their headers use, for the note above the list. */
  const overridden = useMemo(
    () =>
      overriding
        .map((code) => TOOL_COLUMNS.find((column) => column.code === code)?.label.toLowerCase())
        .filter((label): label is string => label !== undefined)
        .join(' and '),
    [overriding],
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
   * Whether the drill half of a threaded hole came up with no **drill**.
   *
   * The list can be long and still hold none: a hole modelled at the cut tap's
   * size has no drill at the form tap's, and the end mills that can bore it
   * fill the table on their own. "Nothing fits" was the only state that stood
   * anything in, so that list read as the answer (Paul, 2026-09-09).
   */
  const shortOfDrills = useMemo(
    () => drillsOnly && !tools.some((each) => each.form === 'drill'),
    [drillsOnly, tools],
  )

  const closest = useMemo(() => {
    if (!asking || (tools.length > 0 && !shortOfDrills)) {
      return []
    }
    const admitted = closeCandidates(nearMisses, query)
    /**
     * **A tapped hole is drilled.** The nearest misses are drawn from what the
     * rules removed, and a mill that could interpolate the bore is a near miss
     * by that measure — but not an answer to "what drills this thread"; the
     * hole has to be at size before the tap goes anywhere near it (Paul,
     * 2026-08-31: "when a hole is threaded, we DON'T show endmills"). Unless
     * this hole's shop has asked for them (Paul, 2026-09-02), in which case
     * they are in the list and its near misses alike, behind the drills.
     */
    if (holeChoice.mode === 'plain') {
      return [
        // What the rules allow but no holder reaches comes first: it is the
        // nearest miss there is, and the one somebody can do something about.
        ...outOfReach,
        ...closestMisses(admitted, 8).map((verdict) => verdict.tool),
      ]
    }
    /*
      **Drills, where drills are the thing that is missing.** Standing in for an
      empty list means every form the shop asked for; standing in for the drills
      alone, over a table the mills have already filled, means the drills — a
      near-miss mill under a mill that fits is the same tool twice.
    */
    const forms = tools.length > 0 ? ['drill'] : predrillForms
    /*
      **Eight of each form, not the eight nearest of all of them** (Paul,
      2026-09-09: "we should always show closest match tools if none meet the
      feature requirements"). A drill misses a ⌀0.089 in predrill by the width
      of the next size up; an end mill misses the helix limit or the flute
      length by more — so ranked together the drills take every slot and the
      mills this list had just turned on were nowhere, under a note saying they
      were being shown. `closestPerForm` ranks each form in its own list.
    */
    return drillsFirst([
      ...outOfReach.filter((each) => forms.includes(each.form)),
      ...closestPerForm(admitted, forms, 8).map((verdict) => verdict.tool),
    ])
  }, [
    asking,
    tools.length,
    shortOfDrills,
    nearMisses,
    query,
    holeChoice.mode,
    outOfReach,
    predrillForms,
  ])
  /**
   * **No drill makes it, so the mills that can are turned on** (Paul,
   * 2026-09-09: "automatically show end mills that could bore the predrill
   * diameter of the selected hole(s) - meaning add flat and bull nose end mills
   * to the type filter").
   *
   * Written into the **filter** rather than into the list, which is this page's
   * rule for anything a threaded hole decides: the rail is the last word on
   * what a list holds, so a shop that does not want them can untick them where
   * they are shown.
   *
   * Once per question, and that is what the ref is for: writing it on every
   * render would put the mills back the moment somebody took them off, which is
   * a filter that cannot be cleared. A new feature or the other tap is a new
   * question and gets one more write.
   */
  const milledFor = useRef<string | null>(null)
  useEffect(() => {
    if (!asking || !shortOfDrills) {
      return
    }
    const question = `${askedNow.tags.join('|')}:${holeChoice.mode}`
    if (milledFor.current === question) {
      return
    }
    milledFor.current = question
    const forms = query.terms.form ?? []
    if (millsShown(forms).length > 0) {
      return
    }
    applyTerm('form', [...forms, ...PREDRILL_MILL_FORMS])
  }, [asking, shortOfDrills, askedNow.tags, holeChoice.mode, query.terms.form, applyTerm])

  const listed = useMemo(() => {
    const shownTools = !asking
      ? catalogList
      : /*
          **What a forgiven column removed goes under what the rules kept, not
          instead of it.** An override widens the answer rather than replacing
          it: a shop reaching for a larger cutter still wants to see the ones
          that fit above it, and the near misses have nothing to stand in for
          once the list is not empty. `fitting` and `excluded` are disjoint by
          construction, but what a forgiven column offers and what the fill
          stands in with are both drawn from `excluded` — so `oneEach` is what
          keeps a tool that is in both from being drawn twice.
        */
        overrideTools.length > 0
        ? oneEach([...tools, ...overrideTools, ...closest])
        : tools.length > 0
          ? [...tools, ...closest]
          : closest
    if (!drillsOnly) {
      return shownTools
    }
    // Drills lead: a mill that lands on the predrill would otherwise outrank
    // every drill on the sheet's "closest to the hole diameter" row.
    return drillsFirst(shownTools.filter((each) => predrillForms.includes(each.form)))
  }, [asking, catalogList, tools, closest, overrideTools, drillsOnly, predrillForms])
  /**
   * What each axis would leave, counted against every other filter.
   *
   * This is what lets the panel narrow itself — a vendor chosen takes the
   * other vendors' families off the family axis — and it is measured without
   * the axis's own term, so choosing one vendor does not hide the rest
   * (Paul, 2026-09-01).
   *
   * **Over the rows the list is actually holding**, which is what "offer what
   * is there" means. A feature's list has already been answered against the
   * query — the matcher applied it — so the query is not applied a second time
   * here: the nearest misses stand in when nothing fits, and they are outside
   * the query by construction, which counted four rows on screen as nothing to
   * narrow by. Without a feature the pool is the whole catalog, so there the
   * query is what makes the counts mean anything.
   */
  const axisCounts = useMemo(
    () =>
      asking
        ? countsByAxis(listed, EMPTY_QUERY, FACET_AXES)
        : countsByAxis(allTools, effectiveQuery, FACET_AXES),
    [asking, allTools, listed, effectiveQuery],
  )
  /**
   * What each axis is offering, which is not always what it can still count.
   *
   * `shared/filter.ts` § `stillOffered` has the reason: with a feature on the
   * screen the counts are measured over what the matcher judged, and the
   * matcher only judges what the terms already admit — so an axis that has been
   * narrowed can only report itself, and a second vendor was unreachable. It
   * keeps offering the list it last had instead. The memory is this feature's:
   * another question is another set of values, and carrying one over would
   * offer the last feature's vendors under this one's name.
   */
  const offeredAxes = useRef(new Map<string, ReadonlyMap<string, number>>())
  const askedOf = useRef<string | null>(null)
  const axisOptions = useMemo(() => {
    if (askedOf.current !== ask) {
      askedOf.current = ask
      offeredAxes.current = new Map()
    }
    const offered = new Map<string, ReadonlyMap<string, number>>()
    for (const axis of FACET_AXES) {
      const counts = axisCounts.get(axis) ?? new Map<string, number>()
      offered.set(
        axis,
        asking
          ? stillOffered(counts, query.terms[axis] ?? [], offeredAxes.current.get(axis))
          : counts,
      )
    }
    offeredAxes.current = offered
    return offered
  }, [asking, axisCounts, query.terms, ask])

  /** One axis's values as the pickers read them, however they were arrived at. */
  const countsOn = useCallback(
    (axis: string): ReadonlyMap<string, number> => axisOptions.get(axis) ?? countBy(listed, axis),
    [axisOptions, listed],
  )

  /**
   * A drill on the list brings its own column with it, and takes it away
   * again when the drills go — it is the number a drill is chosen on and dead
   * weight for everything else (Paul, 2026-08-31). Toggled by hand it stays
   * where it was put; `touchedColumns` is what somebody decided themselves.
   */
  const hasDrills = useMemo(() => listed.some((each) => each.form === 'drill'), [listed])
  /**
   * Whether an end mill actually reached the list, which is what the
   * stand-in note may say (`shared/threads.ts` § `millStandInNote`). Read off
   * the rows rather than off the filter: the filter is what was asked for, and
   * the sentence is about what came back.
   */
  const millsListed = useMemo(
    () => listed.some((each) => PREDRILL_MILL_FORMS.includes(each.form)),
    [listed],
  )
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
   * What the tool table's own headings ask, and where their answers go.
   *
   * The counts are the panel's — measured against every filter but the axis's
   * own — so a vendor already chosen still lists the other vendors with what
   * each would bring back, rather than itself and eight zeroes.
   */
  /**
   * What a column's dialog offers when its number no longer matches the
   * geometry's.
   *
   * Offered for every range column while a feature is being asked about; what
   * is *shown* is the dialog's own rule — `column-filter.tsx` §
   * `overrideOffered` — because whether a number is somebody's own is a
   * question about the number, and the dialog is holding it. `suggested` is
   * what the geometry asked for, or nothing where it asked nothing; the count
   * is the matcher's, measured over the whole removed set, and
   * `shared/tool-fit.ts` § `overridableTally` says why a tool two columns turn
   * down is counted under neither.
   */
  const overrideFor = useCallback(
    (code: string) => {
      if (!asking) {
        return undefined
      }
      const suggested = suggestions.ranges[code]
      const ask = askOfToolColumn(code)
      return {
        suggested,
        available: detailed?.overridableByCode[code] ?? 0,
        on: overriding.includes(code),
        /**
         * **The number and the forgiveness are one decision** (Paul,
         * 2026-09-08: "if override rules is off, it should go back to the
         * filter defined by the geometry — right now it is keeping the
         * override"). Dropping only the forgiveness left the widened bound
         * standing over a list the rules then emptied — the exact dead end this
         * whole control exists to remove, reached by pressing the control.
         *
         * So this goes one way, and the number is the way back: clearing it or
         * typing the geometry's own number in drops the override with it, in
         * the effect below. There is no press that turns one off any more,
         * because the press that did was the one that could leave the two
         * halves disagreeing (Paul, 2026-09-09).
         */
        onOverride: () => overrideOn(code, true),
        say: (bound: { readonly min?: number; readonly max?: number }) =>
          sayBound(ask?.shape === 'range' ? ask.kind : 'length', bound, unit),
      }
    },
    [asking, suggestions, detailed, overriding, overrideOn, unit],
  )

  /**
   * An override that is back on the geometry's own number is not an override.
   *
   * Clearing or restoring the bound is the way out of one, and leaving it
   * standing would keep tools on the list that the filter above them no longer
   * asks for — with nothing on screen still saying why.
   */
  useEffect(() => {
    setOverriding((current) => {
      const kept = current.filter((code) => {
        const bound = query.ranges[code]
        if (bound === undefined || (bound.min === undefined && bound.max === undefined)) {
          return false
        }
        const suggested = suggestions.ranges[code]
        return suggested === undefined || !sameBound(bound, suggested)
      })
      return kept.length === current.length ? current : kept
    })
  }, [query.ranges, suggestions])

  /**
   * Every value each axis has, so a contextual list can say what it is not
   * showing.
   *
   * **A column can only offer what the list is holding, and that is not always
   * the whole question** (Paul, 2026-09-08: "there is no way to show end mills
   * if I can't find a drill … I should always have a '...' row at the bottom of
   * the recommended filter options to expand any filter to show what it's
   * hiding from the list in any filter that is limited contextually"). With a
   * feature on screen the counts are measured over the rows the matcher
   * answered with, so a threaded hole's Type column offered `Drill` and nothing
   * else — and the way to ask for anything more was gone.
   *
   * The whole catalog rather than the filtered one: what is behind the `…` is
   * the values that exist, and a value another filter is holding back is still
   * a value pressing this one could bring in.
   */
  const everyValue = useMemo(() => {
    const counts = new Map<string, ReadonlyMap<string, number>>()
    // The axes a column narrows on with words: a range column says what it is
    // hiding with its own two numbers, and has an override besides.
    for (const axis of TOOL_TERM_AXES) {
      counts.set(axis, countBy(allTools, axis))
    }
    return counts
  }, [allTools])

  /** One axis's values that are not on the list, in the words the rows use. */
  const hiddenOn = useCallback(
    (axis: string): ReadonlyArray<{ value: string; label: string }> => {
      // Without a feature the options already are the whole catalog; there is
      // nothing behind them, and a `…` row offering nothing is noise.
      if (!asking) {
        return []
      }
      const offered = axisOptions.get(axis)
      return [...(everyValue.get(axis) ?? new Map<string, number>()).keys()]
        .filter((value) => !(offered?.has(value) ?? false))
        .map((value) => ({ value, label: axis === 'family' ? familyName(value) : value }))
        .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
    },
    [asking, axisOptions, everyValue],
  )

  /**
   * The forms the page itself put in the filter, which a tick may add to and
   * never takes away.
   *
   * Not the sheet's suggestion alone: choosing a thread replaces it with
   * {@link THREADED_FORMS}, so on a threaded blind hole the sheet still says
   * `flat end mill` while the page says drill and taps. Reading the suggestion
   * there would have left an end mill in the filter after its tick came off —
   * the switch nobody can find their way back out of.
   */
  const baseForms = useMemo(
    () => (holeChoice.mode === 'plain' ? (suggestions.terms.form ?? []) : THREADED_FORMS),
    [holeChoice.mode, suggestions.terms.form],
  )

  /**
   * What the Type column is narrowing on, including what the page put there.
   *
   * **A filter the page set itself is still a filter, and the header has to
   * say so** (Paul, 2026-09-09). The feature's tool types and a thread's
   * drill-and-taps are written to the `form` axis, which has no column; the
   * Type column asks the same question in the trade's phrases, so it reads its
   * ticks off the forms until somebody answers it themselves.
   * `shared/tool-type.ts` § `typesAsking` is the rule.
   */
  const shownTypes = useMemo(
    () => typesAsking(query.terms.form ?? [], query.terms.type ?? [], [...countsOn('type').keys()]),
    [query.terms.form, query.terms.type, countsOn],
  )

  /**
   * A type ticked is a form asked for.
   *
   * **The Type column narrows on a phrase, and the phrase is not what decides
   * whether a tool is judged** — the `form` filter is, and choosing a thread
   * writes the drill and the taps into it. So ticking `Flat end mill` on a
   * threaded hole narrowed a list of drills to nothing rather than asking for
   * end mills, which is the whole of what somebody meant by pressing it.
   *
   * `formsAsking` (`shared/tool-type.ts`) is the rule, and it is symmetric: the
   * geometry's own forms are never taken away, and unticking gives back only
   * what that tick added.
   */
  const applyToolTerm = useCallback(
    (axis: string, values: ReadonlyArray<string>) => {
      const forms = query.terms.form ?? []
      if (axis !== 'type' || forms.length === 0) {
        applyTerm(axis, values)
        return
      }
      const next = formsAsking(forms, baseForms, shownTypes, values)
      const terms: Record<string, ReadonlyArray<string>> = { ...query.terms }
      // Empty is unconstrained on either axis, and an axis constraining nothing
      // is written as absent rather than as an empty list — `applyTerm`'s rule.
      for (const [key, kept] of [
        ['form', next],
        ['type', values],
      ] as const) {
        if (kept.length === 0) {
          delete terms[key]
        } else {
          terms[key] = kept
        }
      }
      apply({ ...query, terms })
    },
    [query, applyTerm, apply, baseForms, shownTypes],
  )

  /**
   * The query as the headings read it: the ticks the page put on the Type
   * column standing beside the ones somebody set.
   *
   * Only what is drawn — the matching runs off `effectiveQuery`, and writing
   * these phrases into the filters themselves would make every other writer of
   * the `form` axis leave a stale `type` behind it.
   */
  const shownQuery = useMemo(
    () =>
      shownTypes.length === 0 ? query : { ...query, terms: { ...query.terms, type: shownTypes } },
    [query, shownTypes],
  )

  const toolFiltering = useMemo(
    () => ({
      search: { value: numberSearch, onChange: setNumberSearch },
      catalog: {
        query: shownQuery,
        onTerm: applyToolTerm,
        onRange: applyRange,
        options: (axis: string) =>
          [...countsOn(axis)]
            .map(([value, count]) => ({
              value,
              // A family is stored as the vendor's line, or as the family id
              // where it names none, and read out under the vendor's own
              // title. Everything else is already the words the cells show.
              label: axis === 'family' ? familyName(value) : value,
              count,
            }))
            .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true })),
        override: overrideFor,
        hidden: hiddenOn,
      },
    }),
    [shownQuery, applyToolTerm, applyRange, countsOn, numberSearch, overrideFor, hiddenOn],
  )

  /**
   * The kinds of tap the thread turned up, counted over the whole pool.
   *
   * Over `makers.made` rather than over the rows on show, so a phrase somebody
   * has just unticked is still there to tick back on — an axis never narrows
   * itself, which is the filter panel's own rule.
   */
  const tapTypes = useMemo(
    () =>
      [...countBy(makers.made, 'type')]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true })),
    [makers.made],
  )

  /** Which kinds of tap the form filter is asking for, as the column's ticks. */
  const shownTapTypes = useMemo(
    () =>
      typesAsking(
        query.terms.form ?? [],
        [],
        tapTypes.map((each) => each.value),
      ),
    [query.terms.form, tapTypes],
  )

  /**
   * A tick on the tap list's Type column is a tap form asked for.
   *
   * `shared/hole-mode.ts` § `formsAskingTaps` is the rule: it moves the taps in
   * the `form` axis and leaves the drill half alone, so answering the tap half
   * cannot empty the drill list on the tab beside it.
   */
  const applyTapTerm = useCallback(
    (axis: string, values: ReadonlyArray<string>) => {
      if (axis !== 'type') {
        applyTerm(axis, values)
        return
      }
      applyTerm(
        'form',
        formsAskingTaps(
          query.terms.form ?? [],
          values.flatMap((label) => formOfTypeLabel(label) ?? []),
        ),
      )
    },
    [applyTerm, query.terms.form],
  )

  /**
   * The taps narrow on their catalog number and which kind of tap they are.
   *
   * **Everything else about them is the thread's** (Paul, 2026-09-09: "when I
   * am in the TAPs row or table, it should be filtering to taps"). They are
   * swept out of the whole catalog by the thread — the tool filters never reach
   * `makersFor` — so a funnel on the tap list's Vendor or Flute length heading
   * would be a control that changes nothing, and the list carried none at all
   * while the chrome over it counted three filters. `askOfTapColumn` is the
   * pair it does answer.
   *
   * Offered only while the `form` axis is saying something, which on a threaded
   * hole is always: choosing a thread writes `THREADED_FORMS`. With the filters
   * cleared the list is genuinely unconstrained, the column has no answer to
   * show, and a tick would then be the only form in the filter — which is the
   * one shape that would empty the drills.
   */
  /**
   * The two numbers the thread and the depth put on this list, as bounds.
   *
   * Read once and used twice — by the headings that state them and by the count
   * beside them — because a number on a funnel and a number in `Clear n
   * filters` that disagree is the defect this whole session has been chasing.
   */
  const tapRanges = useMemo(
    () => (threadSpec === null ? {} : tapBounds(threadSpec, threadReach)),
    [threadSpec, threadReach],
  )

  const tapFiltering = useMemo(
    () => ({
      search: { value: numberSearch, onChange: setNumberSearch },
      ask: askOfTapColumn,
      ...((query.terms.form ?? []).length === 0
        ? {}
        : {
            catalog: {
              query: {
                ...EMPTY_QUERY,
                terms: { type: shownTapTypes },
                ranges: tapRanges,
              },
              onTerm: applyTapTerm,
              options: () => tapTypes,
              /*
                Stated, not asked: `onRange` is absent, so the two headings say
                the number and where it came from instead of offering boxes.
                The list is swept on them — and a short list's near misses are
                the very rows that break them, which a filter would hide along
                with the reason it was showing them.
              */
              stated: (code: string) =>
                threadSpec === null
                  ? undefined
                  : code === 'DC'
                    ? `Every tap the ${threadSpec.name} thread takes. The list is swept on it rather than filtered, so there is nothing to change here.`
                    : code === 'LCF' && threadReach !== null
                      ? `The thread has to cover the ${formatLength(threadReach.depth, unit)} depth of what is selected. A tap that falls short is on the list only when nothing reaches, and its length is painted red.`
                      : undefined,
            },
          }),
    }),
    [
      numberSearch,
      query.terms.form,
      shownTapTypes,
      applyTapTerm,
      tapTypes,
      tapRanges,
      threadSpec,
      threadReach,
      unit,
    ],
  )

  /**
   * Putting the tap list back to what the part says.
   *
   * **Every one of its three narrowings is the part's**, which is what makes
   * this the whole of clearing it: the kinds of tap are the thread's forms, and
   * the diameter and the length are the thread's and the depth's — there is no
   * narrower state to return to, and the count stays where it was because the
   * part is still narrowing the list. What it puts back is the tap half of the
   * form filter, and the tap half only, the same halves `formsAskingTaps` keeps
   * apart: clearing the list somebody is looking at must not silently widen the
   * one on the tab beside it.
   */
  const clearTapFilters = useCallback(() => {
    setNumberSearch('')
    applyTerm(
      'form',
      formsAskingTaps(query.terms.form ?? [], [
        ...new Set(tapTypes.flatMap((each) => formOfTypeLabel(each.value) ?? [])),
      ]),
    )
  }, [applyTerm, query.terms.form, tapTypes])

  /**
   * What the rules said about each tool, column by column — a tick on what
   * they read and passed, the field that failed in red, three words for why.
   */
  const tested = useMemo(
    () => (reading ? testedCodes(reading, report.features) : new Set<string>()),
    [reading, report.features],
  )
  const byGuid = useMemo(
    () =>
      new Map(
        [...fitting, ...nearMisses, ...overridable].map((verdict) => [verdict.tool.guid, verdict]),
      ),
    [fitting, nearMisses, overridable],
  )
  /**
   * Whether the rules turned this tool down, whichever list put it on screen.
   *
   * **The mark is about the verdict, not about the switch.** The nearest misses
   * stand in when nothing fits, and they are removed tools too — so a row picked
   * out of *that* list is as much an override as one picked with the switch on,
   * and asking which list a row came from would have marked one and not the
   * other. A tool the rules kept has nothing in `removed` by construction.
   */
  const removedByRules = useCallback(
    (guid: string) => (byGuid.get(guid)?.removed.length ?? 0) > 0,
    [byGuid],
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
  const choiceKey = useMemo(() => {
    if (focused === null) {
      return '*'
    }
    /*
      **The row's key, where a row holds this reading** (Paul, 2026-09-09).
      It used to be the *hole group's* first tag, which was the same thing while
      every row held whole hole groups — a hole cannot be asked about alone any
      more than a bolt circle could. It is not the same thing now: a feature
      made from the second hole of a group is keyed by that hole, and a panel
      still keying by the first wrote its lines where nothing read them.

      Reading the list is also the honest way to state the 2026-09-02 rule: a
      sibling clicked on a group already on the list updates that group's line
      rather than opening a second one beside it, whatever grouping is doing.
    */
    const holder = list.find((item) => item.tags.includes(focused))
    return holder ? (sheetKeysOf(holder)[0] ?? focused) : focused
  }, [focused, list])

  /**
   * What is already kept for the feature being read.
   *
   * Reading a feature from its card is returning to a decision, so the tools
   * that decision holds go to the top of the list (Paul, 2026-08-31).
   */
  const keptHere = useMemo(
    () =>
      new Set(
        /*
          Every key the row stands for, not the one under the mouse: a bolt
          circle's lines are written under all eight of its holes, and reading
          one of them made the same decision look kept on one hole and unkept on
          the next (Paul, 2026-09-09).
        */
        linesOf(sheet, [
          choiceKey,
          ...(selectedItem === null ? [] : sheetKeysOf(selectedItem)),
        ]).map((choice) => choice.toolGuid),
      ),
    [sheet, choiceKey, selectedItem],
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
        const chosenCollet = picked[each.guid]?.colletGuid
        const series =
          chosenCollet == null ? undefined : (getCollet(chosenCollet)?.series ?? undefined)
        // Only the holders that can be drawn — `hasPicture` above says why, and
        // `undrawable` below reports what that hid.
        const options = optionsFor(each).filter(hasPicture)
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
       * How many holders were left off for having no picture, so the panel can
       * say so rather than showing an empty dropdown (Paul, 2026-09-07).
       */
      undrawable: (each) => optionsFor(each).filter((option) => !hasPicture(option)).length,
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
      /*
        `toolsByGuid`, not `getTool`: this page's tools are the catalog's
        carried through `withClampingLength`, so the catalog's own copy is the
        same cutter set up at a different length. Everything below reads a
        stickout off this.
      */
      (chosenTool === null ? undefined : toolsByGuid.get(chosenTool)) ??
      (chosenTool === null ? (held[0]?.tool ?? null) : null),
    [chosenTool, held, toolsByGuid],
  )
  /**
   * True while the list is showing the taps rather than the tools.
   *
   * **A threaded hole opens on its taps** (Paul, 2026-09-02: "taps should be
   * active, which should be the default when a hole is defined as threaded"),
   * and there is no longer a tab that says otherwise: the pair of stacks in the
   * tree is the pair of tabs, so which list a threaded hole is showing is the
   * stack that is open — `tappingNow` — and this is only what it opens on.
   */
  const tapping = threadSpec !== null
  const tablePending =
    tableMatch.status === 'pending' && tableMatch.key === tableKey && !perFeature && !tapping

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
    /*
      **And by which kind of tap the filter is asking for** (Paul, 2026-09-09).
      The whole `form` axis rather than its tap half: a filter naming forms and
      no tap among them is a question this list has no answer to, where an empty
      axis is nobody asking. `hole-mode.ts` § `formsAskingTaps` is what writes it.
    */
    const forms = query.terms.form ?? []
    const asked =
      forms.length === 0 ? makers.made : makers.made.filter((each) => forms.includes(each.form))
    return wanted === ''
      ? asked
      : asked.filter((each) => `${each.catalogNumber} ${each.brand}`.toLowerCase().includes(wanted))
  }, [makers.made, numberSearch, query.terms.form])

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
    return panes.tap ?? tool ?? shownRows[0] ?? null
  }, [chosenTool, threadSpec, tool, shownRows, tapRows])

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

  /** What kind of feature this is, as the kernel reports it — before any thread. */
  const kindOf = useCallback(
    (featureTag: string) => {
      const feature = report.features.find((each) => each.featureTag === featureTag)
      return feature
        ? featureRow({ feature, features: report.features, regions: report.regions, unit }).type
        : 'Feature'
    },
    [report.features, report.regions, unit],
  )

  /**
   * What one feature is called, drawn with, and cut from — the list's three
   * columns.
   *
   * **A thread is part of the name** (Paul, 2026-09-08: "once a thread is
   * applied to a hole, the feature should be named '<thread spec> <type of
   * hole> Hole'"). Forty-two holes read as `Blind Hole` whether they were
   * clearance holes or M8×1.25, and which of the two decides every tool on the
   * assembly under them; the spec was a combobox somebody had to select the row
   * to see. `threadedName` is the rule, and `kindOf` is still the kernel's own
   * word for anything that has to be told apart by kind.
   */
  const nameOf = useCallback(
    (featureTag: string) => threadedName(kindOf(featureTag), threads[featureTag]?.spec ?? null),
    [kindOf, threads],
  )

  /**
   * The same name in a sentence: `Cuts the #4-40 UNC blind hole`.
   *
   * The kind is lowercased and the spec is not — `#4-40 unc` is not how a shop
   * writes it, and lowercasing the whole name is what naming through
   * `nameOf` would do here.
   */
  const namedInline = useCallback(
    (featureTag: string) =>
      threadedName(kindOf(featureTag).toLowerCase(), threads[featureTag]?.spec ?? null),
    [kindOf, threads],
  )
  const iconOf = useCallback(
    (featureTag: string) => {
      const feature = report.features.find((each) => each.featureTag === featureTag)
      /*
        The kernel's kind rather than the name: the icon is picked by what the
        feature *is*, and a thread in front of it is a word `BY_KIND` has never
        heard of.
      */
      return feature ? (
        <KindIcon featureType={feature.featureType} kind={kindOf(featureTag)} />
      ) : null
    },
    [report.features, kindOf],
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

  const recommendationDemandKey = useCallback((tags: ReadonlyArray<string>) => tags.join('|'), [])
  /**
   * Saved choices are local and immediate. Every unresolved question becomes
   * one item in a single worker batch rather than a render-time matcher call.
   */
  const recommendationInputs = useMemo(() => {
    const answers = new Map<string, RecommendationAnswer>()
    const demands = new Map<string, MatchDemand>()
    const add = (
      tags: ReadonlyArray<string>,
      /**
       * Whether this row asks about no feature at all — a part-level assembly.
       *
       * There is nothing to match it against, so it is never a demand: what it
       * is answered with is whatever somebody put in its stacks, read off the
       * bill below. Sending it as a demand would ask the worker "which tool
       * cuts these no features", which is the question `asked()` refuses to let
       * the table ask.
       */
      featureless = false,
    ) => {
      const key = recommendationDemandKey(tags)
      if (answers.has(key) || demands.has(key)) {
        return
      }
      const decided = linesOf(sheet, tags)
      const picks = decided.flatMap((line) => {
        const tool = toolsByGuid.get(line.toolGuid)
        return tool === undefined
          ? []
          : [
              {
                tool,
                holder:
                  line.holderGuid == null
                    ? null
                    : (getHolder(line.holderGuid)?.catalogNumber ?? null),
                collet:
                  line.colletGuid == null
                    ? null
                    : (getCollet(line.colletGuid)?.catalogNumber ?? null),
              },
            ]
      })
      if (picks.length > 0) {
        answers.set(key, { picks, chosen: true })
        return
      }
      if (featureless) {
        // Nothing chosen in it yet: the row says so with a dash rather than
        // spinning on a question nobody asked.
        answers.set(key, { picks: [], chosen: true })
        return
      }
      const bores = Object.fromEntries(
        tags.flatMap((tag) => {
          const choice = threads[tag]
          const bore = choice?.spec ? drillFor(choice.spec, choice.mode) : null
          return bore === null ? [] : [[tag, bore] as const]
        }),
      )
      demands.set(key, {
        demandKey: key,
        tags,
        ...(Object.keys(bores).length === 0 ? {} : { bores }),
        reachTag: tags[0] ?? null,
      })
    }
    for (const item of orderRows) {
      if (item.kind === 'group' && item.results === 'each') {
        for (const tags of distinctIn(item.tags)) {
          add(tags)
        }
      } else {
        // `sheetKeysOf`, so a part-level assembly is answered under the key its
        // own lines are kept under — `recommendations.ts` reads it the same way.
        add(sheetKeysOf(item), item.kind === 'assembly')
      }
    }
    if (draft?.kind === 'group' && draft.results === 'each') {
      for (const tags of distinctIn(kept)) {
        add(tags)
      }
    }
    return { answers, demands: [...demands.values()] }
  }, [
    orderRows,
    draft,
    kept,
    recommendationDemandKey,
    sheet,
    toolsByGuid,
    allHolders,
    allCollets,
    threads,
    distinctIn,
  ])
  const recommendationKey = useMemo(
    () =>
      recommendationInputs.demands.length === 0
        ? null
        : matchKey('recommendations', tableContext, recommendationInputs.demands),
    [tableContext, recommendationInputs.demands],
  )
  useEffect(() => {
    if (matcherReady && recommendationInputs.demands.length > 0) {
      matchRecommendations(tableContext, recommendationInputs.demands)
    }
  }, [matcherReady, matchRecommendations, tableContext, recommendationInputs.demands])
  const recommendationAnswers = useMemo(() => {
    const answers = new Map(recommendationInputs.answers)
    const results =
      recommendationMatch.status === 'ready' && recommendationMatch.key === recommendationKey
        ? new Map(recommendationMatch.results.map((result) => [result.demandKey, result]))
        : new Map()
    for (const demand of recommendationInputs.demands) {
      const result = results.get(demand.demandKey)
      if (result?.state === 'ready' && result.toolGuid !== null) {
        const tool = toolsByGuid.get(result.toolGuid)
        answers.set(
          demand.demandKey,
          tool === undefined
            ? 'error'
            : { picks: [{ tool, holder: null, collet: null }], chosen: false },
        )
      } else if (result?.state === 'nothing-fits') {
        answers.set(demand.demandKey, 'nothing-fits')
      } else if (
        recommendationMatch.status === 'error' &&
        recommendationMatch.key === recommendationKey
      ) {
        answers.set(demand.demandKey, 'error')
      } else {
        answers.set(demand.demandKey, 'pending')
      }
    }
    return answers
  }, [recommendationInputs, recommendationMatch, recommendationKey, toolsByGuid])

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
    /*
      Every tag being asked about, read together — the same union the list and
      the order-list page read, so a tool cannot be on the bill for a feature
      and missing from what the panel offers about it.
    */
    return linesOf(sheet, askedNow.tags).map((choice) => choice.toolGuid)
  }, [asking, askedNow.tags, sheet])

  /**
   * The order list, as the stacks on it — the same list the order-list page
   * draws, built by the same function (`shared/order-list`).
   */
  const orderStacks = useMemo(
    () => orderAssemblies(orderRows, sheet, nameOf),
    [orderRows, sheet, nameOf],
  )

  /**
   * The same list added up by component: what to buy, and how many.
   *
   * A guid that no longer resolves says so rather than being dropped — Justin
   * Gray's rule that a reference lives, kept since 2026-08-10: a bill that
   * quietly lost a line would report a part as tooled when it is not.
   */
  const tallyRows = useMemo<Array<ComponentTallyRow>>(
    () =>
      componentTotals(
        orderStacks,
        (each) => getTool(each.choice.toolGuid)?.catalogNumber ?? 'this tool',
      ).map((total) => {
        const common = {
          key: `${total.component}:${total.guid}`,
          component: total.component,
          kind: KIND_LABEL[total.component],
          count: total.count,
          uses: total.uses.map((use) => use.title),
        }
        /*
          A guid that no longer resolves says so rather than being dropped —
          Justin Gray's rule that a reference lives, kept since 2026-08-10: a
          bill that quietly lost a line would report a part as tooled when it
          is not.
        */
        const gone = { brand: '—', catalogNumber: 'gone', detail: 'no longer in the catalog' }
        if (total.component === 'tool') {
          const tool = getTool(total.guid)
          return tool === null
            ? { ...common, icon: null, ...gone }
            : {
                ...common,
                icon: <ToolTypeIcon toolType={tool.form} />,
                brand: tool.brand,
                catalogNumber: tool.catalogNumber,
                detail: typeLabel(tool),
              }
        }
        if (total.component === 'holder') {
          const holder = getHolder(total.guid)
          return holder === null
            ? { ...common, icon: <HolderIcon />, ...gone }
            : {
                ...common,
                icon: <HolderIcon />,
                brand: holder.brand,
                catalogNumber: holder.catalogNumber,
                detail: holderTypeLabel(holder),
              }
        }
        const collet = getCollet(total.guid)
        return collet === null
          ? { ...common, icon: <ColletIcon />, ...gone }
          : {
              ...common,
              icon: <ColletIcon />,
              brand: collet.brand,
              catalogNumber: collet.catalogNumber,
              detail: colletTypeLabel(collet),
            }
      }),
    [orderStacks],
  )

  const summaryRows = useMemo(
    () =>
      recommendationRows(orderRows, {
        answers: recommendationAnswers,
        demandKey: recommendationDemandKey,
        nameOf,
        split: distinctIn,
      }),
    [orderRows, recommendationAnswers, recommendationDemandKey, nameOf, distinctIn],
  )
  const draftEach = useMemo(() => {
    if (draft?.kind !== 'group' || draft.results !== 'each') {
      return { status: 'idle' as const, picked: false }
    }
    const answers = distinctIn(kept).map((tags) =>
      recommendationAnswers.get(recommendationDemandKey(tags)),
    )
    if (answers.some((answer) => answer === 'error')) {
      return { status: 'error' as const, picked: false }
    }
    if (answers.some((answer) => answer === 'pending' || answer === undefined)) {
      return { status: 'pending' as const, picked: false }
    }
    if (answers.some((answer) => answer === 'nothing-fits')) {
      return { status: 'nothing-fits' as const, picked: false }
    }
    return {
      status: 'ready' as const,
      picked: true,
    }
  }, [draft, distinctIn, kept, recommendationAnswers, recommendationDemandKey])
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

  /**
   * A row nobody ordered anything against goes when it stops being the one
   * being worked on (Paul, 2026-09-09).
   *
   * The list already refuses to draw it — {@link orderRows} — and this is the
   * other half: a row left in the store would be unreachable, would go on
   * costing the matcher a demand, and would hold an id the next *+ Feature*
   * cannot have. An effect rather than a line in `selectRow`, because every way
   * of putting a row down ends here: selecting another, Escape, and each of the
   * three presses that start something else.
   */
  const workedOn = useRef<string | null>(null)
  useEffect(() => {
    const before = workedOn.current
    workedOn.current = selectedId
    if (before === null || workingIds.includes(before)) {
      return
    }
    setList((current) => {
      const item = itemNamed(current, before)
      if (item === null || isOrdered(sheet, item)) {
        return current
      }
      forgetTree(before)
      return removeItem(current, before)
    })
  }, [selectedId, workingIds, sheet, setList, forgetTree])

  const startAddGroup = useCallback(() => {
    setSelectedId(null)
    setSelectedTag(null)
    // Whatever is under the mouse seeds the draft: pressing "add group" with a
    // face already clicked should not throw that click away.
    setDraft({ kind: 'group', results: 'all', editing: null })
    /*
      **And a hole seeds the group with its identical siblings** (Paul,
      2026-09-09: hole grouping is a GROUP rule). Outside a group a hole stands
      for itself, so opening one over a previewed hole has to grow what is
      already kept — `part-interaction` § `group` is the expansion.
    */
    dispatch({ type: 'group' })
  }, [])

  /**
   * A feature already on the list, made into the group it could have been.
   *
   * **The offer stands while the decision does** (Paul, 2026-09-09: "when I'm
   * editing the feature, I should have the option to change it to a group
   * always, or when I select a hole with no tools applied, it should show both
   * options"). Taking it on a row rather than on a bare reading has to *edit*
   * that row — a second group beside the feature it came from is two rows for
   * one decision, which is the thing the list exists to prevent.
   *
   * The row keeps its id, so the stack built on it comes with it: the tree is
   * keyed by row id, and `confirmDraft` carries the lines.
   */
  const changeToGroup = useCallback(
    (id: string) => {
      const item = itemNamed(list, id)
      if (item === null || item.kind !== 'feature') {
        return
      }
      setSelectedId(null)
      setSelectedTag(null)
      setDraft({ kind: 'group', results: 'all', editing: id })
      dispatch({ type: 'collect', tags: item.tags, collecting: true })
      // And grown into the identical holes, which is what taking the offer means.
      dispatch({ type: 'group' })
    },
    [list],
  )

  /**
   * The offer to ask about every hole identical to this one, at once.
   *
   * **Grouping identical holes is a GROUP rule** (Paul, 2026-09-09: "the
   * current hole grouping should only be applied in GROUP. In Add Feature, I
   * should be able to select a single hole. The Add Feature Dialog should warn
   * me there are other identical holes and ask if I want to add them in a
   * group"). The rule used to be applied silently on every path through
   * `part-interaction`, so a click on one hole of a bolt circle made a row
   * holding all thirty-nine and a single hole was unaskable. This is where it
   * went: the panel states the fact and offers both answers.
   *
   * Offered for **any hole being read** rather than only inside the dialog,
   * because a plain click followed by *+ Feature* adds a feature just as the
   * dialog does — and withheld once a row is selected or a group or assembly is
   * being built, where there is nothing left to offer.
   */
  const offerGroup = useMemo(() => {
    if (focused === null) {
      return null
    }
    /*
      **The row this reading belongs to, where it is one already** (Paul,
      2026-09-09). The offer was withheld the moment anything was selected,
      which made *Just this hole* look permanent: adding the feature selected
      it, and the way back was gone. A feature is a decision that can still be
      changed, so the offer stands on the row too — and taking it there edits
      that row rather than opening a second one beside it.
    */
    const edited = draft?.kind === 'feature' ? itemNamed(list, draft.editing) : null
    const row = edited ?? selectedItem
    const offer = groupOffer({
      siblings: groupOf(focused).length,
      dismissed: aloneFor === focused,
      building: draft?.kind ?? null,
      row,
      editing: edited !== null,
      ordered: row !== null && isOrdered(sheet, row),
    })
    if (offer === null) {
      return null
    }
    const { rowId } = offer
    return {
      count: offer.count,
      /*
        On a row it is that row becoming a group; on a bare reading it is the
        same press as *+ Group*. Either way `part-interaction` § `group` grows
        what is kept into the identical holes.
      */
      onGroup: rowId === null ? startAddGroup : () => changeToGroup(rowId),
      onDismiss: () => setAloneFor(focused),
    }
  }, [focused, selectedItem, draft, list, sheet, groupOf, aloneFor, startAddGroup, changeToGroup])

  /**
   * A tool assembly of the part's own, begun.
   *
   * **Not tied to a feature or a group** (Paul, 2026-09-08: "the tool assembly
   * will not be tied to a specific feature or group, it will just exist at the
   * part level"): the same tree, the same three slots and the same tables, with
   * the catalog under it because there is no feature to narrow it by.
   *
   * **And it is a draft until it is ordered** (Paul, 2026-09-08: "if I don't add
   * anything to the order list when creating a tool assembly, the command was
   * cancelled and the empty tool assembly row should not show"). A feature is a
   * question worth keeping on the list with no tool against it yet; a part-level
   * assembly *is* its order, so an empty one is a row about nothing. The press
   * under the stack makes the row and writes the lines in one go — the path
   * `assembly-actions` already calls `confirm`.
   *
   * Everything being read is put down with it: a face left selected under a
   * stack for the whole part would have the page answering a question the stack
   * is not about.
   */
  const startAddAssembly = useCallback(() => {
    setSelectedId(null)
    setSelectedTag(null)
    dispatch({ type: 'reset' })
    setDraft({ kind: 'assembly', results: 'all', editing: null })
  }, [])

  const startEdit = useCallback(
    (id: string) => {
      const item = itemNamed(list, id)
      // A part-level assembly holds no features, so there is nothing an editor
      // could ask about; the list offers it no *Edit* either.
      if (item === null || item.kind === 'assembly') {
        return
      }
      setSelectedId(null)
      setSelectedTag(null)
      setDraft({
        kind: item.kind,
        results: item.kind === 'group' ? item.results : 'all',
        editing: id,
      })
      // Editing a group groups; editing a feature does not, however many tags
      // it happens to hold (Paul, 2026-09-09).
      dispatch({ type: 'collect', tags: item.tags, collecting: item.kind === 'group' })
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
            const answer = recommendationAnswers.get(recommendationDemandKey(each))
            const best = typeof answer === 'object' ? answer.picks[0] : undefined
            /*
              Written under every tag of the set, the way the tree writes one:
              the sheet is keyed by tag, and a line under one hole of a bolt
              circle paints one hole and is read as one decision by whichever
              page happens to read that key.
            */
            return best === undefined
              ? current
              : each.reduce(
                  (soFar, tag) => addChoice(soFar, tag, { toolGuid: best.tool.guid }),
                  current,
                )
          }, sheet),
        )
        return
      }
      /**
       * **Making the row is not choosing its tools** (Paul, 2026-09-07: "it
       * should also no longer autoselect the tool component row that I click
       * on. I should explicitly confirm each component with the checkmark
       * icon"). A component reaches the bill through the tick beside it in the
       * tree — `confirmSlot` — and nowhere else, so adding a feature writes the
       * row and stops there.
       *
       * What this replaced wrote every stack that had a tool in it, which was
       * the same fall-through in a politer form: a stack somebody was still
       * assembling went onto the bill because the row was confirmed around it.
       */
    },
    [commit, distinctIn, sheet, recommendationAnswers, recommendationDemandKey],
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
    (keys: ReadonlyArray<string>) => {
      /*
        **Every key, not the first of each distinct feature** (Paul, 2026-09-09:
        "I can sometimes trigger something being shown on one list after
        removing it from either/or"). A row's lines are written under all of its
        keys — `treeActionsFor` below — and a bolt circle is one distinct
        feature and eight keys, so clearing one of them left seven lines on the
        sheet for the order-list page to go on showing. `shared/order-list` is
        where reading, writing and clearing agree about the keys.
      */
      commit(clearKeys(sheet, keys))
    },
    [commit, sheet],
  )

  /**
   * The draft's stacks become the row's, under the id it has just been given.
   *
   * **Nothing built before the press is lost by making it.** A holder chosen
   * while the feature was still a draft is the same decision after it is a row,
   * and the tree is keyed by row id — so the entry moves rather than the work
   * being done twice. An edit keeps whatever the row already had where the
   * draft has nothing of its own.
   */
  const carryDraftTree = useCallback(
    (itemId: string, tags: ReadonlyArray<string>) => {
      /*
        A group editor keeps its stacks under the plain key — its tags change
        under the mouse as faces are toggled, and a key that moved with them
        would reset the tree mid-build. Everything else is keyed by what is
        being asked, so two faces do not share one scratch stack.
      */
      // Off the ref, not the render's `trees`: the press that confirms a stack
      // marks it and makes the row in one tick, and the mark has to travel.
      const built = treeNow(DRAFT_TREE) ?? treeNow(draftKeyFor(tags))
      forgetTree(DRAFT_TREE)
      forgetTree(draftKeyFor(tags))
      if (built !== undefined) {
        commitTree(itemId, built)
      }
    },
    [treeNow, commitTree, forgetTree],
  )

  const addFeature = useCallback(() => {
    if (kept.length === 0) {
      return
    }
    // One feature is one question, so it takes the tool that was picked for it.
    billFor(kept, 'all')
    const made: ListItem = { kind: 'feature', id: nextId(list, 'feature'), tags: [...kept] }
    carryDraftTree(made.id, made.tags)
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
  }, [kept, billFor, list, carryDraftTree])

  /**
   * The id the assembly being built will be given, while it is still a draft.
   *
   * Arithmetic off the list, the way every id on this page is minted, so the
   * press that writes the lines and the press that makes the row agree about
   * where they are writing without the row having to exist first.
   */
  const pendingAssemblyId = useMemo(
    () => (draft?.kind === 'assembly' ? nextId(list, 'assembly') : null),
    [draft?.kind, list],
  )

  /**
   * The assembly draft becomes a row, carrying the stacks built on it.
   *
   * Called by the press under the stack and by nothing else: an assembly with
   * nothing on the order list is not a row, so this is the only way one is made.
   */
  const addAssemblyRow = useCallback(() => {
    if (pendingAssemblyId === null) {
      return
    }
    /*
      Its own carry rather than `carryDraftTree` — see below — and read first,
      because **the row is called what the stack in it was called** (Paul,
      2026-09-08: "it should default to the default name, or the one I entered
      in the dialog"). The dialog's card is where a name is typed while the
      assembly is being built, and a row that threw that away and asked again
      would be asking twice for one answer.
    */
    const built = treeNow(draftKeyFor([]))
    const named = built?.[0]?.name?.trim()
    const made: ListItem = {
      kind: 'assembly',
      id: pendingAssemblyId,
      tags: [],
      ...(named === undefined || named === '' ? {} : { name: named }),
    }
    /*
      `treeNow` above rather than `carryDraftTree`: that one falls back to
      `DRAFT_TREE`, which is the group editor's key and can still hold a group
      somebody walked away from. An assembly's stacks are only ever under its
      own scratch key.

      Off the ref rather than the render's `trees`, because the press that
      confirms a stack marks what it stands as on the order list and makes the
      row in one tick — an unmarked stack arriving here would lose the link to
      its line.
    */
    forgetTree(draftKeyFor([]))
    if (built !== undefined) {
      commitTree(made.id, built)
    }
    setList((current) => addItem(current, made))
    setDraft(null)
    // The row somebody has just made is the row they are working on.
    setSelectedId(made.id)
    setSelectedTag(null)
    /*
      **And it is not asked to be named** (Paul, 2026-09-08: "it shouldn't force
      me to name it immediately when I complete creating a tool assembly … then
      I can rename if desired"). The press is an order, and a field opening over
      the row it just wrote makes naming a step in ordering rather than
      something a shop does when it has something to say. The default stands,
      the dialog's own name is kept where there was one, and right-click →
      *Rename…* is there whenever it is wanted.
    */
  }, [pendingAssemblyId, treeNow, forgetTree, commitTree, setList])

  const confirmDraft = useCallback(() => {
    if (draft === null || kept.length === 0) {
      return
    }
    if (draft.kind === 'group' && draft.results === 'each' && !draftEach.picked) {
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
    /*
      **A feature made into a group keeps what it had ordered** (Paul,
      2026-09-09, on changing a feature to a group while editing it). The sheet
      is keyed by feature tag and the row's key is its first tag, so growing one
      hole into its thirty-nine moves the key — and the drill somebody had
      already chosen would be sitting under a tag nothing reads. The lines are
      written across the group's tags, which is where confirming a stack writes
      them.
    */
    if (before !== null && before.kind === 'feature' && made.kind === 'group') {
      const had = linesFor(sheet, before)
      if (had.length > 0) {
        commit(
          made.tags.reduce(
            (current, tag) => had.reduce((held, line) => addChoice(held, tag, line), current),
            sheet,
          ),
        )
      }
    }
    billFor(made.tags, made.kind === 'group' ? made.results : 'all')
    carryDraftTree(made.id, made.tags)
    setList((current) =>
      draft.editing === null ? addItem(current, made) : replaceItem(current, made),
    )
    setDraft(null)
    // The row somebody has just made is the row they are working on.
    setSelectedId(made.id)
    setSelectedTag(null)
  }, [
    draft,
    kept,
    list,
    addFeature,
    billFor,
    unbill,
    draftEach.picked,
    carryDraftTree,
    sheet,
    commit,
  ])

  const cancelDraft = useCallback(() => {
    // What was being built goes with what was being built — including an
    // assembly draft's stacks, which are kept under a key of their own.
    forgetTree(DRAFT_TREE)
    forgetTree(draftKeyFor([]))
    setDraft(null)
    dispatch({ type: 'reset' })
  }, [forgetTree])

  /**
   * The way out of the box over the part, in its top right corner.
   *
   * **One X, the same in all three** (Paul, 2026-09-09: "I would like to add an
   * 'X' in the top right of the dialog to close the dialog as well. This should
   * be consistent across +feature, +group, and +tool assembly"). The footer
   * buttons that used to close each of them are gone — a stack reaches the
   * order list through the press under it and nothing else — so the box needs
   * one way out that does not also decide anything.
   *
   * A draft is put down the way Escape puts it down: nothing was written, so
   * there is nothing to undo. A box open over a row that already exists has no
   * draft to drop, and closing it is putting that row down.
   */
  const closePanel = useCallback(() => {
    if (draft !== null) {
      cancelDraft()
      return
    }
    selectRow(null)
  }, [draft, cancelDraft, selectRow])

  /**
   * The row on the list the panel's buttons act on, where there is one.
   *
   * A previewed feature can already be on the list — clicking it on the part is
   * how somebody goes back to it — so this is not simply the selected row.
   */
  const activeItem = useMemo(
    () =>
      /*
        **An assembly being built is not a row, and is not any other row
        either** (Paul, 2026-09-08). It asks about no features, so the search
        below would hand back whichever row happened to match nothing — and the
        press under the stack would write that row's lines instead of making
        its own.
      */
      (draft?.kind === 'assembly' ? null : selectedItem) ??
      /*
        **A question about nothing matches no row** (Paul, 2026-09-07: "when no
        feature is selected, the tool table should not show any assemblies").
        `[].every(...)` is true of every item, so with nothing being asked this
        matched whichever row happened to be first and handed it out as the row
        in play. `toolActions` never noticed — it is gated on `active` — but the
        assembly tree took the row at its word and drew that feature's stacks
        under a table showing the whole catalog.
      */
      (askedNow.tags.length === 0
        ? null
        : draft?.kind === 'assembly'
          ? null
          : /*
              **A group being built is not the feature it holds** (Paul,
              2026-09-09, with the group editor's own confirm gone). A group of
              one hole that is already a row matches that row here, so the press
              under the stack read as *add a tool to that feature* and the group
              was never made — the confirm button used to make it, and there is
              no confirm button any more. A group being *edited* is the row it
              is editing, which the search below still finds.
            */
            draft?.kind === 'group' && draft.editing === null
            ? null
            : list.find((item) => askedNow.tags.every((tag) => item.tags.includes(tag)))) ??
      null,
    [selectedItem, list, askedNow.tags, draft?.kind, draft?.editing],
  )

  /* ----------------------- the tool assembly tree ------------------------- */

  /**
   * The shape being tried out, and the way back off it.
   *
   * **A feature is answered with assemblies, not tools** (Paul, 2026-09-07). A
   * cutter is chosen with a holder and a collet; a threaded hole needs two
   * stacks before it is a hole at all. The page asked for a tool and hung the
   * other two off it as dropdowns, which made a holder a footnote on a tool and
   * made the second stack for a feature unreachable.
   *
   * Behind a flag, switched in the header, because it replaces enough of this
   * page at once that going back has to be a press rather than a revert.
   */
  /** Which slot of which stack is open, and the row it belongs to. */
  const [nodeHeld, setNodeHeld] = useState<{ itemId: string; node: TreeNode } | null>(null)
  const [holderQuery, setHolderQuery] = useState<ComponentQuery>(NO_QUERY)
  const [colletQuery, setColletQuery] = useState<ComponentQuery>(NO_QUERY)
  const [hiddenHolderColumns, setHiddenHolderColumns] = useState<ReadonlyArray<string>>(() =>
    hiddenComponentColumns(HOLDER_COLUMNS),
  )
  const [holderColumnOrder, setHolderColumnOrder] = useState<ReadonlyArray<string>>(() =>
    HOLDER_COLUMNS.map((column) => column.code),
  )
  const [hiddenColletColumns, setHiddenColletColumns] = useState<ReadonlyArray<string>>(() =>
    hiddenComponentColumns(COLLET_COLUMNS),
  )
  const [colletColumnOrder, setColletColumnOrder] = useState<ReadonlyArray<string>>(() =>
    COLLET_COLUMNS.map((column) => column.code),
  )

  /**
   * Whose tree is on screen.
   *
   * **A draft has one before it is a row** (Paul, 2026-09-07: "when a new
   * feature or group is selected (being created), the tree should already be
   * shown"). Waiting for the row meant the bottom of the page had nothing in it
   * during the one moment somebody is actually deciding — and the tools for the
   * draft were already listed under it, which made the empty column beside them
   * read as broken rather than as not-yet.
   *
   * The draft's stacks are kept under {@link DRAFT_TREE} and carried onto the
   * row's own id when it is confirmed, so nothing built before the press is
   * lost by making it.
   *
   * **Being created is wider than `draft`.** A plain click on a face previews a
   * reading and offers the two ways in without opening a draft at all — that is
   * `asked()`'s third row — and it is the commonest way a feature gets made. So
   * anything being *asked* with no row of its own gets the draft's tree, which
   * covers the preview and the group editor alike.
   */
  const treeKey =
    /*
      **Only the group editor takes the plain key** (Paul, 2026-09-07: "new hole
      selections should be treated as new"). Its tags change under the mouse as
      faces are toggled, so a key that moved with them would reset the tree
      mid-build. A *feature* draft has settled tags and was taking that key as
      well — and the key is kept in the browser, so the tap and drill stacks
      built for one hole were still standing the next time anybody pressed
      *Add feature*, on a hole nobody had called threaded.
    */
    draft?.kind === 'group'
      ? DRAFT_TREE
      : /*
          **An assembly being built keeps its stacks under a key of its own.**
          It has no tags, so `draftKeyFor([])` is that key — and `carryDraftTree`
          reads the same one when the press makes the row, so nothing built
          before the press is lost by making it.
        */
        draft?.kind === 'assembly'
        ? draftKeyFor([])
        : /*
          **A part-level assembly is a tree with no question above it** (Paul,
          2026-09-08). It asks about no feature, so `asking` is false for it —
          and the row is still the thing being built, keyed by its own id like
          every other row's tree.
        */
          selectedItem?.kind === 'assembly'
          ? selectedItem.id
          : // Nothing asked is nothing to assemble: the table is the whole catalog
            // then, and a tree beside it would be answering for a feature nobody
            // has selected.
            !asking
            ? null
            : draft !== null
              ? draftKeyFor(askedNow.tags)
              : (activeItem?.id ?? draftKeyFor(askedNow.tags))
  /**
   * The stacks for that row — what was built, or what the bill already holds.
   *
   * A part answered before this shape existed, or with the flag off, has lines
   * on the sheet and no tree; `treeFromLines` opens on those rather than on an
   * empty stack, so switching the flag on does not read as work lost.
   *
   * **And whatever it opens on, the roles follow the thread.** A tree is kept
   * in the browser and the thread a hole is read for is not, so a tap stack
   * outlived the reading that asked for it — `forThread` is that rule, and it
   * leaves any stack somebody has put a component in exactly as it stands.
   */
  const assemblies = useMemo<ReadonlyArray<TreeAssembly>>(() => {
    if (treeKey === null) {
      return []
    }
    const threaded = threadSpec !== null
    const kept = trees[treeKey]
    if (kept !== undefined) {
      return forThread(kept, threaded)
    }
    /*
      A draft opens on empty stacks rather than on the bill: it has no lines
      yet, and reading the focused feature's would show another row's answers
      under a feature being created.
    */
    return draft !== null || treeKey === DRAFT_TREE
      ? defaultAssemblies(threaded)
      : treeFromLines(
          /*
            A part-level assembly's lines are kept under its own id — it has no
            feature to be keyed by — so reading `choiceKey` here would open it
            on whatever face was last clicked. Every key of the row it is,
            because that is where the lines were written (`shared/order-list`).
          */
          linesOf(sheet, selectedItem === null ? [choiceKey] : sheetKeysOf(selectedItem)),
          threaded,
          // Which line is the tap is a fact about the tool, and the catalog is
          // the route's to read.
          (toolGuid) => getTool(toolGuid)?.form.startsWith('tap ') ?? false,
        )
  }, [trees, treeKey, sheet, choiceKey, threadSpec, draft, selectedItem])

  /**
   * The slot open now: what was clicked while it still exists, else the first
   * question the tree has not been answered.
   *
   * Derived rather than kept in an effect, and stamped with the row it was
   * clicked on — every tree starts at `assembly-1`, so a node held across a
   * change of row would land on a different feature's stack of the same name.
   */
  const node = useMemo<TreeNode | null>(() => {
    const held =
      nodeHeld !== null &&
      nodeHeld.itemId === treeKey &&
      assemblies.some((each) => each.id === nodeHeld.node.assemblyId)
        ? nodeHeld.node
        : null
    return held ?? firstNode(assemblies)
  }, [nodeHeld, treeKey, assemblies])

  const selectNode = useCallback(
    (next: TreeNode) => {
      if (treeKey !== null) {
        setNodeHeld({ itemId: treeKey, node: next })
      }
    },
    [treeKey],
  )

  const assembly = useMemo(
    () => assemblyNamed(assemblies, node?.assemblyId ?? null),
    [assemblies, node],
  )
  const treeTool = assembly?.toolGuid == null ? null : getTool(assembly.toolGuid)
  const treeHolder = assembly?.holderGuid == null ? null : getHolder(assembly.holderGuid)
  const treeCollet = assembly?.colletGuid == null ? null : getCollet(assembly.colletGuid)

  /**
   * The length below the holder each row in the tool list would stand at.
   *
   * **The column is about the stack, not about the tool** (Paul, 2026-09-08:
   * "we can plainly see that more of the tool is beneath the holder"). It
   * printed `geometry.LBH` — the length a tool is set up at with no holder and
   * no feature — beside a panel drawing the same tool three times further out,
   * because the holder it used to ask about was a dropdown on the row and the
   * tree took those out. One holder is chosen for the whole assembly now, so
   * the question is asked of that holder once per row.
   *
   * Cached per tool for as long as the stack, the feature and the margins hold
   * still: the answer is a sweep of the holder over the reach curve, and the
   * list is virtualized, so this is a few dozen sweeps rather than one per
   * catalog row.
   */
  const belowHolderOf = useMemo(() => {
    const cache = new Map<string, BelowHolder | null>()
    return (each: CatalogTool): BelowHolder | null => {
      const had = cache.get(each.guid)
      if (had !== undefined) {
        return had
      }
      const made = belowHolder(
        each,
        { holder: treeHolder, collet: treeCollet },
        curve,
        margins,
        thresholds,
      )
      cache.set(each.guid, made)
      return made
    }
  }, [treeHolder, treeCollet, curve, margins, thresholds])

  const writeTree = useCallback(
    (next: ReadonlyArray<TreeAssembly>) => {
      if (treeKey !== null) {
        commitTree(treeKey, next)
      }
    },
    [treeKey, commitTree],
  )

  /**
   * A row in the table below lands in the slot that is open — and the slot stays
   * open.
   *
   * **Picking a tool must not walk you to the holders** (Paul, 2026-09-07: "it
   * is still automatically moving me to holders when I select a tool as a row …
   * the row selected in the table is activated in the tool tree, but I shouldn't
   * be moved to the next component automatically — I should click on its row to
   * see the table for it"). The open slot is derived — whatever was clicked, or
   * else the tree's first *unanswered* slot — so filling the tool made the
   * holder the first unanswered one and the list under the mouse changed to
   * holders mid-click. Pinning the node the row went into is what makes the
   * derivation stop deciding: what is open next is a press in the tree.
   */
  const fillSlot = useCallback(
    /**
     * @param override whether the rules had removed what is going in — carried
     * from the row that was clicked, because only the table knows which list it
     * drew the row from, and `assembly-tree` keeps it so the warning outlives
     * the filters that admitted it.
     */
    (guid: string | null, override = false) => {
      if (node === null) {
        return
      }
      selectNode(node)
      writeTree(setSlot(assemblies, node.assemblyId, node.slot, guid, override))
      /*
        **The tap that was picked says how the thread is made** (Paul,
        2026-09-09: "if I select a cut tap first, drills for the cut tap should
        be selected when I go to the drills page"). One mode is read by both
        stacks, so writing it here is what makes the drill list under a form tap
        the form drill's without anybody pressing the button twice.

        Only where the tool states a method: a tap scraped before
        `@toolpath/tool-scraper` 2.4.0 says nothing, and reading that silence as
        `cut tap` would move the drills of a hole nobody had decided about.
        Nothing else can write it either — a holder, a collet and a drill all
        answer `null` — so the guid alone is the test.
      */
      const asked = modeFor(guid === null ? null : toolsByGuid.get(guid)?.threadMethod)
      if (
        asked !== null &&
        asked !== holeChoice.mode &&
        threadSpec !== null &&
        holeDiameter !== null
      ) {
        writeThread({ mode: asked, spec: threadSpec }, threadScope, holeDiameter)
      }
    },
    [
      node,
      selectNode,
      assemblies,
      writeTree,
      toolsByGuid,
      holeChoice.mode,
      threadSpec,
      threadScope,
      holeDiameter,
      writeThread,
    ],
  )

  const clearSlot = useCallback(
    (assemblyId: string, slot: Slot) => writeTree(setSlot(assemblies, assemblyId, slot, null)),
    [assemblies, writeTree],
  )

  /**
   * Which of the three lists the table shows while no stack is open.
   *
   * **The buttons work with nothing selected too** (Paul, 2026-09-07: "the
   * buttons need to be shown and usable when not editing a feature as well.
   * With no selections, I should still see the tool, holder, and collet buttons
   * in the table"). A crib is three catalogs and all three are worth reading —
   * which BT30 chucks do I own, which collets close on 8 mm — and asking that
   * used to need a feature invented to hang it off.
   */
  const [browsing, setBrowsing] = useState<Slot>('tool')

  /**
   * The holder or collet being read while no stack is open.
   *
   * A row clicked in a component table normally fills the slot the tree has
   * open. Read on its own there is no slot to fill, and a click that did nothing
   * at all would be a table somebody can only look at — so it is a look-up, and
   * the panel on the right shows what the vendor published.
   */
  const [lookedUp, setLookedUp] = useState<string | null>(null)

  /**
   * The slot the tree has open, where there is one. It outranks the buttons: the
   * tree is what the table is being asked for while a feature is being answered,
   * and two things deciding which list is on screen is how those two stop
   * agreeing.
   */
  const slotOpen: Slot | null = !perFeature && node !== null ? node.slot : null

  /** The list on show: the open slot's, or whichever rack is being read. */
  const listKind: Slot = slotOpen ?? browsing

  /**
   * Pressing one of the three buttons.
   *
   * **A button is the tree's slot while there is a tree.** Pressing *Holders*
   * with a stack open opens that stack's holder slot, so the row clicked in the
   * table lands where the button said it would; with no stack open it is a
   * catalog being read, and the button is all there is to remember.
   */
  const chooseList = useCallback(
    (kind: Slot) => {
      setBrowsing(kind)
      if (node !== null) {
        selectNode({ assemblyId: node.assemblyId, slot: kind })
      }
    },
    [node, selectNode],
  )

  /**
   * Which of the two component lists the table is, and `null` while it is the
   * tools.
   *
   * `null` too while the question is one per feature — a group asked for a tool
   * each has no one list of anything, and that notice outranks everything else.
   */
  const componentSlot: Slot | null = !perFeature && listKind !== 'tool' ? listKind : null

  /** A rack being read rather than a slot being answered. */
  const looking = componentSlot !== null && slotOpen === null

  /** The one row clicked while reading a rack, in each of the two. */
  const lookedUpHolder =
    looking && componentSlot === 'holder' ? (lookedUp === null ? null : getHolder(lookedUp)) : null
  const lookedUpCollet =
    looking && componentSlot === 'collet' ? (lookedUp === null ? null : getCollet(lookedUp)) : null

  /**
   * Whether the tree is drawn at all.
   *
   * **It belongs to the feature, not to the table** (Paul, 2026-09-07: "moving
   * the tool tree to the feature panel"). It stood in the table's own scroll
   * area, which put the stack being built at the bottom of the page and the
   * feature it answers at the top; in the panel beside the list it sits under
   * the reading that asked for it. What it is drawn *for* has not changed, so
   * this is the condition that block carried, named.
   */
  const showTree = !perFeature && node !== null && assembly !== null

  /**
   * Whether the box over the part reads out a feature.
   *
   * Not while a **tool assembly** is being built (Paul, 2026-09-08): it answers
   * no feature, so a reading above it would be a face somebody clicked and a
   * stack that has nothing to do with it, one under the other in one box.
   */
  const showReading = reading !== null && draft?.kind !== 'assembly'

  /**
   * The holders on show: what can hold what is already in the stack, narrowed
   * by the crib's own filters and then by the table's.
   */
  /**
   * Two lists, and the difference between them matters.
   *
   * The **pool** is what can hold what is already in the stack. The **rows** are
   * that, narrowed by the filters somebody set. The filter panel offers values
   * off the *pool*, which is the rule the tool filters already follow: offering
   * them off the narrowed rows would take every other brand off the list the
   * moment one brand was picked, so a filter could be set and never unset from
   * the panel that set it.
   */
  /**
   * The holders offered, and how many were kept back for having no shape —
   * `holdersToOffer` is the rule and says why the count matters.
   */
  /**
   * The tools this stack is choosing between, before any holding narrows them.
   *
   * Named once because two lists are drawn from it: the tools under the tree,
   * and — since a holder slot is opened on a feature rather than on the catalog
   * — the holders worth offering for that slot. Taking it twice is how the two
   * end up disagreeing about which tools the stack is even about.
   *
   * **Which list depends on the stack's role.** A threaded hole's tap stack
   * opens on the taps and its drill stack on the drills, so the two tabs that
   * used to be the only way to say which are now the two stacks themselves.
   */
  const stackTools = useMemo(
    () => (assembly?.role === 'tap' ? tapRows : shownRows),
    [assembly, tapRows, shownRows],
  )

  /**
   * The same tools, one per shank — what the two racks are actually narrowed by.
   *
   * **A rack is graded against shanks, not against tools** (`byShank` says why).
   * Both lists below ask "can this holder take *any* of these", and every rule
   * behind that question reads `geometry.SFDM` alone — so a feature matching two
   * thousand end mills is asking about the twenty shanks they stand on. On the
   * full scrape that product was the long task behind every click on the part.
   */
  const stackShanks = useMemo(() => byShank(stackTools), [stackTools])

  const offered = useMemo(
    () =>
      holdersToOffer(
        allHolders,
        { tool: treeTool, collet: treeCollet },
        allCollets,
        holderFilters,
        (holder) => drawable(holder, (guid) => getProfile(guid) !== null),
        /*
          **A holder is offered for the feature, not for the rack** (Paul,
          2026-09-07). With no tool picked yet the slot used to list every
          drawable holder in the crib, most of which cannot grip anything this
          feature's geometry admits — so the first row somebody clicked emptied
          the tool list under it. `asking` is the guard: with no feature there is
          no set of tools to be compatible with, and the list is a catalog again.
        */
        asking ? stackShanks : null,
      ),
    [treeTool, treeCollet, holderFilters, asking, stackShanks],
  )
  const holderPool = offered.shown
  const undrawableHolders = offered.hidden
  const holderRows = useMemo(
    () => filterComponents('holder', holderPool, holderQuery),
    [holderPool, holderQuery],
  )

  const colletPool = useMemo(
    // The same rule the holder slot follows, for the same reason: a collet
    // closing on nothing this feature can be cut with is not a row to click.
    () =>
      narrowCollets(
        allCollets,
        { tool: treeTool, holder: treeHolder },
        asking ? stackShanks : null,
      ),
    [treeTool, treeHolder, asking, stackShanks],
  )
  const colletRows = useMemo(
    () => filterComponents('collet', colletPool, colletQuery),
    [colletPool, colletQuery],
  )

  /**
   * The tools on show under the tree: {@link stackTools}, narrowed by the
   * holding that is standing in the stack, and **what the feature already
   * orders first** (Paul, 2026-09-07: "can we float confirmed tool assembly
   * components to the top of the table lists?").
   *
   * `shownRows` is kept-first already, but a tap list is not and neither is a
   * list narrowed by a holder, so the rule is applied where the table's own rows
   * are settled rather than left to survive two derivations.
   */
  const treeToolRows = useMemo(
    () =>
      keptFirst(
        narrowTools(stackTools, { holder: treeHolder, collet: treeCollet }, allCollets),
        keptHere,
      ),
    [stackTools, treeHolder, treeCollet, keptHere],
  )

  /**
   * The rows the tool table is handed, capped.
   *
   * **The kit's table sorts everything it is given, quadratically** (Paul,
   * 2026-09-07: "it takes a long time to go back to the tools tab in the
   * table"). `@toolpath/ui`'s table runs a sort modifier that reduces with
   * `concat`, so the whole 38,000-tool catalog costs some 700 million
   * operations — measured at 2.7 seconds a switch, and it runs again whenever
   * the table renders with new data. The fix belongs upstream in the kit; until
   * it lands, the list hands over a slice.
   *
   * **What is left out is said out loud**, beside the heading and on the button
   * that counts the list — the rule this page follows everywhere an answer is
   * narrowed. A feature's matched list is almost always shorter than this, so
   * the cap bites while browsing the catalog rather than while answering a
   * question, which is also where sorting a slice matters least.
   */
  /**
   * The rows a forgiven column put on the list, so the cap cannot drop all of
   * them — `tool-order.ts` § `capRows` is the rule and says what it cost.
   */
  const overrideGuids = useMemo(
    () => new Set(overrideTools.map((each) => each.guid)),
    [overrideTools],
  )
  const tableRows = useMemo(
    () => capRows(treeToolRows, overrideGuids, TABLE_ROW_CAP),
    [treeToolRows, overrideGuids],
  )
  const rowsHidden = treeToolRows.length - tableRows.length

  /** The lines this row already has on the bill, which is what Add and Update compare against. */
  const treeLines = useMemo(
    () => (activeItem === null ? [] : linesOf(sheet, [...sheetKeysOf(activeItem), choiceKey])),
    [activeItem, sheet, choiceKey],
  )

  /**
   * What a component is called on a button, by guid — the vendor's catalog
   * number, whichever of the three catalogs it came out of.
   *
   * The button under a stack says what pressing it changes ("change holder from
   * BT30-ER16-100DT to BT30-ER11-60"), and `shared/assembly-actions` holds guids
   * rather than records: naming one is a lookup only the route can do, so the
   * rule takes it as an argument the way `slotLabelFor` does for the tree.
   */
  const componentName = useCallback(
    (guid: string): string | null =>
      getTool(guid)?.catalogNumber ??
      getHolder(guid)?.catalogNumber ??
      getCollet(guid)?.catalogNumber ??
      null,
    [],
  )

  /**
   * What each assembly in the tree offers, and what each answer does.
   *
   * **One button for the full assembly, under the components it is about**
   * (Paul, 2026-09-08: "there should only be one 'add to order list' button for
   * the full assembly"). It stood in the panel on the right, a table away from
   * the stack it described; then it was a press per stack, which made a
   * threaded hole two orders — a tap orderable with no drill under it to make
   * the hole it threads.
   *
   * **Every assembly, not just the open one.** A pocket's rougher and finisher
   * are ordered separately, so each carries its own press; the panel on the
   * right could only ever speak for whichever slot was selected.
   *
   * **Written to every tag the row stands for.** A bolt circle of eight
   * identical holes is one row and eight tags, and a tool chosen for the row is
   * chosen for all eight; the sheet is keyed by tag, so the loop is what makes
   * one press mean what it says.
   */
  const treeActionsFor = useCallback(
    (stacks: ReadonlyArray<TreeAssembly>) =>
      groupActions(
        stacks,
        treeLines,
        activeItem !== null,
        draft?.kind === 'group' ? 'group' : draft?.kind === 'assembly' ? 'assembly' : 'feature',
        componentName,
      ).map((action) => ({
        key: `${stacks[0]?.id ?? 'assembly'}-${action.kind}`,
        label: action.label,
        ...(action.danger === true ? { danger: true } : {}),
        ...(action.quiet === true ? { quiet: true } : {}),
        ...(action.note === undefined ? {} : { note: action.note }),
        /*
          **Greyed rather than absent while the stack is empty** (Paul,
          2026-09-09). The rule is `assembly-actions`; the press below does
          nothing where there is nothing to write, so this is what says so
          before it is pressed.
        */
        ...(action.disabled === true ? { disabled: true } : {}),
        onClick: () => {
          /*
            **Backing out touches the tree, not the bill.** The change was never
            written, so there is nothing to undo on the sheet — what is put back
            is every stack of the assembly, from the lines the sheet holds.
          */
          if (action.kind === 'revert') {
            let put = assemblies
            for (const stack of stacks) {
              const saved = savedFor(stack, treeLines)
              if (saved !== null) {
                put = restoreAssembly(put, stack.id, saved)
              }
            }
            writeTree(put)
            return
          }
          /*
            **The whole assembly is written, or none of it.** A tap and the
            drill under it are one thing to order, so the press walks every
            stack of the group that has a tool to write.
          */
          const written = stacks.flatMap((stack) => {
            const line = lineOf(stack)
            return line === null ? [] : [{ stack, line, had: savedFor(stack, treeLines) }]
          })
          if (written.length === 0) {
            return
          }
          /*
            **Not a row yet: one press makes it and writes this assembly.**
            `addFeature` and `confirmDraft` carry the scratch tree onto the new
            row; making the row writes no lines of its own (see `billFor`), so
            what reaches the order list is this assembly and no other.
          */
          /*
            The keys the sheet holds this row's lines under: its features, or —
            for a part-level assembly, which has none — its own id.
          */
          const tags =
            activeItem !== null
              ? sheetKeysOf(activeItem)
              : /*
                  An assembly being built writes under the id the row is about
                  to be given — `pendingAssemblyId`, which `addAssemblyRow`
                  mints from the same list, so the lines and the row cannot
                  disagree about where they went.
                */
                pendingAssemblyId !== null
                ? [pendingAssemblyId]
                : kept
          if (tags.length === 0) {
            return
          }
          /*
            **Each stack remembers what it now stands as, before anything else.**
            It is the only thing that tells a replacement from a second assembly
            next time (Paul, 2026-09-07), and it is written first because the
            press that confirms an assembly also makes the row — `carryDraftTree`
            moves the stacks onto the new id, and an unmarked stack arriving
            there would lose the link to its line.
          */
          let marked = assemblies
          for (const { stack, line } of written) {
            marked = markOrdered(marked, stack.id, action.kind === 'remove' ? null : line.toolGuid)
          }
          writeTree(marked)
          if (action.kind === 'confirm') {
            if (draft?.kind === 'assembly') {
              addAssemblyRow()
            } else if (draft !== null) {
              confirmDraft()
            } else {
              addFeature()
            }
          }
          let next = sheet
          for (const { line, had } of written) {
            /*
              **A replacement takes the old line off before the new one goes on.**
              The sheet keys a line by its tool, so a stack that swapped cutters
              would otherwise leave the tool it was ordered as sitting on the
              feature beside the one that replaced it (Paul, 2026-09-07).
            */
            const off =
              action.kind === 'remove'
                ? (had?.toolGuid ?? line.toolGuid)
                : had !== null && had.toolGuid !== line.toolGuid
                  ? had.toolGuid
                  : null
            for (const tag of tags) {
              next = off === null ? next : removeChoice(next, tag, off)
              next = action.kind === 'remove' ? next : addChoice(next, tag, line)
            }
          }
          commit(next)
          /*
            **A row with nothing on the order list is not a row** (Paul,
            2026-09-09: "when I remove ALL tool assemblies from a feature or
            group, the feature or group is kept in the parts page order list. It
            should not be"). This was a part-level assembly's rule alone since
            2026-09-08, on the reasoning that a feature is a question worth
            keeping with no tool against it — but the list is the *order* list,
            and a row emptied of orders was then answered with the rules' own
            recommendation, which reads exactly like an order and is not one.

            Taking the last assembly off is an explicit press, so the row goes
            with it here rather than waiting to be put down: what {@link
            orderRows} keeps is the row somebody is still building, not the one
            they have just emptied.
          */
          if (action.kind === 'remove' && activeItem !== null && !isOrdered(next, activeItem)) {
            forgetTree(activeItem.id)
            setList((current) => removeItem(current, activeItem.id))
            selectRow(null)
          }
        },
      })),
    [
      assemblies,
      activeItem,
      kept,
      treeLines,
      sheet,
      commit,
      draft,
      confirmDraft,
      addFeature,
      addAssemblyRow,
      pendingAssemblyId,
      componentName,
      writeTree,
      forgetTree,
      setList,
      selectRow,
    ],
  )

  /** What a slot holds, in words, for the tree to draw. */
  const slotLabelFor = useCallback((each: TreeAssembly, slot: Slot): string | null => {
    if (slot === 'tool') {
      return each.toolGuid === null ? null : (getTool(each.toolGuid)?.catalogNumber ?? null)
    }
    if (slot === 'holder') {
      return each.holderGuid === null ? null : (getHolder(each.holderGuid)?.catalogNumber ?? null)
    }
    return each.colletGuid === null ? null : (getCollet(each.colletGuid)?.catalogNumber ?? null)
  }, [])

  /**
   * What the order list holds in a slot, where that is not what the slot holds
   * now.
   *
   * **A change shows on the row it is a change to** (Paul, 2026-09-07: "when I
   * make changes, they should show in the respective component rows (like tool
   * x -> tool y)"). The button under the stack says the change in a sentence,
   * which is the right place for *what pressing it does* and the wrong place to
   * find out which of three slots moved.
   *
   * Read off the same line the button reads — `savedFor`, so through
   * `orderedTool` — and `null` for every slot of a stack that is not on the
   * order list at all, because "not on the list yet" is the stack's own state
   * and every row saying `— → …` under it is noise. An em dash stands for a
   * slot the line has nothing in, so adding a holder to an ordered stack reads
   * as a change like any other.
   */
  const orderedLabelFor = useCallback(
    (each: TreeAssembly, slot: Slot): string | null => {
      const saved = savedFor(each, treeLines)
      if (saved === null) {
        return null
      }
      const was =
        slot === 'tool'
          ? saved.toolGuid
          : slot === 'holder'
            ? (saved.holderGuid ?? null)
            : (saved.colletGuid ?? null)
      if (was === guidAt(each, slot)) {
        return null
      }
      return was === null ? '—' : (componentName(was) ?? was)
    },
    [treeLines, componentName],
  )

  /**
   * Why a slot's choice was made against the rules, where it was.
   *
   * The fact is the tree's — `assembly-tree` § `overrides` says why it is kept
   * rather than derived — and the sentence is the matcher's, for as long as the
   * matcher still holds a verdict about that tool. Once it does not, the fact
   * still stands and `overrideNote` says less.
   */
  const warningFor = useCallback(
    (each: TreeAssembly, slot: Slot): string | null => {
      if (!isOverride(each, slot)) {
        return null
      }
      const guid = guidAt(each, slot)
      return overrideNote(guid === null ? null : (byGuid.get(guid) ?? null))
    },
    [byGuid],
  )

  /**
   * Which list of tools is on show.
   *
   * **The stack's role decides it**, where two tabs decided it before: a
   * threaded hole's tap stack opens on the taps and its drill stack on the
   * drills, so the pair of stacks *is* the pair of tabs and there is no second
   * control that can disagree with the tree.
   */
  const tappingNow = assembly !== null ? assembly.role === 'tap' : tapping

  /**
   * Which of this row's other stacks a component is standing in, by name.
   *
   * Named rather than counted, and never the stack being filled: the table's
   * own selected row already says that one (Paul, 2026-09-07).
   */
  const heldElsewhere = useCallback(
    (guid: string) => heldIn(assemblies, guid, assembly?.id ?? null),
    [assemblies, assembly],
  )

  /**
   * Every component already on the order list, and what it is on there for.
   *
   * **A row says which feature and which assembly** (Paul, 2026-09-07: "if a
   * tool, holder, or collet is used on a different feature, it should note which
   * feature and assembly they are used in in the badge"). One walk of the list
   * rather than a lookup per row drawn: a rack of five hundred holders would
   * otherwise ask the question five hundred times over every feature.
   */
  const uses = useMemo(
    () =>
      usesByGuid(
        list.map((item) => ({
          itemId: item.id,
          name: labelOf(item, nameOf),
          lines: linesFor(sheet, item),
          stacks: trees[item.id] ?? [],
        })),
      ),
    [list, nameOf, sheet, trees],
  )

  /** What a row's badge says, for a component this feature does not hold. */
  const usedOn = useCallback(
    (guid: string) => usedElsewhere(uses.get(guid) ?? [], activeItem?.id ?? null),
    [uses, activeItem],
  )

  /** Whether a component is on the order list at all — what floats it up a rack. */
  const inUse = useCallback((guid: string) => uses.has(guid), [uses])

  /** What the bill already holds in the open slot, for the row that says so. */
  const savedInSlot = useMemo(() => {
    if (assembly === null || componentSlot === null) {
      return null
    }
    const saved = savedFor(assembly, treeLines)
    return (componentSlot === 'holder' ? saved?.holderGuid : saved?.colletGuid) ?? null
  }, [assembly, componentSlot, treeLines])

  /**
   * The rack as the table draws it: what the feature already orders, first.
   *
   * **The same rule the tool list has always had** (Paul, 2026-09-07: "can we
   * float confirmed tool assembly components to the top of the table lists?").
   * The holder a feature is ordered with sat wherever the crib's own order put
   * it, wearing an *on the feature* badge nobody scrolled to. A partition rather
   * than a sort, so a column somebody sorted by still decides everything else —
   * and the row the stack is holding stays where the narrowing put it, because
   * the table marks that one itself.
   */
  const holderList = useMemo(
    () =>
      firstBy(
        firstBy(holderRows, (each) => inUse(each.guid)),
        (each) => each.guid === savedInSlot,
      ),
    [holderRows, savedInSlot, inUse],
  )
  const colletList = useMemo(
    () =>
      firstBy(
        firstBy(colletRows, (each) => inUse(each.guid)),
        (each) => each.guid === savedInSlot,
      ),
    [colletRows, savedInSlot, inUse],
  )

  /**
   * Which holder rows the crib cannot actually close on, and why.
   *
   * **The rack is wider than the collet drawer** (Paul, 2026-09-09: "we should
   * show any holder, even if there is not a collet in the library that works").
   * The list offers those chucks, so every one of them has to carry the reason
   * it cannot be built today — `colletGap` is the rule, the badge on the row and
   * the empty collet slot below both read it.
   *
   * Cached per holder: the answer is a walk of the chosen tool or of the
   * feature's shanks, and the table asks it once per row on every render.
   */
  const holderGap = useMemo(() => {
    const cache = new Map<string, string | null>()
    const asked = treeTool !== null ? [treeTool] : asking ? stackShanks : null
    return (guid: string): string | null => {
      const had = cache.get(guid)
      if (had !== undefined) {
        return had
      }
      const holder = getHolder(guid)
      const gap = holder === null ? null : colletGapFor(holder, asked, allCollets)
      cache.set(guid, gap)
      return gap
    }
  }, [treeTool, asking, stackShanks])

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
    /*
      **Every tag being asked about, not the first of each distinct feature.**
      The tree writes a line under all of a row's keys and this wrote it under
      one, so the same decision made from the panel and from the tree left the
      sheet in two different shapes — which is how one list could show a tool
      the other had lost (Paul, 2026-09-09).
    */
    const across = (change: (sheet: SetupSheet, featureTag: string) => SetupSheet) =>
      commit(askedNow.tags.reduce((current, tag) => change(current, tag), sheet))
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
        const next = askedNow.tags.reduce(
          (current, tag) => removeChoice(current, tag, panelTool.guid),
          sheet,
        )
        commit(next)
        const left = linesOf(next, askedNow.tags).length > 0
        if (!left && activeItem !== null) {
          forgetTree(activeItem.id)
          setList((current) => removeItem(current, activeItem.id))
          selectRow(null)
        }
      },
    }
    return wanted.map((action) => ({
      key: action,
      label: toolActionLabel(action, {
        // Named by the number a shop orders by, not by the guid it is keyed on.
        dropping: mappedHere.map((guid) => toolsByGuid.get(guid)?.catalogNumber ?? guid),
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
    toolsByGuid,
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
  escapeRef.current = () => {
    /*
      **Escape backs out of a tool assembly being built** (Paul, 2026-09-08:
      "escape key should also get me out of tool assembly dialog"). It is the
      newest thing on the page and it answers no feature, so there is nothing
      underneath it for the press to walk out to — and nothing written to undo,
      which is why one press drops the whole draft rather than a layer of it.
    */
    if (draft?.kind === 'assembly') {
      cancelDraft()
      return
    }
    dispatch({ type: 'escape' })
  }
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

  /** The row on screen where it is a tool assembly the part needs and no feature asked for. */
  const freeAssembly = selectedItem?.kind === 'assembly' ? selectedItem : null
  /** …or one being built, which has no row yet and is still what is on screen. */
  const assemblyOnly = freeAssembly !== null || draft?.kind === 'assembly'

  const listTitle = perFeature
    ? 'One tool per feature'
    : assemblyOnly
      ? /*
          **Named for the row, not for the catalog under it** (Paul,
          2026-09-08). The heading is what the tree is for as much as what the
          table is of, and "Every tool in the catalog" over a stack somebody is
          building says nothing about the stack.
        */
        `${freeAssembly === null ? 'New tool assembly' : labelOf(freeAssembly, nameOf)} — no feature`
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
            : `Cuts the ${namedInline(reading.featureTag)}`

  /**
   * What the table below is a list of.
   *
   * The row's own question while a tool is being chosen; the component
   * otherwise, because "Cuts the pocket" over a list of collet chucks is a
   * heading about a different list.
   */
  /**
   * How many rows each of the three lists has, for the button that opens it.
   *
   * Every one of them is a list this render already derived, so the numbers are
   * whatever the table would draw: narrowed by the feature, by the filters and
   * by what is standing in the stack.
   */
  const listCounts: Readonly<Record<Slot, number>> = {
    tool: treeToolRows.length,
    holder: holderRows.length,
    collet: colletRows.length,
  }

  /**
   * What each of the three lists is called on its button — plural, because a
   * button naming a list is naming rows rather than the slot it fills.
   */
  const SLOT_TABLE_LABEL: Readonly<Record<Slot, string>> = {
    tool: 'Tools',
    holder: 'Holders',
    collet: 'Collets',
  }

  const tableTitle =
    componentSlot === 'holder'
      ? /*
          **And it says which holders.** The rack is narrowed to what can hold
          the stack only while there is a stack; read on its own it is the whole
          crib, and a heading claiming an assembly nobody has started is the kind
          of thing somebody trusts and then cannot square with the count on the
          button beside it.
        */
        asking || assemblyOnly
        ? 'Holders for this assembly'
        : 'Every holder in the crib'
      : componentSlot === 'collet'
        ? asking || assemblyOnly
          ? 'Collets for this assembly'
          : 'Every collet in the crib'
        : listTitle

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
          className={cn('min-h-0', draft === null ? 'overflow-hidden' : 'overflow-visible')}
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
              className={cn(
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
                selected={paintedSet}
                heldRegions={heldRegionList}
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
                      **Beside the list, always** (Paul, 2026-09-07: "the
                      feature detail panel should now show to the right of the
                      feature list"). It used to wrap — beneath while the pair
                      fitted, beside when it did not — which was right while the
                      panel was a short reading. It now carries the tool tree,
                      and a box that changes column as its own contents grow
                      moves the stack somebody is building out from under the
                      mouse.
                    */}
                    {/*
                      **Transparent to the part.** `h-full` is what makes the
                      wrap rule above work, and it also makes this an invisible
                      full-height sheet over the canvas. It arranges the two
                      cards and takes no click of its own; each card says for
                      itself that it does.
                    */}
                    <div className="pointer-events-none flex h-full min-h-0 items-start gap-2">
                      {/*
                        **The presses and the list are one column, and the box
                        being filled in is beside it** (Paul, 2026-09-09:
                        "creating a feature, group, or tool assembly should open
                        the dialog at the top of the part viewer, not in line
                        with the order list row"). The box used to be laid out
                        in the same row as the list, which put its top edge
                        below the three presses — a form opening a row's height
                        down the part rather than at the top of it. This column
                        carries the presses and the rows; the box is the row's
                        second child, so it starts where the viewer does.
                      */}
                      <div className="flex h-full min-h-0 w-80 shrink-0 flex-col items-start gap-2">
                        {/*
                        **The three ways to add sit over the part, above
                        everything else** (Paul, 2026-09-08: "move the add
                        feature, add group, and add tool assembly buttons so
                        they are always at the top left of the part viewer").
                        They were the last thing in the Features card, which is
                        the one place they cannot be relied on to be: the list
                        fills the space it has and then scrolls, so on a long
                        list all three were below the fold.
                      */}
                        <AddBar
                          addingFeature={draft?.kind === 'feature' && kept.length === 0}
                          onAddFeature={() => {
                            /*
                            Pressed with nothing being read it asks for a face
                            rather than refusing to be pressed (Paul,
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
                          onAddAssembly={startAddAssembly}
                        />
                        {/* Pressed with nothing being read, the button asks for
                          the one thing it needs rather than refusing to be
                          pressed. */}
                        {draft?.kind === 'feature' && kept.length === 0 ? (
                          <p className="text-2xs filter-off text-info rounded px-1.5 py-0.5">
                            Click a face on the part, then press + Feature.
                          </p>
                        ) : null}
                        {/*
                        **The rows sit on the part, not in a box** (Paul,
                        2026-09-08: "I'd also love to make the list rows sit on
                        top of the 3d viewer rather than in the box"). The card
                        was a solid panel the width of the list whether the list
                        was one row or twelve, so it covered the part with its
                        own ground to say nothing.

                        It is `pointer-events-none`, and the list inside it takes
                        the pointer for its own rows: an invisible column
                        carrying `pointer-events: auto` is a curtain over the
                        canvas, which is the defect `tests/on-the-part.spec.ts`
                        § "at a laptop width" exists for.

                        **It still fills the space it has, then scrolls** (Paul,
                        2026-09-02: "the list goes down to the top of the table
                        if it is shown … then is scrollable"). `max-h-full` is
                        the top of the table: the overlay is floored to the
                        viewer, and the viewer stops where the table starts.
                      */}
                        <div className="pointer-events-none flex max-h-full min-h-0 w-full flex-1 flex-col">
                          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                            {/*
                            **Named for what it is for** (Paul, 2026-09-08:
                            "instead of features, the list should be renamed
                            'order list'"). Every row on it is a thing being
                            ordered — a feature, a group, or an assembly the
                            part needs — and nothing reaches the bill except
                            because a row here put it there. The page in the
                            header is the same list read the other way round.
                          */}
                            <h4 className="text-2xs flex shrink-0 items-center gap-1.5 font-semibold tracking-wide text-zinc-500 uppercase [text-shadow:0_1px_2px_var(--color-zinc-950)]">
                              <span className="text-zinc-600">
                                <CursorClickIcon />
                              </span>
                              Order list
                              {/*
                                **Two icons beside the heading** (Paul,
                                2026-09-09). The same two readings the page in
                                the header offers, in the space a heading
                                already has — a row of words under the heading
                                would be a second line of chrome over the part,
                                and the part is what this list stands on.
                              */}
                              <span className="pointer-events-auto ml-auto flex items-center gap-0.5">
                                {(
                                  [
                                    ['assembly', 'Assemblies', <TreeStructureIcon key="a" />],
                                    ['components', 'Components', <ListBulletsIcon key="c" />],
                                  ] as const
                                ).map(([view, label, icon]) => (
                                  <IconButton
                                    key={view}
                                    type="button"
                                    size="sm"
                                    variant="muted"
                                    aria-pressed={orderView === view}
                                    aria-label={`Show the order list by ${label.toLowerCase()}`}
                                    title={
                                      view === 'assembly'
                                        ? 'The assemblies on the order list, with their components'
                                        : 'Every component on the order list, and how many to order'
                                    }
                                    onClick={() => setOrderView(view)}
                                    className={cn(
                                      '!size-5 shrink-0 rounded border-0 p-0 transition [&_svg]:!size-3.5',
                                      orderView === view
                                        ? 'bg-info/15 text-info'
                                        : 'bg-transparent text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200',
                                    )}
                                  >
                                    {icon}
                                  </IconButton>
                                ))}
                              </span>
                            </h4>

                            {/*
                          **The list, and one control that grows it** (Paul,
                          2026-09-02: "I see a plus sign where the features
                          dialog is"). What was one field showing the face under
                          the mouse is now the work above and the reading below.
                        */}
                            {orderView === 'components' ? (
                              <ComponentTally
                                rows={tallyRows}
                                empty="Nothing on the order list yet."
                                sort={orderSort.by}
                                descending={orderSort.descending}
                                /* Pressing the column it is already read by
                                   turns it round; pressing another opens that
                                   one the way it opens. */
                                onSort={(by) =>
                                  setOrderSort((current) =>
                                    current.by === by
                                      ? { by, descending: !current.descending }
                                      : { by, descending: opensDescending(by) },
                                  )
                                }
                              />
                            ) : (
                              <FeatureListPanel
                                items={orderRows}
                                selectedId={selectedId}
                                selectedTag={selectedTag}
                                onSelect={(id, tag, toolGuid) =>
                                  selectRow(id, tag ?? null, toolGuid)
                                }
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
                                onEdit={startEdit}
                                /*
                                **The name is on the stack, and the line stands
                                for the stack** (Paul, 2026-09-08: "it still
                                isn't showing the name in the order list in the
                                parts page"). The bill holds tools; the tree
                                holds what they were called — matched by what
                                the stack was *ordered* as, so swapping the
                                cutter keeps the line pointing at its own stack.
                              */
                                assemblyOf={(itemId, toolGuid) => {
                                  const stacks = trees[itemId] ?? []
                                  const stack = stacks.find(
                                    (each) => (each.orderedTool ?? each.toolGuid) === toolGuid,
                                  )
                                  if (stack?.name === undefined) {
                                    return null
                                  }
                                  const name = assemblyName(stacks, stack)
                                  /*
                                  Not twice: a part-level assembly's row is
                                  called what the stack in it was called, and a
                                  line repeating the heading over it is noise.
                                */
                                  const item = itemNamed(list, itemId)
                                  return item !== null && labelOf(item, nameOf) === name
                                    ? null
                                    : name
                                }}
                                renamingId={renamingId}
                                onRenameStart={(id) => setRenamingId(id)}
                                onRename={(id, name) => {
                                  setList((current) => renameItem(current, id, name))
                                  setRenamingId(null)
                                }}
                                onRenameCancel={() => setRenamingId(null)}
                                onRemove={(id) => {
                                  const going = itemNamed(list, id)
                                  if (going !== null) {
                                    // Its features, or — for a part-level assembly
                                    // — the key its own lines are kept under.
                                    unbill(sheetKeysOf(going))
                                  }
                                  /*
                                **And its tree with it.** Ids are arithmetic, so
                                a part emptied of rows starts again at
                                `feature-1` — a tree left behind would attach
                                itself to whatever row took that id next.
                              */
                                  forgetTree(id)
                                  setList((current) => removeItem(current, id))
                                  if (selectedId === id) {
                                    selectRow(null)
                                  }
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/*
                      **Beside the list, and level with the top of the part**
                      (Paul, 2026-09-09) — it is the row's second child now, so
                      `self-start` is the top of the viewer rather than the top
                      of the list's rows.

                      **Beside the list, not under it** (Paul, 2026-09-02: "show
                      the feature and group editor to the right of the feature
                      list"). The list is what has been asked and this is the
                      one thing being asked *now*; stacked, the second pushed
                      the first up until neither had room, and on a part with a
                      dozen rows the form somebody was filling in was the half
                      that went off the bottom.
                    */}
                      {draft?.kind === 'group' || showReading || showTree ? (
                        <Card
                          className={cn(
                            'filter-off pointer-events-auto max-h-full shrink-0 self-start overflow-y-auto',
                            draft?.kind === 'group' ? 'w-[26rem]' : 'w-80',
                          )}
                        >
                          {/*
                            **The way out is the X in the corner** (Paul,
                            2026-09-09). It is the same press in all three — a
                            feature, a group, a tool assembly — and it is the
                            only thing in the box that closes it, now that a
                            stack reaches the order list through the press under
                            it and nothing else.

                            **Level with the first row of the box** (Paul,
                            2026-09-09: "can we get the x in the same row as the
                            first row of the dialog?"). A row of its own put a
                            blank band above the reading; the box is the column
                            beside it instead, so the X sits at the top right of
                            whatever the box opens with — the reading, the group
                            heading, or the tree.
                          */}
                          <div className="flex items-start gap-1 p-2">
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                              {draft?.kind === 'group' ? (
                                <GroupEditor
                                  tags={kept}
                                  results={draft.results}
                                  onDrop={(tag) => dispatch({ type: 'toggle', featureTag: tag })}
                                  nameOf={nameOf}
                                  onCancel={cancelDraft}
                                  /*
                              **The tool is part of the answer** (Paul,
                              2026-09-02: "I must select a tool from the list
                              when creating a feature, and that is what adds it
                              to the BOM"). The list below is showing what fits
                              what is being built; picking a row there is what
                              finishes it.
                            */
                                  picked={
                                    draft.results === 'each' ? draftEach.picked : panelTool !== null
                                  }
                                  matching={draftEach.status}
                                  editing={draft.editing !== null}
                                  /*
                              **What the group measures, at its worst** (Paul,
                              2026-09-08). The feature box says what one
                              feature is; a group's is the hardest of its
                              features', with the feature that set it named.
                            */
                                  readings={draftReadings}
                                  unit={unit}
                                  mixed={draftMixedBores}
                                  /*
                                    **The thread is the whole group's** (Paul,
                                    2026-09-09). `writeThread` writes it across
                                    every hole of that bore in the draft, which
                                    is what the group is.
                                  */
                                  {...(draftBore === null
                                    ? {}
                                    : {
                                        thread: {
                                          holeDiameter: draftBore,
                                          mode: draftThread.mode,
                                          spec: draftThread.spec,
                                          onChange: (choice: HoleChoice) => {
                                            writeThread(choice, kept, draftBore)
                                            // A threaded hole is drilled, not
                                            // milled — the same demand the
                                            // reading panel's thread writes.
                                            applyTerm(
                                              'form',
                                              choice.mode === 'plain' ? [] : THREADED_FORMS,
                                            )
                                          },
                                        },
                                      })}
                                />
                              ) : !showReading /*
                              The box can now be open for the tree alone — a
                              group's row is answered by stacks and reads no
                              face — and an empty reading over it says only
                              that nothing is being read.
                            */ ? null : (
                                <SelectionPanel
                                  feature={reading}
                                  nameOf={nameOf}
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
                                  /*
                                    **The grouping is offered, not applied**
                                    (Paul, 2026-09-09: "In Add Feature, I should
                                    be able to select a single hole. The Add
                                    Feature Dialog should warn me there are
                                    other identical holes and ask if I want to
                                    add them in a group"). A hole used to be
                                    kept with its siblings on every path, so one
                                    could not be asked about; the offer is where
                                    that rule went, and taking it is what turns
                                    grouping on.
                                  */
                                  {...(offerGroup === null ? {} : { identical: offerGroup })}
                                  {...(holeDiameter === null
                                    ? {}
                                    : {
                                        thread: {
                                          holeDiameter,
                                          mode: holeChoice.mode,
                                          spec: threadSpec,
                                          onChange: (choice: HoleChoice) => {
                                            /*
                                            **A thread applies to what is
                                            selected** (Paul, 2026-09-09) — the
                                            row or the draft where the hole is
                                            part of one, and the hole alone
                                            where it is not. It used to be
                                            written across every identical hole
                                            on the part, which was the same
                                            thing while a hole stood for its
                                            siblings and is a thread on
                                            thirty-eight holes nobody chose it
                                            for now that one can be asked about
                                            on its own.
                                          */
                                            writeThread(choice, threadScope, holeDiameter)
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
                                        },
                                      })}
                                />
                              )}

                              {/*
                              **The stacks sit under the reading that asked for
                              them** (Paul, 2026-09-07: "moving the tool tree to
                              the feature panel"). It is still the one editable
                              copy — the feature list shows each row's answers as
                              a summary, and this is where a stack is put
                              together — but it now stands beside the feature it
                              answers rather than at the bottom of the page, and
                              the table below is the list for whichever slot is
                              open here.
                            */}
                              {showTree && node !== null ? (
                                <AssemblyTreePanel
                                  assemblies={assemblies}
                                  selected={node}
                                  onSelect={selectNode}
                                  labelFor={slotLabelFor}
                                  orderedFor={orderedLabelFor}
                                  warningFor={warningFor}
                                  onClear={clearSlot}
                                  actionsFor={treeActionsFor}
                                  /*
                                    **A part-level assembly is one stack**
                                    (Paul, 2026-09-08: "we can also remove the
                                    add assembly button from + Tool Assembly").
                                    It answers no feature, so a second stack
                                    under it is a second thing to order with
                                    nothing to tell it apart — another one is
                                    another _+ Tool Assembly_, with a row and a
                                    name of its own.
                                  */
                                  {...(assemblyOnly
                                    ? {}
                                    : { onAdd: () => writeTree(addAssembly(assemblies)) })}
                                  onRemove={(id) => writeTree(removeAssembly(assemblies, id))}
                                  onRename={(id, name) =>
                                    writeTree(renameAssembly(assemblies, id, name))
                                  }
                                  title={listTitle}
                                  confirmed={activeItem !== null}
                                />
                              ) : null}

                              {/*
                              **A row reaches the list by being ordered** (Paul,
                              2026-09-09: "I no longer need these cancel or
                              create group and add tool buttons — the group is
                              created and added when a tool assembly is created
                              and added to the order list. Same with add this
                              feature").

                              *Add this feature*, *Create group and add tool* and
                              the Cancel beside each of them were a second way to
                              do what the press under the stack already does:
                              `treeActionsFor`'s `confirm` makes the row and
                              writes the assembly in one press, which is the rule
                              `docs/FEATURE-LIST.md` states. Two presses for one
                              decision is the defect that spec exists to prevent,
                              and the X in the corner is the way out of all three.

                              **What is left is saving an edit.** Changing which
                              features a row holds is not an order, so nothing
                              under the stack commits it — the press below is the
                              only thing that does, and it appears only while a
                              row that already exists is being changed.
                            */}
                              {draft !== null && draft.editing !== null && kept.length > 0 ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button size="sm" onClick={confirmDraft}>
                                    {draft.kind === 'group' ? 'Save group' : 'Save this feature'}
                                  </Button>
                                </div>
                              ) : null}
                            </div>

                            <IconButton
                              variant="muted"
                              size="sm"
                              aria-label="Close this dialog"
                              title="Close"
                              onClick={closePanel}
                              className="!size-5 shrink-0 border-0 bg-transparent text-zinc-500 hover:text-zinc-200 [&_svg]:!size-3.5"
                            >
                              <XIcon aria-hidden="true" />
                            </IconButton>
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
                      name={nameOf(info)}
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
                  dispatch({ type: 'click', pick })
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
                  {/*
                    A `div`, not a `p`: this is the list's header bar, and it
                    holds two tab buttons and the column picker. A `p` may hold
                    phrasing content only, so the picker's own `div` inside it
                    was invalid nesting — which the browser corrects by closing
                    the paragraph early, and which React reports as a hydration
                    error because the tree it built is not the tree that came
                    back (2026-09-02).
                  */}
                  <div
                    data-list-chrome
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 border-b border-zinc-900 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 min-h-8 flex-wrap items-center gap-2">
                      {/*
                        **Which of the three lists this is, as three buttons**
                        (Paul, 2026-09-07: "I want the table tabs for tools,
                        holders, and collets back, just as buttons like the
                        filters button. The one that is active should be
                        highlighted"). They were a full-width tab row for an
                        afternoon and then nothing at all; what was wanted is the
                        switch the *table* needs — small, in its chrome, beside
                        the Filters button they are dressed as — and an indicator
                        of which list is on screen.

                        They are the tree's slots, not a control beside it:
                        pressing one opens that slot on the open stack, so the
                        buttons and the tree cannot disagree about what the rows
                        below are for. Drawn only while there is a stack, because
                        with no feature there is no assembly for a holder to be
                        offered against and the table is the catalog.
                      */}
                      {!perFeature
                        ? SLOTS.map((slot) => {
                            const open = listKind === slot
                            return (
                              <Button
                                key={slot}
                                type="button"
                                size="sm"
                                variant="secondary"
                                aria-pressed={open}
                                onClick={() => chooseList(slot)}
                                className={cn(
                                  'flex items-center gap-1.5 rounded border px-2 py-1 text-xs',
                                  open
                                    ? 'border-primary/60 bg-primary/15 text-zinc-100'
                                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                                )}
                              >
                                {SLOT_TABLE_LABEL[slot]}
                                {/*
                                  **Each button counts its own list** (Paul,
                                  2026-09-07: "the count is always showing the
                                  tool count. This should be unique to the
                                  component … and it should be shown in the
                                  buttons"). One number beside the heading
                                  counted tools whichever of the three was on
                                  screen, so a rack of three holders was headed
                                  by a nine.

                                  Derived, so they move with everything that
                                  narrows a list: the feature being asked about,
                                  the filters, and the components already in the
                                  stack — pick a holder and the collets left are
                                  the ones that close on it.
                                */}
                                <span
                                  className={cn(
                                    'text-2xs',
                                    open ? 'text-zinc-400' : 'text-zinc-500',
                                  )}
                                >
                                  {/*
                                    A dash while the matching is still running:
                                    all three lists are empty until it answers,
                                    and three zeroes beside a spinner is a count
                                    somebody reads as "nothing fits".
                                  */}
                                  {tablePending ? '—' : listCounts[slot]}
                                </span>
                              </Button>
                            )
                          })
                        : null}
                      {/*
                        The heading of whichever list is on screen. A threaded
                        hole used to put two tabs here — taps, then drills —
                        and the pair of stacks in the tree is that pair of tabs
                        now, so there is one title and the stack says which
                        list it is over.
                      */}
                      <span className="text-zinc-200">{tableTitle}</span>
                      {/*
                        **How the thread is made lives over the lists it
                        decides** (Paul, 2026-09-07: "we should no longer show
                        the 'cut tap' and 'form tap' rows in the feature dialog
                        when applying threads to a hole — it should just return
                        the right tap drills"). Saying what thread the hole is
                        for and saying whether it will be cut or rolled are two
                        decisions, and only the second one is about these lists:
                        the two predrills are half a millimetre apart on an M6,
                        and the drills are judged against whichever is chosen.
                        So it sits beside the list rather than on the dialog
                        somebody opens to name the thread.

                        **Over the taps as well as the drills** (Paul,
                        2026-09-09). It decides both — which taps the list holds
                        and which hole the drills are measured against — and one
                        control written to one mode is what keeps the pair of
                        stacks agreeing about the same thread. Not over a holder
                        or collet list, which it decides nothing about.
                      */}
                      {threadSpec === null ||
                      perFeature ||
                      componentSlot !== null ||
                      holeDiameter === null ? null : (
                        <PredrillChoice
                          spec={threadSpec}
                          mode={holeChoice.mode}
                          /*
                            **The same scope as the thread it refines** (Paul,
                            2026-09-09). Cut tap or form tap is a decision about
                            the hole the thread is on, and this wrote it to the
                            focused hole alone — so a group's predrill moved one
                            hole of thirty-nine and left the rest on the tap
                            drill they were chosen with.
                          */
                          onChange={(mode) =>
                            writeThread({ mode, spec: threadSpec }, threadScope, holeDiameter)
                          }
                          holeDiameter={holeDiameter}
                          deviation={drillDeviation}
                          unit={unit}
                        />
                      )}
                      {/* Nothing to count where nothing has been asked of this
                        panel: a number beside "nothing selected" reads as a
                        count of tools that are not there. */}
                      {/* One number beside the heading counted tools whichever
                        list was on screen; each button counts its own now. */}
                      {/*
                        **What the list is not showing is said where the list
                        is** — the rule this page follows for a rack the drawable
                        filter thinned and for the rules' own removals. The
                        button beside it counts what matched; this says how much
                        of that is on screen.
                      */}
                      {rowsHidden > 0 && componentSlot === null ? (
                        <span
                          className="text-2xs text-zinc-500"
                          title="The table sorts every row it is given, so it is handed the first two thousand. Narrow the list with the filters, the search box, or a feature on the part."
                        >
                          showing the first {String(tableRows.length)} — narrow the list to reach
                          the other {String(rowsHidden)}
                        </span>
                      ) : null}
                      {tablePending ? (
                        <span
                          role="status"
                          title="Updating compatible tools"
                          className="flex items-center text-info"
                        >
                          <span
                            aria-hidden="true"
                            className="size-3 animate-spin rounded-full border-2 border-info/30 border-t-info"
                          />
                          <span className="sr-only">Updating compatible tools...</span>
                        </span>
                      ) : null}
                      {tableError !== null && detailed !== null ? (
                        <span role="alert" className="text-2xs text-danger">
                          {tableError}
                        </span>
                      ) : null}
                      {/*
                      **The notes are about the list on show** (Paul,
                      2026-09-02). What the rules took off the drill list is
                      true of the drills and says nothing about the taps, and
                      it was printed over both. The tap tab says what its own
                      list was matched on, and what is wrong with it.
                    */}
                      {/* None of them are about a panel that is waiting to be
                        asked: they describe a list that is not on screen. */}
                      {/*
                        **What the drawable rule hid** (Paul, 2026-09-07). The
                        table is only the holders with a shape, so the ones that
                        fit and have no model have to be counted somewhere or an
                        empty list reads as "nothing in the rack fits this".
                      */}
                      {componentSlot === 'holder' ? (
                        undrawableHolders > 0 ? (
                          <span
                            className="text-2xs text-zinc-500"
                            title="A holder is drawn from its measured CAD model, or from a published nose diameter. These have neither, so there is no shape to put under the tool."
                          >
                            {undrawableHolders} more fit but have no model to draw
                          </span>
                        ) : null
                      ) : perFeature ? null : tapping && threadSpec !== null ? (
                        <>
                          {/*
                            **Each list says what it was swept on, and they are
                            two different numbers** (Paul, 2026-09-09: "in
                            drills, the highlighted message should show the tap
                            or form drill size (the predrill size) it is looking
                            for"). The taps were matched on the thread's nominal
                            size; the drills on the predrill the chosen tap
                            starts from — ⌀0.089 in against ⌀0.0995 in on a
                            #4-40. Printing the tap's number over the drills
                            named a diameter no row in that list is near, on a
                            list whose whole sweep is the other one.
                          */}
                          <span className="text-2xs text-zinc-500">
                            {holeChoice.mode === 'thread mill'
                              ? `inside the ⌀${formatLength(minorOf(threadSpec), unit)} minor diameter`
                              : tappingNow
                                ? threadNote(threadSpec, unit)
                                : shortOfDrills
                                  ? millStandInNote(threadSpec, holeChoice.mode, unit, millsListed)
                                  : predrillNote(threadSpec, holeChoice.mode, unit)}
                          </span>
                          {/* Both are about the tap list: how far the taps reach
                            and whether the crib holds one. */}
                          {makers.short && tappingNow ? (
                            <span className="text-2xs text-amber-300">
                              none reach the bottom — the closest are shown
                            </span>
                          ) : null}
                          {makers.unheld && tappingNow ? (
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
                          {(detailed?.excludedCount ?? 0) > 0 && reading !== null ? (
                            <span className="text-2xs text-zinc-500" title={tightest ?? undefined}>
                              {detailed?.excludedCount ?? 0} removed by the rules
                              {tightest ? ` — most by ${tightest}` : ''}
                            </span>
                          ) : null}
                          {fitting.length > narrowed.length ? (
                            <span className="text-2xs text-amber-300/80">
                              {fitting.length - narrowed.length} that fit are hidden by the filters
                            </span>
                          ) : null}
                          {/*
                            **A live override is said where the list is, and
                            changed where it was made** (Paul, 2026-09-08: "the
                            override the rules button should be in the filter
                            dialog rather than always shown"). This is the note,
                            not the control: the tick that confirms one is in
                            the column's own dialog, because that is the rule it
                            overrules.
                          */}
                          {overriding.length > 0 && overrideTools.length > 0 ? (
                            <span
                              className="text-2xs text-zinc-400"
                              title="Confirmed in that column's filter. Clearing the filter, or backing it out to what the geometry asked for, puts the rule back."
                            >
                              {overrideTools.length} the {overridden} rules turn down are listed
                              {/*
                                **No silent caps.** The list cannot draw more
                                rows than this whether they are overridden or
                                not, and a truncated answer that reads as the
                                whole one is what sent somebody looking for
                                half-inch cutters that were never on it.
                              */}
                              {(detailed?.overridableCount ?? 0) > overrideTools.length
                                ? ` of ${String(detailed?.overridableCount ?? 0)} — narrow the filters to reach the rest`
                                : ''}
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
                      onClear={() => {
                        if (componentSlot === 'holder') {
                          setHolderQuery(NO_QUERY)
                          return
                        }
                        if (componentSlot === 'collet') {
                          setColletQuery(NO_QUERY)
                          return
                        }
                        if (tappingNow) {
                          clearTapFilters()
                          return
                        }
                        setNumberSearch('')
                        apply(EMPTY_QUERY)
                      }}
                      /*
                        **What is narrowing the list, named where it can be
                        cleared** (Paul, 2026-09-08, and 2026-09-09: "in Tap, it
                        shows 'Clear 4 filters' but I only see tool type. What
                        are the 4 filters active? It needs to be visible.").
                        Most of the filters are column headers now, and a header
                        on a column somebody has since hidden is a filter with
                        nothing on screen pointing at it — so the count includes
                        them and the press names every one of them.

                        **Per list, because a filter is only a filter over the
                        rows it reaches.** The tap list is swept out of the
                        catalog by the thread, so the drill half of the form
                        filter and every range the rules put on a drill narrow
                        nothing on it: counting them there named three filters
                        that table does not have and cannot show. It counts the
                        two `askOfTapColumn` asks.
                      */
                      set={
                        componentSlot === 'holder'
                          ? narrowingNames(holderQuery, HOLDER_COLUMNS)
                          : componentSlot === 'collet'
                            ? narrowingNames(colletQuery, COLLET_COLUMNS)
                            : tappingNow
                              ? narrowingNames(
                                  {
                                    text: numberSearch,
                                    terms: { type: shownTapTypes },
                                    /*
                                      **The bounds the part set count too**
                                      (Paul, 2026-09-09: "button should show to
                                      clear 3 filters not 1 in this situation").
                                      They narrow the list and they are drawn on
                                      it, so leaving them out made the figure
                                      disagree with the funnels a second time —
                                      the same defect from the other end. Grey
                                      rather than lit is what says a number is
                                      not yours to type; it was never a reason
                                      to stop counting it.
                                    */
                                    bounds: tapRanges,
                                  },
                                  TAP_COLUMNS,
                                )
                              : narrowingNames(
                                  {
                                    text: numberSearch || query.text,
                                    terms: query.terms,
                                    bounds: query.ranges,
                                  },
                                  TOOL_COLUMNS,
                                )
                      }
                      filters={
                        /*
                          **A holder list has no filter buttons at all.** Every
                          question about a holder or a collet is a question
                          about one of its columns, so all of them are asked in
                          the headings; the tool list keeps the few no column
                          shows.
                        */
                        componentSlot !== null ? undefined : (
                          <FilterPanel
                            facets={facets}
                            query={query}
                            onQuery={apply}
                            counts={countsOn}
                            unit={unit}
                            holding={{ tapers, series: colletSeries }}
                            materialGroup={materialGroup}
                            onMaterial={chooseMaterial}
                            only={BUTTON_FILTERS}
                            /*
                              **The floor allowance and the clamping length
                              are off the page** (Paul, 2026-09-08), with the
                              rule behind each still running: the sheet's
                              values are what the matching reads, and nothing
                              on screen asks to change them for now.
                            */
                            matching={{
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
                        )
                      }
                      actions={
                        /*
                          **The picker edits the list that is open**, and under
                          the tree a list can be holders or collets as well as
                          tools. The three sets are kept apart for the reason the
                          tap set is: a code hidden in one means nothing in
                          another, and a nose diameter is not a column a tap has.
                        */
                        componentSlot !== null ? (
                          <ColumnPicker
                            columns={orderedCodes(
                              (componentSlot === 'holder' ? HOLDER_COLUMNS : COLLET_COLUMNS).map(
                                (column) => column.code,
                              ),
                              componentSlot === 'holder' ? holderColumnOrder : colletColumnOrder,
                            ).flatMap((code) =>
                              (componentSlot === 'holder' ? HOLDER_COLUMNS : COLLET_COLUMNS)
                                .filter((column) => column.code === code)
                                .map((column) => ({ code: column.code, label: column.label })),
                            )}
                            shown={(componentSlot === 'holder' ? HOLDER_COLUMNS : COLLET_COLUMNS)
                              .filter(
                                (column) =>
                                  !(
                                    componentSlot === 'holder'
                                      ? hiddenHolderColumns
                                      : hiddenColletColumns
                                  ).includes(column.code),
                              )
                              .map((column) => column.code)}
                            onToggle={(code) => {
                              const set =
                                componentSlot === 'holder'
                                  ? setHiddenHolderColumns
                                  : setHiddenColletColumns
                              set((current) =>
                                current.includes(code)
                                  ? current.filter((each) => each !== code)
                                  : [...current, code],
                              )
                            }}
                            onReorder={
                              componentSlot === 'holder'
                                ? setHolderColumnOrder
                                : setColletColumnOrder
                            }
                          />
                        ) : (
                          <ColumnPicker
                            columns={orderedCodes(
                              (tappingNow ? TAP_COLUMNS : TOOL_COLUMNS).map(
                                (column) => column.code,
                              ),
                              tappingNow ? tapColumnOrder : columnOrder,
                            ).flatMap((code) =>
                              (tappingNow ? TAP_COLUMNS : TOOL_COLUMNS)
                                .filter((column) => column.code === code)
                                .map((column) => ({ code: column.code, label: column.label })),
                            )}
                            shown={(tappingNow ? TAP_COLUMNS : TOOL_COLUMNS)
                              .filter(
                                (column) =>
                                  !(tappingNow ? hiddenTapColumns : hiddenColumns).includes(
                                    column.code,
                                  ),
                              )
                              .map((column) => column.code)}
                            onToggle={(code) => {
                              if (tappingNow) {
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
                            onReorder={tappingNow ? setTapColumnOrder : setColumnOrder}
                          />
                        )
                      }
                    />
                  </div>
                  <div
                    // The UI table owns the panel's virtualized scroll area.
                    className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
                  >
                    {/*
                      **The tool list stays mounted while a rack is on screen**
                      (Paul, 2026-09-07: "it takes a long time to go back to the
                      tools tab in the table"). Rebuilding it cost one 2.7-second
                      task every time, measured on the whole 38,000-tool catalog:
                      the kit's table runs a sort modifier over the rows it is
                      handed and that modifier reduces with `concat`, which is
                      quadratic. It runs when the data changes, so a list that is
                      hidden rather than unmounted costs nothing to come back to.
                    */}
                    <div
                      className={cn(
                        'flex min-h-0 min-w-0 flex-1',
                        componentSlot === null ? '' : 'hidden',
                      )}
                    >
                      {perFeature ? (
                        <p className="p-4 text-sm text-zinc-500">
                          Tools will automatically be selected for each feature. After creating the
                          group, click on a feature in the list to see all compatible tools.
                        </p>
                      ) : asking && detailed === null && !tappingNow ? (
                        <TablePlaceholder error={tableError} />
                      ) : tappingNow ? (
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
                          tools={treeToolRows}
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
                          chosen={assembly?.toolGuid ?? null}
                          onChoose={(each) => {
                            setChosenTool(each.guid)
                            fillSlot(each.guid)
                          }}
                          inBom={(each) => keptHere.has(each.guid)}
                          keptElsewhere={(each) => bom.has(each.guid) && !keptHere.has(each.guid)}
                          usedOn={(guid) => usedOn(guid)}
                          below={belowHolderOf}
                          filtering={tapFiltering}
                        />
                      ) : (
                        <PartToolTable
                          // Kept for this feature, then the sheet's order or
                          // whatever column the list is sorted by.
                          tools={tableRows}
                          unit={unit}
                          chosen={assembly?.toolGuid ?? null}
                          /*
                          **A row in the table lands in the slot that is open**
                          (Paul, 2026-09-07). Under the tree, clicking a tool
                          puts it in the stack rather than only opening it on
                          the right; the bill is still written by the confirm in
                          that panel, so nothing reaches an order because a row
                          was highlighted.
                        */
                          onChoose={(each) => {
                            setChosenTool(each.guid)
                            fillSlot(each.guid, removedByRules(each.guid))
                          }}
                          hiddenColumns={hiddenColumns}
                          columnOrder={columnOrder}
                          marks={marksOf}
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
                          usedOn={(guid) => usedOn(guid)}
                          below={belowHolderOf}
                          filtering={toolFiltering}
                        />
                      )}
                    </div>
                    {componentSlot === null ? null : (
                      <div className="absolute inset-0 flex min-h-0 min-w-0">
                        <ComponentTable
                          kind={componentSlot}
                          records={componentSlot === 'holder' ? holderList : colletList}
                          unit={unit}
                          columns={componentSlot === 'holder' ? HOLDER_COLUMNS : COLLET_COLUMNS}
                          hiddenColumns={
                            componentSlot === 'holder' ? hiddenHolderColumns : hiddenColletColumns
                          }
                          columnOrder={
                            componentSlot === 'holder' ? holderColumnOrder : colletColumnOrder
                          }
                          chosen={
                            looking
                              ? lookedUp
                              : componentSlot === 'holder'
                                ? (assembly?.holderGuid ?? null)
                                : (assembly?.colletGuid ?? null)
                          }
                          /*
                          A row fills the slot the tree has open; with no stack
                          open there is no slot, and the click is a look-up the
                          panel on the right reads out.
                        */
                          onChoose={looking ? setLookedUp : fillSlot}
                          /*
                            Every question about a holder or a collet is asked
                            in its own column heading; the pool rather than the
                            list, so an axis still offers what choosing it
                            would bring back.
                          */
                          filtering={{
                            query: componentSlot === 'holder' ? holderQuery : colletQuery,
                            onQuery: componentSlot === 'holder' ? setHolderQuery : setColletQuery,
                            options: (code) =>
                              optionsOn(
                                componentSlot,
                                componentSlot === 'holder' ? holderPool : colletPool,
                                code,
                              ),
                          }}
                          usedIn={heldElsewhere}
                          onFeature={(guid) => guid === savedInSlot}
                          usedOn={usedOn}
                          gap={componentSlot === 'holder' ? holderGap : undefined}
                          empty={
                            whyEmpty(
                              componentSlot === 'holder' ? holderRows.length : colletRows.length,
                              { tool: treeTool, holder: treeHolder, collet: treeCollet },
                              {},
                              // Both lists are narrowed to the feature's own tools
                              // whenever there is a feature, so both can be empty
                              // for that reason rather than for an empty crib.
                              asking,
                              /*
                                And a collet list can now be empty for a third
                                reason: the chuck above it is one the rack offers
                                without the crib stocking anything that closes on
                                it. That is the fact worth printing, over the two
                                general ones.
                              */
                              componentSlot === 'collet' && treeHolder !== null
                                ? holderGap(treeHolder.guid)
                                : null,
                            ) ?? undefined
                          }
                        />
                      </div>
                    )}
                    {tablePending && detailed !== null ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-zinc-950/10"
                      />
                    ) : null}
                  </div>
                </div>
              </Card>
            </Panels.Panel>
          </Panels.Group>
        </Panels.Panel>

        <Panels.Separator className={separator} />

        {/*
          The tool, the stack that holds it, and the part around it. The
          assembly came out on 2026-08-31 while the holder half was being
          sorted out; measured holder profiles landed on 2026-09-02, so it is
          back — with the feature's own reach curve, which this page has had in
          hand the whole time and was spending only on the holder list.
        */}
        <Panels.Panel className="min-h-0 overflow-hidden" minSize={280}>
          {/*
            **The stack, and the component being read** (Paul, 2026-09-07: "as
            components are added, they can all be shown in the right panel …
            selected in the table and confirmed in the right hand panel"). The
            tool's own reading is unchanged and still `<ToolDetails>`; what is
            new is that a holder and a collet get the same panel, and that the
            bill is written from here rather than from a highlighted row.
          */}
          {assembly !== null && node !== null ? (
            /*
              `overflow-hidden`, not `auto`: the panel inside is a full-height
              column whose regions scroll themselves, and a scrolling card would
              give the drawing an indefinite box to measure itself against.
            */
            <Card className="size-full overflow-hidden">
              <AssemblyPanel
                tool={treeTool}
                holder={treeHolder}
                collet={treeCollet}
                selected={node.slot}
                unit={unit}
                /*
                  **No buttons here any more** (Paul, 2026-09-07: "move the
                  confirmation of adding a tool tree component to a feature to
                  the feature dialog"). What this panel is for is reading the
                  component the tree has open — the stack drawn as far as it is
                  chosen, and the fields the vendor published — and the tick
                  beside the component in the tree is what puts it on the
                  feature.
                */
                notice={nothingToConfirm(assembly)}
                /*
                  One sheet for every slot: the panel decides what goes under
                  the drawing, this decides what the drawing is of. No
                  `holding` — the holder and the collet are slots of the tree
                  with tables of their own, so the panel offers no dropdowns;
                  `stack` is what still draws them.
                */
                toolDetails={
                  treeTool === null
                    ? undefined
                    : (details) => (
                        <ToolDetails
                          tool={treeTool}
                          unit={unit}
                          mappedTo={mappedTo}
                          curve={curve}
                          margins={margins}
                          stack={{ holder: treeHolder, collet: treeCollet }}
                          {...(details === undefined ? {} : { details })}
                        />
                      )
                }
              />
            </Card>
          ) : /*
              **A rack can be read without a feature** (Paul, 2026-09-07). The
              same panel, with no stack around it and nothing to confirm: what
              the vendor published about the one row that was clicked.
            */
          looking && componentSlot !== null && (lookedUpHolder ?? lookedUpCollet) !== null ? (
            <Card className="size-full overflow-hidden">
              <AssemblyPanel
                tool={null}
                holder={lookedUpHolder}
                collet={lookedUpCollet}
                selected={componentSlot}
                unit={unit}
              />
            </Card>
          ) : panelTool ? (
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
                /*
                  The material around the feature being answered, and the room
                  the shop asked to keep from it. Both are already worked out
                  for the holder list; handing them down is what puts the part
                  wall on the sheet beside the tool.
                */
                curve={curve}
                margins={margins}
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
