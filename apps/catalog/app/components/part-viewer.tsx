import { cn } from '@toolpath/ui'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  Axes,
  DirectionArrows,
  Grid,
  ViewCube,
  Viewer,
  sectionFromPick,
  type PartPick,
} from '@toolpath/viewer'
import { EnginePart } from '@toolpath/viewer/engine'
import { GridFourIcon, MagnifyingGlassPlusIcon, SquareHalfIcon, XIcon } from '@phosphor-icons/react'
import type { PartReport, PublicInspectionReport } from '@toolpath/part-contracts'
import { readingTheme } from 'shared/reading-colors'

/**
 * The part, and the directions it can be cut from.
 *
 * **Selection is by direction and only by direction.** Clicking an arrow scopes
 * the part to one way up; the features that way up are then listed below and
 * picked there. That is the DFM application's direction mode, and it is the
 * mode this application has — because a tool question is always asked about a
 * setup, and a feature reachable from two directions is two different tools.
 */

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
          The mesh could not be loaded. The feature list is still available.
        </div>
      )
    }
    return this.props.children
  }
}

const meshUrl = (partId: string, jobId: string, format: 'glb' | 'stl'): string =>
  `/api/parts/${encodeURIComponent(partId)}/mesh?${new URLSearchParams({ jobId, format })}`

/** A control on the viewer's own shelf. Pressed state is the whole of its meaning. */
const ToolButton = ({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    onClick={onClick}
    className={cn(
      'grid size-7 place-items-center rounded border transition',
      pressed
        ? 'border-info/60 bg-info/20 text-info'
        : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
      'focus-visible:ring-info/60 focus-visible:ring-1 focus-visible:outline-none',
    )}
  >
    {children}
  </button>
)

export interface PartViewerProps {
  readonly report: PublicInspectionReport
  readonly jobId: string
  readonly selected: ReadonlySet<string>
  /** Faces being held, so the part can show what a click is resolving from. */
  readonly heldRegions: ReadonlyArray<number>
  /**
   * A row under the pointer in the list.
   *
   * The part answers a hover the way it answers a click, one step lighter: a
   * list of feature names is unreadable as geometry until the part says which
   * one each is.
   */
  readonly hovered?: string | null
  /**
   * A feature to zoom to — framed **when it changes**, which is the viewer's
   * own rule: a zoom is a request, not a state to hold. So asking twice for
   * the same feature does nothing, and a group of holes is walked through by
   * naming the next one (Paul, 2026-09-01).
   */
  readonly focus?: string | null
  /**
   * Which arrows to draw, decided by the selection mode.
   *
   * Passed in rather than toggled here: the relationship between the mode and
   * the arrows is one rule in `shared/part-selection`, and a viewer that kept
   * its own copy is how it drifted the first time.
   */
  readonly arrows: {
    readonly visible: boolean
    readonly shown: number | ReadonlyArray<number> | null
    /** The way up the part is scoped to, which takes the other arrows away. */
    readonly active: number | null
  }
  /** Pressing an arrow: arming a way up for the next click on the part. */
  readonly onPickDirection: (index: number) => void
  /** The colour that way up is drawn in, for the selection to match. */
  readonly directionColor: number | null
  /**
   * One feature's full record, shown over the part.
   *
   * Over rather than beside: the list it was opened from stays where it is, so
   * closing the record puts somebody back exactly where they were. The canvas
   * stays mounted underneath, so the mesh is not fetched again.
   */
  readonly details?: ReactNode
  /**
   * What sits over the part in its top-left corner: the filter rail and the
   * feature being read (Paul's layout, 2026-08-31). The viewer owns the
   * corner rather than a panel beside it, so the part gets the whole width.
   */
  readonly overlay?: ReactNode
  /**
   * Whether the overlay may grow past the bottom of the viewer.
   *
   * **A form has to be finishable** (Paul, 2026-09-02: "make the selection
   * dialog go over the table — the table is blocking me from confirming long
   * lists right now"). The box is clipped to the viewer, which is right for a
   * panel that is read at a glance and wrong for one with a confirm button at
   * the bottom of a list somebody is still adding to. While that is on screen
   * the viewer stops clipping and stands above the panel below it.
   *
   * The corners go square for as long as it is set, which is what the clipping
   * was doing: a fair price for a button somebody can reach.
   */
  readonly overlaySpills?: boolean
  /**
   * Features a tool has been kept for, painted a shade darker so the part
   * says what is done without anything having to be selected.
   */
  readonly tooled?: ReadonlyArray<string>
  readonly onCloseDetails?: () => void
  /** A click on the part, unless a cut is being placed. */
  readonly onPickFace: (pick: PartPick | null) => void
  /** A click that hit nothing: the usual meaning is "put the selection down". */
  readonly onClear: () => void
}

export const PartViewer = ({
  report,
  jobId,
  selected,
  focus = null,
  heldRegions,
  hovered = null,
  arrows,
  onPickDirection,
  directionColor,
  details,
  overlay,
  overlaySpills = false,
  tooled = [],
  onCloseDetails,
  onPickFace,
  onClear,
}: PartViewerProps) => {
  /**
   * How far in the feature record has to start to clear the questions.
   *
   * The record used to start at a fixed `21rem`, which was the width of the
   * two boxes over the top-left corner **on the day it was written**. The
   * feature box grows — a threaded hole adds a thread picker and two rows of
   * predrills — and past 21rem the record opened over the box it was opened
   * from (Paul, 2026-09-02: "it should start to the right of the feature
   * box"). Measured instead, so it tracks whatever the corner holds.
   */
  const questions = useRef<HTMLDivElement>(null)
  const [questionsWidth, setQuestionsWidth] = useState<number | null>(null)
  useEffect(() => {
    const box = questions.current
    if (box === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = () => setQuestionsWidth(box.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [overlay])

  const [showAids, setShowAids] = useState(false)
  // Off by default (Paul, 2026-08-30): the stack in the scene is a check, not the view.
  const [sectioning, setSectioning] = useState(false)
  /**
   * What the wheel zooms toward.
   *
   * The cursor by default, which is what Fusion does and what most people
   * reach for. It stays a control because on a trackpad it can walk the model
   * off screen, and the way back is to zoom to the middle instead.
   */
  const [zoomTo, setZoomTo] = useState<'centre' | 'cursor'>('cursor')
  const [plane, setPlane] = useState<ReturnType<typeof sectionFromPick> | null>(null)
  const [depth, setDepth] = useState(0)

  const viewerReport = useMemo<PartReport>(
    () => ({
      ...report,
      meshGlbUrl: report.hasMeshGlb ? meshUrl(report.partId, jobId, 'glb') : null,
      meshStlUrl: report.hasMeshStl ? meshUrl(report.partId, jobId, 'stl') : null,
      thumbnailUrl: null,
    }),
    [jobId, report],
  )

  /**
   * A click on the part.
   *
   * While a cut is being placed it places the cut instead of selecting: that is
   * the question just asked, and answering both at once would select whatever
   * the cut is about to hide. Otherwise it resolves to the features that own
   * the clicked face — the pick's own ranking, already narrowed by the
   * direction in force.
   */
  const pick = (picked: PartPick | null) => {
    if (sectioning && picked !== null) {
      setPlane(
        sectionFromPick({
          point: { x: picked.point[0], y: picked.point[1], z: picked.point[2] },
          normal: { x: picked.normal[0], y: picked.normal[1], z: picked.normal[2] },
        }),
      )
      setDepth(0)
      return
    }
    onPickFace(picked)
  }

  return (
    <section // No minimum height: the panel decides how tall this is, and a floor under
      // it made the canvas 77px taller than its panel at 720px, so the bottom of
      // the part was drawn under the tool list — and clicks there went to the
      // list, not the part. `tests/on-the-part.spec.ts` found it.
      className={cn(
        'relative size-full rounded-xl bg-zinc-950',
        overlaySpills ? 'z-50' : 'overflow-hidden',
      )}
    >
      {overlay ? (
        <div
          ref={questions}
          /*
           * Two columns, and they stay where they are: the questions, then
           * what is being read. It wrapped by height for a while and the
           * boxes moved about as the window changed — Paul (2026-08-31): "I
           * like it up there and then it doesn't need to be jumping around."
           *
           * **Only the boxes take a click, and each says so itself.** This
           * used to hand the pointer to every top-level child
           * (`[&>*]:pointer-events-auto`), which was the same thing for as
           * long as every child *was* a drawn box. On 2026-09-02 one of them
           * became a transparent `h-full` column that arranges two cards — and
           * a full-height invisible sheet of `pointer-events: auto` over the
           * canvas is a curtain: click-drag-rotate died everywhere left of it,
           * while the view cube in the far corner went on working. The suite
           * missed it because `on-the-part.spec.ts` runs at 1680 wide, the one
           * width where the centre of the part clears the curtain.
           *
           * So the overlay's own boxes opt in, and the columns holding them
           * stay transparent to the part underneath.
           */
          className="pointer-events-none absolute top-3 bottom-3 left-3 z-40 flex gap-2"
        >
          {overlay}
        </div>
      ) : null}

      {/* Along the bottom, centred: the corners belong to the view cube and to
          what the part is waiting for, and a shelf in the middle of the bottom
          edge is out of the way of the geometry above it. */}
      <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5">
        <span
          className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/90 p-1 backdrop-blur"
          role="group"
          aria-label="Viewer controls"
        >
          <ToolButton
            label={zoomTo === 'cursor' ? 'Zoom to cursor (on)' : 'Zoom to cursor'}
            pressed={zoomTo === 'cursor'}
            onClick={() => setZoomTo(zoomTo === 'cursor' ? 'centre' : 'cursor')}
          >
            <MagnifyingGlassPlusIcon />
          </ToolButton>
          <ToolButton
            label={showAids ? 'Grid and axes (on)' : 'Grid and axes'}
            pressed={showAids}
            onClick={() => setShowAids(!showAids)}
          >
            <GridFourIcon />
          </ToolButton>
          {/*
            **No wrench for now** (Paul, 2026-09-01: "remove the wrench icon in
            the viewer for now"). It put the drawn stack at the clicked feature;
            the drawing in the panel is where a stack is read today. The button
            is what has gone — `assembly` still draws one when a page asks.
          */}
          <ToolButton
            label={sectioning ? 'Section view (on)' : 'Section view'}
            pressed={sectioning}
            onClick={() => {
              setSectioning(!sectioning)
              setPlane(null)
            }}
          >
            <SquareHalfIcon />
          </ToolButton>
        </span>
      </div>

      {details ? (
        /*
          **Beside the questions, over the part** (Paul, 2026-09-01: "feature
          details visualization is hidden behind everything. It should show over
          the 3d viewer to the right of filters and features").
          `inset-0` at `z-20` put it under the filter rail and the feature box —
          both `z-40` — so the panel opened *behind* the two things covering
          that corner, and the part showed through what was left. It now starts
          past that column, sits above the part, and is opaque.

          Where it starts is **measured**, not a number: `left-[21rem]` was the
          corner's width the day it was written, and a threaded hole's feature
          box is wider than that (Paul, 2026-09-02). The class stays as what to
          do before the first measurement.
        */
        <div
          className="absolute inset-y-3 right-3 left-[21rem] z-30 flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl"
          // A runtime measurement, which is what `style` is for here: 12px of
          // margin, the questions themselves, and the gap between the columns.
          style={questionsWidth === null ? undefined : { left: questionsWidth + 20 }}
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
              Feature details
            </span>
            <button
              type="button"
              aria-label="Back to the part"
              title="Back to the part"
              onClick={onCloseDetails}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            >
              <XIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{details}</div>
        </div>
      ) : null}

      {report.hasMeshGlb || report.hasMeshStl ? (
        <MeshErrorBoundary key={`${report.partId}:${jobId}`}>
          <Suspense
            fallback={
              <div className="grid size-full place-items-center text-sm text-zinc-400">
                Loading mesh…
              </div>
            }
          >
            {/*
              **Orthographic, always** (Paul, 2026-09-01: "shouldn't the viewer
              component have orthographic view now? Give me that please, just as
              the default, no need for an option"). It is how a machinist reads
              a part: parallel edges stay parallel, so two features the same
              size measure the same size wherever they sit on the model.
            */}
            <Viewer projection="orthographic" zoomTo={zoomTo} onPointerMissed={onClear}>
              <EnginePart
                report={viewerReport}
                selection={[...selected]}
                // Under everything else, at the consumer's own weight: a
                // feature with a tool kept for it reads as done rather than
                // as chosen.
                highlights={tooled.map((tag) => ({ tag, color: 0x3f4650, weight: 0.55 }))}
                pickedRegions={heldRegions}
                hoveredFeatureIds={hovered === null ? [] : [hovered]}
                focusFeature={focus}
                theme={readingTheme(directionColor)}
                onPick={pick}
                // No plane, no cut: a section that starts by lopping off an
                // arbitrary half hides the face you were about to pick from.
                section={{ enabled: sectioning && plane !== null, plane, depth }}
                onSectionChange={(state) => {
                  if (state.plane && state.depth !== null) {
                    setDepth(state.depth)
                  }
                }}
              />
              {/* `onPickDirection` is what makes an arrow an object the pointer
                  can hit at all. Without it the arrows were scenery: a click on
                  one went straight through to the mesh behind it, which is why
                  pressing one appeared to do nothing.

                  `activeDirection` is the scope — it takes the other arrows off
                  screen — so it carries only an arrow somebody pressed, never
                  the way up a reading happens to be cut from. */}
              <DirectionArrows
                directions={report.candidateDirections}
                activeDirection={arrows.active}
                shownDirection={arrows.shown}
                visible={arrows.visible}
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
          This report has no viewable mesh. Its features are still listed below.
        </div>
      )}
    </section>
  )
}
