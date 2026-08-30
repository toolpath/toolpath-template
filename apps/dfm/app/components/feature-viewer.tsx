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
import { CrosshairSimpleIcon, GridFourIcon, SquareHalfIcon } from '@phosphor-icons/react'
import { Component, Suspense, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import type { PartPick, SectionPlacement, SectionState } from '@toolpath/viewer'
import { type Arrows, nextArrows } from '../shared/arrows'
import { READING_COLORS } from '../shared/selection-colors'
import { loadShowAids, saveShowAids } from '../shared/scene-aids'
import { directionLabel } from '@toolpath/part-contracts/report'
import { PAINT_MODE_LABELS, type PaintMode, paintWash } from '../shared/paint'
import type { Band } from '../shared/rules'
import { Button } from '@toolpath/ui'
import { ToolButton } from './tool-button'
import type { PartReport, PublicInspectionReport } from '@toolpath/part-contracts'

class MeshErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  render() {
    if (this.state.error) {
      return (
        <div className="grid size-full place-items-center p-8 text-center text-sm text-zinc-400">
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
  report,
  jobId,
  selectedFeatureTag,
  highlightedFeatureTags,
  heldRegions,
  activeDirection,
  shownDirection,
  arrows,
  onArrows,
  arrowsVisible,
  paintMode,
  onPaintMode,
  verdicts,
  focusFeature,
  onPickDirection,
  onPick,
  onHoverPart,
  onClearSelection,
}: {
  report: PublicInspectionReport
  jobId: string
  selectedFeatureTag: string | null
  /** Features under the pointer in the feature list. */
  highlightedFeatureTags: readonly string[]
  /**
   * The faces being held, painted so a modifier-click has something to aim at.
   *
   * Without them, holding a second face narrows the candidate list and often
   * leaves the same reading painted, so the click looks like it did nothing.
   */
  heldRegions: readonly number[]
  /** Scopes picking to one way up, and shows that arrow on its own. */
  activeDirection: number | null
  /**
   * The way up the feature being read is cut from, shown on its own.
   *
   * A part has up to ten candidate directions and the arrows are large; once
   * one feature is being read, the other nine answer a question nobody asked.
   */
  shownDirection: number | null
  /** Whether every arrow is drawn, or only whatever the selection implies. */
  arrows: Arrows
  onArrows: (arrows: Arrows) => void
  /** Whether any arrow is drawn at all. */
  arrowsVisible: boolean
  /** The standing wash: what the part is coloured by while nothing is selected. */
  paintMode: PaintMode
  onPaintMode: (mode: PaintMode) => void
  /** What the rules made of each feature, for the difficulty wash. */
  verdicts: readonly { tag: string; band: Band | null }[]
  /** A feature to zoom to. Framed when it changes. */
  focusFeature: string | null
  onPickDirection: (index: number) => void
  onPick: (pick: PartPick) => void
  /** Whether the pointer is over the part itself, rather than empty space. */
  onHoverPart: (over: boolean) => void
  /** A click that hit nothing in the scene. */
  onClearSelection: () => void
}) => {
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

  const toggleAids = () => {
    setShowAids((shown) => {
      saveShowAids(typeof window === 'undefined' ? null : window.localStorage, !shown)
      return !shown
    })
  }

  const wash = useMemo(() => paintWash(paintMode, verdicts), [paintMode, verdicts])

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
    <section className="relative size-full min-h-[32rem] bg-zinc-950">
      <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-1.5" aria-label="Viewer controls">
          {/* A shelf rather than a toggle: what the part is coloured by is the
            first thing anybody changes, and a switch that hides the other mode
            makes you press it to find out what it was. */}
          <span
            className="flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950/85 p-1"
            role="group"
            aria-label="Colour the part by"
          >
            {PAINT_MODE_LABELS.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={paintMode === mode}
                onClick={() => onPaintMode(mode)}
                className={`rounded px-2 py-1 text-xs font-medium transition ${
                  paintMode === mode
                    ? 'bg-info/20 text-info'
                    : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/75`}
              >
                {label}
              </button>
            ))}
            {/* In the same shelf as the modes: it is another thing to do to the
              part in front of you, and it is the arrows' only home. Divided off
              them by the toolbar's own separator rather than by a border on the
              button, which would sit inside its 24px box and push the glyph off
              centre by the width of the border. */}
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-zinc-700" />
            <button
              type="button"
              aria-pressed={arrows === 'all'}
              aria-label={`Direction arrows: ${arrows === 'all' ? 'all arrows' : 'no arrows'}`}
              title={
                arrows === 'off'
                  ? 'No arrows — one appears on its own while a feature is selected'
                  : 'All arrows — click to turn them off'
              }
              onClick={() => onArrows(nextArrows(arrows))}
              className={`grid size-6 place-items-center rounded transition ${
                arrows === 'all'
                  ? 'bg-info/20 text-info'
                  : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/75`}
            >
              <ArrowGlyph />
            </button>
            <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-zinc-700" />
            <ToolButton
              label={showAids ? 'Grid and axes (on)' : 'Grid and axes'}
              pressed={showAids}
              onClick={toggleAids}
            >
              <GridFourIcon />
            </ToolButton>
            <ToolButton
              label={sectioning ? 'Section (on)' : 'Section'}
              pressed={sectioning}
              onClick={() => (sectioning ? stopSectioning() : startSectioning())}
            >
              <SquareHalfIcon />
            </ToolButton>
          </span>
          {sectioning ? (
            <>
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
                <label className="flex h-8 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950/85 px-3 text-xs text-zinc-300">
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
            </>
          ) : null}
        </div>
        {/* A filter switched on from the part has to be visible on the part, and
          clearable from there: one you can only switch off from another view is
          a filter people get stuck in. */}
        {activeDirection === null ? null : (
          <span className="flex items-center gap-2 rounded bg-warning/20 px-2 py-1 text-2xs text-zinc-100 shadow-sm">
            Only {directionLabel(report.candidateDirections[activeDirection] ?? ORIGIN)} ·
            everything else is hidden from a click
            <Button size="sm" variant="secondary" onClick={() => onPickDirection(activeDirection)}>
              Clear
            </Button>
          </span>
        )}
      </div>
      {report.hasMeshGlb || report.hasMeshStl ? (
        <MeshErrorBoundary key={`${report.partId}:${jobId}`}>
          <Suspense
            fallback={
              <div className="grid size-full place-items-center text-sm text-zinc-400">
                Loading mesh…
              </div>
            }
          >
            <Viewer ref={viewerRef} onPointerMissed={onClearSelection}>
              <EnginePart
                report={viewerReport}
                selection={selectedFeatureTag ? [selectedFeatureTag] : []}
                hoveredFeatureIds={highlightedFeatureTags}
                pickedRegions={heldRegions}
                theme={READING_COLORS}
                highlights={wash}
                focusFeature={focusFeature}
                onPick={pickInViewport}
                onHover={(pick) => onHoverPart(pick !== null)}
                activeDirection={activeDirection}
                // No plane, no cut. A section that starts by lopping off an
                // arbitrary half of the part hides the face you were about to
                // pick it from.
                section={{ enabled: sectioning && plane !== null, plane, depth }}
                onSectionChange={(state) => {
                  // The handle reports its drag through the same path the
                  // slider writes to, so the two never disagree.
                  if (state.plane && state.depth !== null) setDepth(state.depth)
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
              <ViewCube />
            </Viewer>
          </Suspense>
        </MeshErrorBoundary>
      ) : (
        <div className="grid size-full place-items-center p-8 text-center text-sm text-zinc-400">
          This report has no viewable mesh. Its feature data is still available.
        </div>
      )}
    </section>
  )
}
