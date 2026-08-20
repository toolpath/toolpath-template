import { directionIndexOf, sameDirection, type PartPick } from '@toolpath/viewer'
import { type Arrows, arrowsVisible, shownArrow } from '../shared/arrows'
import { type PaintMode, loadPaintMode, savePaintMode } from '../shared/paint'
import { type Unit, loadUnit, saveUnit } from '../shared/units'
import { Panels, Tabs } from '@toolpath/ui'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { PublicInspectionReport } from '../shared/contracts'
import {
  NOTHING_SELECTED,
  type SelectionState,
  heldRegions,
  isEmptySelection,
  pickFace,
  scopeToDirection,
  stepCandidate,
} from '../shared/selection'
import { featureFromTags, filterFeatures, tagsOfType } from '../shared/report'
import { listHighlight } from '../shared/highlighting'
import { useRules } from '../shared/use-rules'
import { featureScores } from '../shared/feature-score'
import { rulesSummary } from '../shared/rules-summary'
import { partContext } from '../shared/metrics'
import { escapeStep } from '../shared/escape'
import { AppHeader } from './app-header'
import { FeatureDetail } from './feature-detail'
import { PartSummary } from './part-summary'
import { RulesPanel } from './rules-panel'
import { FeatureViewer } from './feature-viewer'

type ViewerTab = 'inspector' | 'rules'

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
  const [arrows, setArrows] = useState<Arrows>('off')
  const [focusFeature, setFocusFeature] = useState<string | null>(null)

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
    // Narrow the arrows to the one being held. Left showing all of them,
    // pressing an arrow changed nothing anybody could see, and a filter with no
    // sign of itself reads as a click that missed.
    if (holding !== null) setArrows('off')

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
  const focused = useMemo(
    () => report.features.find((feature) => feature.featureTag === focusedTag) ?? null,
    [focusedTag, report.features],
  )
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
  const rules = useRules(report.features)
  /** How each feature came out, for the rows that name one. */
  const scores = useMemo(() => featureScores(rules.verdicts), [rules.verdicts])
  const summary = useMemo(
    () => rulesSummary(rules.verdicts, report.features, rules.ruleSet.rules),
    [report.features, rules.ruleSet.rules, rules.verdicts],
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
  const [unit, setUnit] = useState<Unit>('mm')
  const features = useMemo(() => filterFeatures(report.features, query), [query, report.features])

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
  const arrowContext = useMemo(() => {
    const index = focused ? directionIndexOf(report, focused.machiningDirection) : -1
    return { focusedDirection: index === -1 ? null : index, activeDirection }
  }, [activeDirection, focused, report])
  const candidates = useMemo(
    () => featureFromTags(report.features, candidateTags),
    [candidateTags, report.features],
  )
  /** Naming a feature in the list is a different question from the one a click asked. */
  const choose = (featureTag: string) => {
    setSelection({ picks: [], candidates: [], focused: featureTag })
    setTypeIsAsking(false)
  }

  /**
   * Switching between the readings of the face already clicked.
   *
   * Keeps the candidate list up: it is the control being used, and clearing it
   * on the first press left nothing to switch back with.
   */
  const focusCandidate = (featureTag: string) => {
    setSelection((current) => ({ ...current, focused: featureTag }))
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
  const pickFromPart = (pick: PartPick) => {
    setSelection((current) => pickFace(current, pick))
    setTypeIsAsking(false)
  }

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
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      // A list under the pointer walks itself; this is the shortcut for when
      // focus is still on the canvas that produced the candidates.
      if (target?.closest('[data-keynav]')) return

      // Escape works outward, one thing per press — see `escapeStep`.
      if (event.key === 'Escape') {
        const step = escapeStep({
          hasSelection: !isEmptySelection(selection),
          expandedType,
          direction: activeDirection,
        })
        if (step === 'selection') setSelection(NOTHING_SELECTED)
        else if (step === 'expandedType') expandType(null)
        else if (step === 'direction') setActiveDirection(null)
        return
      }

      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
      if (step === 0) return
      event.preventDefault()
      setSelection((current) => stepCandidate(current, step))
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeDirection, expandedType, selection])

  const tabPanel =
    tab === 'inspector' ? (
      <aside className="flex size-full min-h-0 flex-col overflow-y-auto bg-zinc-900">
        <PartSummary
          report={report}
          features={features}
          activeDirection={activeDirection}
          onPickDirection={holdDirection}
          expandedType={expandedType}
          onExpandType={expandType}
          focusedTag={focusedTag}
          candidateTags={candidateTags}
          onChoose={choose}
          onHover={setHoveredTags}
          unit={unit}
          onUnit={chooseUnit}
          query={query}
          onQuery={setQuery}
          scores={scores}
        />
      </aside>
    ) : (
      <RulesPanel
        features={report.features}
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

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <AppHeader
        className="border-b border-zinc-800 px-4 py-3"
        navigation={
          <Tabs value={tab} onValueChange={(value) => setTab(value as ViewerTab)}>
            <Tabs.List>
              <Tabs.Tab value="inspector">Inspector</Tabs.Tab>
              <Tabs.Tab value="rules">Rules</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        }
        actions={
          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-zinc-500">
              <p>{report.features.length} recognized features</p>
              <p className="font-mono">{report.partId}</p>
            </div>
            <Link
              className="rounded border border-zinc-700 bg-transparent px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-900"
              to="/"
            >
              Upload another part
            </Link>
          </div>
        }
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">Toolpath</p>
        <h1 className="font-display text-xl font-bold">Part Viewer</h1>
      </AppHeader>

      <Panels.Group className="min-h-0 flex-1" orientation="horizontal">
        <Panels.Panel className="min-h-0 overflow-hidden" defaultSize={460} minSize={260}>
          {tabPanel}
        </Panels.Panel>
        <Panels.Separator className={leftSeparatorClassName} />
        <Panels.Panel className="min-h-0 overflow-hidden" minSize={400}>
          <FeatureViewer
            activeDirection={activeDirection}
            onPickDirection={(index) => holdDirection(index)}
            report={report}
            jobId={jobId}
            selectedFeatureTag={focusedTag}
            highlightedFeatureTags={listHighlight({
              hovered: hoveredTags,
              ofType: typeTags,
              pointerOnPart,
            })}
            heldRegions={heldRegions(selection)}
            shownDirection={shownArrow(arrows, arrowContext)}
            arrows={arrows}
            onArrows={setArrows}
            arrowsVisible={arrowsVisible(arrows, arrowContext)}
            paintMode={paintMode}
            verdicts={rules.verdicts}
            onPaintMode={choosePaintMode}
            focusFeature={focusFeature}
            onPick={pickFromPart}
            onHoverPart={setPointerOnPart}
            onClearSelection={() => setSelection(NOTHING_SELECTED)}
          />
        </Panels.Panel>
        <Panels.Separator className={rightSeparatorClassName} />
        <Panels.Panel className="min-h-0 overflow-hidden" defaultSize={460} minSize={320}>
          <FeatureDetail
            feature={focused}
            report={report}
            candidates={candidates}
            scores={scores}
            onChoose={focusCandidate}
            onZoom={zoomToFeature}
            onClose={() => setSelection(NOTHING_SELECTED)}
            unit={unit}
            rules={rules.ruleSet.rules}
            part={rulesContext}
            verdict={rules.verdicts.find((each) => each.tag === focusedTag) ?? null}
          />
        </Panels.Panel>
      </Panels.Group>
    </main>
  )
}
