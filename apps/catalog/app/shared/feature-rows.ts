import type { PartFeature } from '@toolpath/part-contracts'
import { measurements } from '@toolpath/part-contracts/measurements'
import { featureSummary } from '@toolpath/part-contracts/report'
import type { Unit } from '@toolpath/domain/units'

/**
 * What a selected feature has to say in a table of them.
 *
 * **The geometry a tool is chosen against, and nothing else.** A feature has
 * dozens of measurements; three of them decide whether a tool can cut it — how
 * tight the corners are, how far down it goes, and, on a chamfer, at what
 * angle. The rest belong behind the ⓘ, where somebody has gone looking.
 *
 * Every value comes from `measurements`, the same reader the DFM application
 * shows, so a number here is the number there.
 */

export interface FeatureRow {
  readonly tag: string
  readonly type: string
  readonly direction: string
  /**
   * The tightest internal radius the feature leaves room for.
   *
   * Half the widest cutter that still reaches its corners — the number a tool
   * is actually chosen against, and the one a shop calls "will a 6 mm get in
   * there".
   */
  readonly minRadius: string | null
  /** How far below the top of the part it bottoms out, which the stack must clear. */
  readonly maxDepth: string | null
  /** A chamfer's included angle, which decides the tool rather than its size. */
  readonly angle: string | null
}

const valueOf = (rows: ReadonlyArray<{ key: string; value: string }>, key: string): string | null =>
  rows.find((row) => row.key === key)?.value ?? null

export const featureRow = ({
  feature,
  features,
  regions,
  unit,
}: {
  readonly feature: PartFeature
  readonly features: ReadonlyArray<PartFeature>
  readonly regions: ReadonlyArray<{ idx: number; shapeKind: string }>
  readonly unit: Unit
}): FeatureRow => {
  const rows = measurements({ feature, features, regions, unit })
  const summary = featureSummary(feature)

  return {
    tag: feature.featureTag,
    type: summary.type,
    direction: summary.direction,
    minRadius: valueOf(rows, 'minRadius'),
    // Depth below the part top where the report supports it, and the feature's
    // own depth where it does not — a feature is deep for a tool in whichever
    // of those is stated, and showing neither because one is missing helps
    // nobody.
    maxDepth: valueOf(rows, 'depthBelowTop') ?? valueOf(rows, 'featureDepth'),
    angle: valueOf(rows, 'bevelAngle'),
  }
}
