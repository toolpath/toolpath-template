/**
 * Which way up a feature is cut, in a machinist's words.
 *
 * The report states a machining direction as a unit vector, and a table saying
 * `(0, 0, 1)` says nothing at a glance. The six axis directions get their own
 * names; anything else is a compound one nobody has a short name for, so it is
 * printed as the vector it is rather than as a name this invented (Paul,
 * 2026-09-01).
 */
export interface WayUp {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** How close to an axis a direction has to be to be called by its name. */
const ON_AXIS = 1e-6

export const wayUpLabel = (direction: WayUp | null): string => {
  if (direction === null) {
    return '—'
  }
  const { x, y, z } = direction
  const axes: ReadonlyArray<[number, string]> = [
    [x, 'X'],
    [y, 'Y'],
    [z, 'Z'],
  ]
  const along = axes.filter(([value]) => Math.abs(value) > ON_AXIS)
  const first = along[0]
  if (along.length === 1 && first !== undefined && Math.abs(Math.abs(first[0]) - 1) < ON_AXIS) {
    return `${first[0] > 0 ? '+' : '−'}${first[1]}`
  }
  const round = (value: number) => (Math.abs(value) < ON_AXIS ? 0 : Math.round(value * 100) / 100)
  return `${String(round(x))}, ${String(round(y))}, ${String(round(z))}`
}
