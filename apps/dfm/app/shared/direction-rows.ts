import type { PartFeature, PartReport } from './contracts'

/** What a direction row reads: the faces, the ways up, and the features. */
export type PartDirections = Pick<PartReport, 'regions' | 'candidateDirections' | 'features'>
import { directionLabel } from './report'
import { partArea } from './setups'

/**
 * What a direction amounts to on this part, before anybody has planned anything.
 *
 * The read-only half of the direction list. Each row answers the question a
 * person asks first — *if I held it this way, what would I be able to reach?* —
 * and answers it in surface area rather than in feature count, for the reason
 * `areaOf` exists: forty fillets and the face they sit on are not forty-one
 * equal things, and only an area says which one matters.
 *
 * Nothing here reads the plan. A row means the same thing on an empty page as
 * on a finished one, which is what makes it the sensible thing to show first.
 */
export interface DirectionRow {
  index: number
  label: string
  /** Features the Engine attributed to this direction. */
  features: number
  /** Regions those features cover, de-duplicated. */
  regions: number
  /** Area of those regions. */
  area: number
  /** That area as a fraction of the whole part. */
  share: number
}

/**
 * Which candidate direction a feature was reported from.
 *
 * By identity against the candidate list rather than by angle: these vectors
 * come from the same report, so the one that cut a feature is the one already
 * in the list. Naming a direction the Engine never offered is PR 11, and it
 * needs the angular match in `directions.ts` — this does not.
 */
const directionIndexOf = (report: PartDirections, feature: PartFeature): number =>
  report.candidateDirections.findIndex(
    (candidate) =>
      candidate.x === feature.machiningDirection.x &&
      candidate.y === feature.machiningDirection.y &&
      candidate.z === feature.machiningDirection.z,
  )

export const directionRows = (report: PartDirections): Array<DirectionRow> => {
  const whole = partArea(report)
  const regionsPer = report.candidateDirections.map(() => new Set<number>())
  const featuresPer = report.candidateDirections.map(() => 0)

  for (const feature of report.features) {
    const index = directionIndexOf(report, feature)
    if (index === -1) continue

    featuresPer[index] += 1
    for (const idx of feature.regionIdxs) {
      regionsPer[index]?.add(idx)
    }
  }

  return report.candidateDirections.map((direction, index) => {
    const regions = regionsPer[index] ?? new Set<number>()
    let area = 0
    for (const idx of regions) {
      area += report.regions[idx]?.area ?? 0
    }

    return {
      index,
      label: directionLabel(direction),
      features: featuresPer[index] ?? 0,
      regions: regions.size,
      area,
      share: whole === 0 ? 0 : area / whole,
    }
  })
}
