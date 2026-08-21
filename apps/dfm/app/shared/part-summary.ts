import type { PublicInspectionReport } from './contracts'
import { directionLabel } from './report'

/**
 * What the Engine found, before anybody has clicked anything.
 *
 * The counts are the part's shape as a report describes it: how much geometry
 * there is, which ways up it can be held, and what kinds of feature came back.
 * All of it is arithmetic over the report — nothing here asks the Engine
 * anything it did not already say.
 */
export interface DirectionCount {
  readonly index: number
  readonly label: string
  readonly features: number
}

export interface TypeCount {
  readonly type: string
  readonly label: string
  readonly features: number
  /**
   * How many of them are cut from the direction being held.
   *
   * `null` when none is: a count against no question is a column of numbers
   * equal to the one beside it.
   */
  readonly inDirection: number | null
}

export interface PartSummary {
  readonly features: number
  readonly regions: number
  readonly triangles: number
  readonly points: number
  readonly directions: readonly DirectionCount[]
  readonly types: readonly TypeCount[]
  readonly timing: { readonly download: number; readonly analysis: number; readonly total: number }
}

const labelForType = (value: string): string =>
  value
    .split('_')
    .filter(Boolean)
    .map((word, at) => (at === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')

const asMs = (value: unknown): number => (typeof value === 'number' && value >= 0 ? value : 0)

export function partSummary(
  report: PublicInspectionReport,
  activeDirection: number | null = null,
): PartSummary {
  const held = activeDirection === null ? null : report.candidateDirections[activeDirection]
  const perDirection = new Map<string, number>()
  const perType = new Map<string, number>()
  const perTypeHeld = new Map<string, number>()

  for (const feature of report.features) {
    const direction = feature.machiningDirection
    const key = `${direction.x},${direction.y},${direction.z}`
    perDirection.set(key, (perDirection.get(key) ?? 0) + 1)
    perType.set(feature.featureType, (perType.get(feature.featureType) ?? 0) + 1)

    if (held && direction.x === held.x && direction.y === held.y && direction.z === held.z) {
      perTypeHeld.set(feature.featureType, (perTypeHeld.get(feature.featureType) ?? 0) + 1)
    }
  }

  return {
    features: report.features.length,
    regions: report.regions.length,
    triangles: report.meshTriangleCount,
    points: report.meshPointCount,
    directions: report.candidateDirections.map((direction, index) => ({
      index,
      label: directionLabel(direction),
      features: perDirection.get(`${direction.x},${direction.y},${direction.z}`) ?? 0,
    })),
    // Commonest first: the long tail of one-off types is the part of this list
    // nobody scans, and putting it at the top buries what the part is made of.
    types: [...perType]
      .map(([type, features]) => ({
        type,
        label: labelForType(type),
        features,
        inDirection: held ? (perTypeHeld.get(type) ?? 0) : null,
      }))
      .sort((a, b) => b.features - a.features || a.label.localeCompare(b.label)),
    timing: {
      download: asMs(report.downloadMs),
      // The API split analysis into recognition and enrichment; summing them
      // keeps this meaning what it always meant rather than reading zero.
      analysis: asMs(report.recognitionMs) + asMs(report.enrichmentMs),
      total: asMs(report.totalMs),
    },
  }
}

/** Milliseconds while they are small, seconds once they stop being. */
export const duration = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`
