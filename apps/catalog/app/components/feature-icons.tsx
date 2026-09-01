import type { ReactElement, ReactNode } from 'react'

/**
 * A drawing of each feature, instead of a coloured dot.
 *
 * A dot only works once its colour has been learned, and there were nine of
 * them; a shape is recognised before it is read. These are silhouettes rather
 * than pictures — a bore is a circle, a wall stands up, a face lies flat, a
 * T-slot is a T — so they survive being fourteen pixels wide in a list of two
 * hundred rows, which is the only size they are ever drawn at.
 *
 * **Drawn in `currentColor`**, so the row decides what colour they are: in the
 * lists that judge, that is the difficulty band, which puts "what it is" and
 * "how bad it is" in one mark instead of two.
 *
 * Keyed by feature type first, so the nineteen the kernel emits are told apart
 * where it matters — a blind hole from a through hole, a closed pocket from an
 * open one, a T-slot from a filleted one — and by the Engine's own `facts.kind`
 * second, so a type it adds still lands on its family rather than on nothing.
 */

const Frame = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    className="size-3.5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.4}
    viewBox="0 0 16 16"
  >
    {children}
  </svg>
)

/* ------------------------------- holes -------------------------------- */

/** Blind: a bore with a bottom in it. */
const BlindHole = () => (
  <Frame>
    <circle cx="8" cy="8" r="4.5" />
    <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </Frame>
)

/** Through: a bore you can see daylight down. */
const ThroughHole = () => (
  <Frame>
    <circle cx="8" cy="8" r="4.5" />
    <circle cx="8" cy="8" r="1.6" />
  </Frame>
)

/** Filleted: the same, with the mouth broken. */
const FilletedHole = () => (
  <Frame>
    <circle cx="8" cy="8" r="4.5" />
    <circle cx="8" cy="8" r="2.4" opacity={0.6} />
    <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
  </Frame>
)

/* ------------------------------ cavities ------------------------------ */

/** Closed: walls all the way round a floor. */
const Pocket = () => (
  <Frame>
    <path d="M2.5 3v10h11V3" />
    <path d="M5 6.5v3.5h6V6.5" />
  </Frame>
)

/** Open: one side of it is not there. */
const OpenPocket = () => (
  <Frame>
    <path d="M2.5 3v10h11V3" />
    <path d="M5 6.5v3.5h6" />
  </Frame>
)

/** Through: no floor to it at all. */
const ThroughPocket = () => (
  <Frame>
    <path d="M2.5 3v10h11V3" />
    <path d="M5 6.5v3.5" />
    <path d="M11 6.5v3.5" />
  </Frame>
)

/** Filleted: the inside corners are radiused. */
const FilletedPocket = () => (
  <Frame>
    <path d="M2.5 3v10h11V3" />
    <path d="M5 6.5v1.5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6.5" />
  </Frame>
)

/* ------------------------------ standing ------------------------------ */

/** Something standing up, with the ground beside it. */
const Wall = () => (
  <Frame>
    <path d="M2 13h12" />
    <path d="M5 13V4h5v9" />
  </Frame>
)

/** A stub standing proud of the ground. */
const Boss = () => (
  <Frame>
    <path d="M2 13h12" />
    <path d="M5.5 13V6a2.5 2.5 0 0 1 5 0v7" />
  </Frame>
)

/** The same, with its base blended in. */
const FilletedBoss = () => (
  <Frame>
    <path d="M2 13h12" />
    <path d="M4 13a2 2 0 0 0 1.5-2V6a2.5 2.5 0 0 1 5 0v5a2 2 0 0 0 1.5 2" />
  </Frame>
)

/** Something lying flat, seen at an angle. */
const Face = () => (
  <Frame>
    <path d="M2 10.5 6 5h8l-4 5.5Z" />
  </Frame>
)

/** The outline of the part, cut around. */
const Profile = () => (
  <Frame>
    <path d="M4 2.5h6l3.5 3.5v7.5H4L2.5 12V4Z" />
  </Frame>
)

/* ------------------------------- bevels ------------------------------- */

/** A corner with its edge broken off. */
const Chamfer = () => (
  <Frame>
    <path d="M2.5 13.5V7l4.5-4.5h6.5" />
    <path d="M2.5 7 13.5 13.5" opacity={0.5} />
  </Frame>
)

/** A whole face at an angle to everything. */
const SlantedFace = () => (
  <Frame>
    <path d="M2 13h12" />
    <path d="M2.5 11 13 4" />
    <path d="M2.5 11v2" opacity={0.5} />
  </Frame>
)

/** A countersink: a cone let into a face. */
const Sink = () => (
  <Frame>
    <path d="M2 4h12" />
    <path d="M4.5 4 8 9.5 11.5 4" />
    <path d="M8 9.5V13" opacity={0.6} />
  </Frame>
)

/* ----------------------------- undercuts ------------------------------ */

/** A slot that reaches in under its opening. */
const Tslot = () => (
  <Frame>
    <path d="M2 3.5h12" />
    <path d="M6.5 3.5v3.5H3v5.5h10V7H9.5V3.5" />
  </Frame>
)

/** The same, with the inside corners radiused. */
const FilletedTslot = () => (
  <Frame>
    <path d="M2 3.5h12" />
    <path d="M6.5 3.5v2a1.5 1.5 0 0 1-1.5 1.5H4a1 1 0 0 0-1 1v4.5h10V8a1 1 0 0 0-1-1h-1a1.5 1.5 0 0 1-1.5-1.5v-2" />
  </Frame>
)

/** Wider at the bottom than the top, and cut with a tool that is too. */
const Dovetail = () => (
  <Frame>
    <path d="M2 3.5h12" />
    <path d="M6 3.5 3.5 12.5h9L10 3.5" />
  </Frame>
)

/* ------------------------------ surfaced ------------------------------ */

/** A concave blend: the inside of a corner. */
const InnerFillet = () => (
  <Frame>
    <path d="M3 3v10h10" />
    <path d="M13 8a5 5 0 0 0-5 5" />
  </Frame>
)

/** A convex blend: the outside of one. */
const OuterFillet = () => (
  <Frame>
    <path d="M3 13V3h10" />
    <path d="M3 8a5 5 0 0 1 5-5" />
  </Frame>
)

/** A shape driven at a stepover rather than a width. */
const ContourSurface = () => (
  <Frame>
    <path d="M2 10.5c2.5-5 4-5 6.5-1.5S12.5 12 14 6.5" />
    <path d="M2 13.5h12" opacity={0.5} />
  </Frame>
)

/** Anything the maps do not name. */
const Other = () => (
  <Frame>
    <circle cx="8" cy="8" r="3" />
  </Frame>
)

const BY_TYPE: Record<string, () => ReactNode> = {
  blind_hole: BlindHole,
  boss: Boss,
  chamfer: Chamfer,
  contour_surface: ContourSurface,
  face: Face,
  filleted_blind_hole: FilletedHole,
  filleted_boss: FilletedBoss,
  filleted_open_pocket: FilletedPocket,
  filleted_pocket: FilletedPocket,
  inner_fillet: InnerFillet,
  open_pocket: OpenPocket,
  outer_fillet: OuterFillet,
  pocket: Pocket,
  profile: Profile,
  sink: Sink,
  slanted_face: SlantedFace,
  threaded_hole: ThroughHole,
  through_hole: ThroughHole,
  through_pocket: ThroughPocket,
  undercut_dovetail: Dovetail,
  undercut_filleted_tslot: FilletedTslot,
  undercut_tslot: Tslot,
  wall: Wall,
}

/** The family, for a type nobody has drawn yet. */
const BY_KIND: Record<string, () => ReactNode> = {
  Boss,
  Chamfer,
  Dovetail,
  Face,
  Hole: BlindHole,
  Pocket,
  Profile,
  Three: ContourSurface,
  Tslot,
  Wall,
  Other,
}

export const KindIcon = ({
  featureType,
  kind,
}: {
  /** Preferred: the nineteen the kernel emits are told apart by this. */
  featureType?: string | undefined
  kind: string
}) => {
  const Drawn = (featureType ? BY_TYPE[featureType] : undefined) ?? BY_KIND[kind] ?? Other

  return <Drawn />
}

/**
 * Small drawings of the measurements somebody reaches for a tool with.
 *
 * Line art rather than glyphs from a set, because these are not concepts with
 * icons — "how far down before it cuts", "the tightest inside corner", "the
 * widest thing that gets in" are shapes, and a shape is what a machinist
 * already has in their head for each of them. Drawn on one 16×16 grid at one
 * weight so a row of them reads as a row.
 */
const MeasurementFrame = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden="true"
    className="size-4 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.3}
    viewBox="0 0 16 16"
  >
    {children}
  </svg>
)

/** Reach: the top of the part, and how far under it the cutting starts. */
const ReachIcon = () => (
  <MeasurementFrame>
    <path d="M2 3h12" />
    <path d="M8 4v7" />
    <path d="M5.5 8.5 8 11l2.5-2.5" />
  </MeasurementFrame>
)

/** Depth: the extent of the thing itself, top and bottom. */
const DepthIcon = () => (
  <MeasurementFrame>
    <path d="M4 3h8" />
    <path d="M4 13h8" />
    <path d="M8 4.5v7" />
    <path d="M6.5 6 8 4.5 9.5 6" />
    <path d="M6.5 10 8 11.5 9.5 10" />
  </MeasurementFrame>
)

/** Radius: an inside corner, and the arc the cutter leaves in it. */
const RadiusIcon = () => (
  <MeasurementFrame>
    <path d="M3 3v10h10" />
    <path d="M13 6A7 7 0 0 0 6 13" />
  </MeasurementFrame>
)

/** Diameter: a bore, measured across. */
const DiameterIcon = () => (
  <MeasurementFrame>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M3.5 8h9" />
  </MeasurementFrame>
)

/** Reach over width: a long tool, and how much of it is hanging out. */
const RatioIcon = () => (
  <MeasurementFrame>
    <path d="M6 2h4v4H6z" />
    <path d="M7 6v8" />
    <path d="M9 6v8" />
  </MeasurementFrame>
)

/** An angle, of a drill point or a bevel. */
const AngleIcon = () => (
  <MeasurementFrame>
    <path d="M3 12h10" />
    <path d="M3 12 11 4" />
    <path d="M7 12a5 5 0 0 0 1.5-3.5" />
  </MeasurementFrame>
)

/** Undercut: the opening, and the space that reaches in under it. */
const UndercutIcon = () => (
  <MeasurementFrame>
    <path d="M2 3h12" />
    <path d="M6.5 3v4H3v6h10V7H9.5V3" />
  </MeasurementFrame>
)

/** A ball nose, for the shapes that are surfaced rather than milled. */
const BallIcon = () => (
  <MeasurementFrame>
    <path d="M5 2v7" />
    <path d="M11 2v7" />
    <path d="M5 9a3 3 0 0 0 6 0" />
  </MeasurementFrame>
)

/** Area: how much surface there is to cover. */
const AreaIcon = () => (
  <MeasurementFrame>
    <path d="M2.5 5.5h11v8h-11z" />
    <path d="M2.5 5.5 5.5 2.5h11l-3 3" />
    <path d="M13.5 5.5v8" />
  </MeasurementFrame>
)

/** A face count is a tally rather than a dimension, so it gets a tally. */
const FacesIcon = () => (
  <MeasurementFrame>
    <path d="M2.5 3.5h5v5h-5z" />
    <path d="M8.5 3.5h5v5h-5z" />
    <path d="M2.5 9.5h5v3h-5z" />
    <path d="M8.5 9.5h5v3h-5z" />
  </MeasurementFrame>
)

const MEASUREMENT_ICONS: Record<string, () => ReactElement> = {
  depthBelowTop: ReachIcon,
  featureDepth: DepthIcon,
  minRadius: RadiusIcon,
  ld: RatioIcon,
  diameter: DiameterIcon,
  maxTool: DiameterIcon,
  maxEndmill: DiameterIcon,
  maxDrill: DiameterIcon,
  entryCutter: UndercutIcon,
  bevelAngle: AngleIcon,
  floorFillet: BallIcon,
  area: AreaIcon,
  // The two halves of the surface area wear its icon: they are the same
  // measurement split, and drawing them differently would say they were not.
  walls: AreaIcon,
  floors: AreaIcon,
  faces: FacesIcon,
}

/**
 * The drawing for a measurement, or a gap the width of one.
 *
 * A row without an icon still has to line up with the rows that have one — an
 * unindented row in a column of indented ones reads as a different kind of row
 * rather than as one whose picture is missing.
 */
export const MeasurementIcon = ({ measurement }: { measurement: string }) => {
  const Icon = MEASUREMENT_ICONS[measurement]
  if (!Icon) {
    return <span aria-hidden="true" className="size-4 shrink-0" />
  }
  return <Icon />
}
