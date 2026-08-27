import {
  Axes,
  DirectionArrows,
  Grid,
  ViewCube,
  Viewer,
  type ViewerHandle,
  sectionFromPick,
} from '@toolpath/viewer'
import { EnginePart } from '@toolpath/viewer/engine'
import {
  CrosshairSimpleIcon,
  MagnifyingGlassPlusIcon,
  MoonIcon,
  SquareHalfIcon,
  SunIcon,
} from '@phosphor-icons/react'
import { useEffect, useCallback, Component, Suspense, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { Box3 } from 'three'
import type { PartPick, SectionPlacement, SectionState } from '@toolpath/viewer'
import { type Arrows, nextArrows } from 'shared/arrows'
import { READING_COLORS, SETUP_COLORS } from 'shared/selection-colors'
import { loadShowAids, saveShowAids } from 'shared/scene-aids'
import { loadZoomTo, saveZoomTo, type ZoomTo } from 'shared/zoom-to'
import { directionLabel } from 'shared/report'
import { BananaIcon, GridIcon, PAINT_MODE_ICONS } from './panel-icons'
import { Banana } from './banana'
import { PartSize, formatSides, sidesOf } from './part-size'
import type { Unit } from 'shared/units'
import { loadBanana, saveBanana } from 'shared/banana'
import { applyTheme, loadTheme, saveTheme, type Theme } from 'shared/theme'
import {
  PAINT_MODE_LABELS,
  type PaintMode,
  paintWash,
  paintedWash,
  proposedWash,
  regionWash,
} from 'shared/paint'
import type { Band } from 'shared/rules'
import type { Pass } from 'shared/setups'
import { Button } from '@toolpath/ui'
import { ToolButton } from './tool-button'
import { barButtonClass } from './panel-button'
import type { PartReport, PublicInspectionReport } from 'shared/contracts'
import { usePartView } from './part-view'

class MeshErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.error) {
      return (
        <div className="grid size-full place-items-center p-8 text-center text-sm text-ink-muted">
          <p>The mesh could not be loaded. The feature list is still available.</p>
        </div>
      )
    }
    return this.props.children
  }
}

const meshUrl = (partId: string, jobId: string, format: 'glb' | 'stl'): string =>
  `/api/parts/${encodeURIComponent(partId)}/mesh?${new URLSearchParams({ jobId, format })}`

/**
 * One arrow, pointing down at the part the way the arrows on the part do.
 *
 * A solid head and nothing else: at this size extra lines read as smudges, and
 * the button's own colour already says which state it is in.
 */
/** A direction the report does not have, so the label says something. */
const ORIGIN = { x: 0, y: 0, z: 0 }

const ArrowGlyph = () => (
  <svg
    aria-hidden="true"
    // 16px, like the Phosphor icons beside it. At 14 it read as a smaller
    // control rather than as a different one.
    className="size-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth={1.75}
    viewBox="0 0 16 16"
  >
    <path d="M8 2v9" />
    <path d="M8 14 4.5 9h7Z" fill="currentColor" stroke="none" />
  </svg>
)

/**
 * What the arrows button says it is doing, in each of its three states.
 *
 * A word beside the glyph rather than a third colour: the shelf already spends
 * its one tint on "this is on", and asking a single hue to separate *all of
 * them* from *the ones I am using* is asking a colour to carry a distinction it
 * cannot.
 */
const ARROW_STATES: Record<Arrows, { label: string; said: string; note: string }> = {
  all: {
    label: 'All',
    said: 'every candidate way up',
    note: 'Every way up the part has — click for only the ones the plan holds',
  },
  confirmed: {
    label: 'Confirmed',
    said: 'only the ways up the plan holds',
    note: 'Only the ways up the plan holds — none are drawn until one is. Click to turn them off',
  },
  off: {
    label: 'Off',
    said: 'no arrows',
    note: 'No arrows — one appears on its own while a feature is selected. Click for all of them',
  },
}

/**
 * The part, showing the one reading being read.
 *
 * The viewer can paint every feature a click could have meant, and this
 * deliberately passes none. A click resolves to five to eight readings, and
 * among them are the direction's `profile` features — a profile traces the
 * whole boundary contour of its direction, so painting the owners of one face
 * washed most of the part and read as though clicking had chained things
 * together. The alternatives are offered in words instead, in the panel beside
 * it, and only the focused reading is coloured.
 */
export const FeatureViewer = ({
  jobId,
  selectedFeatureTags,
  highlightedFeatureTags,
  heldRegions,
  activeDirection,
  shownDirection,
  arrows,
  onArrows,
  arrowsVisible,
  paintMode,
  onUnit,
  onShowingPass,
  cutBy,
  cutByRegion,
  cutRegionsBy,
  faceLayer,
  proposed,
  proposedFrom,
  painted,
  onPaintMode,
  focusFeature,
  onPickDirection,
  onPick,
  onHoverPart,
  onAdjacency,
  onClearSelection,
}: {
  jobId: string
  /** The readings painted as selected: ticked, plus whatever is being read. */
  selectedFeatureTags: ReadonlyArray<string>
  /** Features under the pointer in the feature list. */
  highlightedFeatureTags: ReadonlyArray<string>
  /**
   * The faces being held, painted so a modifier-click has something to aim at.
   *
   * Without them, holding a second face narrows the candidate list and often
   * leaves the same reading painted, so the click looks like it did nothing.
   */
  heldRegions: ReadonlyArray<number>
  /** Scopes picking to one way up, and shows that arrow on its own. */
  activeDirection: number | null
  /**
   * The way up the feature being read is cut from, shown on its own.
   *
   * A part has up to ten candidate directions and the arrows are large; once
   * one feature is being read, the other nine answer a question nobody asked.
   */
  /** `null` for every arrow, an index for one, a list for a set, `-1` for none. */
  shownDirection: number | ReadonlyArray<number> | null
  /** Every arrow, only the ways up the plan holds, or only what the selection implies. */
  arrows: Arrows
  onArrows: (arrows: Arrows) => void
  /** Whether any arrow is drawn at all. */
  arrowsVisible: boolean
  /** The standing wash: what the part is coloured by while nothing is selected. */
  paintMode: PaintMode
  onUnit: (unit: Unit) => void
  onShowingPass: (pass: Pass) => void
  /** Which way up cuts each feature in that pass, for the directions wash. */
  cutBy: ReadonlyMap<string, number>
  /** Which way up cuts each face, for readings that cut only part of themselves. */
  cutByRegion: ReadonlyMap<number, number>
  /** Which reading cuts each face, for the difficulty wash. */
  cutRegionsBy: ReadonlyMap<number, string>
  /**
   * Faces named directly, over the wash — the reading whose faces are being
   * listed. Under the picked colour, so the row under the pointer still stands
   * out of the set it belongs to.
   */
  faceLayer: ReadonlyArray<{ region: number; color: number; weight: number }>
  /** Readings the app is offering, painted over everything else. */
  proposed: ReadonlyArray<{ featureTag: string }>
  /**
   * Which way up the offer came from, so it is painted in that colour.
   *
   * An offer *is* a direction's claim — "these are the faces +Z would take" —
   * and painting it the colour that way up already wears says which one is
   * asking. Absent falls back to violet.
   */
  proposedFrom?: number | undefined
  /** Readings gathered by painting, in their own orange. */
  painted: ReadonlyArray<{ featureTag: string }>
  onPaintMode: (mode: PaintMode) => void
  /** A feature to zoom to. Framed when it changes. */
  focusFeature: string | null
  onPickDirection: (index: number) => void
  onPick: (pick: PartPick) => void
  /** Whether the pointer is over the part itself, rather than empty space. */
  onHoverPart: (over: boolean) => void
  /** Which faces touch which, once the mesh is in — the viewer works it out. */
  onAdjacency: (adjacency: ReadonlyMap<number, ReadonlySet<number>>) => void
  /** A click that hit nothing in the scene. */
  onClearSelection: () => void
}) => {
  const { report, unit, showingPass, verdicts } = usePartView()

  const viewerRef = useRef<ViewerHandle>(null)
  // The cut is a mode: its handle stands over the part's centre, which is also
  // where an orbit starts, so leaving it on would swallow the gesture.
  const [sectioning, setSectioning] = useState(false)
  // A cut keyed off a face, rather than swept along an axis. `armed` is the
  // moment between asking for one and clicking the face it starts from.
  const [armed, setArmed] = useState(false)
  const [plane, setPlane] = useState<SectionPlacement | null>(null)
  const [depth, setDepth] = useState(0)
  const [depthRange, setDepthRange] = useState<SectionState['depthRange']>(null)
  const [showAids, setShowAids] = useState(() =>
    loadShowAids(typeof window === 'undefined' ? null : window.localStorage),
  )
  const [zoomTo, setZoomTo] = useState<ZoomTo>(() =>
    loadZoomTo(typeof window === 'undefined' ? null : window.localStorage),
  )
  const [banana, setBanana] = useState(() =>
    loadBanana(typeof window === 'undefined' ? null : window.localStorage),
  )
  const [partBox, setPartBox] = useState<Box3 | null>(null)
  /*
   * Read after mount, unlike the class on `<html>`, which a script in the head
   * has already set. This is only the button's idea of what is showing.
   */
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(loadTheme(globalThis.localStorage ?? null))
  }, [])

  const toggleTheme = () => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      saveTheme(globalThis.localStorage ?? null, next)
      applyTheme(globalThis.document?.documentElement ?? null, next)
      return next
    })
  }

  /*
   * Frame the part and the banana together, which `fit` cannot do: the banana
   * is furniture and furniture is exactly what `fit` is written to ignore.
   */
  const frameWithBanana = useCallback((both: Box3) => {
    viewerRef.current?.frameBox(both)
  }, [])

  const toggleBanana = () => {
    setBanana((shown) => {
      saveBanana(typeof window === 'undefined' ? null : window.localStorage, !shown)
      // Going off, re-fit now: nothing is arriving to ask for it later.
      if (shown) {
        viewerRef.current?.fit()
      }
      return !shown
    })
  }

  const toggleAids = () => {
    setShowAids((shown) => {
      saveShowAids(typeof window === 'undefined' ? null : window.localStorage, !shown)
      return !shown
    })
  }

  // The offer goes on last, so while it stands it is what the part is saying.
  /*
   * Weakest first, so the newest question is the one on screen.
   *
   * The standing wash for the mode, then what is painted in its own orange,
   * then a standing offer in violet over the top — an offer is the app asking
   * something, and it has to be impossible to mistake for work already placed.
   */
  const wash = useMemo(
    () => [
      ...paintWash(paintMode, verdicts, cutBy),
      ...paintedWash(painted),
      ...proposedWash(proposed, proposedFrom),
    ],
    [paintMode, verdicts, cutBy, painted, proposed, proposedFrom],
  )

  /*
   * The faces of a part-cut reading, over the feature layer.
   *
   * The viewer's region layer exists for exactly this — "which part of a
   * feature it is talking about" — and the two sets never overlap, because a
   * face is cut once.
   */
  const faceWash = useMemo(
    () => [...regionWash(paintMode, cutByRegion, cutRegionsBy, verdicts), ...faceLayer],
    [paintMode, cutByRegion, cutRegionsBy, verdicts, faceLayer],
  )

  const pickInViewport = (pick: PartPick) => {
    if (armed) {
      // The click places the cut instead of selecting: it is the question that
      // was just asked, and answering both at once would select whatever the
      // cut is about to hide.
      setPlane(
        sectionFromPick({
          point: { x: pick.point[0], y: pick.point[1], z: pick.point[2] },
          normal: { x: pick.normal[0], y: pick.normal[1], z: pick.normal[2] },
        }),
      )
      setDepth(0)
      setArmed(false)
      return
    }
    onPick(pick)
  }

  const startSectioning = () => {
    setSectioning(true)
    setArmed(true)
    setPlane(null)
  }

  const stopSectioning = () => {
    setSectioning(false)
    setArmed(false)
    setPlane(null)
  }
  const viewerReport = useMemo<PartReport>(
    () => ({
      ...report,
      meshGlbUrl: report.hasMeshGlb ? meshUrl(report.partId, jobId, 'glb') : null,
      meshStlUrl: report.hasMeshStl ? meshUrl(report.partId, jobId, 'stl') : null,
      thumbnailUrl: null,
    }),
    [jobId, report],
  )

  return (
    <section className="viewport relative size-full min-h-[32rem] bg-ground">
      <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-1.5">
          {/* A shelf rather than a toggle: what the part is coloured by is the
            first thing anybody changes, and a switch that hides the other mode
            makes you press it to find out what it was. */}
          <span
            className="flex items-center gap-1 rounded-md border border-edge-strong bg-ground/85 p-1"
            role="group"
            aria-label="Colour the part by"
          >
            {PAINT_MODE_LABELS.map(([mode, label]) => {
              const Glyph = PAINT_MODE_ICONS[mode]

              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={paintMode === mode}
                  onClick={() => onPaintMode(mode)}
                  className={`flex items-center gap-1.5 ${barButtonClass(paintMode === mode)}`}
                >
                  {/* The word is the label; the glyph is decoration beside it,
                      so it is hidden rather than read out twice. */}
                  <span aria-hidden="true" className="shrink-0">
                    <Glyph />
                  </span>
                  {label}
                </button>
              )
            })}
          </span>
        </div>
        {/*
          Which pass the colours mean — under the modes, not beside them.
          
          Only while they mean something (row 40): roughing and finishing are
          separate claims on a face, so a part painted by direction is painting
          one of two answers and has to say which.
          
          Its own row because the modes wear glyphs now, and the two groups on
          one line ran off the end of the canvas and under the panel — where the
          control it clipped was the one that says what you are looking at.
        */}
        {paintMode === 'plain' ? null : (
          <span
            className="flex items-center gap-0.5 rounded-md border border-edge-strong bg-ground/85 p-1"
            role="group"
            aria-label="Which pass the colours mean"
          >
            {(['rough', 'finish'] as const).map((pass) => (
              <button
                key={pass}
                type="button"
                aria-pressed={showingPass === pass}
                onClick={() => onShowingPass(pass)}
                className={barButtonClass(showingPass === pass, 'within')}
              >
                {pass}
              </button>
            ))}
          </span>
        )}
        {/* A filter switched on from the part has to be visible on the part, and
          clearable from there: one you can only switch off from another view is
          a filter people get stuck in. */}
        {activeDirection === null ? null : (
          <span className="flex items-center gap-2 rounded bg-warning/20 px-2 py-1 text-2xs text-ink shadow-sm">
            Only {directionLabel(report.candidateDirections[activeDirection] ?? ORIGIN)} ·
            everything else is hidden from a click
            <Button size="sm" variant="secondary" onClick={() => onPickDirection(activeDirection)}>
              Clear
            </Button>
          </span>
        )}
      </div>
      {/*
        The view controls, under the part rather than beside the washes.

        Two different questions were sharing one shelf. *What is the part
        coloured by* is about the report — it changes what you are looking at,
        and it is the first thing anybody reaches for, so it keeps the corner
        the eye starts in. Arrows, zoom, grid and section change how you are
        looking, which is a different kind of answer and belongs with the part
        rather than with the reading of it.

        Centred under the model, where the hand already is after an orbit, and
        clear of the view cube in the opposite corner. The strip spans the width
        so the shelf stays centred, so it passes pointer events through
        everywhere except the shelf itself — a full-width bar over the canvas
        would eat every drag that ended low.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col gap-1.5 px-3">
        {/*
          Two rows, not one.

          The canvas is only as wide as the two panels leave it — around 480px
          on a 1400px window — and the controls, the unit, the theme and the
          size reading do not fit across that. On one row they took turns
          hiding each other: first the reading ran off the edge, then it sat on
          top of the shelf. Stacked, the shelf stays centred and the readings
          stay right, at every width there is.
        */}
        <div className="flex flex-col items-center gap-1.5">
          {sectioning ? (
            /* Its own row above the shelf, so starting a section does not shove
             the buttons somebody just pressed. `pointer-events-auto` because
             the strip around it deliberately has none. */
            <div className="pointer-events-auto flex items-center gap-1.5">
              <ToolButton
                label={armed ? 'Now click a face' : 'Cut from another face'}
                pressed={armed}
                onClick={() => {
                  setArmed(true)
                  setPlane(null)
                }}
              >
                <CrosshairSimpleIcon />
              </ToolButton>
              {plane === null ? (
                <span className="flex h-8 items-center rounded-md border border-info/40 bg-info/10 px-3 text-xs text-info">
                  Click a face to cut from
                </span>
              ) : null}
              {plane && depthRange ? (
                <label className="flex h-8 items-center gap-2 rounded-md border border-edge-strong bg-ground/85 px-3 text-xs text-ink-body">
                  <span className="sr-only">Cut depth</span>
                  <input
                    type="range"
                    min={Math.max(0, depthRange.min)}
                    max={depthRange.max}
                    step={0.1}
                    value={depth}
                    onChange={(event) => setDepth(Number(event.target.value))}
                    className="w-32 accent-info"
                  />
                  <span className="w-16 text-right font-mono">{depth.toFixed(1)} mm</span>
                </label>
              ) : null}
            </div>
          ) : null}
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-md border border-edge-strong bg-ground/85 p-1"
            role="group"
            aria-label="View controls"
          >
            <button
              type="button"
              // Three states, so `aria-pressed` cannot carry it — the label says
              // which one outright, and the word beside the glyph does the same
              // for anybody looking at it. A colour alone can only say two
              // things, and there are three.
              aria-pressed={arrows !== 'off'}
              aria-label={`Direction arrows: ${ARROW_STATES[arrows].said}`}
              title={ARROW_STATES[arrows].note}
              onClick={() => onArrows(nextArrows(arrows))}
              className={`flex items-center gap-1 rounded px-1.5 py-1 transition ${
                arrows === 'off'
                  ? 'text-ink-body hover:bg-surface hover:text-ink'
                  : 'bg-info/20 text-info'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/75`}
            >
              <ArrowGlyph />
              <span className="text-2xs font-medium">{ARROW_STATES[arrows].label}</span>
            </button>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-lift" />
            {/*
            What the wheel zooms toward.
            
            A preference rather than a right answer: zooming to the cursor is
            what Fusion does and what most people reach for, and on a
            trackpad it can walk the model off screen. Double click re-frames
            either way, which is what makes the cursor one safe to leave on.
          */}
            <ToolButton
              label={zoomTo === 'cursor' ? 'Zoom to cursor' : 'Zoom to centre'}
              pressed={zoomTo === 'cursor'}
              onClick={() => {
                const next: ZoomTo = zoomTo === 'cursor' ? 'centre' : 'cursor'
                setZoomTo(next)
                saveZoomTo(globalThis.localStorage ?? null, next)
              }}
            >
              <MagnifyingGlassPlusIcon />
            </ToolButton>
            <ToolButton
              label={showAids ? 'Grid and axes (on)' : 'Grid and axes'}
              pressed={showAids}
              onClick={toggleAids}
            >
              <GridIcon />
            </ToolButton>
            {/* Furniture, like the grid, and in the same part of the shelf: both
              answer "how big is this actually", one in numbers you read and one
              at a glance. */}
            <ToolButton
              label={banana ? 'Banana for scale (on)' : 'Banana for scale'}
              pressed={banana}
              onClick={toggleBanana}
            >
              <BananaIcon />
            </ToolButton>
            <ToolButton
              label={sectioning ? 'Section (on)' : 'Section'}
              pressed={sectioning}
              onClick={() => (sectioning ? stopSectioning() : startSectioning())}
            >
              <SquareHalfIcon />
            </ToolButton>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-edge-strong" />
            {/* Divided off the rest: everything left of the rule changes what you
              are looking at, and this changes how the page is lit. */}
            <ToolButton
              label={
                theme === 'dark' ? 'Dark theme — press for light' : 'Light theme — press for dark'
              }
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </ToolButton>
          </div>
        </div>
        {/*
          How big the part actually is, in the corner opposite the cube.

          Nothing else on screen says: a part fills the viewport whatever its
          size, and the banana answers at a glance but not in numbers. Sorted
          largest first rather than X, Y, Z — how the part happened to be drawn
          is not a fact about the part.

          Pressing it swaps the unit for the whole page, because somebody who
          wants inches here wants inches everywhere, and a reading that
          disagreed with the datasheet beside it would be worse than none.

          In the same row as the shelf rather than its own corner: at a narrow
          viewport the two absolute corners sat on top of each other, and the
          thing they hid was the toolbar.
        */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/*
            One button, not two. There are exactly two units and a machinist
            works in one of them all day, so this shows what is being read and
            pressing it reads the other.

            Down here with the size it qualifies, rather than beside one
            heading on one tab: every number on every page is in this unit, and
            the reading next to it is the most obvious thing to want it for.
          */}
          {/*
            The unit, beside the size it is spoken in — the most obvious thing
            to want it for, and the reading right of it changes with it.

            `pointer-events-auto` on the shelf: the strip around it has none, and
            a control nobody can press is worse than one that is not there.
          */}
          <span className="pointer-events-auto flex items-center rounded-md border border-edge-strong bg-ground/85 p-1">
            <button
              type="button"
              aria-label={`Units: ${unit}. Switch to ${unit === 'mm' ? 'in' : 'mm'}`}
              title={`Reading in ${unit} — press for ${unit === 'mm' ? 'in' : 'mm'}`}
              onClick={() => onUnit(unit === 'mm' ? 'in' : 'mm')}
              className="rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-ink-muted transition hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info"
            >
              {unit}
            </button>
          </span>
          {partBox === null ? null : (
            <button
              type="button"
              aria-label={`Part size, ${formatSides(sidesOf(partBox), unit)}. Press to show ${
                unit === 'mm' ? 'inches' : 'millimetres'
              }`}
              title={`Show ${unit === 'mm' ? 'inches' : 'millimetres'}`}
              onClick={() => onUnit(unit === 'mm' ? 'in' : 'mm')}
              className="pointer-events-auto whitespace-nowrap rounded-md border border-edge-strong bg-ground/85 px-2 py-1 font-mono text-2xs tabular-nums text-ink-muted transition hover:border-edge-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/75"
            >
              {formatSides(sidesOf(partBox), unit)}
            </button>
          )}
        </div>
      </div>
      {report.hasMeshGlb || report.hasMeshStl ? (
        <MeshErrorBoundary key={`${report.partId}:${jobId}`}>
          <Suspense
            fallback={
              <div className="grid size-full place-items-center text-sm text-ink-muted">
                Loading mesh…
              </div>
            }
          >
            <Viewer ref={viewerRef} zoomTo={zoomTo} onPointerMissed={onClearSelection}>
              <EnginePart
                report={viewerReport}
                selection={selectedFeatureTags}
                hoveredFeatureIds={highlightedFeatureTags}
                pickedRegions={heldRegions}
                // Warm over the cool direction cycle, cool over the warm
                // difficulty ramp (§3.5). A blue selection over the directions
                // is one more direction rather than an answer.
                theme={paintMode === 'directions' ? SETUP_COLORS : READING_COLORS}
                highlights={wash}
                regionHighlights={faceWash}
                focusFeature={focusFeature}
                onPick={pickInViewport}
                onHover={(pick) => onHoverPart(pick !== null)}
                onAdjacency={onAdjacency}
                activeDirection={activeDirection}
                // No plane, no cut. A section that starts by lopping off an
                // arbitrary half of the part hides the face you were about to
                // pick it from.
                section={{ enabled: sectioning && plane !== null, plane, depth }}
                onSectionChange={(state) => {
                  // The handle reports its drag through the same path the
                  // slider writes to, so the two never disagree.
                  if (state.plane && state.depth !== null) {
                    setDepth(state.depth)
                  }
                  setDepthRange(state.depthRange)
                }}
              />
              <DirectionArrows
                directions={report.candidateDirections}
                activeDirection={activeDirection}
                shownDirection={shownDirection}
                visible={arrowsVisible}
                onPickDirection={onPickDirection}
              />
              {showAids ? (
                <>
                  <Grid />
                  <Axes size={35} />
                </>
              ) : null}
              <PartSize onMeasured={setPartBox} />
              {/* Its own boundary with no fallback: the mesh is fetched the
                  first time somebody asks for it, and the part must not be
                  replaced by "Loading…" while a banana arrives. */}
              {banana ? (
                <Suspense fallback={null}>
                  <Banana onPlaced={frameWithBanana} />
                </Suspense>
              ) : null}
              <ViewCube />
            </Viewer>
          </Suspense>
        </MeshErrorBoundary>
      ) : (
        <div className="grid size-full place-items-center p-8 text-center text-sm text-ink-muted">
          This report has no viewable mesh. Its feature data is still available.
        </div>
      )}
    </section>
  )
}
