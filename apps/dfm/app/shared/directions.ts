import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey } from './report'

/**
 * Naming a way up that the Engine did not offer.
 *
 * The Engine reports the directions it found features from, and those are the
 * ones a plan usually argues about. But a shop knows orientations the analysis
 * has no reason to propose: the way the part sits in soft jaws, the tilt that
 * brings a bore square to the spindle, five degrees off an axis because that is
 * where the fixture puts it.
 *
 * So a direction can also be **said**, and there are three ways people say one:
 *
 * - *Like that one* — an orientation already on the part, picked off its arrow.
 * - *Square to that* — a face whose normal is the way in, a bore whose axis is,
 *   an edge that runs along it.
 * - *That, but tilted* — any of the above, turned by an angle.
 *
 * Everything here is vector arithmetic on unit vectors, kept apart from the
 * plan so it can be read and tested without one.
 */

/** Below this a vector is noise rather than a direction. */
const TINY = 1e-6

/**
 * How close two directions have to be to count as the same way up.
 *
 * A degree, near enough. Tighter and a direction taken off a face normal never
 * matches the candidate it plainly is — meshed normals carry rounding, and the
 * Engine's own vectors are rounded when they are printed. Looser and two
 * genuinely different five-axis orientations collapse into one.
 */
export const SAME_DIRECTION_DEGREES = 1

export const lengthOf = ({ x, y, z }: Vec3): number => Math.sqrt(x * x + y * y + z * z)

export const normalize = (vec: Vec3): Vec3 | null => {
  const length = lengthOf(vec)
  if (length < TINY) return null
  return { x: vec.x / length, y: vec.y / length, z: vec.z / length }
}

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

/** The angle between two directions, in degrees. */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const first = normalize(a)
  const second = normalize(b)
  if (!first || !second) return Number.NaN
  return (Math.acos(Math.min(1, Math.max(-1, dot(first, second)))) * 180) / Math.PI
}

/**
 * The way a tool approaches a face, from the face itself.
 *
 * A face's outward normal *is* the direction a cutter comes down it, so
 * "perpendicular face" and "approach direction" are the same vector — which is
 * why picking a face is the most direct way to say a way up.
 */
export const fromFaceNormal = (normal: Vec3): Vec3 | null => normalize(normal)

/**
 * The way up an edge or a bore names.
 *
 * An axis has no sense to it — a bore's centreline points both ways — so this
 * takes the one closest to a reference, which is the direction the person is
 * already looking from. Without that, half the picks would name the way up
 * *into* the part.
 */
export const fromAxis = (axis: Vec3, towards?: Vec3): Vec3 | null => {
  const unit = normalize(axis)
  if (!unit || !towards) return unit
  return dot(unit, towards) < 0 ? { x: -unit.x, y: -unit.y, z: -unit.z } : unit
}

/**
 * A feature's own axis, where it has one worth naming.
 *
 * Holes are the case this exists for: "square to that bore" is how a machinist
 * describes an orientation without knowing a single number about it.
 *
 * The Engine's schema types `axis` as always present, but a feature with no
 * natural axis reports it as null on the wire — so this guards anyway rather
 * than trusting the type.
 */
export const axisOf = (feature: PartFeature): Vec3 | null =>
  feature.axis ? normalize(feature.axis) : null

/**
 * Some direction at right angles to this one.
 *
 * Any will do — it exists to be the hinge an angle turns about, and which one
 * it is only decides whether "10 degrees" tilts left or forward. Picked off
 * whichever world axis this direction is *least* aligned with, so the cross
 * product is never near zero and the result never degenerate.
 */
export const perpendicularTo = (direction: Vec3): Vec3 => {
  const unit = normalize(direction) ?? { x: 0, y: 0, z: 1 }
  let away: Vec3
  if (Math.abs(unit.x) <= Math.abs(unit.y) && Math.abs(unit.x) <= Math.abs(unit.z)) {
    away = { x: 1, y: 0, z: 0 }
  } else if (Math.abs(unit.y) <= Math.abs(unit.z)) {
    away = { x: 0, y: 1, z: 0 }
  } else {
    away = { x: 0, y: 0, z: 1 }
  }
  return normalize(cross(unit, away)) ?? { x: 1, y: 0, z: 0 }
}

/**
 * The same direction, turned by an angle about an axis.
 *
 * Rodrigues' rotation, which is the short way to say "spin this vector around
 * that one". The hinge defaults to something perpendicular, so entering an
 * angle with nothing else said tilts away from where you started rather than
 * spinning on the spot and doing nothing.
 */
export const rotatedBy = (direction: Vec3, degrees: number, about?: Vec3): Vec3 | null => {
  const unit = normalize(direction)
  if (!unit) return null

  const hinge = normalize(about ?? perpendicularTo(unit))
  if (!hinge) return unit

  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const scaled = dot(hinge, unit) * (1 - cos)
  const perp = cross(hinge, unit)

  return normalize({
    x: unit.x * cos + perp.x * sin + hinge.x * scaled,
    y: unit.y * cos + perp.y * sin + hinge.y * scaled,
    z: unit.z * cos + perp.z * sin + hinge.z * scaled,
  })
}

/** A tilt about each world axis, in degrees. */
export interface Tilt {
  x: number
  y: number
  z: number
}

export const NO_TILT: Tilt = { x: 0, y: 0, z: 0 }

/**
 * A direction turned about each world axis in turn.
 *
 * Three numbers rather than one, because that is how a fixture is described:
 * "square to +Z, tipped ten degrees toward the front". Applied X then Y then Z,
 * and stated here because rotations do not commute — the same three numbers in
 * another order are a different direction, and somebody dragging a handle needs
 * the one they drag to be the one that moves.
 */
export const tilted = (direction: Vec3, tilt: Tilt): Vec3 | null => {
  let turned: Vec3 | null = normalize(direction)

  for (const [degrees, about] of [
    [tilt.x, { x: 1, y: 0, z: 0 }],
    [tilt.y, { x: 0, y: 1, z: 0 }],
    [tilt.z, { x: 0, y: 0, z: 1 }],
  ] as const) {
    if (turned && degrees !== 0) {
      turned = rotatedBy(turned, degrees, about)
    }
  }

  return turned
}

/**
 * Which candidate direction this is, if it is one of them.
 *
 * The question that decides whether a said direction has any work in it. The
 * Engine reports features per direction, so a direction it never considered has
 * **no readings at all** — nothing to assign, nothing to infer. Matching a said
 * direction back to a candidate is what turns "square to that bore" into an
 * ordinary way up with features in it.
 */
export const matchingCandidate = (
  candidates: ReadonlyArray<Vec3>,
  direction: Vec3,
  within = SAME_DIRECTION_DEGREES,
): number | null => {
  let best: { index: number; angle: number } | null = null

  for (const [index, candidate] of candidates.entries()) {
    const angle = angleBetween(candidate, direction)
    if (!Number.isNaN(angle) && angle <= within && (!best || angle < best.angle)) {
      best = { index, angle }
    }
  }

  return best?.index ?? null
}

/** Whether a direction is already held, so the same way up is never bought twice. */
export const alreadyHeld = (held: ReadonlyArray<Vec3>, direction: Vec3): boolean =>
  held.some((existing) => directionKey(existing) === directionKey(direction)) ||
  matchingCandidate(held, direction) !== null

/**
 * Whether a way up is one of the six ordinary ones — ±X, ±Y, ±Z.
 *
 * An axis-aligned direction is a part sitting square in the vice, which is what
 * a three-axis machine does and what most shops reach for first. Anything else
 * wants a fifth axis or a fixture built for it: a real answer, and a more
 * expensive one, so it should not be what a click lands on before anybody has
 * asked for it.
 *
 * Judged with the same tolerance two directions are called the same way up
 * with, because a normal read off a mesh and a vector the Engine rounded when
 * printing are both a degree or so away from the axis they plainly are.
 */
export const isAxisAligned = (direction: Vec3, within = SAME_DIRECTION_DEGREES): boolean =>
  [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ].some((axis) => {
    const angle = angleBetween(axis, direction)
    return !Number.isNaN(angle) && angle <= within
  })
