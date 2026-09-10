import type { PartFeature } from '@toolpath/part-contracts'
import { asNumber, asRecord } from '@toolpath/part-contracts/datasheet'
import { isReachCurve } from '@toolpath/part-contracts'
import { partTop } from '@toolpath/part-contracts/measurements'
import type { FeatureSection, SectionKind } from '@toolpath/catalog-data'

/**
 * What the drawing needs to section a feature, read off its datasheet.
 *
 * The geometry is `@toolpath/catalog-data`'s (`sectionOutline`); this is the
 * reading of the report, which is the application's — the same split as the
 * defaults sheet's fields. What the datasheet does not state is null, and the
 * section draws around it: no width is an open right side, no curve is a wall
 * straight up to the part top.
 */
const kindOf = (kind: unknown, hasWall: boolean, hasFloor: boolean): SectionKind => {
  switch (kind) {
    case 'Hole':
      return 'hole'
    case 'Wall':
    case 'Profile':
      return 'wall'
    case 'Face':
      return 'face'
    default:
      return hasWall || !hasFloor ? 'pocket' : 'face'
  }
}

export const sectionOf = (
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
): FeatureSection | null => {
  const sheet = feature.datasheet
  if (!sheet) {
    return null
  }
  const facts = asRecord(sheet.facts)
  const raw = sheet as unknown as Record<string, unknown>
  // Kernel 0.3.0 reports said `minDepth`/`maxDepth` and `depthVariation` for
  // what later ones call `zMin`/`zMax` and `reachCurve`: the same facts by
  // older names, read so that an older report (the cube fixture among them)
  // is sectioned rather than drawn bare.
  const zMin = asNumber(sheet.zMin) ?? asNumber(raw.minDepth)
  const zMax = asNumber(sheet.zMax) ?? asNumber(raw.maxDepth)
  if (zMin === null || zMax === null) {
    return null
  }
  const hasFloor = raw.hasFloor !== false
  const hasWall = raw.hasWall !== false
  const kind = kindOf(facts?.kind, hasWall, hasFloor)
  const cd = asRecord(asRecord(facts?.cd)?.ignore)
  const positive = (value: number | null): number | null =>
    value !== null && value > 0 ? value : null
  const width = kind === 'hole' ? positive(asNumber(facts?.diameter)) : positive(asNumber(cd?.min))
  const top = partTop(partFeatures, feature)
  const variation = asRecord(raw.depthVariation)
  const curve =
    (sheet as { reachCurve?: unknown }).reachCurve ??
    (variation
      ? { horizontalOffset: variation.deltaX, verticalOffset: variation.deltaY }
      : undefined)
  return {
    kind,
    depth: Math.max(0, zMax - zMin),
    hasFloor,
    width,
    filletRadius: positive(asNumber(facts?.filletRadius)) ?? 0,
    coneDeg: kind === 'hole' ? asNumber(facts?.fullConeDeg) : null,
    topAbove: Math.max(zMax - zMin, top === null ? 0 : top - zMin),
    curve: isReachCurve(curve) ? curve : null,
  }
}
