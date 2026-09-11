import { IconButton, cn } from '@toolpath/ui'
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
import { FrameInset } from 'components/frame-inset'
import { SECTION_LABEL } from 'shared/type'
import { useEscape } from 'shared/use-escape'

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

  /**
   * **What it caught is said, not swallowed** (2026-09-10). This threw away the
   * error and rendered one sentence for every cause there is — a refused
   * artifact, a report with no mesh on it, a browser that cannot open a WebGL
   * context — so a part that would not draw took four rounds of guessing to
   * even locate. The reason goes on the screen where the failure is, and the
   * stack goes to the console for whoever opens it.
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[mesh] the viewer threw', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid size-full place-items-center p-8 text-center text-sm text-zinc-400">
          <div>
            <p>The mesh could not be loaded. The feature list is still available.</p>
            {/*
              The message rather than the stack: it is the half that names the
              cause, and it is what somebody can repeat back down a phone.
            */}
            <p className="mt-2 font-mono text-xs break-words text-zinc-500">
              {this.state.error.message || String(this.state.error)}
            </p>
          </div>
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
  <IconButton
    size="lg"
    variant="muted"
    title={label}
    aria-label={label}
    toggled={pressed}
    onClick={onClick}
    className="!size-7 [&_svg]:!size-4"
  >
    {children}
  </IconButton>
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
  /** A transient action that sits over the part without replacing its mesh. */
  readonly modal?: ReactNode
  /**
   * What sits over the part in its top-left corner: the filter rail and the
   * feature being read (Paul's layout, 2026-08-31). The viewer owns the
   * corner rather than a panel beside it, so the part gets the whole width.
   */
  readonly overlay?: ReactNode
  /**
   * A bar drawn along the bottom of the viewer, above the panel below it.
   *
   * **The list's chrome floats over the part** (Paul, 2026-09-11: "they should
   * float in the 3d viewer above the table"). It is a slot rather than
   * something the page lays over the top, because the viewer already owns this
   * edge — the shelf of view controls stands on it, and the two have to be
   * stacked by whoever knows about both.
   *
   * It starts where the questions end, for the reason the feature record does:
   * the column over the left of the canvas takes the pointer for its whole
   * height, so a bar running under it is a bar whose left end cannot be
   * pressed.
   */
  readonly bottomChrome?: ReactNode
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
  modal,
  overlay,
  bottomChrome,
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

  /**
   * Escape puts the record away, and leaves the box it was opened from alone.
   *
   * **The press belonged to the page** (Paul, 2026-09-11: "hitting escape
   * should close feature details but keep the feature dialog open and as is").
   * The record is opened *over* the questions with no layer of its own, so one
   * press walked the page's own step — dropping the reading behind it — and the
   * record stayed open on a feature nothing was reading any more. It is the
   * newest thing on the screen, so it takes the press: `use-escape.ts` is the
   * stack, and this layer is pushed only while the record is up.
   */
  useEscape(Boolean(details) && onCloseDetails !== undefined, () => {
    onCloseDetails?.()
  })
  /**
   * How far in the boxes over the part reach — what the camera was told.
   *
   * **The drawn boxes, not the column** (Paul, 2026-09-10: "have it follow the
   * drawn content"). The column is a fixed width and the full height of the
   * viewer whatever is in it, so insetting by *it* pushed the part aside for
   * three buttons in the corner over an empty list. `spokenFor` is the rule and
   * `<FrameInset>` does the measuring — the canvas's own size is only reliable
   * from inside it — and this is where the answer is kept so the page can say
   * what it decided.
   */
  const [inset, setInset] = useState(0)

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

  /**
   * How much of the bottom edge the shelf and the bar under it have taken.
   *
   * **The questions stop above it** (Paul, 2026-09-11: "it should be under the
   * top left hand panel, not to the right of it"). The bar runs the full width
   * of the viewer, and the column over the left of the canvas is full height
   * and takes the pointer for all of it — so without this the bar's left end
   * would be drawn under the list and could not be pressed at all. Measured
   * rather than reserved: the bar wraps to two lines on a narrow window, and a
   * guessed height is a gap on one screen and an overlap on the next.
   */
  const bottom = useRef<HTMLDivElement>(null)
  const [bottomRoom, setBottomRoom] = useState(0)

  useEffect(() => {
    const box = bottom.current
    if (box === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = () => setBottomRoom(box.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [bottomChrome])

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

  /**
   * **The scene's own props are deliberately not memoised** (measured,
   * 2026-09-07). Holding `selection`, `highlights`, `hoveredFeatureIds`,
   * `theme` and `section` still between renders is the obvious fix for "the 3d
   * model sticks", and on the scraped catalog it made a click on the part five
   * times *slower*: 566 ms of long tasks became 2,600 ms, and picking a tool
   * row went from none to 4,200 ms. `EnginePart` evidently takes a cheaper path
   * when it is handed fresh values than when it is asked to reconcile ones it
   * has seen. Whatever the mechanism, the numbers are the rule: build them in
   * the JSX, and measure before changing that.
   */
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
    <section
      /* How far the boxes over the part reach, rounded — what the camera was
         framed beside, and the seam a test reads that back through. */
      data-part-inset={Math.round(inset)}
      // No minimum height: the panel decides how tall this is, and a floor under
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
          /* Named so a test can measure what the part is framed beside —
             `shared/frame-inset.ts` is what does the framing. */
          data-questions
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
          /* Above the bar along the bottom, measured — see `bottomRoom`. */
          style={bottomRoom === 0 ? undefined : { bottom: bottomRoom + 20 }}
        >
          {overlay}
        </div>
      ) : null}

      {/*
        **Under the view cube, in a column** (Paul, 2026-09-11: "can we move the
        viewer controls to a vertical orientation under the viewcube?"). They
        were a shelf along the bottom edge, which is where the list's chrome
        floats now — two things over one strip. The cube already owns this
        corner and the gizmo is drawn 80px in from it, so the column starts
        below what the cube can reach.
      */}
      <span
        className="pointer-events-auto absolute top-40 right-3 z-30 flex flex-col items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/90 p-1 backdrop-blur"
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

      {/* Along the bottom, whatever chrome the page floats here.

          **The sheet takes no click**, and each thing on it says for itself
          that it does — the rule the overlay column follows, and the defect
          `tests/on-the-part.spec.ts` § "at a laptop width" exists for: an
          invisible full-width box carrying the pointer is a curtain over the
          part. */}
      <div
        ref={bottom}
        /* Close to the table under it (Paul, 2026-09-11: "reduce the vertical
           spacing between the buttons and the table"). */
        /*
          **Full width, so the page can line its chrome up with the table**
          (Paul, 2026-09-11: "move the tools, holders, collets, etc buttons
          left so they are in line with the left edge of the table"). An inset
          here was a margin the page could not see or undo, and the list's
          chrome came out 12px in from an edge it is meant to share with the
          list below. The slot is the viewer's whole width; what stands in it
          decides its own.
        */
        className="pointer-events-none absolute inset-x-0 bottom-1 z-30 flex flex-col gap-2"
      >
        {bottomChrome}
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
            <span className={SECTION_LABEL}>Feature details</span>
            <IconButton
              size="lg"
              variant="muted"
              aria-label="Back to the part"
              title="Back to the part"
              onClick={onCloseDetails}
            >
              <XIcon />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{details}</div>
        </div>
      ) : null}

      {modal}

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
              {/*
                **The part centres beside the questions, not behind them**
                (Paul, 2026-09-10: "the viewer should really be only to the
                right of the left hand panel — so the part centers next to the
                list rather than behind it on small screens. I would, however,
                still like to be able to see the part behind the list and keep
                the layers that work now").

                Both halves of that at once, which is why it is the camera that
                is told and not the layout: the canvas keeps every pixel it has,
                so the part still draws behind the translucent rows and every
                overlay layer is untouched, and the *projection* frames into
                what the column leaves. `shared/frame-inset.ts` is the rule.

                The same measurement the feature record is placed by, and the
                same 20px: this column's own left margin and the gap after it.
              */}
              <FrameInset boxes={questions} watch={overlay} onInset={setInset} />
              <EnginePart
                report={viewerReport}
                selection={[...selected]}
                // Under everything else: a feature with a tool kept for it
                // reads as done rather than as chosen. Darker than it was and
                // a little flatter (Paul, 2026-09-11) — 0x3f4650 at 0.55 was a
                // shade of the part rather than a mark on it, and 0x1f232a at
                // 1 was a black hole in it.
                //
                // **The weight is the shine.** The paint mixes into the
                // material's diffuse colour, so whatever weight is left over
                // keeps that fraction of the part's own white in the lit term
                // — and the white is what catches the bright side of the
                // hemisphere light. Hence a shade under 1: enough of the rig
                // left to read the face as a surface, not enough to gloss it.
                highlights={tooled.map((tag) => ({ tag, color: 0x333b46, weight: 0.85 }))}
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
