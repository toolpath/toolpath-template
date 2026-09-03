import type { PartFeature } from './contracts.js'
import { asNumber, facts } from './report.js'
import { formatArea, formatLength, type UnitSystem } from '@toolpath/tool-support'

/**
 * What a feature amounts to, in the order somebody asks it.
 *
 * **Shared with the tool catalog**, 2026-08-28: it reads the same numbers to
 * decide which tools can cut a feature, and two implementations of "how deep is
 * this" is two applications disagreeing about one part.
 *
 * The datasheet is dozens of fields under the Engine's own names, and reading
 * one has meant knowing which of them matter for this kind of feature —
 * `wallishArea` against `floorishArea`, `zMax` minus `zMin`, `facts.cd` halved.
 * This is that knowledge written down once: the same handful of questions for
 * every feature, answered from whichever fields that type happens to use.
 *
 * **Every row says where it came from.** Not as a debugging aid — as the point.
 * A number a shop cannot trace is a number they have to take on faith, and the
 * whole argument for showing the Engine's own measurements is that they can be
 * checked against the raw datasheet further down the same panel.
 */
export interface Measurement {
  /** A stable name, so the strip at the top can pick rows out by identity. */
  readonly key: string
  readonly label: string
  readonly value: string
  /**
   * The same number in the other unit.
   *
   * Shops read in one unit and buy tooling in the other, and the arithmetic
   * between them is exactly the kind somebody gets wrong once and trusts
   * afterwards. Absent on rows that are not a length or an area — a ratio and a
   * count of faces do not convert.
   */
  readonly alt?: string
  /** The raw fields and arithmetic behind it, as they read in the JSON. */
  readonly from: string
  /** Longer than a label, where the field needs a sentence. */
  readonly note?: string
}

/**
 * The top of the part along one machining direction.
 *
 * The report carries no part top, so the highest `extendedZMax` of everything
 * cut this way up stands in for it — which is what makes "how far down does the
 * tool reach before it cuts anything" answerable at all.
 */
export const partTop = (
  features: ReadonlyArray<PartFeature>,
  feature: PartFeature,
): number | null => {
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

/** How the faces of this feature are shaped, by the Engine's own classification. */
const facesBy = (
  feature: PartFeature,
  regions: ReadonlyArray<{ idx: number; shapeKind: string }>,
): Array<[string, number]> => {
  const byIdx = new Map(regions.map((region) => [region.idx, region]))
  const counts = new Map<string, number>()

  for (const idx of feature.regionIdxs) {
    const kind = byIdx.get(idx)?.shapeKind ?? 'unknown'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  return [...counts].sort((a, b) => b[1] - a[1])
}

/**
 * The rows every feature gets, followed by the ones its type earns.
 *
 * A row is left out rather than shown empty: "—" against a field the Engine
 * never reports for this type reads as a measurement that failed, and there are
 * a lot of them — a wall's `facts` carries little but a cutter diameter.
 */
export const measurements = ({
  feature,
  features,
  regions,
  unit,
}: {
  feature: PartFeature
  features: ReadonlyArray<PartFeature>
  regions: ReadonlyArray<{ idx: number; shapeKind: string }>
  unit: UnitSystem
}): Array<Measurement> => {
  // Both readings, so a row carries its conversion rather than the caller
  // working it out again from a string it would have to parse first.
  const other: UnitSystem = unit === 'millimeters' ? 'inches' : 'millimeters'
  const length = (value: number) => ({
    value: formatLength(value, unit),
    alt: formatLength(value, other),
  })
  const area = (value: number) => ({
    value: formatArea(value, unit),
    alt: formatArea(value, other),
  })

  const rows: Array<Measurement> = []
  const sheet = feature.datasheet
  const sheetFacts = facts(feature)

  const zTop = asNumber(sheet?.zMax)
  const zBottom = asNumber(sheet?.zMin)
  const top = partTop(features, feature)
  const walls = asNumber(sheet?.wallishArea)
  const floors = asNumber(sheet?.floorishArea)
  const cd =
    sheetFacts?.kind === 'Chamfer'
      ? sheetFacts.three?.cd
      : sheetFacts && 'cd' in sheetFacts
        ? sheetFacts.cd
        : undefined
  const cutter = asNumber(cd?.ignore.min)
  const diameter = sheetFacts?.kind === 'Hole' ? asNumber(sheetFacts.diameter) : null

  if (top !== null && zBottom !== null) {
    rows.push({
      key: 'depthBelowTop',
      label: 'Depth below top of part',
      ...length(top - zBottom),
      from: 'part top − zMin',
      note: 'the part top is the highest extendedZMax of any feature cut from this same direction',
    })
  }

  // `zMax`/`zMin` are coordinates along the machining direction, not depths,
  // which is why nothing shows them as themselves.
  if (zTop !== null && zBottom !== null) {
    rows.push({
      key: 'featureDepth',
      label: 'Feature depth',
      ...length(zTop - zBottom),
      from: 'zMax − zMin',
    })
  }

  // The largest tool that still reaches everywhere in the feature.
  //
  // The *bottom* of the cutter band, which is the terminal tool: anything wider
  // stops short of the tightest corner. The top of the band is the widest thing
  // that fits somewhere, which is a different and less useful question — on the
  // pocket that made this row, `ignore.min` of 6.616 is twice a corner Fusion
  // measures at 3.302.
  //
  // Every feature with a band has one, which is why this row exists at all: the
  // per-kind fields below are richer, and a hole is the only kind that carries
  // them.
  if (cutter !== null && cutter > 0) {
    rows.push({
      key: 'maxTool',
      label: 'Largest tool diameter',
      ...length(cutter),
      from: 'facts.cd.ignore.min',
      note: 'the widest cutter that still reaches the tightest corner',
    })
    // The same number as a radius, because that is the form a corner is drawn
    // and argued about in — and a rule about radii has to be given a radius.
    rows.push({
      key: 'minRadius',
      label: 'Required cutter radius',
      ...length(cutter / 2),
      from: 'facts.cd.ignore.min ÷ 2',
      note: 'half the tool above: the tightest internal radius this feature leaves room for',
    })
  }

  // Stated per kind where the Engine states them: a hole reports the drill and
  // the endmill it admits separately, and which of the two a shop reaches for
  // is the difference between one plunge and a helix.
  const endmill = sheetFacts?.kind === 'Hole' ? asNumber(sheetFacts.maxEndmillDiameter) : null
  if (endmill !== null && endmill > 0) {
    rows.push({
      key: 'maxEndmill',
      label: 'Largest endmill',
      ...length(endmill),
      from: 'facts.maxEndmillDiameter',
      note: 'the widest endmill the Engine says this feature admits',
    })
  }

  const drill = sheetFacts?.kind === 'Hole' ? asNumber(sheetFacts.maxDrillDiameter) : null
  if (drill !== null && drill > 0) {
    rows.push({
      key: 'maxDrill',
      label: 'Largest drill',
      ...length(drill),
      from: 'facts.maxDrillDiameter',
      note: 'the widest drill the Engine says this feature admits',
    })
  }

  // An undercut is defined by what gets in rather than by what fits once there,
  // so the Engine states the entry separately. A T-slot cutter goes in sideways
  // and cannot be backed out, which is why the opening is its own number.
  const entry = sheetFacts?.kind === 'Tslot' ? asNumber(sheetFacts.maxEntryCd) : null
  if (entry !== null && entry > 0) {
    rows.push({
      key: 'entryCutter',
      label: 'Largest tool that gets in',
      ...length(entry),
      from: 'facts.maxEntryCd',
      note: 'the widest cutter that reaches the undercut through its opening',
    })
  }

  // Reach over the widest tool the shape admits. A hole has its own, against
  // its diameter, because nothing wider than the bore goes in it.
  if (top !== null && zBottom !== null) {
    const reach = top - zBottom
    const drilling = diameter !== null && diameter > 0
    const across = drilling ? diameter : cutter

    if (across !== null && across > 0) {
      rows.push({
        key: 'ld',
        label: drilling ? 'Drilling L/D' : 'Milling L/D',
        value: (reach / across).toFixed(2),
        from: drilling
          ? '(part top − zMin) ÷ facts.diameter'
          : '(part top − zMin) ÷ facts.cd.ignore.min',
      })
    }
  }

  if (walls !== null || floors !== null) {
    rows.push({
      key: 'area',
      label: 'Surface area',
      ...area((walls ?? 0) + (floors ?? 0)),
      from: 'wallishArea + floorishArea',
    })
    rows.push({ key: 'walls', label: '  as walls', ...area(walls ?? 0), from: 'wallishArea' })
    rows.push({
      key: 'floors',
      label: '  as floors',
      ...area(floors ?? 0),
      from: 'floorishArea',
    })
  }

  const faces = facesBy(feature, regions)

  rows.push({
    key: 'faces',
    label: `Faces (${feature.regionIdxs.length})`,
    value: faces.map(([kind, count]) => `${count} × ${kind}`).join(', ') || '—',
    from: 'regionIdxs → regions[].shapeKind',
    note: 'the Engine classifies a face by its geometry; whether one is a wall or a floor is reported as area, not per face',
  })

  /* ---------------- and then whatever this type reports ---------------- */

  if (diameter !== null) {
    rows.push({
      key: 'diameter',
      label: 'Diameter',
      ...length(diameter),
      from: 'facts.diameter',
    })
  }

  const filletRadius =
    sheetFacts && 'filletRadius' in sheetFacts ? asNumber(sheetFacts.filletRadius) : null
  if (filletRadius !== null && filletRadius > 0) {
    rows.push({
      key: 'floorFillet',
      label: 'Floor fillet radius',
      ...length(filletRadius),
      from: 'facts.filletRadius',
    })
  }

  const angle = sheetFacts?.kind === 'Chamfer' ? asNumber(sheetFacts.bevel?.angleDeg) : null

  if (angle !== null) {
    rows.push({
      key: 'bevelAngle',
      label: 'Chamfer angle',
      value: `${angle.toFixed(1)}°`,
      from: 'facts.bevel.angleDeg',
    })
  }

  return rows
}

/** The handful worth reading before the table: the numbers a tool is chosen with. */
export const STRIP_KEYS = [
  'depthBelowTop',
  'featureDepth',
  'diameter',
  'maxEndmill',
  'maxTool',
  'minRadius',
  'ld',
  'area',
]

/** Shorter than the table's wording: these sit under a number, not beside one. */
export const STRIP_LABELS: Record<string, string> = {
  depthBelowTop: 'below top',
  featureDepth: 'deep',
  diameter: 'diameter',
  maxTool: 'largest tool ⌀',
  minRadius: 'cutter radius',
  maxEndmill: 'largest endmill',
  maxDrill: 'largest drill',
  ld: 'L/D',
  area: 'surface',
}

export const stripMeasurements = (rows: ReadonlyArray<Measurement>): Array<Measurement> => {
  return STRIP_KEYS.flatMap((key) => rows.filter((row) => row.key === key)).slice(0, 3)
}
