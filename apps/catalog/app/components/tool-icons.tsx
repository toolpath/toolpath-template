import type { ReactElement, ReactNode } from 'react'
import { TOOL_FORMS, shankOf } from '@toolpath/catalog-data'

/**
 * A drawing of every kind of tool the library holds, and of how many flutes it
 * has.
 *
 * The same argument as the feature icons: a word in a chip is read, a shape is
 * recognised. These are **side profiles**, which is how a tool is drawn in
 * every catalog and every CAM library anybody using this has already seen — so
 * the shape is not a symbol to be learned, it is the tool.
 *
 * Each is whichever single line tells it apart from its neighbours: a ball end
 * from a bull nose is a radius, a spot drill from a drill is a point angle, a
 * left-hand tap from a right-hand one is which way the thread leans. Everything
 * that does not carry that difference is left out, because at fourteen pixels
 * it is noise on top of the one line that matters.
 *
 * Names come from Fusion's own library, with the catalog's shorter spellings
 * (`endmill`, `drill`, `tap`) as aliases — the same tool under two names must
 * not be two icons.
 */

const Frame = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg
    aria-hidden="true"
    className={className ?? 'size-3.5 shrink-0'}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.2}
  >
    {children}
  </svg>
)

/** The helix, drawn thinner than the profile so it reads as surface, not edge. */
const Helix = ({ d }: { d: string }) => <path d={d} strokeWidth={0.85} />

/** Every drawing takes the same optional size, so a caller can ask for a bigger one. */
type IconProps = { className?: string }

const icon =
  (children: ReactNode) =>
  ({ className }: IconProps) => <Frame className={className}>{children}</Frame>

/* ── Milling ─────────────────────────────────────────────────────────────── */

/** Square corner, square end: everything else in this group is a departure. */
const FlatEndMill = icon(
  <>
    <path d="M5 1.5v13h6v-13" />
    <Helix d="M5 11.5 11 9M5 8 11 5.5" />
  </>,
)

/** A full hemisphere — the radius is the tool. */
const BallEndMill = icon(
  <>
    <path d="M5 1.5v10a3 3 0 0 0 6 0v-10" />
    <Helix d="M5 8 11 5.5" />
  </>,
)

/** A corner radius, not a hemisphere: the flat between them is the difference. */
const BullNoseEndMill = icon(
  <>
    <path d="M5 1.5V12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V1.5" />
    <Helix d="M5 8 11 5.5" />
  </>,
)

/** Wide and shallow on an arbor: cutting happens across the face. */
const FaceMill = icon(
  <>
    <path d="M6.5 1.5V6" />
    <path d="M2.5 6h11v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
  </>,
)

/** Straight flanks that close on the tip. */
const TaperedMill = icon(
  <>
    <path d="M4.5 1.5V9l2.5 5.5h2L11.5 9V1.5" />
    <Helix d="M5 8 11 6" />
  </>,
)

/** The concave quarter round that puts a radius on an outside corner. */
const RadiusMill = icon(
  <>
    <path d="M6.5 1.5V6" />
    <path d="M3 6h10v3a3 3 0 0 0-3 3H6a3 3 0 0 0-3-3z" />
  </>,
)

/** A sharp included point, run at the top of a wall rather than at its foot. */
const ChamferMill = icon(
  <>
    <path d="M5 1.5V8l3 6.5L11 8V1.5" />
    <Helix d="M5 6.5 11 4.5" />
  </>,
)

/** Wider at the bottom than the top: it cuts the undercut it cannot back out of. */
const DovetailMill = icon(
  <>
    <path d="M6.5 1.5V8" />
    <path d="M5.5 8h5l2 6h-9z" />
  </>,
)

/** A ball on a thin neck, so it reaches back under what it just passed. */
const LollipopMill = icon(
  <>
    <path d="M8 1.5V8" />
    <circle cx="8" cy="11.3" r="3.1" />
  </>,
)

/** A disc on a shank, cutting on its rim. */
const SlotMill = icon(
  <>
    <path d="M8 1.5V8" />
    <path d="M2.5 8h11v3.5h-11z" />
  </>,
)

/** A flat end and stacked crests: it cuts the form, not the depth. */
const ThreadMill = icon(
  <>
    <path d="M5 1.5v13h6v-13" />
    <Helix d="M5 5.5h6M5 8.5h6M5 11.5h6" />
  </>,
)

/** Circle segments: the flank is an arc, and which arc is the whole family. */

/** Widest at the middle — the big radius rides the wall. */
const BarrelMill = icon(
  <>
    <path d="M5.5 1.5v3C4 8 4.6 11.6 8 14.5c3.4-2.9 4-6.5 2.5-10v-3" />
  </>,
)

/** Two arcs closing on a tip: a lens, for shallow walls at steep angles. */
const LensMill = icon(
  <>
    <path d="M5.5 1.5v3.5c0 4 1 7 2.5 9.5 1.5-2.5 2.5-5.5 2.5-9.5V1.5" />
  </>,
)

/** An egg: the arc keeps turning all the way to the end. */
const OvalMill = icon(
  <>
    <path d="M5.2 1.5v7.2c0 3.4 1.2 5.8 2.8 5.8s2.8-2.4 2.8-5.8V1.5" />
  </>,
)

/** A taper whose flank is an arc rather than a line, ending on a radius. */
const TaperMill = icon(
  <>
    <path d="M4.6 1.5v5c.3 4 1.6 6.7 3.4 8 1.8-1.3 3.1-4 3.4-8v-5" />
  </>,
)

/* ── Hole making ─────────────────────────────────────────────────────────── */

/** The one tool in the set that is not symmetrical: it cuts on one side. */
const BoringBar = icon(
  <>
    <path d="M6 1.5V13h5" />
    <path d="M11 10.8 13.5 13 11 15.2z" />
  </>,
)

/** A flat-bottomed counter cut, guided by the pilot in the hole below it. */
const CounterBore = icon(
  <>
    <path d="M4.5 1.5v9.5h7V1.5" />
    <path d="M6.8 11v3.5h2.4V11" />
  </>,
)

/** The ground point, and the helix that clears the chip. */
const Drill = icon(
  <>
    <path d="M5 1.5v9l3 4 3-4v-9" />
    <Helix d="M5 8 11 5.5M5 4.5 11 2" />
  </>,
)

/** A stiff body stepped down to a small point: it starts a hole, it does not make one. */
const CenterDrill = icon(
  <>
    <path d="M4.5 1.5v7.5h2.2v2.6l1.3 2.9 1.3-2.9V9h2.2V1.5" />
  </>,
)

/** Wide included angle, short: it marks where, not how deep. */
const SpotDrill = icon(
  <>
    <path d="M4.5 1.5v8l3.5 4 3.5-4v-8" />
  </>,
)

/** Straight flutes and a lead chamfer: it sizes a hole that already exists. */
const Reamer = icon(
  <>
    <path d="M5 1.5v11l1.2 2h3.6l1.2-2v-11" />
    <Helix d="M6.6 3v9M9.4 3v9" />
  </>,
)

/** A cone with nothing under it. */
const CounterSink = icon(
  <>
    <path d="M6.6 1.5V5" />
    <path d="M3 5h10l-5 9.2z" />
  </>,
)

/** A tap, told apart by which way the thread leans. `lead` is that lean. */
const tap = (hand: 'left' | 'right') =>
  icon(
    <>
      <path d="M5 1.5v9.5l3 3.5 3-3.5V1.5" />
      <Helix d={hand === 'right' ? 'M5 6.5 11 4.5M5 9.5 11 7.5' : 'M5 4.5 11 6.5M5 7.5 11 9.5'} />
    </>,
  )

const TapRightHand = tap('right')
const TapLeftHand = tap('left')

/* ── Toolholding ─────────────────────────────────────────────────────────── */

/**
 * A holder, drawn as the spindle sees it: the taper, the flange, the nose.
 *
 * The taper is the identifying feature — it is what decides whether a holder
 * goes in *this* machine at all — so it is the half of the drawing that gets
 * the room.
 */
/**
 * A shank stepped down to a neck above the flutes.
 *
 * Not a kind of tool — it is the thing a shank filter asks about, so it is
 * drawn as the difference itself: full width at the top, narrower below the
 * step, flutes at the bottom (Paul, 2026-08-31).
 */
export const ReducedShankIcon = ({ className }: IconProps) => (
  <Frame className={className}>
    <path d="M4.5 1.5v4.5h1.75V14h3.5V6H11.5V1.5" />
    <Helix d="M6.25 11.5 9.75 10M6.25 8.5 9.75 7" />
  </Frame>
)

/**
 * A holder, drawn in the box the rest of them are drawn in.
 *
 * It was laid out for a 24-unit frame and then drawn in a 16-unit one, so the
 * flange and the nose ran off the bottom edge (Paul, 2026-08-31, on the collet
 * beside it). Same shape, inside the lines: taper, flange, nose.
 */
export const HolderIcon = ({ className }: IconProps) => (
  <Frame className={className}>
    <path d="M6 1.5h4l-.7 4H6.7z" />
    <path d="M4 5.5h8v2H4z" />
    <path d="M6.2 7.5h3.6l-.8 7H7z" />
  </Frame>
)

/**
 * A collet, drawn as the slit taper a milling collet is.
 *
 * The slits are the whole idea: they are what lets one collet close over a
 * range of shanks instead of one nominal size, which is the difference between
 * a collet and a bore. **Alternating** from each end, which is how an ER
 * collet is cut and what makes the drawing read as one rather than as a plain
 * taper (Paul, 2026-08-31: "should look more like a milling collet").
 */
export const ColletIcon = ({ className }: IconProps) => (
  <Frame className={className}>
    <path d="M5.4 2.2h5.2l-.9 4.3h1.1l-1.4 7.3H6.6L5.2 6.5h1.1z" />
    <path d="M8 2.6v4.6M6.6 13.2V9.4M9.4 13.2V9.4" strokeWidth={0.85} opacity={0.8} />
  </Frame>
)

/**
 * Flute length: the cutting part of the tool, with the length that is cutting
 * bracketed beside it.
 *
 * **Its own drawing, not a ruler** (Paul, 2026-09-01: "flute length and
 * minimum clamping length both have the same icon, and it's generic for
 * both"). Two filters asking about two different lengths of the same tool
 * cannot both be a ruler; each one draws the part of the tool it measures.
 */
export const FluteLengthIcon = ({ className }: IconProps) => (
  <Frame className={className}>
    <path d="M6.5 1.5v13h4.5v-13" />
    <Helix d="M7 12.5 10.5 11M7 9.5 10.5 8" />
    <path d="M3.5 7.5v7M2.4 7.5h2.2M2.4 14.5h2.2" strokeWidth={0.85} />
  </Frame>
)

/**
 * Minimum clamping length: the shank inside the holder, bracketed over the
 * part that is held.
 */
export const ClampingLengthIcon = ({ className }: IconProps) => (
  <Frame className={className}>
    <path d="M4.5 1.5h7v6h-7z" />
    <path d="M7 1.5v13M9 1.5v13" strokeWidth={0.9} />
    <path d="M2.6 1.8v5.4M1.6 1.8h2M1.6 7.2h2" strokeWidth={0.85} />
  </Frame>
)

/**
 * A floor radius: the corner a filleted pocket has, and the sharp one it is
 * not.
 *
 * The wall comes down, turns through the radius and runs out along the floor,
 * with the square corner it replaces ghosted behind it — the whole question
 * this filter asks is how much of that corner a shop will accept
 * (Paul, 2026-08-31).
 */
export const FloorRadiusIcon = ({ className }: IconProps) => (
  <Frame className={className}>
    {/* The wall, the radius, the floor — the corner as a section. */}
    <path d="M3 2v6a4 4 0 0 0 4 4h6" />
    {/* The square corner the radius replaces, which is what the filter allows. */}
    <path d="M3 12h4" strokeWidth={0.9} strokeDasharray="1.4 1.2" opacity={0.6} />
    <path d="M7 12V8" strokeWidth={0.9} strokeDasharray="1.4 1.2" opacity={0.6} />
    {/* The material below the floor, so it reads as a section rather than a bracket. */}
    <path d="M3 14h11" strokeWidth={0.9} opacity={0.5} />
  </Frame>
)

/** Anything the catalog names that this list does not draw. */
const Generic = icon(<path d="M5 1.5v13h6v-13" />)

/**
 * The registry, keyed by a normalised name.
 *
 * Aliases matter more than they look: this catalog's ingested tools say
 * `endmill` and `tap`, a Fusion library says `flat end mill` and `tap right
 * hand`, and both have to land on one drawing or the same tool is two things
 * on screen.
 */
const BY_TYPE: Record<string, (props: IconProps) => ReactElement> = {
  'ball end mill': BallEndMill,
  ballnose: BallEndMill,
  'ball mill': BallEndMill,
  'bull nose end mill': BullNoseEndMill,
  bullnose: BullNoseEndMill,
  'flat end mill': FlatEndMill,
  endmill: FlatEndMill,
  'end mill': FlatEndMill,
  mill: FlatEndMill,
  'face mill': FaceMill,
  facemill: FaceMill,
  'tapered mill': TaperedMill,
  taper: TaperedMill,
  'radius mill': RadiusMill,
  'corner rounding': RadiusMill,
  'chamfer mill': ChamferMill,
  chamfer: ChamferMill,
  engrave: ChamferMill,
  'engrave chamfer mill': ChamferMill,
  'dovetail mill': DovetailMill,
  dovetail: DovetailMill,
  'lollipop mill': LollipopMill,
  lollipop: LollipopMill,
  'slot mill': SlotMill,
  slitting: SlotMill,
  'thread mill': ThreadMill,
  threadmill: ThreadMill,
  'circle segment barrel': BarrelMill,
  barrel: BarrelMill,
  'circle segment lens': LensMill,
  lens: LensMill,
  'circle segment oval': OvalMill,
  oval: OvalMill,
  'circle segment taper': TaperMill,
  'boring bar': BoringBar,
  boring: BoringBar,
  'counter bore': CounterBore,
  counterbore: CounterBore,
  drill: Drill,
  'twist drill': Drill,
  'center drill': CenterDrill,
  'centre drill': CenterDrill,
  centerdrill: CenterDrill,
  'spot drill': SpotDrill,
  spotdrill: SpotDrill,
  spot: SpotDrill,
  reamer: Reamer,
  ream: Reamer,
  'counter sink': CounterSink,
  countersink: CounterSink,
  'tap left hand': TapLeftHand,
  'tap right hand': TapRightHand,
  tap: TapRightHand,
}

/** Lower case, and one space between words, so `Bull_nose-mill` finds its drawing. */
const normalise = (toolType: string): string =>
  toolType
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const ToolTypeIcon = ({ toolType, className }: { toolType: string; className?: string }) => {
  const Icon = BY_TYPE[normalise(toolType)] ?? Generic
  return <Icon className={className} />
}

/** Whether this application has a drawing for a name, rather than a fallback. */
export const hasToolTypeIcon = (toolType: string): boolean => normalise(toolType) in BY_TYPE

/** What a name is called in the library's vocabulary, where it has a proper one. */
export const toolTypeLabel = (toolType: string): string =>
  TOOL_FORMS.find((each) => each.value === normalise(toolType))?.label ?? toolType

/**
 * The forms whose shank is reduced by definition, so saying so adds nothing.
 *
 * A slot mill — a keyseat or woodruff cutter — is a disc of teeth on a neck;
 * there is no full-shank one to tell it apart from, and "Reduced shank slot
 * mill" is two words of noise on every one of them (Paul, 2026-09-01). The
 * shank facet still reads `reduced`, because it is: what changes is only
 * whether the label says a thing its own name already said.
 */
const SHANK_IS_THE_TYPE: ReadonlySet<string> = new Set(['slot mill'])

/**
 * What a tool is, in its own words, with the shank in the name where it is
 * reduced: "Reduced shank bull nose end mill". Paul's call (2026-08-30) — a
 * neck is not a kind of tool, but it is the first thing a shop wants to know
 * about one, so it leads. Except where every tool of that form has one; see
 * {@link SHANK_IS_THE_TYPE}.
 */
export const formLabel = (tool: {
  readonly form: string
  readonly geometry: Readonly<Record<string, number>>
}): string => {
  const form = normalise(tool.form)
  const label = toolTypeLabel(tool.form)
  return shankOf(tool) === 'reduced' && !SHANK_IS_THE_TYPE.has(form)
    ? `Reduced shank ${label.toLowerCase()}`
    : label
}
