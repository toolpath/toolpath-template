import { hasNeck, type Assembly, type CatalogTool } from '@toolpath/catalog-data'

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

export interface ToolDimensions {
  readonly lengths: ReadonlyArray<LengthDimension>
  readonly widths: ReadonlyArray<WidthDimension>
  /** The corner radius, called out on the corner rather than dimensioned across it. */
  readonly cornerRadius: number | null
}

export interface DimensionOptions {
  /** The stack, when the holder is drawn: the stickout replaces the overall length. */
  readonly assembly?: Assembly | null
}

/** Nothing to draw a dimension from. */
const EMPTY: ToolDimensions = { lengths: [], widths: [], cornerRadius: null }

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
      at: (LCF + shoulderLength) / 2,
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

  return {
    lengths,
    widths,
    cornerRadius: RE !== undefined && RE > 0 ? RE : null,
  }
}

/** What a dimension is called on the drawing, where that is not its code. */
export const DIMENSION_LABEL: Readonly<Record<string, string>> = {
  'shoulder-length': 'shoulder',
  'shoulder-diameter': 'shoulder ⌀',
  stickout: 'stickout',
}

export const dimensionLabel = (code: string): string => DIMENSION_LABEL[code] ?? code
