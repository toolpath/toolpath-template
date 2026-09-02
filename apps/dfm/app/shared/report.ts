import type { FeatureDatasheetFacts, Vec3 } from '@toolpath/api'
import { sameDirection } from '@toolpath/viewer'
import type { PartFeature } from './contracts'

export type { PartFeature } from './contracts'

export interface FeatureSummary {
  tag: string
  type: string
  direction: string
  regionCount: number
  headline?: string
}

export interface DetailRow {
  label: string
  value: string
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

export const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const labelForType = (value: string): string =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

export const directionLabel = ({ x, y, z }: Vec3): string => {
  const values: Array<[string, number]> = [
    ['X', x],
    ['Y', y],
    ['Z', z],
  ]
  const nonZero = values.filter(([, value]) => Math.abs(value) > 0.000001)
  if (nonZero.length === 1 && Math.abs(Math.abs(nonZero[0][1]) - 1) < 0.000001) {
    return `${nonZero[0][1] > 0 ? '+' : '−'}${nonZero[0][0]}`
  }
  return `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`
}

/**
 * A stable key for a machining direction, for grouping features cut the same
 * way up. Rounded, because two directions the Engine reports as the same way up
 * differ in the last bits of a float.
 */
export const directionKey = ({ x, y, z }: Vec3): string =>
  `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`

const millimeters = (value: number): string => `${value.toFixed(value < 10 ? 2 : 1)} mm`

export const facts = (feature: PartFeature): FeatureDatasheetFacts | null =>
  feature.datasheet?.facts ?? null

/** The Engine's own family for a feature, for the drawing that stands for it. */
export const kindOf = (feature: PartFeature): string => {
  const kind = facts(feature)?.kind
  return typeof kind === 'string' ? kind : 'Other'
}

export const featureHeadline = (feature: PartFeature): string | undefined => {
  const featureFacts = facts(feature)
  const diameter = featureFacts?.kind === 'Hole' ? asNumber(featureFacts.diameter) : null
  if (diameter !== null) {
    return `⌀ ${millimeters(diameter)}`
  }
  const radius =
    featureFacts && 'filletRadius' in featureFacts ? asNumber(featureFacts.filletRadius) : null
  if (radius !== null) {
    return `R ${millimeters(radius)}`
  }
  const sheet = feature.datasheet
  const minimum = asNumber(sheet?.zMin)
  const maximum = asNumber(sheet?.zMax)
  if (minimum !== null && maximum !== null && Math.abs(maximum - minimum) > 0.005) {
    return `Depth ${millimeters(maximum - minimum)}`
  }
  return undefined
}

export const featureSummary = (feature: PartFeature): FeatureSummary => ({
  tag: feature.featureTag,
  type: labelForType(feature.featureType),
  direction: directionLabel(feature.machiningDirection),
  regionCount: feature.regionIdxs.length,
  headline: featureHeadline(feature),
})

export const filterFeatures = (
  features: ReadonlyArray<PartFeature>,
  query: string,
): Array<PartFeature> => {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) {
    return [...features]
  }
  return features.filter((feature) => {
    const summary = featureSummary(feature)
    return [summary.type, summary.direction, summary.tag, summary.headline]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalized))
  })
}

export const featureDetailRows = (feature: PartFeature): Array<DetailRow> => {
  const sheet = feature.datasheet
  const featureFacts = facts(feature)
  const rows: Array<DetailRow> = [
    { label: 'Feature tag', value: feature.featureTag },
    { label: 'Machining direction', value: directionLabel(feature.machiningDirection) },
    { label: 'Mesh regions', value: String(feature.regionIdxs.length) },
  ]
  const measurements: Array<[string, unknown, (value: number) => string]> = [
    ['Diameter', featureFacts?.kind === 'Hole' ? featureFacts.diameter : undefined, millimeters],
    ['Maximum depth', sheet?.zMax, millimeters],
    ['Minimum depth', sheet?.zMin, millimeters],
    [
      'Fillet radius',
      featureFacts && 'filletRadius' in featureFacts ? featureFacts.filletRadius : undefined,
      (value) => `R ${millimeters(value)}`,
    ],
    [
      'Tool diameter',
      featureFacts?.kind === 'Three' ? featureFacts.toolFit.toolDiameter : undefined,
      millimeters,
    ],
  ]
  for (const [label, raw, format] of measurements) {
    const value = asNumber(raw)
    if (value !== null) {
      rows.push({ label, value: format(value) })
    }
  }
  return rows
}

export const rawDatasheet = (feature: PartFeature): string =>
  JSON.stringify(feature.datasheet ?? {}, null, 2)

/**
 * The named features, **in the order they were named**.
 *
 * Report order would be a different list: the candidates are ranked, and a list
 * shown in one order while the keyboard walks another sends the highlight
 * jumping around it.
 */
/**
 * Every feature of one kind, as tags — narrowed to one way up when a direction
 * is being held.
 *
 * Opening a type is a question about that type, and the part is where the
 * answer is legible: sixty-one walls is a number, and sixty-one walls lit up is
 * a shape. Holding a direction narrows the question the same way the counts
 * beside the type already narrow, so the two agree.
 */
export const tagsOfType = (
  features: ReadonlyArray<PartFeature>,
  featureType: string | null,
  direction: Vec3 | null,
): Array<string> => {
  if (featureType === null) {
    return []
  }
  return features
    .filter((feature) => feature.featureType === featureType)
    .filter((feature) => !direction || sameDirection(feature.machiningDirection, direction))
    .map((feature) => feature.featureTag)
}

/**
 * Whether the way up being held can reach the reading a tag names.
 *
 * Takes the readings rather than a report, like everything else here — and that
 * is the bug this was lifted out of rather than a matter of taste. It lived as
 * a closure over `report.features` in `part-inspector`, so a reading somebody
 * drew here was not in the list it searched, the lookup found nothing, and the
 * `false` below dropped it: holding the very way up a made reading is cut from
 * took it out of the list it belongs at the top of.
 *
 * Nothing held reaches everything, which is what puts the whole list back when
 * an arrow is released.
 */
export const reachableFrom = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3 | null,
): ((tag: string) => boolean) => {
  if (!direction) {
    return () => true
  }

  const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))
  return (tag) => {
    const feature = byTag.get(tag)
    return feature ? sameDirection(feature.machiningDirection, direction) : false
  }
}

export const featureFromTags = (
  features: ReadonlyArray<PartFeature>,
  tags: ReadonlyArray<string>,
): Array<PartFeature> => {
  const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))
  return tags.flatMap((tag) => {
    const feature = byTag.get(tag)
    return feature ? [feature] : []
  })
}
