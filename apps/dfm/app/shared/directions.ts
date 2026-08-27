import type { Vec3 } from '@toolpath/api'

/**
 * Vector arithmetic on ways up.
 *
 * Unit-vector maths and one question about it — *is this direction square to an
 * axis* — kept apart from the plan so both can be read and tested without one.
 *
 * It was once much larger. A set of helpers for **saying** a direction the
 * Engine never offered — off a face normal, off a bore axis, tilted by an angle,
 * matched back to a candidate — was written for a way of naming orientations
 * that the app ended up not taking: a way up is chosen from the arrows on the
 * part, and `make-feature.ts` reads faces directly. Ten exports and their tests
 * sat here reachable only from `directions.test.ts`, which read as coverage of
 * the app and was coverage of nothing. They are in the history if that way of
 * naming a direction comes back.
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
  if (length < TINY) {
    return null
  }
  return { x: vec.x / length, y: vec.y / length, z: vec.z / length }
}

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

/** The angle between two directions, in degrees. */
export const angleBetween = (a: Vec3, b: Vec3): number => {
  const first = normalize(a)
  const second = normalize(b)
  if (!first || !second) {
    return Number.NaN
  }
  return (Math.acos(Math.min(1, Math.max(-1, dot(first, second)))) * 180) / Math.PI
}

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
