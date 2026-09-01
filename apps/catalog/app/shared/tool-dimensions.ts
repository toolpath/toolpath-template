import { hasNeck, type Assembly, type CatalogTool } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'

/**
 * What a drawing of this tool dimensions, and where each dimension goes.
 *
 * **Pure, and here rather than in the component**, because where a dimension
 * line sits is arithmetic: which ones apply to this tool, what each one
 * measures, and — the part a component would get wrong quietly — which lane
 * each length runs in so that no two lines cross. The drawing turns these into
 * SVG and nothing else.
 *
 * The space is the outline's own: millimetres, `z` above the tip, `r` from the
 * axis. Every length is measured **from the tip**, which is where a machinist
 * measures from and where every rule in the sheet measures from.
 *
 * Only stated numbers are dimensioned. A drawing that carries a figure the
 * vendor never published is worse than one that carries fewer — the caption
 * already names what was assumed, and a dimension line looks like a
 * measurement whatever the caption says.
 */

/** A length along the axis, drawn beside the stack. */
export interface LengthDimension {
  readonly code: string
  /** From the tip, in millimetres — always 0 for now, kept for a dimension that is not. */
  readonly from: number
  readonly to: number
  /**
   * Which line out from the stack this one runs in, 0 nearest.
   *
   * Shortest innermost, so the lines nest instead of crossing — the rule a
   * drafting sheet follows and the reason this is worked out rather than
   * listed in a fixed order.
   */
  readonly lane: number
}

/** A width across the axis, drawn at its own height. */
export interface WidthDimension {
  readonly code: string
  /** Half-width, in millimetres: the dimension runs from `-radius` to `+radius`. */
  readonly radius: number
  /** Where up the tool it is measured, in millimetres above the tip. */
  readonly at: number
}

/**
 * An angle called out with a leader rather than measured between two lines.
 *
 * **A drill is its point** (Paul, 2026-09-01: "shouldn't a 2d rep of a drill be
 * showing me a tip angle?"). On a ⌀1 drill the cone is three tenths of a
 * millimetre tall — drawn to scale it is invisible, and the number is the only
 * way the drawing says 140° rather than 118°.
 */
export interface AngleDimension {
  readonly code: string
  readonly degrees: number
  /** Where the leader points: a radius from the axis and a height above the tip. */
  readonly at: { readonly r: number; readonly z: number }
}

export interface ToolDimensions {
  readonly lengths: ReadonlyArray<LengthDimension>
  readonly widths: ReadonlyArray<WidthDimension>
  readonly angles: ReadonlyArray<AngleDimension>
  /** The corner radius, called out on the corner rather than dimensioned across it. */
  readonly cornerRadius: number | null
}

export interface DimensionOptions {
  /** The stack, when the holder is drawn: the stickout replaces the overall length. */
  readonly assembly?: Assembly | null
}

/** Nothing to draw a dimension from. */
const EMPTY: ToolDimensions = { lengths: [], widths: [], angles: [], cornerRadius: null }

/**
 * The dimensions for one tool, with or without its holder.
 *
 * With the holder, the tool's overall length is left off: most of the shank is
 * inside the holder and a line to a face nobody can see reads as a mistake.
 * What replaces it is the number the holder brings — how far the tool stands
 * out of it.
 */
export const dimensionsFor = (
  tool: CatalogTool,
  { assembly = null }: DimensionOptions = {},
): ToolDimensions => {
  const { DC, LCF, OAL, SFDM, RE } = tool.geometry
  if (DC === undefined || LCF === undefined) {
    return EMPTY
  }

  const shoulderLength = tool.geometry['shoulder-length']
  const shoulderDiameter = tool.geometry['shoulder-diameter']
  const necked = hasNeck(tool) && shoulderLength !== undefined && shoulderDiameter !== undefined

  const widths: Array<WidthDimension> = [{ code: 'DC', radius: DC / 2, at: 0 }]
  if (necked && shoulderDiameter !== undefined && shoulderLength !== undefined) {
    widths.push({
      code: 'shoulder-diameter',
      radius: shoulderDiameter / 2,
      // At the top of the relief, where the shank steps down to it: measured
      // in the middle it sat among the flute length and the corner radius,
      // which is the busiest inch of the drawing (Paul, 2026-09-01).
      at: shoulderLength,
    })
  }
  if (SFDM !== undefined) {
    // On the shank, and above the holder nose where there is one: a width
    // measured inside the holder is measured across a face nobody can see.
    const shankFrom = necked && shoulderLength !== undefined ? shoulderLength : LCF
    const shankTo = assembly?.stickout ?? OAL ?? shankFrom
    widths.push({
      code: 'SFDM',
      radius: SFDM / 2,
      at: (shankFrom + Math.max(shankFrom, shankTo)) / 2,
    })
  }

  /** Every length this tool states, before they are put in lanes. */
  const spans: Array<{ code: string; from: number; to: number }> = [
    { code: 'LCF', from: 0, to: LCF },
  ]
  if (necked && shoulderLength !== undefined) {
    spans.push({ code: 'shoulder-length', from: 0, to: shoulderLength })
  }
  const below = tool.geometry.LBH
  if (below !== undefined && below > 0) {
    // What the shop's clamping rule leaves below the holder: the reach the
    // tool has, which is the number half the rules are about (Paul,
    // 2026-09-01).
    spans.push({ code: 'LBH', from: 0, to: below })
  }
  if (assembly === null) {
    if (OAL !== undefined) {
      spans.push({ code: 'OAL', from: 0, to: OAL })
    }
  } else {
    if (assembly.stickout !== null) {
      spans.push({ code: 'stickout', from: 0, to: assembly.stickout })
    }
    /**
     * **No gauge length.** It is the spindle face to the holder nose, and
     * neither drawing reaches the spindle face — both stop a little past the
     * flange. A dimension to a face that is not on the drawing is the same
     * mistake as one to the end of a shank buried in the holder; the number
     * is in the holder's own details, where it can be read without a line
     * pointing at nothing.
     */
  }

  const lengths = spans
    .slice()
    .sort((a, b) => a.to - a.from - (b.to - b.from))
    .map((span, index) => ({ ...span, lane: index }))

  /**
   * The point angle, on the tools that have a point: the leader lands halfway
   * up the cone's own flank, which is where the angle is.
   */
  const SIG = tool.geometry.SIG
  const pointed =
    tool.form === 'drill' || tool.form === 'spot drill' || tool.form === 'center drill'
  const angles: Array<AngleDimension> =
    pointed && SIG !== undefined && SIG > 0
      ? [
          {
            code: 'SIG',
            degrees: SIG,
            at: { r: DC / 4, z: DC / 2 / Math.tan(((SIG / 2) * Math.PI) / 180) / 2 },
          },
        ]
      : []

  return {
    lengths,
    widths,
    angles,
    cornerRadius: RE !== undefined && RE > 0 ? RE : null,
  }
}

/** What a dimension is called on the drawing, where that is not its code. */
const DIMENSION_LABEL: Readonly<Record<string, string>> = {
  LBH: 'below holder',
  'shoulder-length': 'shoulder',
  'shoulder-diameter': 'shoulder ⌀',
  stickout: 'stickout',
  SIG: 'point angle',
}

export const dimensionLabel = (code: string): string => DIMENSION_LABEL[code] ?? code

/** One label's box on the drawing, before anything has been moved. */
export interface LabelBox {
  readonly key: string
  /** The left edge, and the width, in the drawing's own units. */
  readonly x: number
  readonly width: number
  /** The baseline it would like, and the height it takes. */
  readonly y: number
  readonly height: number
}

/**
 * The same labels, moved apart until none covers another.
 *
 * **Because a dimension is only worth drawing if it can be read** (Paul,
 * 2026-09-01). A tool 50 mm long with 4 mm of flute puts its flute length, its
 * relief and its cutting diameter inside the bottom tenth of the drawing, and
 * three figures land on each other however carefully each one is placed. Each
 * label carries a box, so the boxes can be stacked: the lowest keeps its
 * place, and anything that would cover it moves **up**, which is where the
 * drawing has room.
 *
 * Pure arithmetic over rectangles — no measuring of text and no reading of the
 * DOM, so it runs the same on a server as in a browser.
 */
export const stackLabels = (
  boxes: ReadonlyArray<LabelBox>,
  gap = 0,
  /**
   * Boxes that cannot move: the drawing's own lines, so a figure rises clear
   * of an extension line rather than sitting on it (Paul, 2026-09-01 — the
   * figures moved in beside their own lanes, and the lines outboard of them
   * cross those bands).
   */
  fixed: ReadonlyArray<LabelBox> = [],
): Map<string, number> => {
  const placed: Array<LabelBox> = [...fixed]
  const moved = new Map<string, number>()
  // Bottom first: the lowest label is the one nearest what it measures.
  for (const box of [...boxes].sort((a, b) => b.y - a.y)) {
    let y = box.y
    let clash = true
    while (clash) {
      clash = false
      for (const other of placed) {
        const apart =
          box.x + box.width <= other.x ||
          other.x + other.width <= box.x ||
          y - box.height >= other.y + gap ||
          y <= other.y - other.height - gap
        if (!apart) {
          y = other.y - other.height - gap
          clash = true
          break
        }
      }
    }
    placed.push({ ...box, y })
    moved.set(box.key, y)
  }
  return moved
}

/**
 * Where every figure on the drawing stands.
 *
 * **Each figure beside its own line, in the band just outboard of it** (Paul,
 * 2026-09-01: "I'd love to put SFDM, LCF and shoulder dia closer to the part —
 * like, inside the below holder and OAL lines"). One column in the far margin
 * put the number for a dimension at the tool's edge as far from it as the
 * number for the overall length, and the eye has to travel the width of the
 * sheet to pair them up. So the margin is a series of bands: the widths sit in
 * the first, just past their arrows, and each length's figure sits in the band
 * outboard of its own lane.
 *
 * A band is only as wide as the widest figure in it, because the room this
 * takes comes out of the tool.
 */

/** The type a figure is set in, given the drawing's own size. */
export const figureType = (fontSize: number): number => fontSize * 0.85

/** How wide a figure of these lines is, set at that size. */
const figureWidth = (lines: ReadonlyArray<string>, type: number): number =>
  lines.length === 0 ? 0 : (Math.max(...lines.map((each) => each.length)) + 1) * type * 0.56

/** One figure, and the band it stands in. */
export interface DimensionFigure {
  readonly code: string
  readonly side: 'left' | 'right'
  /** 0 is the band nearest the tool — the widths'; band `i + 1` is outboard of lane `i`. */
  readonly band: number
  /** The lane this figure's dimension runs in on its own side, or null for a width. */
  readonly lane: number | null
  readonly lines: ReadonlyArray<string>
  readonly width: number
}

export interface DimensionLayout {
  readonly figures: ReadonlyArray<DimensionFigure>
  /** Per side, the width of every band, nearest the tool first. */
  readonly bands: Readonly<Record<'left' | 'right', ReadonlyArray<number>>>
}

/** The room a side's bands take, measured out from the edge of the stack. */
export interface BandRoom {
  /** How far the width dimensions' arrows reach past the tool. */
  readonly arrow: number
  /** The clearance between a band and the line beside it. */
  readonly gap: number
}

/** Where a band's inboard edge is: the x a figure in it reads outward from. */
export const bandOffset = (bands: ReadonlyArray<number>, band: number, room: BandRoom): number => {
  let at = room.arrow + room.gap
  for (let index = 0; index < band; index += 1) {
    at += (bands[index] ?? 0) + room.gap * 2
  }
  return at
}

/** Where a lane's line runs: just outboard of the band that carries its figure. */
export const laneOffset = (bands: ReadonlyArray<number>, lane: number, room: BandRoom): number =>
  bandOffset(bands, lane, room) + (bands[lane] ?? 0) + room.gap

/** Everything one side needs, out to the far edge of its last band. */
export const bandRoom = (bands: ReadonlyArray<number>, room: BandRoom): number =>
  bands.length === 0
    ? 0
    : bandOffset(bands, bands.length - 1, room) + (bands[bands.length - 1] ?? 0)

/** What one figure reads: the name, the number, and a corner radius under it. */
const linesOf = (
  model: ToolDimensions,
  unit: Unit,
): Array<{ code: string; lines: Array<string>; width: boolean }> => [
  ...model.lengths.map((each) => ({
    code: each.code,
    lines: [dimensionLabel(each.code), formatLength(each.to - each.from, unit)],
    width: false,
  })),
  ...model.angles.map((each) => ({
    code: each.code,
    lines: [dimensionLabel(each.code), `${String(each.degrees)}°`],
    width: true,
  })),
  ...model.widths.map((each) => ({
    code: each.code,
    // Some labels carry the diameter sign already; none carries it twice.
    lines: [
      dimensionLabel(each.code).includes('⌀')
        ? dimensionLabel(each.code)
        : `${dimensionLabel(each.code)} ⌀`,
      formatLength(each.radius * 2, unit),
      // The corner radius belongs to the tip's diameter, and reads under it
      // rather than beside it.
      ...(each.at === 0 && model.cornerRadius !== null
        ? [`RE ${formatLength(model.cornerRadius, unit)}`]
        : []),
    ],
    width: true,
  })),
]

/**
 * Every figure, on the side and in the band it belongs to.
 *
 * The sides alternate — lengths by lane, widths by their own order — so
 * neither margin runs away with the whole drawing while the other stands
 * empty. Where the drawing has the part beside it, everything stays left.
 */
export const dimensionLayout = (
  model: ToolDimensions,
  unit: Unit,
  fontSize: number,
  sides: 'left' | 'both' = 'left',
): DimensionLayout => {
  const type = figureType(fontSize)
  const said = new Map(linesOf(model, unit).map((each) => [each.code, each.lines]))
  const across = [...model.widths, ...model.angles]
  const figures: Array<DimensionFigure> = [
    ...across.map((each, index) => {
      const side: 'left' | 'right' = sides === 'both' && index % 2 === 1 ? 'right' : 'left'
      const lines = said.get(each.code) ?? []
      return { code: each.code, side, band: 0, lane: null, lines, width: figureWidth(lines, type) }
    }),
    ...model.lengths.map((each) => {
      const side: 'left' | 'right' = sides === 'both' && each.lane % 2 === 1 ? 'right' : 'left'
      const lane = sides === 'both' ? Math.floor(each.lane / 2) : each.lane
      const lines = said.get(each.code) ?? []
      return { code: each.code, side, band: lane + 1, lane, lines, width: figureWidth(lines, type) }
    }),
  ]

  const bandsOn = (side: 'left' | 'right'): Array<number> => {
    const mine = figures.filter((each) => each.side === side)
    const count = Math.max(0, ...mine.map((each) => each.band)) + 1
    return Array.from({ length: mine.length === 0 ? 0 : count }, (_, band) =>
      Math.max(0, ...mine.filter((each) => each.band === band).map((each) => each.width)),
    )
  }

  return { figures, bands: { left: bandsOn('left'), right: bandsOn('right') } }
}
