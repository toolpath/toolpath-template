import { asNumber, facts } from '@toolpath/part-contracts/datasheet'
import { isReachCurve, type PartFeature, type ReachCurve } from '@toolpath/part-contracts'
import type { CatalogTool, ToolType } from './types.js'

/**
 * What a feature demands of a tool, in millimetres.
 *
 * Read off the Toolpath datasheet and nothing else — this is not a place where
 * a shop's preferences or a vendor's marketing enters. Every field is optional
 * because the kernel states different measurements for different feature kinds,
 * and a demand nobody stated must not silently become a demand of zero.
 */
export interface FeatureDemand {
  /** The feature this came from, so a result can say which selection excluded a tool. */
  readonly featureTag: string
  /** The widest cutter that still reaches the tightest corner. */
  readonly maxToolDiameter?: number
  /** Stated separately for a hole: the widest drill, and the widest endmill. */
  readonly maxDrillDiameter?: number
  readonly maxEndmillDiameter?: number
  /** A hole's bore. Nothing wider than this goes in it. */
  readonly holeDiameter?: number
  /** How deep the cut reaches, which the flutes have to cover. */
  readonly depth?: number
  /**
   * How far below the top of the part the feature bottoms out, in millimetres.
   *
   * Depth is the feature; this is the *reach* — what the whole stack has to
   * clear before it cuts anything. The report states no part top, so the
   * highest `extendedZMax` of everything cut from the same direction stands in
   * for it, which is the same rule the DFM app's measurements use.
   */
  readonly reachBelowTop?: number
  /** The floor fillet: a corner radius larger than this cannot finish the floor. */
  readonly floorRadius?: number
  /**
   * How tall the material stands, by distance out from the cut — what a holder
   * and a shank are swept against (`clearance.ts`). Present from Engine API
   * 1.0.4 on; a report without it is simply not checked for collisions.
   */
  readonly reachCurve?: ReachCurve
}

/**
 * The top of the part along one machining direction.
 *
 * The report carries no part top, so the highest `extendedZMax` of everything
 * cut this way up stands in for it — which is what makes "how far down does the
 * tool reach before it cuts anything" answerable at all.
 */
const partTop = (features: ReadonlyArray<PartFeature>, feature: PartFeature): number | null => {
  const { x, y, z } = feature.machiningDirection
  let top: number | null = null

  for (const other of features) {
    const direction = other.machiningDirection
    if (direction.x !== x || direction.y !== y || direction.z !== z) {
      continue
    }
    const zMax = asNumber(other.datasheet?.extendedZMax)
    if (zMax === null) {
      continue
    }
    top = top === null ? zMax : Math.max(top, zMax)
  }

  return top
}

/**
 * What a feature asks of a tool, read from its datasheet.
 *
 * The measurements are the Engine's own — `facts.cd.ignore.min` is the widest
 * cutter that still reaches the tightest corner, and it is the number a tool is
 * actually chosen against. Nothing here is derived from a second source, so a
 * shop can check any exclusion against the datasheet the DFM app already shows.
 */
export interface DemandContext {
  /**
   * The other features on the part, so reach can be measured from the part top.
   *
   * An options object rather than a second positional argument, because
   * `features.map(demandOf)` would otherwise hand this the array index — a
   * mistake that reads fine and produces a demand with no reach in it.
   */
  readonly partFeatures?: ReadonlyArray<PartFeature>
}

export const demandOf = (
  feature: PartFeature,
  { partFeatures = [] }: DemandContext = {},
): FeatureDemand => {
  const sheet = feature.datasheet
  const sheetFacts = facts(feature)

  const cd =
    sheetFacts?.kind === 'Chamfer'
      ? sheetFacts.three?.cd
      : sheetFacts && 'cd' in sheetFacts
        ? sheetFacts.cd
        : undefined

  const zTop = asNumber(sheet?.zMax)
  const zBottom = asNumber(sheet?.zMin)
  const filletRadius =
    sheetFacts && 'filletRadius' in sheetFacts ? asNumber(sheetFacts.filletRadius) : null

  const demand: {
    -readonly [K in keyof FeatureDemand]: FeatureDemand[K]
  } = { featureTag: feature.featureTag }

  const maxTool = asNumber(cd?.ignore.min)
  if (maxTool !== null && maxTool > 0) {
    demand.maxToolDiameter = maxTool
  }
  if (sheetFacts?.kind === 'Hole') {
    const drill = asNumber(sheetFacts.maxDrillDiameter)
    const endmill = asNumber(sheetFacts.maxEndmillDiameter)
    const bore = asNumber(sheetFacts.diameter)
    if (drill !== null && drill > 0) {
      demand.maxDrillDiameter = drill
    }
    if (endmill !== null && endmill > 0) {
      demand.maxEndmillDiameter = endmill
    }
    if (bore !== null && bore > 0) {
      demand.holeDiameter = bore
    }
  }
  if (zTop !== null && zBottom !== null && zTop > zBottom) {
    demand.depth = zTop - zBottom
  }
  if (filletRadius !== null && filletRadius > 0) {
    demand.floorRadius = filletRadius
  }
  const top = partTop(partFeatures, feature)
  if (top !== null && zBottom !== null && top > zBottom) {
    demand.reachBelowTop = top - zBottom
  }
  const curve = (sheet as { reachCurve?: unknown } | null | undefined)?.reachCurve
  if (isReachCurve(curve)) {
    demand.reachCurve = curve
  }

  return demand
}

/** Why a tool cannot cut a feature, in the words a machinist would use. */
export interface FitFailure {
  readonly featureTag: string
  readonly reason: string
}

export interface ToolFit {
  readonly tool: CatalogTool
  readonly fits: boolean
  /** Empty when the tool fits. One entry per feature that ruled it out. */
  readonly failures: ReadonlyArray<FitFailure>
}

/** How a tool would be used, which decides which of a hole's two limits applies. */
const DRILLING: ReadonlySet<ToolType> = new Set<ToolType>(['drill', 'reamer'])

/**
 * Whether one tool can cut one feature.
 *
 * **A demand the datasheet does not state is not checked.** The alternative —
 * treating an absent measurement as zero, or as no limit — is the difference
 * between a shop trusting this list and a shop checking every row by hand. What
 * is not stated is not claimed.
 */
export const fitAgainst = (tool: CatalogTool, demand: FeatureDemand): Array<FitFailure> => {
  const failures: Array<FitFailure> = []
  const say = (reason: string) => failures.push({ featureTag: demand.featureTag, reason })

  const diameter = tool.geometry.DC
  const fluteLength = tool.geometry.LCF
  const cornerRadius = tool.geometry.RE
  const drilling = DRILLING.has(tool.toolType)

  // A hole states its own limits, and which one applies depends on how the tool
  // goes in: a drill is bounded by the bore, an endmill by what can helix in it.
  const widest = drilling
    ? (demand.maxDrillDiameter ?? demand.holeDiameter ?? demand.maxToolDiameter)
    : (demand.maxEndmillDiameter ?? demand.maxToolDiameter)

  if (diameter !== undefined && widest !== undefined && diameter > widest) {
    say(`⌀${diameter} mm is wider than the ${widest} mm this feature admits`)
  }

  if (fluteLength !== undefined && demand.depth !== undefined && fluteLength < demand.depth) {
    say(`${fluteLength} mm of flute does not reach ${demand.depth} mm deep`)
  }

  // A corner radius larger than the floor fillet leaves material the floor does
  // not have room for. A sharp tool in a filleted corner is fine — it just
  // leaves the fillet to something else.
  if (
    cornerRadius !== undefined &&
    demand.floorRadius !== undefined &&
    cornerRadius > demand.floorRadius
  ) {
    say(`a ${cornerRadius} mm corner does not fit a ${demand.floorRadius} mm floor fillet`)
  }

  return failures
}

/**
 * Which tools cut **every** selected feature.
 *
 * The intersection is the point of the whole exercise: one setup wants one tool
 * for as much of the part as possible, and a tool that clears four of five
 * features is not an answer — but knowing which feature ruled it out is, which
 * is why a near miss keeps its failures instead of vanishing.
 *
 * With no features selected every tool fits, because nothing has been asked of
 * them yet.
 */
export const fitTools = (
  tools: ReadonlyArray<CatalogTool>,
  demands: ReadonlyArray<FeatureDemand>,
): Array<ToolFit> =>
  tools.map((tool) => {
    const failures = demands.flatMap((demand) => fitAgainst(tool, demand))
    return { tool, fits: failures.length === 0, failures }
  })

/** Just the tools that clear every selected feature, in catalog order. */
/**
 * What a selection of features demands, each read in the context of the whole
 * part so that reach can be measured from the part top.
 */
export const demandsOf = (
  selected: ReadonlyArray<PartFeature>,
  all: ReadonlyArray<PartFeature> = selected,
): Array<FeatureDemand> => selected.map((feature) => demandOf(feature, { partFeatures: all }))

export const toolsForFeatures = (
  tools: ReadonlyArray<CatalogTool>,
  features: ReadonlyArray<PartFeature>,
  all: ReadonlyArray<PartFeature> = features,
): Array<CatalogTool> => {
  const demands = demandsOf(features, all)
  return fitTools(tools, demands)
    .filter((fit) => fit.fits)
    .map((fit) => fit.tool)
}
