import { directionIndexOf, sameDirection, type PartPick } from '@toolpath/viewer'
import { type Arrows, arrowsFor, arrowsVisible, nextArrows, shownArrow } from '../shared/arrows'
import { type PaintMode, loadPaintMode, savePaintMode } from '../shared/paint'
import { type Unit, loadUnit, saveUnit } from '../shared/units'
import { Panels, Tabs } from '@toolpath/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { PublicInspectionReport } from '../shared/contracts'
import {
  NOTHING_SELECTED,
  focusWithin,
  type SelectionState,
  heldRegions,
  isEmptySelection,
  pickFace,
  pickForRegion,
  scopeToDirection,
  stepThrough,
} from '../shared/selection'
import { featureFromTags, filterFeatures, tagsOfType } from '../shared/report'
import { gatheredReadings, peekTarget } from '../shared/picks'
import { partClick } from '../shared/part-click'
import { focusedRow, listAt, rowAt, rowsIn } from '../shared/row-nav'
import { sameHoles } from '../shared/hole-groups'
import { byDirection } from '../shared/map-features'
import {
  cutByDirection,
  cutRegionsByDirection,
  cutRegionsByFeature,
  planCoverage,
  uncutRows,
} from '../shared/plan-summary'
import { readingsFor } from '../shared/infer'
import type { Infer } from '../shared/infer'
import {
  focusAfterPrune,
  keeping,
  proposedReadings,
  propose,
  withoutFace,
  withoutReading,
  withReading,
  type Proposal,
} from '../shared/proposal'
import { paintReading } from '../shared/pick-mode'
import { listHighlight, paintByCut, partHighlight } from '../shared/highlighting'
import { useRules } from '../shared/use-rules'
import { judgesPlan } from '../shared/rules'
import { featureScores } from '../shared/feature-score'
import { rulesSummary } from '../shared/rules-summary'
import { partContext } from '../shared/metrics'
import {
  EMPTY_PLAN,
  PASSES,
  claimedRegions,
  coveredRegions,
  cutRegions,
  cutsFace,
  type Pass,
  type SetupPlan,
} from '../shared/setups'
import { withoutEmptied } from '../shared/setups'
import {
  easiestReading,
  lockSetup,
  readingForFace,
  readingOrder,
  setPassFor,
} from '../shared/plan-actions'
import { generate, planForChosen, type Generator } from '../shared/generate'
import { missedBy, setupOffers } from '../shared/setup-offers'
import { SetupChooser } from './setup-chooser'
import {
  START as PICK_START,
  type PickMode,
  clearAll as clearPicking,
  holdDirection as holdPickDirection,
  switchMode,
} from '../shared/pick-mode'
import type { PartFeature } from '../shared/contracts'
import { escapeStep } from '../shared/escape'
import { isTyping, keyIntent } from '../shared/keys'
import { AppHeader } from './app-header'
import { READING_COLORS, SETUP_COLORS, faceColor } from '../shared/selection-colors'
import { claimFace, handedReadings, readingChanged, setFaceCut } from '../shared/faces'
import type { WhatBit } from '../shared/best-reading'
import {
  EMPTY_DRAFT,
  type Draft,
  cutFrom,
  isMade,
  makeFeature,
  readsAs,
  type Touching,
  withFace,
  withGuess,
} from '../shared/make-feature'
import { FaceList } from './face-list'
import { FeatureDetail } from './feature-detail'
import { PartSummary } from './part-summary'
import { RulesPanel } from './rules-panel'
import { ToolpathIcon } from './panel-icons'
import { SetupsPanel } from './setups-panel'
import { MapFeaturesPanel } from './map-features'
import { FeatureViewer } from './feature-viewer'
import { PartViewProvider } from './part-view'

type ViewerTab = 'directions' | 'inspector' | 'rules'

/**
 * A 1px divider needs a grab area wider than 1px, and that area has to come out
 * of one of its neighbours.
 *
 * It takes it from the list, not from the part. A strip over the canvas is a
 * strip where a drag starting there never reaches the viewer at all — the
 * resizer ignores every button but the primary one, so the gesture lands on
 * nothing and reads as a dead spot down the whole edge. A strip over a list
 * costs a couple of pixels of a row nobody aims at.
 *
 * Two pixels still reach over the canvas, which is what lets the cursor change
 * before the pointer is exactly on the line.
 */
const separatorBase =
  "relative z-20 w-px cursor-col-resize hover:border-info data-[separator=active]:border-info before:absolute before:inset-y-0 before:content-['']"

/** The divider with the summary on its left. */
const leftSeparatorClassName = `${separatorBase} before:-left-[8px] before:-right-[2px]`

/** The divider with the detail panel on its right. */
const rightSeparatorClassName = `${separatorBase} before:-left-[2px] before:-right-[8px]`

export const PartInspector = ({
  report,
  jobId,
}: {
  report: PublicInspectionReport
  jobId: string
}) => {
  const [tab, setTab] = useState<ViewerTab>('inspector')
  const [query, setQuery] = useState('')
  const [hoveredTags, setHoveredTags] = useState<string[]>([])
  const [pointerOnPart, setPointerOnPart] = useState(false)
  const [selection, setSelection] = useState<SelectionState>(NOTHING_SELECTED)
  const [activeDirection, setActiveDirection] = useState<number | null>(null)
  const [paintMode, setPaintMode] = useState<PaintMode>('plain')
  /**
   * Which passes a click in the face editor claims.
   *
   * The editor's own switch, not the viewport's pass toggle: that one says which
   * pass the part is *coloured* by, and this one says what a press *does*.
   * Letting a single control mean both is what F63 and F64 were, twice.
   */
  const [facePasses, setFacePasses] = useState<ReadonlyArray<Pass>>(PASSES)

  const [arrows, setArrows] = useState<Arrows>('off')
  /**
   * What the arrows were before a mode put them on screen.
   *
   * Three modes need an arrow pressed to start — By direction, Unmapped and
   * Create — so entering one draws them all, and leaving one used to leave them
   * drawn. The part then stood covered in arrows that nothing on screen
   * explained, in a mode that has no use for them.
   *
   * **Borrowed, not taken**, the same rule the face editor follows with the
   * paint mode. Choosing a way up while in the mode is a decision of its own and
   * ends the loan: the arrows are then showing what was chosen, not what the
   * mode needed.
   */
  const arrowsBefore = useRef<Arrows | null>(null)

  /** Put the arrows on screen for a mode that is worked by pressing one. */
  const borrowArrows = () => {
    arrowsBefore.current ??= arrows
    setArrows('all')
  }

  /** Give them back, unless something since has made them somebody's choice. */
  const returnArrows = () => {
    if (arrowsBefore.current !== null) setArrows(arrowsBefore.current)
    arrowsBefore.current = null
  }

  /**
   * Off, and nothing held — whatever they were before.
   *
   * Not {@link returnArrows}, which restores what the arrows were and does
   * nothing at all once a way up has been chosen, on the reasoning that they
   * are then showing somebody's decision rather than the mode's scaffolding.
   * That reasoning holds inside the mode and stops holding on the way out of
   * it: a way up held in By direction is a **filter on By direction**, and
   * carrying it into By feature leaves an arrow lit over a list it is not
   * filtering.
   */
  const putArrowsAway = () => {
    setArrows('off')
    arrowsBefore.current = null
    setActiveDirection(null)
  }
  const [focusFeature, setFocusFeature] = useState<string | null>(null)

  /*
   * The mapping, held in memory and lost on reload.
   *
   * Decision 2 of the parity plan: this matches what the app already does with
   * rules, which `441b7bc` took from persisted to memory-only. A mapping that
   * survived a reload while the rules beside it did not would be the odd one
   * out. Persistence lands later, for both together.
   */
  const [plan, setPlan] = useState<SetupPlan>(EMPTY_PLAN)

  /*
   * How a click on the part will be read, and what the reading is for.
   *
   * `picking` carries the mode, the painted set and the way up being held —
   * they change together, so they are one state rather than three that can
   * disagree (§3.6 lists thirteen pieces and says most of the picker's bugs
   * were two of them out of step).
   */
  const [picking, setPicking] = useState(PICK_START)
  /*
   * The way up whose work is lit on the part.
   *
   * Named by pressing a direction row: "what does −Y get me here" is one press
   * rather than a column of chips to compare. It is a *third* thing that paints
   * the part, so it is put down by the same gesture as the other two.
   */
  const [litDirection, setLitDirection] = useState<{
    index: number
    tags: readonly string[]
  } | null>(null)

  /*
   * A standing offer: work the app is suggesting and nothing more.
   *
   * Held as a set of faces rather than a set of readings — pruning one face
   * re-covers the rest, where holding readings would make enabling a wall
   * summon the profile that contains it. See `proposal.ts`.
   */
  const [proposal, setProposal] = useState<Proposal | null>(null)
  /** Whether Map features is showing everything nothing cuts. */
  const [showingUncut, setShowingUncut] = useState(false)
  /**
   * The reading whose faces are being listed, if any.
   *
   * Opened by pressing a face count, and it takes the datasheet's place: both
   * are about the same reading, and showing both would ask somebody to hold
   * "twelve faces" and "one of them" at once.
   */
  const [facesFor, setFacesFor] = useState<string | null>(null)
  /**
   * The wash to go back to when the editor closes.
   *
   * The editor paints its own faces green and red, and a direction or
   * difficulty wash underneath is a second opinion about the same surfaces —
   * so it opens on Plain. Restored rather than persisted: the mode is a
   * preference somebody set, and a panel borrowing it should give it back.
   */
  const [washBefore, setWashBefore] = useState<PaintMode | null>(null)

  /**
   * The plan as it was when the editor opened.
   *
   * **Edits land live and commit deliberately.** Every click still writes
   * straight to the plan, because the point of editing on the model is
   * watching the colours change as you work — a draft the part did not paint
   * would be a list of intentions. What was missing was the way back out: the
   * only undo was clicking each face again and remembering what it had been.
   *
   * So the plan is snapshotted on the way in, and leaving is a choice between
   * keeping the work and putting it back.
   */
  const [planBefore, setPlanBefore] = useState<SetupPlan | null>(null)

  const openFaces = (featureTag: string) => {
    setPlanBefore((before) => before ?? plan)
    setWashBefore((before) => before ?? paintMode)
    setPaintMode('plain')
    setFacesFor(featureTag)
    /*
     * **Both, every time it opens.**
     *
     * The switch is session state and nothing put it back, so an editor opened
     * after a session of splitting passes came up armed to cut *finishing
     * only* — and the next click on the part quietly did that instead of what
     * it looks like it does. A mode that persists across the thing it belongs
     * to is a mode nobody remembers setting.
     *
     * Both is also what a tick in this panel has always meant: somebody saying
     * "cut this face here" is describing the work, not one half of it.
     */
    setFacePasses(PASSES)
    // Never armed on the way in. Adding faces is a thing somebody asks for, and
    // an editor that opened ready to swallow the next click would take one.
    setAddingFace(false)
  }

  /** Keep the work, and leave. */
  const saveFaces = () => {
    setPlanBefore(null)
    closeFaces()
  }

  /**
   * Put the plan back as it was, and leave.
   *
   * The whole snapshot rather than an undo of each press: an editor session is
   * a set of changes somebody made together, and unpicking them one at a time
   * is the thing they were trying to avoid by pressing Cancel.
   */
  const cancelFaces = () => {
    if (planBefore !== null) setPlan(planBefore)
    setPlanBefore(null)
    closeFaces()
  }

  const closeFaces = () => {
    setFacesFor(null)
    setAddingFace(false)
    setHoveredFace(null)
    setCurrentFace(null)
    setRevealFace(null)
    if (washBefore !== null) setPaintMode(washBefore)
    setWashBefore(null)
  }
  /** The face under the pointer in that list, lit on the part on its own. */
  const [hoveredFace, setHoveredFace] = useState<number | null>(null)
  /**
   * The face being worked on in that list — opened, or named from the part.
   *
   * Held apart from the hover because it outlives the pointer: it is what
   * somebody is deciding about, and it has to still be on the part when they
   * move the mouse to press something.
   */
  const [currentFace, setCurrentFace] = useState<number | null>(null)
  /**
   * A face named from the part, for the list to open and scroll to.
   *
   * A request rather than a state, like `focusFeature`: naming the same face
   * twice has to read as two requests, or the second one does nothing because
   * the value did not change.
   */
  const [revealFace, setRevealFace] = useState<number | null>(null)
  /**
   * Armed to hand the next face clicked to the reading whose editor is open.
   *
   * A mode rather than a click-and-it-happens, because the faces this catches
   * are the ones the reading does **not** cover — every click on the part while
   * the editor is open would otherwise have to guess between "add this" and
   * "I am done here, show me that instead", and guessing wrong either adds a
   * face nobody asked for or drops the editor mid-edit.
   */
  const [addingFace, setAddingFace] = useState(false)

  /*
   * Which pass the part is painted for.
   *
   * Roughing and finishing are separate claims on a face, so a part coloured by
   * direction is showing one of two answers and has to say which one.
   */
  const [showingPass, setShowingPass] = useState<Pass>('rough')

  // Read after mount rather than during render: the server has no localStorage,
  // and a mode that differed between the two would hydrate as a flash of the
  // wrong colours.
  useEffect(() => {
    setPaintMode(loadPaintMode(globalThis.localStorage ?? null))
  }, [])

  /**
   * Pressing an arrow holds that way up — and re-reads whatever faces are
   * already held from it, rather than putting them down. Pressing it again
   * lets go, and the faces are read again unscoped.
   */
  const holdDirection = (index: number) => {
    const holding = activeDirection === index ? null : index
    setActiveDirection(holding)
    /*
     * Narrow the arrows to the one being held. Left showing all of them,
     * pressing an arrow changed nothing anybody could see, and a filter with no
     * sign of itself reads as a click that missed.
     *
     * Not while Unmapped is showing, where the arrows *are* the control: they
     * are how that list is filtered, and one that vanishes after a single press
     * cannot be used to choose a different way up. The panel carries the flag
     * there instead, so the filter still has a sign of itself.
     */
    if (holding !== null && !showingUncut) setArrows('off')

    const direction = holding === null ? null : report.candidateDirections[holding]
    setSelection((current) =>
      scopeToDirection(current, (tag) => {
        if (!direction) return true
        const feature = report.features.find((each) => each.featureTag === tag)
        return feature ? sameDirection(feature.machiningDirection, direction) : false
      }),
    )
  }

  /**
   * A zoom is a request rather than a state, so the same feature twice has to
   * read as two requests — the viewer frames on change, and a repeated value is
   * not one.
   */
  const zoomToFeature = (featureTag: string) => {
    setFocusFeature(null)
    requestAnimationFrame(() => setFocusFeature(featureTag))
  }

  const choosePaintMode = (mode: PaintMode) => {
    setPaintMode(mode)
    savePaintMode(globalThis.localStorage ?? null, mode)
  }
  const candidateTags = selection.candidates
  const focusedTag = selection.focused
  /**
   * What the shipped rules make of every feature.
   *
   * Judged once for the part rather than per paint: this is arithmetic over
   * numbers already in hand — no Engine call, no geometry — but it is arithmetic
   * over every feature times every rule, and the part does not change while
   * somebody looks at it.
   */
  const rulesContext = useMemo(() => partContext(report.features), [report.features])
  /** The types this part actually has, so a rule is aimed at what is in front of somebody. */
  const featureTypes = useMemo(
    () => [...new Set(report.features.map((feature) => feature.featureType))].sort(),
    [report.features],
  )
  /**
   * The set in force, and what it makes of every feature.
   *
   * Judging is arithmetic over numbers already in hand — no Engine call, no
   * geometry — which is what lets a threshold moved in the Rules tab recolour
   * the part as it is typed.
   */
  /*
   * **The report, deliberately — not the part.**
   *
   * A made reading carries numbers that are ours: the worst of the readings it
   * was merged from, or of a face handed to it. They are the safe answer for
   * choosing a tool and they are not measurements, and a rule verdict computed
   * over them would be an analysis of arithmetic — presented in the same band,
   * the same colour and the same summary as verdicts about geometry the Engine
   * actually looked at.
   *
   * So made readings score nothing and show no band until the Engine has
   * analysed them and answered properly (`withEngineDatasheet`). Changing this
   * to `part.features` looks like an obvious fix and is the bug.
   */
  const rules = useRules(report.features)
  /** How each feature came out, for the rows that name one. */
  const scores = useMemo(() => featureScores(rules.verdicts), [rules.verdicts])
  /**
   * The features the plan actually cuts — what the rules page is about.
   *
   * It judged every reading the Engine reported, which on a part with a plan on
   * it is mostly alternatives nobody chose: a face is read from every way up
   * that can reach it, and under cut-once all but one of those must lose. So
   * the page said a part was full of trouble that no operation on it would ever
   * meet. What a shop wants to know is how hard **the work they are about to
   * do** is, and that is the readings in the plan.
   *
   * Before anything is mapped there is no such list, and the page says so
   * rather than falling back to every reading — which is the same wrong answer
   * wearing a different face.
   */
  const judged = useMemo(
    () =>
      report.features.filter((feature) => {
        const at = plan.assigned[feature.featureTag]
        return at?.rough !== undefined || at?.finish !== undefined
      }),
    [report.features, plan],
  )

  const summary = useMemo(
    () => rulesSummary(rules.verdicts, judged, rules.ruleSet.rules),
    [judged, rules.ruleSet.rules, rules.verdicts],
  )

  const [expandedType, setExpandedType] = useState<string | null>(null)
  /**
   * Whether the open type is still the question being asked.
   *
   * Separate from the type being open, because the two stop being the same
   * thing the moment somebody clicks: the list stays open — it is how they got
   * here and how they get back — but sixty painted walls have stopped being an
   * answer to anything, and leaving them up buries whatever was just chosen.
   */
  const [typeIsAsking, setTypeIsAsking] = useState(false)

  const expandType = (type: string | null) => {
    setExpandedType(type)
    setTypeIsAsking(type !== null)
  }

  /**
   * The open type, lit on the part. Held under the pointer's own highlight:
   * hovering one feature is a narrower question than the type it belongs to,
   * and the narrower question is the one being asked.
   */
  const typeTags = useMemo(
    () =>
      tagsOfType(
        report.features,
        typeIsAsking ? expandedType : null,
        activeDirection === null ? null : (report.candidateDirections[activeDirection] ?? null),
      ),
    [activeDirection, expandedType, report.candidateDirections, report.features, typeIsAsking],
  )
  /**
   * Readings somebody made here, on top of the ones the Engine reported.
   *
   * Merged into one part rather than carried beside it, because *every* list,
   * the plan, coverage and the paint would otherwise each need to know about a
   * second source — and the one that forgot would quietly leave a made reading
   * out of the plan it is part of.
   */
  const [made, setMade] = useState<readonly PartFeature[]>([])
  /**
   * Readings somebody has renamed, by tag.
   *
   * The Engine says what a face reads as; a machinist may disagree, and after
   * faces have been added to a reading they are often right to — a wall that
   * has picked up a floor and two fillets is not a wall any more.
   *
   * Merged into the part in the same place `made` is, and for the same reason:
   * the type decides which rules speak about a reading and therefore what it
   * scores, so a second source of truth is a list somewhere quietly judging it
   * as the thing it used to be.
   *
   * **Only the type moves.** The Engine's measurements are still the Engine's,
   * and a rule aimed at the new type that reads a number this reading does not
   * carry goes quiet rather than inventing one — which is the honest answer and
   * the reason the panel says so.
   */
  const [retyped, setRetyped] = useState<Readonly<Record<string, string>>>({})
  /**
   * What each op-planning limit decided, on the last arrangement built here.
   *
   * Captured at the moment a generator runs rather than read live: the ledger
   * describes *an arrangement*, and the one on screen stops being the one it
   * describes as soon as somebody edits a face by hand. Held beside the plan so
   * the two go stale together.
   */
  const [planBit, setPlanBit] = useState<WhatBit | undefined>(undefined)
  /** The reading being drawn, if one is. */
  const [draft, setDraft] = useState<Draft | null>(null)
  /**
   * Which faces touch which, from the mesh — the viewer works it out and hands
   * it over, because the topology exists nowhere else.
   */
  const [touching, setTouching] = useState<Touching>(() => new Map())
  /**
   * The reading just made, waiting to be mapped.
   *
   * A reading is only half of a decision — the other half is which way up cuts
   * it — so the panel holds on to it rather than sending somebody off to find
   * it in another list to press the same three buttons.
   */
  const [justMade, setJustMade] = useState<PartFeature | null>(null)
  const part = useMemo(() => {
    const features = [...report.features, ...made]
    const renamed = features.map((feature) => {
      const featureType = retyped[feature.featureTag]
      if (featureType === undefined || featureType === feature.featureType) return feature
      return { ...feature, featureType }
    })

    return { ...report, features: renamed }
  }, [report, made, retyped])

  /**
   * The reading being read, looked up in **the part** rather than the report.
   *
   * A made reading is not in the report — that is what makes it made — so a
   * lookup there found nothing and the datasheet showed its empty state. Made
   * readings were sent to their faces instead, which read as a design decision
   * and was really this: the datasheet could not show one.
   */
  const focused = useMemo(
    () => part.features.find((feature) => feature.featureTag === focusedTag) ?? null,
    [focusedTag, part.features],
  )

  const [unit, setUnit] = useState<Unit>('mm')
  const features = useMemo(() => filterFeatures(part.features, query), [query, part.features])

  // Read after mount, like the paint mode: the server has no localStorage, and
  // a unit that differed between the two would hydrate as a flash of the wrong
  // numbers.
  useEffect(() => {
    setUnit(loadUnit(globalThis.localStorage ?? null))
  }, [])

  const chooseUnit = (next: Unit) => {
    setUnit(next)
    saveUnit(globalThis.localStorage ?? null, next)
  }
  /**
   * Once a feature is being read, its own way up is the only one worth drawing.
   * An explicit direction still wins: choosing one is a question about that
   * direction, and it stays on screen while readings are looked at within it.
   */
  /** The reading whose faces are being listed, if any. */
  /**
   * Takes a made reading off the part, and out of the plan with it.
   *
   * A reading that no longer exists cannot be cut from anywhere, and leaving
   * the assignment behind would leave a way up holding work nothing on the part
   * describes.
   */
  /**
   * Point a made reading at a different way up, and re-read it there.
   *
   * The assignment goes with it: it named a setup for the way up this reading
   * *was* cut from, and leaving it behind would have the plan claim a direction
   * cuts work that is no longer there. The passes it held are re-applied to the
   * new way up — changing where a thing is cut is not a decision to stop
   * cutting it.
   */
  const cutMadeFrom = (featureTag: string, index: number) => {
    /*
     * Re-pointed, and re-read from there.
     *
     * The assignment goes with it: it named a setup for the way
     * up this reading *was* cut from, and leaving it behind
     * would have the plan claim a direction cuts work that is
     * no longer there. The passes it held are re-applied to the
     * new way up, because changing where a thing is cut is not
     * a decision to stop cutting it.
     */
    const vector = part.candidateDirections[index]
    const feature = part.features.find((each) => each.featureTag === featureTag)
    if (!vector || !feature) return

    const moved = cutFrom(part.features, feature, vector)
    const held = PASSES.filter((pass) => plan.assigned[featureTag]?.[pass] !== undefined)

    setMade((current) => current.map((each) => (each.featureTag === featureTag ? moved : each)))
    setPlan((current) => {
      const { [featureTag]: gone, ...assigned } = current.assigned
      const without = withoutEmptied(current, { ...current, assigned }, part.features)
      if (held.length === 0) return without
      return setPassFor(
        without,
        part.candidateDirections,
        part.features.map((each) => (each.featureTag === featureTag ? moved : each)),
        [moved],
        held,
      )
    })
  }

  const deleteMade = (featureTag: string) => {
    setMade((current) => current.filter((each) => each.featureTag !== featureTag))
    setPlan((current) => {
      const { [featureTag]: gone, ...assigned } = current.assigned
      /*
       * The whole list, deleted reading included.
       *
       * `withoutEmptied` keeps a setup that was empty *before* the change, on
       * the grounds that somebody made it and has not filled it yet. Leaving
       * the deleted reading out of the list it checks made it look like exactly
       * that — so the way up survived, holding nothing, describing nothing.
       */
      return withoutEmptied(current, { ...current, assigned }, part.features)
    })
    setJustMade((current) => (current?.featureTag === featureTag ? null : current))
    setSelection(NOTHING_SELECTED)
  }

  const facesOpen = useMemo(
    () => part.features.find((feature) => feature.featureTag === facesFor) ?? null,
    [facesFor, part.features],
  )

  /**
   * The ways up being chosen, while `from the rules` is asking rather than
   * guessing.
   *
   * `null` when nothing is being chosen. Required directions are ticked to
   * begin with — they are what the geometry forces, so starting them off would
   * make the common case a chore — and they can still be turned off, because a
   * shop that would rather leave an undercut to a second operation may say so.
   */
  const [choosing, setChoosing] = useState<{
    /** Which press opened it, so that press can light while it stands. */
    how: Generator
    /** In the order they will be run — ticking appends, the arrows rearrange. */
    chosen: ReadonlyArray<number>
    splitPasses: boolean
    partial: boolean
  } | null>(null)

  const arrowContext = useMemo(() => {
    /*
     * **The reading being edited wins over the one being read.**
     *
     * They are not always the same: pressing `Edit Feature` on a row opens that
     * reading's editor whether or not it is the row the datasheet is focused
     * on. The arrow followed the focus, so the part showed the way up of a
     * reading nobody was working on — while every face click was landing on
     * the one that is.
     */
    const shown = arrowsFor(facesOpen, focused)
    const index = shown ? directionIndexOf(report, shown.machiningDirection) : -1

    return {
      /*
       * The way up being drawn from wins outright.
       *
       * Once it is chosen, every other arrow is an alternative to a decision
       * already made — and they are clickable, so leaving them up invites
       * changing it by accident while clicking faces near one.
       */
      focusedDirection: draft?.direction ?? (index === -1 ? null : index),
      /*
       * A held way up loses to the reading being read, while a face editor is
       * open.
       *
       * Everywhere else holding one wins: it is a filter somebody set, and it
       * survives looking at readings within it. But this list asks *which of
       * these cuts this face*, and every row is a different way up — so the
       * arrow is the answer, and an older filter sitting on top of it makes
       * walking the rows change nothing anybody can see.
       */
      activeDirection: facesOpen || draft !== null ? null : activeDirection,
      litDirection: facesOpen || draft !== null ? null : (litDirection?.index ?? null),
      // The plan's own ways up, for the toggle's middle state. Setups, not
      // candidates: a setup is there because somebody put work on it.
      confirmed: plan.setups.map((setup) => setup.directionIndex),
      /*
       * While the ways up are being chosen, the part draws **the choice**.
       *
       * The arrows are the only place a set of directions can be seen, so a
       * column of ticks against an unchanged part is a decision made blind —
       * and the question being asked is precisely "which of these do I want",
       * which is a question about geometry.
       */
      choosing: choosing === null ? null : [...choosing.chosen],
    }
  }, [activeDirection, focused, report, litDirection, plan.setups, facesOpen, draft, choosing])
  const candidates = useMemo(
    () => featureFromTags(part.features, candidateTags),
    [candidateTags, part.features],
  )
  /*
   * Naming a reading from inside the face list.
   *
   * An answer to the question that list is already asking, so the picked faces
   * and the readings they produced stay put — see `focusWithin`. Using `choose`
   * here emptied the list the moment somebody chose from it.
   */
  /*
   * A made reading opens its **datasheet**, like every other reading.
   *
   * It used to jump straight to its faces, on the grounds that there was
   * nothing in a datasheet for one — no measurements, no verdict, nothing the
   * Engine measured, because the Engine never saw it. That stopped being true
   * when readings could be merged: a merged one carries the worst of its
   * sources' numbers and the names of the sources, which is exactly the thing a
   * datasheet is for. Sending it somewhere else would hide the only record of
   * how those numbers were arrived at.
   *
   * The datasheet already carries the three controls it needs: Delete, which
   * only a made reading gets, Edit Feature, which is the way to the faces, and
   * Close.
   */
  const chooseWithin = (featureTag: string, alone = false) => {
    setSelection((current) => focusWithin(current, featureTag, alone))
    setTypeIsAsking(false)
  }

  /** Naming a feature in the list is a different question from the one a click asked. */
  const choose = (featureTag: string) => {
    setSelection({ picks: [], candidates: [], focused: featureTag, alone: false })
    setTypeIsAsking(false)
  }

  /**
   * Switching between the readings of the face already clicked.
   *
   * Keeps the candidate list up: it is the control being used, and clearing it
   * on the first press left nothing to switch back with.
   */
  const focusCandidate = (featureTag: string) => {
    setSelection((current) => ({ ...current, focused: featureTag, alone: false }))
    setTypeIsAsking(false)
  }

  /**
   * A click on the part offers its readings rather than deciding between them.
   * The best one is focused so there is something to read, and clicking the
   * same face again walks the rest — the list beside it is how you pick another
   * outright.
   *
   * A click that lands back on the reading already being read clears it. On a
   * face with one reading that makes a click a toggle; on a face with eight it
   * is the end of the cycle, which is the point at which walking them again
   * would say nothing new.
   */
  /*
   * Put everything down at once.
   *
   * Three things paint the part and each used to be cleared where it was set,
   * so clicking empty space left painted faces lit with nothing selecting them.
   * Every "that's enough" gesture goes through here instead.
   */
  const clearPicks = () => {
    setSelection(NOTHING_SELECTED)
    setPicking((current) => clearPicking(current))
    /*
     * The face list is about a reading, so it goes when the reading does — and
     * it **puts the work back**.
     *
     * This kept the edits at first, on the reasoning that Escape and a click on
     * empty space mean "that's enough" rather than "undo the last ten minutes",
     * and that losing a session should take saying so. Paul's call, and the
     * better one: **Save is what keeps the changes**, so everything else has to
     * be the other answer. A way out that sometimes commits and sometimes does
     * not is one somebody has to remember the rule for, and the whole reason
     * for a Save button is not having to.
     */
    cancelFaces()
    setHoveredTags([])
    setLitDirection(null)
    setProposal(null)
  }

  /*
   * Every way an offer shrinks goes through here.
   *
   * A reading taken out of an offer is not being read any more, and leaving the
   * focus on it leaves the part lit for something no list mentions — which is
   * exactly what a stuck highlight is.
   */
  /*
   * Where the keyboard was, so it can be put back.
   *
   * A row that is removed takes the focus with it. Measured before the change
   * and restored after the list has re-rendered, on whatever now sits in that
   * position — or the last row, if the one removed was last.
   */
  const holdPlace = (row: HTMLElement | null | undefined) => {
    const container = listAt(row)
    if (!row || !container) return () => undefined
    const at = rowsIn(container).indexOf(row)

    return () => {
      requestAnimationFrame(() => {
        const rows = rowsIn(container)
        rows[Math.min(at, rows.length - 1)]?.focus()
      })
    }
  }

  const changeOffer = (next: Proposal | null) => {
    const after = next
      ? proposedReadings(part.features, part.candidateDirections, next, rules.verdicts)
      : []
    setSelection((current) => ({
      ...current,
      focused: focusAfterPrune(current.focused, proposed, after),
    }))
    setProposal(next)
  }

  /**
   * Carry out what a click on the part asked for.
   *
   * The *which mode gets this click* half is `partClick`, a table in
   * `shared/part-click.ts` with its own tests. This is the other half: one
   * effect per answer, and no precedence left in it at all. The two used to be
   * one hundred and sixty lines of interleaved `if` and `setState`, where the
   * order was only readable by reading the effects.
   */
  const pickFromPart = (pick: PartPick) => {
    const asked = partClick({
      drawing: draft !== null,
      secondary: pick.modifiers.secondary,
      editing: facesOpen !== null,
      editingCovers: facesOpen !== null && coveredRegions(plan, facesOpen).includes(pick.region),
      offered: proposal !== null,
      offeredHere: proposal?.faces.has(pick.region) ?? false,
      holding: picking.mode === 'direction' && picking.holding !== null,
    })

    /** Re-point the editor's list at a face, even if it is already there. */
    const revealAgain = () => {
      setRevealFace(null)
      requestAnimationFrame(() => setRevealFace(pick.region))
    }

    if (asked === 'draw' && draft !== null) {
      // The part goes in, or `withFace` has nothing to chain through and
      // chaining silently adds one face like any other click.
      setDraft(
        withGuess(
          withFace(draft, pick.region, {
            features: part.features,
            directions: part.candidateDirections,
            touching,
          }),
          part.features,
          part.candidateDirections,
        ),
      )
      return
    }

    if (asked === 'reveal') {
      revealAgain()
      return
    }

    if (asked === 'peek') {
      // Which reading it means is decided by what is already on screen.
      const target = peekTarget(pick.ranked.length > 0 ? pick.ranked : pick.owners, [
        facesOpen ? [facesOpen.featureTag] : [],
        proposed.filter((f) => f.regionIdxs.includes(pick.region)).map((f) => f.featureTag),
        paintedFeatures.filter((f) => f.regionIdxs.includes(pick.region)).map((f) => f.featureTag),
      ])
      if (target) setSelection((current) => focusWithin(current, target))
      return
    }

    if (asked === 'claim' && facesOpen !== null) {
      const reading = facesOpen

      setPlan((current) =>
        claimFace(
          current,
          part.candidateDirections,
          part.features,
          reading,
          facePasses,
          pick.region,
        ),
      )
      setHoveredFace(null)
      revealAgain()
      return
    }

    if (asked === 'prune' && proposal !== null) {
      changeOffer(withoutFace(proposal, pick.region))
      return
    }

    if (asked === 'join' && proposal !== null) {
      // With the smallest reading of it this way up can run.
      const vector = part.candidateDirections[proposal.direction]
      const reading = vector
        ? readingsFor(part.features, vector, new Set([pick.region]), rules.verdicts)[0]
        : undefined
      if (reading) {
        const claimed = claimedRegions(part.features, plan)
        setProposal((current) => (current ? withReading(current, reading, claimed) : null))
      }
      return
    }

    if (asked === 'paint' && picking.holding !== null) {
      const vector = part.candidateDirections[picking.holding]
      const regions = vector
        ? (readingsFor(part.features, vector, new Set([pick.region]), rules.verdicts)[0]
            ?.regionIdxs ?? [])
        : []
      setPicking((current) => paintReading(current, pick.region, regions))
      return
    }

    selectFace(pick)
  }

  /**
   * Pick a face and open the reading worth opening — the whole of what
   * "selecting a face" means, wherever the gesture is made.
   *
   * Called by a click on the part and by a row in the unmapped list, so the two
   * cannot come to mean different things. Everything above it in
   * `pickFromPart` is a mode claiming the click first; this is what a click
   * means once nothing has.
   */
  const selectFace = (pick: PartPick): void => {
    /*
     * A lit direction answers "what would −Y cut **of the faces in hand**", so a
     * click that changes the faces in hand makes that answer stale — and a
     * stale answer is a highlight nothing on screen explains.
     */
    setLitDirection(null)

    setSelection((current) => {
      /*
       * Clicking the same face again walks its readings.
       *
       * A face has five to eight of them and only one can be on screen, so a
       * second click means "not that one, the next" — the same gesture the arrow
       * keys make on a list, made on the part instead. It walks the order the
       * list is **drawn** in, so the eye and the click agree about what "next"
       * is, and it wraps rather than stopping.
       *
       * Handled before `pickFace`, which clears the selection when a walk
       * returns to where it started. Wrapping is the more useful answer now
       * that the readings are a list somebody is reading down; Escape and empty
       * space are still how you put it all down.
       */
      const adding = pick.modifiers.meta || pick.modifiers.ctrl
      const again =
        !adding && current.picks.length === 1 && current.picks[0]?.region === pick.region

      if (again && current.candidates.length > 1) {
        const ordered = readingOrder(featureFromTags(part.features, current.candidates), plan)
        const walked = stepThrough(
          ordered.map((feature) => feature.featureTag),
          current.focused,
          1,
        )
        return walked === null ? current : { ...current, focused: walked }
      }

      const next = pickFace(current, pick, (tags) => easiestReading(tags, scores))
      const ordered = readingOrder(featureFromTags(part.features, next.candidates), plan)
      if (ordered.length === 0) return next

      /*
       * A first click opens the reading worth opening.
       *
       * The reading **cutting this face** if there is one — a click on a face
       * already being cut is nearly always a question about that cut. Otherwise
       * the easiest of them by score, which is what `pickFace` already prefers;
       * this used to override that with "the first axis-aligned one", so the
       * rules' own answer was computed and then thrown away.
       */
      return {
        ...next,
        focused: readingForFace(ordered, plan, pick.region, scores) ?? next.focused,
      }
    })
    setTypeIsAsking(false)
  }

  /*
   * What the mapping panel lists — every reading of every picked face.
   *
   * Not `candidates`, which narrows to the readings owning *all* picked faces.
   * That is the right question while inspecting ("what are these both part of")
   * and the wrong one while mapping ("what work is here"): a floor and a wall
   * from the same way up are two readings to assign, and narrowing would empty
   * the list exactly when somebody is gathering work into it. See `picks.ts`.
   */
  const mappable = useMemo(
    () =>
      readingOrder(
        [
          ...featureFromTags(part.features, gatheredReadings(selection.picks)),
          /*
           * And whatever has been **handed** one of these faces.
           *
           * The viewer answers "what owns this face" from the Engine's
           * `regionIdxs`, so a face somebody moved into a wall vanished from
           * that wall's point of view the moment the editor closed — and the
           * reading missing from the list was the one actually cutting it.
           */
          ...handedReadings(part.features, plan, heldRegions(selection)),
        ],
        plan,
      ),
    [part.features, selection, plan],
  )
  /*
   * The face list in the order it is drawn — grouped by way up.
   *
   * The keyboard shortcut below walks *this*, not the order the click produced.
   * Once the list is grouped the two differ, and arrowing through one while
   * looking at the other jumps about for no visible reason.
   */
  /*
   * What is painted, as readings — for the orange it is drawn in.
   *
   * Painting adds whole readings now, so this is the same set seen the way the
   * wash wants it: by feature rather than by face.
   */
  const paintedFeatures = useMemo(() => {
    if (picking.holding === null || picking.painted.size === 0) return []
    const vector = part.candidateDirections[picking.holding]
    if (!vector) return []
    return readingsFor(part.features, vector, picking.painted, rules.verdicts)
  }, [picking.holding, picking.painted, part.candidateDirections, part.features, rules.verdicts])

  /**
   * The plan the part is **painted** from — the real one, or the one the
   * chooser would write.
   *
   * A preview rather than a description. While the chooser stands, the question
   * is *what would these ways up cut*, and the honest answer is the arrangement
   * they would produce: run the same allocator the Confirm button will run, and
   * paint the part from its answer. Ticking a way up recolours the part under
   * the dialog, which is the only place the choice can actually be seen.
   *
   * The rules' own limits, not the chooser's — those it does own (`partial`,
   * `splitPasses`) come off the dialog, so changing either repaints too.
   */
  const painting = useMemo(() => {
    if (choosing === null) return plan

    // The preview wants the arrangement, not the ledger beside it: nothing is
    // decided until Confirm, so there is nothing yet to report about it.
    return planForChosen({
      report,
      directions: part.candidateDirections,
      features: part.features,
      plan: EMPTY_PLAN,
      verdicts: rules.verdicts,
      limits: rules.ruleSet.plan,
      chosen: choosing.chosen,
      splitPasses: choosing.splitPasses,
      partial: choosing.partial,
    }).plan
  }, [choosing, plan, report, part.candidateDirections, part.features, rules])

  const cutBy = useMemo(
    () => cutByDirection(part.features, painting, showingPass),
    [part.features, painting, showingPass],
  )
  /*
   * The faces of readings that cut only part of themselves.
   *
   * Painted face by face rather than by feature, because the rest of such a
   * reading belongs to another way up now. Disjoint from `cutBy` by cut-once.
   */
  const cutByRegion = useMemo(
    () => cutRegionsByDirection(part.features, painting, showingPass),
    [part.features, painting, showingPass],
  )
  /* The same faces, said as *which reading* cuts them, for the difficulty wash. */
  const cutRegionsBy = useMemo(
    () => cutRegionsByFeature(part.features, painting, showingPass),
    [part.features, painting, showingPass],
  )

  const proposed = useMemo(
    () =>
      proposal
        ? proposedReadings(part.features, part.candidateDirections, proposal, rules.verdicts)
        : [],
    [proposal, part.features, part.candidateDirections, rules.verdicts],
  )

  const shownOrder = useMemo(
    () =>
      byDirection(part.candidateDirections, mappable).flatMap((group) =>
        group.readings.map((feature) => feature.featureTag),
      ),
    [part.candidateDirections, mappable],
  )

  /*
   * The holes the reading in hand stands for.
   *
   * Sixteen identical holes are one decision and one tool, so naming one names
   * all of them — the part lights all sixteen and the datasheet says so, rather
   * than describing one and staying silent about the other fifteen.
   */
  const focusedHoles = useMemo(() => {
    if (!focused) return []
    // Named from inside its own opened group, a hole is only itself — that row
    // is the one place somebody has said *this one*, and answering it by
    // lighting the other fifteen is the app ignoring them.
    if (selection.alone) return [focused]
    return sameHoles(part.features, focused)
  }, [focused, part.features, selection.alone])

  /**
   * Arrow keys walk the readings of the face that was clicked.
   *
   * On the window rather than on the list: the click that produced the
   * candidates left focus on the canvas, and asking somebody to click the list
   * before they can arrow through it defeats the point of the shortcut.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null

      /*
       * Which of the four a press is — the routing, not the meaning.
       *
       * `keyIntent` is that table, with its own tests. Everything below is one
       * effect per answer: the ladder used to be interleaved with the eleven
       * `setState` calls that carry the answers out, so what a key did could
       * only be read by reading what it changed.
       */
      const pressed = keyIntent({
        key: event.key,
        typing: isTyping(target),
        inList: listAt(target) !== null,
      })
      if (!pressed) return

      // Escape works outward, one thing per press — see `escapeStep`.
      if (pressed.act === 'escape') {
        const step = escapeStep({
          // Innermost, and the only rung that undoes: leaving the editor any
          // way but Save puts the plan back as it was when it opened.
          editing: facesOpen !== null,
          // Painted faces are part of what the newest gesture put on screen, so
          // the first press takes them with the selection rather than leaving
          // them lit while Escape moves on to older state.
          hasSelection: !isEmptySelection(selection) || picking.painted.size > 0,
          expandedType,
          direction: activeDirection,
          arrows: arrows !== 'off',
          // Anything other than By face, which is where the page opens.
          mode: showingUncut || draft !== null || picking.mode !== 'face',
        })
        if (step === 'editing') cancelFaces()
        else if (step === 'selection') clearPicks()
        else if (step === 'expandedType') expandType(null)
        else if (step === 'direction') setActiveDirection(null)
        else if (step === 'arrows') {
          setArrows('off')
          arrowsBefore.current = null
        } else if (step === 'mode') {
          /*
           * All the way back to By face.
           *
           * The last rung, so pressing Escape until nothing happens always
           * lands somewhere known — whatever was on screen, and without having
           * to find which of the four buttons is the lit one.
           */
          setDraft(null)
          setJustMade(null)
          setShowingUncut(false)
          setPicking((current) => switchMode(current, 'face'))
          setSelection(NOTHING_SELECTED)
          setHoveredTags([])
        }
        return
      }

      if (pressed.act === 'arrows') {
        event.preventDefault()
        setArrows((current) => nextArrows(current))
        return
      }

      /*
       * The keys that act on the reading in hand (rows 31–33, 38).
       *
       * Handled here rather than per list, because "the row under the keyboard"
       * is the target wherever the keyboard happens to be — and two handlers
       * for one keystroke is two things happening per press.
       */
      if (pressed.act === 'plan') {
        const act = pressed.plan
        /*
         * The row under the keyboard first, then whatever is being read: in
         * by-direction mode a list can take focus without lighting anything up.
         *
         * What a row stands for is not always one reading — a row for sixteen
         * identical holes is sixteen, so R on it has to be sixteen — and the
         * row says which it is rather than leaving it to be worked out here:
         * the lists group by different rules (see `groupAcrossPart`) and only
         * the row knows which one drew it. `row-nav` owns that encoding.
         */
        const under = focusedRow()
        const row = rowAt(document.activeElement)
        const meant = under ? featureFromTags(part.features, under.holds) : focusedHoles
        const feature = meant[0]
        if (!feature) return

        if (act.act === 'pass') {
          event.preventDefault()
          setPass(meant, act.passes)
          return
        }

        /*
         * Removing prunes an offer, and only an offer (row 33).
         *
         * An offer is a suggestion, so throwing part of it away costs nothing.
         * A reading a direction is cutting is a decision somebody made, and a
         * key that quietly unmakes one is a plan that changes when a hand
         * brushes the keyboard. Taking work off a direction has a button, and
         * pressing the pass it already holds does it too.
         */
        if (!meant.some((entry) => proposed.some((each) => each.featureTag === entry.featureTag)))
          return
        event.preventDefault()

        // Keeps the keyboard's place, so pruning thirty readings is thirty
        // presses rather than thirty clicks to get the keyboard back.
        const restore = holdPlace(row)
        changeOffer(
          meant.reduce<Proposal | null>(
            (current, reading) => (current ? withoutReading(current, reading) : null),
            proposal,
          ),
        )
        restore()
        return
      }

      /*
       * Arrows walk the readings of the face that was clicked.
       *
       * Only outside a list — a list under the keyboard walks itself in the
       * order it is drawn, and `keyIntent` is where that guard lives. This is
       * the shortcut for when focus is still on the canvas that produced the
       * candidates.
       */
      const next = stepThrough(shownOrder, focusedTag, pressed.by)
      if (next === null) return
      event.preventDefault()
      setSelection((current) => focusWithin(current, next))
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    /*
     * Everything the handler *reads* belongs here.
     *
     * It is a `window` listener, so a missing dependency is not a stale render —
     * it is a stale closure that keeps answering with the state as it was when
     * the listener was attached. Escape's two new rungs read the arrows and the
     * mode, and without them here the ladder decided both were where they had
     * been at mount: arrows off, By face showing. Pressing Escape in Create did
     * nothing at all, silently and only for the new rungs.
     */
  }, [
    activeDirection,
    expandedType,
    selection,
    picking.painted,
    picking.mode,
    arrows,
    showingUncut,
    draft,
    shownOrder,
    focusedTag,
    focusedHoles,
    proposal,
    proposed,
    plan,
    part.features,
  ])

  /*
   * Everything the part should light up, gathered in one place.
   *
   * Two independent selections feed it — the faces picked on the part and the
   * readings ticked in a list — and they are different questions (§3.8). The
   * painted set is a third: faces being gathered for a way up, which are picked
   * faces by another name and paint the same.
   */
  const { tags: paintedReadings, regions: heldFaces } = useMemo(
    () =>
      partHighlight({
        /*
         * While a face list is open the part shows *its faces*, not the reading
         * they belong to. Painting the feature as well would light the faces it
         * has given up, which is the one thing that list exists to distinguish.
         */
        selected:
          facesOpen || draft !== null
            ? []
            : [...(litDirection?.tags ?? []), ...focusedHoles.map((hole) => hole.featureTag)],
        focused: facesOpen || draft !== null ? null : focusedTag,
        /*
         * While a face list is open, the only thing in the picked layer is the
         * row under the pointer.
         *
         * It paints **above** the face layer, so faces picked earlier by
         * clicking the part sat on top of the list wearing the wrong colour —
         * which reads as those faces not being in the list at all. Picking a
         * face is a question about the part; this is a question about a
         * reading, and only one of them is being asked.
         */
        /*
         * What the part paints as picked, by whichever panel owns it.
         *
         * Drawing first: its faces *are* picked faces, so they wear the layer
         * that already means exactly that. Without this the chosen faces were
         * held in state and shown nowhere, which is a mode nobody can use.
         */
        picked:
          draft !== null
            ? draft.faces
            : facesOpen
              ? /*
                 * **Only the face under the pointer**, while the editor is open.
                 *
                 * The face being *worked on* used to wear this too, and the
                 * picked layer paints above the state colours — so clicking a
                 * face left it blue, hiding the very thing the click had just
                 * changed. The answer to "did that work" was covered by the
                 * answer to "which row is this".
                 *
                 * One channel per question (F62): the part says what each face
                 * is, the filled row in the list says which one is current, and
                 * hover is transient enough to borrow the part for a moment.
                 */
                [hoveredFace].filter((face): face is number => face !== null)
              : heldRegions(selection),
      }),
    [focusedTag, selection, litDirection, focusedHoles, facesOpen, hoveredFace, currentFace, draft],
  )

  /*
   * Every face of the reading being listed, under the hovered one.
   *
   * The viewer's region layer: over the wash, under the picked colour. Green,
   * because the row under the pointer wears the theme's `picked` — and in both
   * themes `picked` and `highlight` are the same hex, so borrowing either would
   * paint the whole set and the hovered face in one flat colour with no way to
   * tell which row was which.
   */
  /*
   * The selection, split from the readings that cut only part of themselves.
   *
   * The viewer paints a feature by expanding its tag to every region it covers,
   * so a reading that gave three faces away still lit all twelve. Those three
   * belong to another way up now, and lighting them says the plan still holds
   * them.
   */
  /** What the hover layer would paint, before the part-cut readings come out. */
  const hoveredList = useMemo(
    () =>
      facesOpen ? [] : listHighlight({ hovered: hoveredTags, ofType: typeTags, pointerOnPart }),
    [facesOpen, hoveredTags, typeTags, pointerOnPart],
  )

  const selectionPaint = useMemo(
    () => paintByCut(paintedReadings, part.features, plan, showingPass),
    [paintedReadings, part.features, plan, showingPass],
  )
  const hoverPaint = useMemo(
    () => paintByCut(hoveredList, part.features, plan, showingPass),
    [hoveredList, part.features, plan, showingPass],
  )

  const listedFaces = useMemo(() => {
    const theme = paintMode === 'directions' ? SETUP_COLORS : READING_COLORS

    return [
      // A part-cut reading, painted face by face in the colour its tag would
      // have worn. Below the picked layer, which is where the pointer lives.
      ...selectionPaint.faces.map((region) => ({
        region,
        color: theme.highlight,
        weight: 1,
      })),
      ...hoverPaint.faces.map((region) => ({ region, color: theme.hover, weight: 1 })),
      /*
       * What the reading **cuts**, not what it covers.
       *
       * Painting every face it covers made the tick meaningless on the part: an
       * unticked face is one this reading is not cutting, and on a real pocket
       * the face left out was the largest of the four — so the green said "this
       * is the pocket" while the panel said "three of its four faces". Green
       * means cut. A face still on the list but not cut is found by hovering its
       * row, which lights it whatever its tick says.
       */
      /*
       * Every face the reading covers, in **four** colours: what it roughs and
       * finishes, what it only roughs, what it only finishes, and what it
       * covers and does not cut at all.
       *
       * Two was the whole answer while a face was claimed all at once. Once
       * roughing and finishing are separate claims, *which* of them is held is
       * the thing somebody is reading the part for — a face roughed here and
       * finished from the other side costs a second setup, and painting it the
       * same green as a face done in one is the app hiding the cost.
       *
       * "Covered but not cut" stays its own colour: it is the state somebody
       * opens this panel to find, and a face left unpainted says nothing about
       * whether it was ever a candidate.
       *
       * This is the **part's** job, and the list's rows do not repeat it (F62):
       * the model says which faces are in what state, the tick says whether a
       * face is in the reading, and the one filled row says which face is being
       * worked on.
       */
      ...(facesOpen === null
        ? []
        : coveredRegions(plan, facesOpen).map((region) => ({
            region,
            color: faceColor(
              PASSES.filter((pass) => cutRegions(plan, facesOpen, pass).includes(region)),
            ),
            weight: 1,
          }))),
    ]
  }, [
    facesOpen,
    paintMode,
    selectionPaint,
    hoverPaint,
    plan,
    showingPass,
    currentFace,
    hoveredFace,
  ])

  const setPass = (chosen: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => {
    // A hand edit makes the whole plan somebody's decision — see
    // `planIsGenerated`.
    setPlanIsGenerated(false)
    /*
     * One update for the whole group, and one for both passes.
     *
     * `setPassFor` takes a list on purpose: two `setState` calls from one
     * snapshot lose the first, which is how "Both" set finishing and dropped
     * roughing in the picker.
     */
    setPlan((current) =>
      setPassFor(current, part.candidateDirections, part.features, chosen, passes),
    )
    // Pressing a pass on an offered reading is what says yes to it — there is
    // no separate Confirm — so it is kept, and re-covering cannot swap it out.
    setProposal((current) => (current ? keeping(current, chosen) : null))
  }

  /*
   * Taking a whole way up off the plan.
   *
   * Every reading it held goes back to nothing, and `withoutEmptied` then drops
   * the setup itself — rather than deleting the setup and leaving assignments
   * pointing at an id no longer in the list.
   */
  const removeSetup = (setupId: string) => {
    setPlan((current) => {
      const assigned = Object.fromEntries(
        Object.entries(current.assigned).map(([tag, entry]) => [
          tag,
          {
            rough: entry.rough === setupId ? undefined : entry.rough,
            finish: entry.finish === setupId ? undefined : entry.finish,
          },
        ]),
      )
      return withoutEmptied(current, { ...current, assigned }, part.features)
    })
  }

  /*
   * An arrangement in one press.
   *
   * `fill from current` is the only generator that builds on what is held; the
   * rest replace the plan outright, which is what "offer" means — it is argued
   * with afterwards rather than merged into.
   */

  const offers = useMemo(() => setupOffers(part, part.candidateDirections), [part])

  /**
   * Whether the plan on screen was made by a **generator**.
   *
   * `fill from current` treats an existing plan as somebody's decision — every
   * claimed face is "not ours to improve on" — which is right for a plan built
   * by hand and wrong for one this same file wrote a moment ago. Unseeded, it
   * had nothing it was allowed to touch after `from the rules` had filled the
   * part, and appeared to do nothing at all.
   *
   * Any hand edit clears it. Once somebody has touched the plan, the whole of
   * it is theirs: telling their choices apart from the generator's would need
   * provenance on every assignment, and guessing wrong overwrites a decision.
   */
  const [planIsGenerated, setPlanIsGenerated] = useState(false)

  const runGenerator = (how: Generator) => {
    /*
     * Any of these is a question about **which way up cuts what**, so the part
     * starts answering it. Pressing one and watching nothing change on the
     * model — because the standing wash was Plain, or was Difficulty — is the
     * whole result arriving somewhere nobody was looking.
     */
    choosePaintMode('directions')

    if (how === 'from the rules' || how === 'pick directions') {
      setChoosing({
        how,
        /*
         * `from the rules` starts from the rules' opinion — the ways up the
         * geometry forces are ticked, because they are not a recommendation and
         * starting them off would make the common case a chore. `pick
         * directions` starts from none: it is the press for somebody who
         * already knows how they will hold the part.
         */
        chosen:
          how === 'from the rules'
            ? offers.filter((offer) => offer.required).map((offer) => offer.index)
            : [],
        splitPasses: false,
        /*
         * Seeded from the rule, overridable for this run.
         *
         * *May the plan split a feature* is a shop's usual answer and lives in
         * the rules; a generator press is a question about **this** plan. So
         * the tick opens on what the rules say and can still be changed
         * without editing them.
         */
        partial: rules.ruleSet.plan?.splitFeatures !== false,
      })
      // The arrows are the only place a set of directions can be seen, and the
      // question being asked is which of them to hold. Borrowed, so leaving the
      // chooser gives back whatever was set.
      borrowArrows()
      return
    }

    /*
     * Any other offer puts the chooser away.
     *
     * It is a question — *which of these ways up do you want* — and pressing a
     * different generator answers a different one. Leaving it up made two
     * offers look live at once, and confirming the stale one afterwards wrote
     * a plan over the top of the one just made.
     */
    setChoosing(null)
    returnArrows()

    setPlanIsGenerated(true)
    /*
     * The plan and its ledger come out of the same call.
     *
     * `setPlanBit(whatBit())` used to stand on the line above this one, reading
     * module state that the run below had not written yet — so the panel showed
     * the *previous* arrangement's counters, and zeroes on the first press.
     * There is no ledger to read now until there is a plan to read it from.
     */
    const made = generate(how, {
      report,
      seeded: planIsGenerated,
      directions: part.candidateDirections,
      features: part.features,
      plan,
      verdicts: rules.verdicts,
      /*
       * The shop's own economics, from the rule set beside the part.
       *
       * These were not passed at all, so every arrangement was built against
       * the defaults and a limit somebody had set was quietly ignored.
       *
       * The two **part rules** ride along in `planRules`: they are what a shop
       * says about setups and about how much work an operation should do, and
       * the allocator is handed limits rather than a rule set — so they are put
       * where it will look.
       */
      limits: { ...rules.ruleSet.plan, planRules: rules.ruleSet.rules.filter(judgesPlan) },
    })

    setPlanBit(made.bit)
    setPlan(made.plan)
  }

  /**
   * Put the faces nothing cuts up in the mapping panel, or put them away.
   *
   * Pressed from the coverage bars, which is where somebody is when they want
   * it: those two bars are how much is done, and this is the same measure from
   * the other end.
   */
  const showUncut = (): void => {
    // Five answers to one question, and exactly one is lit — naming any of the
    // others is how you leave the one you are in.
    setDraft(null)
    setJustMade(null)
    setShowingUncut((current) => {
      // Its filter is a click on an arrow, so entering it puts the arrows on
      // screen — the same reason By direction does. A mode whose only gesture
      // is invisible is one nobody starts.
      if (current) returnArrows()
      else borrowArrows()
      return !current
    })
  }

  const directionsPanel = (
    <SetupsPanel
      focusedTag={focusedTag}
      onChoose={choose}
      onHover={setHoveredTags}
      onSetPass={setPass}
      onShowFaces={openFaces}
      onRemoveSetup={removeSetup}
      onGenerate={runGenerator}
      choosing={
        choosing === null ? null : (
          <SetupChooser
            offers={offers}
            chosen={choosing.chosen}
            splitPasses={choosing.splitPasses}
            partial={choosing.partial}
            missed={missedBy(part, part.candidateDirections, choosing.chosen)}
            onToggle={(index) =>
              setChoosing((current) => {
                if (current === null) return current
                // Ticking **appends**: the order somebody says them in is the
                // order they mean, until they say otherwise with the arrows.
                const chosen = current.chosen.includes(index)
                  ? current.chosen.filter((each) => each !== index)
                  : [...current.chosen, index]

                return { ...current, chosen }
              })
            }
            onMove={(index, by) =>
              setChoosing((current) => {
                if (current === null) return current
                const at = current.chosen.indexOf(index)
                const to = at + by
                if (at === -1 || to < 0 || to >= current.chosen.length) return current

                const chosen = [...current.chosen]
                const [moved] = chosen.splice(at, 1)
                chosen.splice(to, 0, moved!)

                return { ...current, chosen }
              })
            }
            onSplitPasses={(splitPasses) =>
              setChoosing((current) => (current === null ? current : { ...current, splitPasses }))
            }
            onPartial={(partial) =>
              setChoosing((current) => (current === null ? current : { ...current, partial }))
            }
            onRecommend={() => {
              // The original answer: the rules buy whatever they think is worth
              // holding. Still the right first question on a part nobody knows.
              setPlanIsGenerated(true)

              const made = generate('from the rules', {
                report,
                directions: part.candidateDirections,
                features: part.features,
                plan: EMPTY_PLAN,
                verdicts: rules.verdicts,
                limits: rules.ruleSet.plan,
              })

              setPlanBit(made.bit)
              setPlan(made.plan)
              setChoosing(null)
              returnArrows()
            }}
            onCancel={() => {
              setChoosing(null)
              returnArrows()
            }}
            onConfirm={() => {
              setPlanIsGenerated(true)
              returnArrows()

              const made = planForChosen({
                report,
                directions: part.candidateDirections,
                features: part.features,
                plan: EMPTY_PLAN,
                verdicts: rules.verdicts,
                limits: rules.ruleSet.plan,
                chosen: choosing.chosen,
                splitPasses: choosing.splitPasses,
                partial: choosing.partial,
              })

              // Both passes of a split are added together — see `bothBits`.
              setPlanBit(made.bit)
              setPlan(made.plan)
              setChoosing(null)
            }}
          />
        )
      }
      onFillSetup={(directionIndex) => {
        /*
         * Go and work this way up: hold it, and offer what it can still pick
         * up.
         *
         * Two things people did in sequence every time — press the one `Fill
         * from current` under the whole list, then switch to By direction and
         * hunt for the way up they meant. It is one question about one
         * direction, so it is one press on that direction.
         *
         * It offers rather than assigns, which is the difference between this
         * and a generator: `propose` puts up a set to argue with, and nothing
         * is in the plan until somebody confirms it.
         */
        setShowingUncut(false)
        setDraft(null)
        setPicking((current) => switchMode(current, 'direction'))
        holdDirection(directionIndex)

        const setup = plan.setups.find((entry) => entry.directionIndex === directionIndex)
        setProposal(
          propose(
            part.features,
            plan,
            part.candidateDirections,
            directionIndex,
            'everything',
            rules.verdicts,
            setup?.id,
          ),
        )
      }}
      onLockSetup={(setupId, locked) => setPlan((current) => lockSetup(current, setupId, locked))}
      choosingHow={choosing?.how ?? null}
      showingUncut={showingUncut}
      onShowUncut={showUncut}
      onClearAll={() => setPlan(EMPTY_PLAN)}
    />
  )

  const tabPanel =
    tab === 'directions' ? (
      directionsPanel
    ) : tab === 'inspector' ? (
      <aside className="flex size-full min-h-0 flex-col overflow-y-auto bg-ground">
        <PartSummary
          report={part}
          features={features}
          activeDirection={activeDirection}
          onPickDirection={holdDirection}
          expandedType={expandedType}
          onExpandType={expandType}
          focusedTag={focusedTag}
          candidateTags={candidateTags}
          onChoose={choose}
          onHover={setHoveredTags}
          query={query}
          onQuery={setQuery}
          scores={scores}
          plan={plan}
        />
      </aside>
    ) : (
      <RulesPanel
        /*
         * What each limit decided on the last arrangement built.
         *
         * Read off the allocator rather than recomputed: it is a count of
         * decisions that actually went one way rather than the other, which
         * nothing outside the run can reconstruct. `undefined` until a plan
         * exists — which is a different answer from "nothing did anything" and
         * reads as one.
         */
        bit={planBit}
        /*
         * Live off the plan, not off the ledger beside it. The ledger describes
         * the last arrangement a generator built; this is the one on screen.
         */
        now={{
          setups: plan.setups.length,
          mapped: planCoverage(part, part.features, plan)[0]?.mapped ?? 0,
        }}
        features={judged}
        focusedTag={focusedTag}
        onChoose={choose}
        onHover={setHoveredTags}
        rules={rules}
        scores={scores}
        summary={summary}
        types={featureTypes}
        unit={unit}
      />
    )

  /*
   * What every panel below is looking at.
   *
   * Memoised because it is a context value: a fresh object each render would
   * make every consumer re-render on every one of this component's state
   * changes, which is the opposite of what moving these off the prop lists was
   * for.
   */
  const view = useMemo(
    () => ({
      report,
      features: part.features,
      directions: part.candidateDirections,
      plan,
      scores,
      verdicts: rules.verdicts,
      unit,
      showingPass,
    }),
    [
      report,
      part.features,
      part.candidateDirections,
      plan,
      scores,
      rules.verdicts,
      unit,
      showingPass,
    ],
  )

  return (
    <PartViewProvider view={view}>
      <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-ground text-ink">
        <AppHeader
          className="border-b border-edge px-4 py-3"
          navigation={
            <Tabs value={tab} onValueChange={(value) => setTab(value as ViewerTab)}>
              <Tabs.List>
                <Tabs.Tab value="inspector">Inspector</Tabs.Tab>
                <Tabs.Tab value="directions">Directions</Tabs.Tab>
                <Tabs.Tab value="rules">Rules</Tabs.Tab>
              </Tabs.List>
            </Tabs>
          }
          actions={
            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-ink-dim">
                <p>{part.features.length} recognized features</p>
                <p className="font-mono">{report.partId}</p>
              </div>
              <Link
                className="rounded border border-edge-strong bg-transparent px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface"
                to="/"
              >
                Upload another part
              </Link>
            </div>
          }
        >
          {/* The mark, then the name. The word `Toolpath` was standing in for a
            logo that exists — it is in `toolpath_ui`, and this is it. */}
          <div className="flex items-center gap-2.5">
            <ToolpathIcon className="size-8" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">Toolpath</p>
              <h1 className="font-display text-xl font-bold">DFM</h1>
            </div>
          </div>
        </AppHeader>

        <Panels.Group className="min-h-0 flex-1" orientation="horizontal">
          <Panels.Panel className="min-h-0 overflow-hidden" defaultSize={460} minSize={260}>
            {tabPanel}
          </Panels.Panel>
          <Panels.Separator className={leftSeparatorClassName} />
          <Panels.Panel className="min-h-0 overflow-hidden" minSize={400}>
            <FeatureViewer
              activeDirection={activeDirection}
              onPickDirection={(index) => {
                /*
                 * While drawing, an arrow names the way up being drawn from.
                 *
                 * It is the gesture the app already uses for "hold this
                 * direction", and a drawing is held from one — so it would be
                 * strange for the arrows to be on screen and mean something else.
                 */
                if (draft !== null) {
                  setDraft((current) =>
                    current === null
                      ? null
                      : withGuess(
                          {
                            ...current,
                            direction: index,
                            /*
                             * The faces stay.
                             *
                             * They were thrown away on the reasoning that a set
                             * chosen against another way up says nothing about
                             * this one — true of what they *read as*, which is
                             * why the guess re-runs, and not true of the faces
                             * themselves. Choosing faces and then the arrow is
                             * the natural order for anybody who looks at the part
                             * before thinking about the setup, and it silently
                             * undid their work.
                             */
                          },
                          part.features,
                          part.candidateDirections,
                        ),
                  )
                  return
                }
                holdDirection(index)
                setPicking((current) => holdPickDirection(current, index))
              }}
              jobId={jobId}
              /*
               * What the part paints as selected: the ticked readings, plus
               * whatever is being read but not ticked (§3.8).
               *
               * The plan excludes a focus the app *guessed* — clicking two walls
               * lit up an eleven-face profile nobody had chosen. That needs
               * `focusFromPick`, which is not tracked yet (row 10), so a guessed
               * focus still paints here.
               */
              selectedFeatureTags={selectionPaint.whole}
              /*
               * Nothing feature-level while a face list is open.
               *
               * This layer paints **over** everything, faces included — an open
               * feature type or a row the pointer passed on the way here would
               * cover the very faces the list is asking about. The list is a
               * question about faces, so faces are what the part answers with.
               */
              highlightedFeatureTags={hoverPaint.whole}
              heldRegions={heldFaces}
              shownDirection={shownArrow(
                draft?.direction === null || draft === null ? arrows : 'off',
                arrowContext,
              )}
              /* Drawing narrows to the one being drawn from — see
               `arrowContext`. Until one is chosen, every arrow is a choice. */
              arrows={draft?.direction === null || draft === null ? arrows : 'off'}
              onArrows={setArrows}
              arrowsVisible={arrowsVisible(
                draft?.direction === null || draft === null ? arrows : 'off',
                arrowContext,
              )}
              paintMode={paintMode}
              onUnit={chooseUnit}
              onShowingPass={setShowingPass}
              cutBy={cutBy}
              cutByRegion={cutByRegion}
              cutRegionsBy={cutRegionsBy}
              faceLayer={listedFaces}
              proposed={proposed}
              proposedFrom={proposal?.direction}
              painted={paintedFeatures}
              onPaintMode={choosePaintMode}
              focusFeature={focusFeature}
              onPick={pickFromPart}
              onAdjacency={setTouching}
              onHoverPart={setPointerOnPart}
              onClearSelection={clearPicks}
            />
          </Panels.Panel>
          <Panels.Separator className={rightSeparatorClassName} />
          <Panels.Panel className="min-h-0 overflow-hidden" defaultSize={460} minSize={320}>
            {/* Content-sized, above the datasheet — not a resizable panel. A panel
              group keeps its layout across a child's remount, so the first
              click's height would survive every click after it (§8). */}
            <div className="flex size-full min-h-0 flex-col">
              {/*
              **Frozen while a feature is being edited.**

              The editor stands in place of the datasheet below, so the mapping
              list above it stays on screen — and every row in it is a live
              control. Pressing one mid-edit maps a different reading, or lights
              a different way up, against a plan that is about to be put back by
              anything but `Save`. The work either vanishes or half of it does,
              and neither reads as a decision anybody made.

              `inert` rather than disabling each control: it takes the whole
              subtree out of the pointer and keyboard and off the accessibility
              tree in one word, and there is no list of controls to keep in step
              with as the panel grows.
            */}
              <div className="contents" inert={facesOpen !== null}>
                <MapFeaturesPanel
                  candidates={mappable}
                  mode={picking.mode}
                  painted={picking.painted}
                  holding={picking.holding}
                  focusedTag={focusedTag}
                  faces={selection.picks.length}
                  highlighted={litDirection?.index ?? null}
                  showingUncut={showingUncut}
                  making={draft}
                  types={featureTypes}
                  touching={touching}
                  onHoverFace={setHoveredFace}
                  justMade={justMade}
                  onAgain={() => {
                    setJustMade(null)
                    setDraft(EMPTY_DRAFT)
                  }}
                  onDeleteMade={deleteMade}
                  onCutMadeFrom={cutMadeFrom}
                  onMake={() => {
                    /*
                     * One press starts it and the same press puts it down, like
                     * every other thing this toggle can be showing — and **leaving
                     * is leaving**, whether or not something was just made. With
                     * the draft already put down by a confirm, a plain toggle
                     * started a fresh drawing instead.
                     */
                    setDraft((current) =>
                      current === null && justMade === null ? EMPTY_DRAFT : null,
                    )
                    setJustMade(null)
                    setShowingUncut(false)
                    setSelection(NOTHING_SELECTED)
                    // The way up is named by pressing an arrow, so entering puts
                    // them on screen — the same reason By direction does. A mode
                    // whose first gesture is invisible is one nobody can start.
                    // Borrowed: leaving without choosing one gives them back.
                    if (draft === null) borrowArrows()
                    else returnArrows()
                  }}
                  /*
                   * Every change to the draft re-guesses the type.
                   *
                   * It used to be guessed only where a click on the part changed
                   * the faces, so a set chosen any other way — Profile, Clear, an ✕
                   * on a row — left the type unset and **Create disabled with no
                   * way to see why**. One choke point instead: the panel says what
                   * changed, and the guess is what follows from it.
                   */
                  onDraft={(next) =>
                    setDraft(withGuess(next, part.features, part.candidateDirections))
                  }
                  onConfirmMade={() => {
                    if (draft === null || draft.direction === null || draft.featureType === null)
                      return
                    const vector = part.candidateDirections[draft.direction]
                    if (!vector) return

                    const guess = readsAs(part.features, vector, draft.faces).find(
                      (each) => each.featureType === draft.featureType,
                    )

                    const feature = makeFeature({
                      direction: vector,
                      featureType: draft.featureType,
                      faces: draft.faces,
                      // The Engine family the rules read, where the readings that
                      // already call these faces this type agree on one.
                      kind: guess?.kind,
                    })

                    setMade((current) => [...current, feature])
                    setJustMade(feature)
                    setDraft(null)
                    // Cut where it was said it would be, while it was being drawn.
                    if (draft.passes.length > 0) {
                      setPlan((current) =>
                        setPassFor(
                          current,
                          part.candidateDirections,
                          [...part.features, feature],
                          [feature],
                          draft.passes,
                        ),
                      )
                    }
                    // Opened straight away: somebody who has just drawn a reading is
                    // about to say where it is cut from.
                    setSelection({
                      picks: [],
                      candidates: [],
                      focused: feature.featureTag,
                      alone: false,
                    })
                  }}
                  uncut={uncutRows(
                    part,
                    part.candidateDirections,
                    part.features,
                    plan,
                    showingPass,
                  )}
                  onPickFace={(region) => {
                    /*
                     * A row in the uncut list **is** the face on the part, so
                     * pressing it lights it exactly as clicking it there would —
                     * one act, one meaning, wherever the gesture is made.
                     *
                     * And nothing else: the row opens onto its own readings in
                     * place, so putting the list away here would close the thing
                     * the press just opened.
                     */
                    selectFace(
                      pickForRegion(
                        region,
                        // Who covers it by the **plan's** reckoning — reported or
                        // handed — which is who could be asked to cut it.
                        part.features
                          .filter((feature) => coveredRegions(plan, feature).includes(region))
                          .map((feature) => feature.featureTag),
                      ),
                    )
                  }}
                  activeDirection={activeDirection}
                  onLetGo={() =>
                    setPicking((current) => holdPickDirection(current, current.holding ?? -1))
                  }
                  proposal={proposal}
                  proposed={proposed}
                  handedTags={
                    new Set(
                      handedReadings(part.features, plan, heldRegions(selection)).map(
                        (feature) => feature.featureTag,
                      ),
                    )
                  }
                  onInfer={(kind: Infer) => {
                    if (picking.holding === null) return
                    const setup = plan.setups.find(
                      (entry) => entry.directionIndex === picking.holding,
                    )
                    setProposal(
                      propose(
                        part.features,
                        plan,
                        part.candidateDirections,
                        picking.holding,
                        kind,
                        rules.verdicts,
                        setup?.id,
                      ),
                    )
                  }}
                  onPrune={(readings) =>
                    // A row is its group, so pruning one is pruning all of them —
                    // folded rather than looped, because each removal answers the
                    // one before it.
                    changeOffer(
                      readings.reduce<Proposal | null>(
                        (current, reading) => (current ? withoutReading(current, reading) : null),
                        proposal,
                      ),
                    )
                  }
                  onDiscard={() => changeOffer(null)}
                  onHighlightDirection={(index, tags) =>
                    // Pressing the row it is already lighting puts it out, so the
                    // same press both asks and stops asking.
                    setLitDirection((current) =>
                      current?.index === index ? null : { index, tags },
                    )
                  }
                  onMode={(mode: PickMode) => {
                    // Unmapped and Create are the other answers to the same
                    // question, so naming either pick mode is how you leave them.
                    setShowingUncut(false)
                    setDraft(null)
                    setJustMade(null)
                    setPicking((current) => switchMode(current, mode))
                    setSelection(NOTHING_SELECTED)
                    setHoveredTags([])
                    /*
                     * By direction is worked by pressing an arrow, so entering it
                     * puts them on screen — and leaving it puts them away along
                     * with whatever was held, rather than restoring what they were.
                     * A held way up is a filter on the mode being left.
                     */
                    if (mode === 'direction') borrowArrows()
                    else putArrowsAway()
                  }}
                  onChoose={chooseWithin}
                  onSetPass={setPass}
                  onShowFaces={openFaces}
                  onHover={setHoveredTags}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {/*
                Nothing is being read while a reading is being drawn.
                
                The datasheet describes one of the Engine's readings, and this
                mode is about faces that do not belong to one yet — leaving it
                up puts a description of something else under the panel doing
                the work, and clicking a face used to change it.
              */}
                {draft !== null ? (
                  <aside className="flex size-full min-h-0 flex-col overflow-y-auto bg-ground">
                    <p className="p-4 text-sm leading-6 text-ink-dim">
                      Drawing a reading. Its faces are listed above, and the part shows what is
                      chosen — nothing is being read.
                    </p>
                  </aside>
                ) : facesOpen ? (
                  <FaceList
                    feature={facesOpen}
                    onSetFace={(feature, region, cut) => {
                      setPlanIsGenerated(false)
                      setPlan((current) =>
                        setFaceCut(
                          current,
                          part.candidateDirections,
                          part.features,
                          feature,
                          // Both passes: a face ticked here is roughed and
                          // finished, the same default a generator takes.
                          PASSES,
                          region,
                          cut,
                        ),
                      )
                    }}
                    onSetPass={setPass}
                    /*
                     * One face moves; nothing else does.
                     *
                     * Pressing the pass a face already has here takes that face
                     * off that reading, which is the same rule a row follows —
                     * and everything else the reading cuts, and everything every
                     * other reading cuts, is left exactly as it was.
                     */
                    onSetFacePass={(owner, region, passes) => {
                      /*
                       * A toggle: pressing a pass this face already has here
                       * takes it off. An **empty** list is Both pressed on a face
                       * that holds both, which `setFaceCut` reads as "off, in
                       * both passes" — `[].every()` is vacuously true, so asking
                       * the question of an empty list gives the wrong answer.
                       */
                      const holds =
                        passes.length > 0 &&
                        passes.every((pass) => cutsFace(plan, owner, pass, region))
                      setPlan((current) =>
                        setFaceCut(
                          current,
                          part.candidateDirections,
                          part.features,
                          owner,
                          passes,
                          region,
                          !holds,
                        ),
                      )
                    }}
                    focusedTag={focusedTag}
                    reveal={revealFace}
                    onCurrentFace={setCurrentFace}
                    onChoose={chooseWithin}
                    onDelete={deleteMade}
                    onCutFrom={cutMadeFrom}
                    cutting={facePasses}
                    onCutting={setFacePasses}
                    /*
                     * Every face nobody has claimed, in the passes the switch
                     * names — folded from one snapshot, the same rule
                     * `onSelectAll` follows and for the same reason.
                     *
                     * **Additive, and per face.** Each entry carries the passes
                     * that face is actually free in — a face finished from
                     * another way up and roughed by nobody is filled in roughing
                     * alone, whatever the switch says. Taking the switch's passes
                     * for every face would pull the finishing off the reading
                     * that has it, in a press that exists to fill gaps rather
                     * than argue with anything.
                     */
                    types={featureTypes}
                    /*
                     * Rename what a reading is, and let every list see it.
                     *
                     * Written into `retyped`, which `part` folds in beside the
                     * made readings — so the rules re-judge it, the score moves,
                     * and a generator run after this puts it where the new type
                     * belongs. A plan built before the rename is no longer a plan
                     * the rules would produce, which is what clearing the
                     * generated flag says.
                     */
                    onRetype={(featureTag, featureType) => {
                      setPlanIsGenerated(false)
                      setRetyped((current) => ({ ...current, [featureTag]: featureType }))
                    }}
                    onSelectFree={(faces) => {
                      setPlanIsGenerated(false)
                      const reading = facesOpen
                      setPlan((current) =>
                        faces.reduce(
                          (plan, face) =>
                            setFaceCut(
                              plan,
                              part.candidateDirections,
                              part.features,
                              reading,
                              face.passes,
                              face.region,
                              true,
                            ),
                          current,
                        ),
                      )
                    }}
                    onUnlockSetup={(setupId) =>
                      setPlan((current) => lockSetup(current, setupId, false))
                    }
                    onSelectAll={(on) => {
                      /*
                       * One update for every face, not one per face.
                       *
                       * `setPlan` folds over the set from a single snapshot —
                       * twenty `setState` calls from one snapshot keep only the
                       * last, which is exactly how "Both" once set finishing and
                       * dropped roughing.
                       */
                      const reading = facesOpen
                      setPlan((current) =>
                        coveredRegions(current, reading).reduce(
                          (plan, region) =>
                            setFaceCut(
                              plan,
                              part.candidateDirections,
                              part.features,
                              reading,
                              facePasses,
                              region,
                              on,
                            ),
                          current,
                        ),
                      )
                    }}
                    onHoverFace={setHoveredFace}
                    /*
                     * Whether `Save` has anything to keep — the same question
                     * `Cancel` answers from the other side, asked of the plan the
                     * editor opened against rather than of a flag somebody has to
                     * remember to set.
                     */
                    changed={planBefore !== null && readingChanged(planBefore, plan, facesOpen)}
                    onCancel={cancelFaces}
                    onClose={saveFaces}
                  />
                ) : (
                  <FeatureDetail
                    mode={picking.mode}
                    feature={focused}
                    siblings={focusedHoles}
                    report={part}
                    candidates={mappable}
                    scores={scores}
                    onChoose={focusCandidate}
                    onZoom={zoomToFeature}
                    onClose={clearPicks}
                    unit={unit}
                    rules={rules.ruleSet.rules}
                    part={rulesContext}
                    verdict={rules.verdicts.find((each) => each.tag === focusedTag) ?? null}
                    plan={plan}
                    showingPass={showingPass}
                    onShowFaces={openFaces}
                    onDelete={deleteMade}
                    /*
                     * Sixteen identical holes are one press, here as everywhere
                     * else — the datasheet is describing the group, so its buttons
                     * had better act on it.
                     */
                    onSetPass={(feature, passes) =>
                      setPass(focusedHoles.length > 1 ? focusedHoles : [feature], passes)
                    }
                  />
                )}
              </div>
            </div>
          </Panels.Panel>
        </Panels.Group>
      </main>
    </PartViewProvider>
  )
}
