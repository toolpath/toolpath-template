import { asNumber, facts } from '@toolpath/part-contracts/datasheet'
import { isReachCurve, type PartFeature, type ReachCurve } from '@toolpath/part-contracts'
import { fitTools, type FeatureDemand } from '@toolpath/tool-support'

import type { CatalogTool } from './types.js'

/**
 * What a feature demands of a tool, in millimetres.
 *
 * `@toolpath/tool-support`'s. **This type is the seam the whole extraction
 * turns on**: reading it off a Toolpath datasheet needs the Engine's part
 * schema, and checking a tool against it needs only tool vocabulary. Those two
 * halves used to sit in this file, and splitting them exactly here is what let
 * the checking travel without dragging the OpenAPI contract with it.
 *
 * What is left in this file is the half above the line — {@link demandOf} and
 * the part-top reading it needs. {@link fitAgainst} and {@link fitTools} are
 * re-exported from the domain package.
 */
export type { FeatureDemand } from '@toolpath/tool-support'
export {
  DRILLING_FORMS,
  fitAgainst,
  fitTools,
  type FitFailure,
  type ToolFit,
} from '@toolpath/tool-support'

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
