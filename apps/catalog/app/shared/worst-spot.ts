import type { Margins } from '@toolpath/catalog-data'

/**
 * Where on a feature the stack has the least clearance — worked out from the
 * part mesh, because the Engine's reach curve is a worst case over the whole
 * feature and does not say where on it that worst case lies.
 *
 * Paul (2026-08-30): the tool in the scene belongs at the spot the holder has
 * minimum clearance, axial or radial, whichever is worse — and nowhere else.
 *
 * The method is the sweep's, applied per candidate tip: every part triangle
 * near the feature contributes "material within `d` of the axis rises to
 * `h`", with `d` the exact distance from the tip to the triangle's footprint
 * in the floor plane and `h` its highest point above the feature's bottom.
 * Against the stack's steps (radius, height above the tip) that gives an
 * axial slack — a step over material — and a radial slack — a step beside
 * material taller than it — each less the room wanted. The candidate whose
 * worst slack is smallest is the spot. Candidates are the feature's floor
 * vertices and centroids (its edges are where walls are), capped so a fine
 * mesh does not cost a second.
 */
export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Step {
  /** Radius of this part of the stack, mm. */
  readonly r: number
  /** Where it begins above the tip, mm. */
  readonly z: number
}

export interface Range {
  readonly start: number
  readonly end: number
}

export interface WorstSpot {
  /** The tip, world mm: the candidate dropped to the feature's bottom. */
  readonly tip: readonly [number, number, number]
  /** The least slack there, mm; negative is a collision. */
  readonly slack: number
  readonly candidates: number
}

const normalize = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}

/** Two unit vectors spanning the plane across the direction. */
const basis = (dir: Vec3): [Vec3, Vec3] => {
  const seed: Vec3 = Math.abs(dir.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const u = normalize({
    x: seed.y * dir.z - seed.z * dir.y,
    y: seed.z * dir.x - seed.x * dir.z,
    z: seed.x * dir.y - seed.y * dir.x,
  })
  const v = {
    x: dir.y * u.z - dir.z * u.y,
    y: dir.z * u.x - dir.x * u.z,
    z: dir.x * u.y - dir.y * u.x,
  }
  return [u, v]
}

/** Distance from a point to a segment, in the plane. */
const toSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/** Distance from a point to a triangle's footprint, in the plane: zero inside it. */
const toTriangle = (px: number, py: number, t: Float64Array, at: number): number => {
  const ax = t[at]!,
    ay = t[at + 1]!,
    bx = t[at + 2]!,
    by = t[at + 3]!,
    cx = t[at + 4]!,
    cy = t[at + 5]!
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
  const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
  if (inside) {
    return 0
  }
  return Math.min(
    toSegment(px, py, ax, ay, bx, by),
    toSegment(px, py, bx, by, cx, cy),
    toSegment(px, py, cx, cy, ax, ay),
  )
}

/** Whether a point lies in a triangle, in the plane. */
const inTriangle = (px: number, py: number, t: ArrayLike<number>, at: number): boolean => {
  const ax = t[at]!,
    ay = t[at + 1]!,
    bx = t[at + 2]!,
    by = t[at + 3]!,
    cx = t[at + 4]!,
    cy = t[at + 5]!
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
  return (s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9) || (s1 <= 1e-9 && s2 <= 1e-9 && s3 <= 1e-9)
}

const MAX_CANDIDATES = 220

/**
 * Where the whole cutter fits on the feature's floor, and where it is
 * against a wall.
 *
 * The floor is the feature's triangles facing the way up, flattened. Its
 * boundary is every edge no second floor triangle shares. A candidate is a
 * point of the floor at least a cutting radius from that boundary — the
 * tool inside the feature, not astride its edge (Paul, 2026-08-30) — and
 * the ones that matter most are along the boundary offset inward by exactly
 * that radius: the cutter touching each wall, which is where a holder has
 * the least room. Those are sampled along every boundary edge; a coarse grid
 * over the floor covers the interior. A feature with no floor (a wall, a
 * profile) falls back to its vertices.
 */
const candidatesOn = (
  positions: ArrayLike<number>,
  feature: ReadonlyArray<Range>,
  dir: Vec3,
  u: Vec3,
  v: Vec3,
  cuttingRadius: number,
  triangleCount: number,
): Array<[number, number]> => {
  const flat = (x: number, y: number, z: number): [number, number] => [
    x * u.x + y * u.y + z * u.z,
    x * v.x + y * v.y + z * v.z,
  ]
  const floor: Array<number> = []
  const others: Array<[number, number]> = []
  for (const range of feature) {
    for (let tri = range.start; tri < Math.min(range.end, triangleCount); tri += 1) {
      const at = tri * 9
      const ax = positions[at]!,
        ay = positions[at + 1]!,
        az = positions[at + 2]!
      const bx = positions[at + 3]!,
        by = positions[at + 4]!,
        bz = positions[at + 5]!
      const cx = positions[at + 6]!,
        cy = positions[at + 7]!,
        cz = positions[at + 8]!
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      const twice = Math.hypot(nx, ny, nz)
      const a = flat(ax, ay, az),
        b = flat(bx, by, bz),
        c = flat(cx, cy, cz)
      if (twice > 0 && (nx * dir.x + ny * dir.y + nz * dir.z) / twice > 0.7) {
        floor.push(a[0], a[1], b[0], b[1], c[0], c[1])
      } else {
        others.push(a, b, c)
      }
    }
  }
  const floorCount = floor.length / 6
  if (floorCount === 0) {
    return others
  }

  // The boundary: edges seen once among the floor triangles, with the way in.
  const key = (x: number, y: number) => `${x.toFixed(4)},${y.toFixed(4)}`
  const seen = new Map<string, number>()
  const edges: Array<{ ax: number; ay: number; bx: number; by: number; inX: number; inY: number }> =
    []
  for (let i = 0; i < floorCount; i += 1) {
    const at = i * 6
    const corners = [
      [floor[at]!, floor[at + 1]!],
      [floor[at + 2]!, floor[at + 3]!],
      [floor[at + 4]!, floor[at + 5]!],
    ] as const
    for (let e = 0; e < 3; e += 1) {
      const a = corners[e]!,
        b = corners[(e + 1) % 3]!
      const k = [key(a[0], a[1]), key(b[0], b[1])].sort().join('|')
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
  }
  for (let i = 0; i < floorCount; i += 1) {
    const at = i * 6
    const corners = [
      [floor[at]!, floor[at + 1]!],
      [floor[at + 2]!, floor[at + 3]!],
      [floor[at + 4]!, floor[at + 5]!],
    ] as const
    for (let e = 0; e < 3; e += 1) {
      const a = corners[e]!,
        b = corners[(e + 1) % 3]!,
        c = corners[(e + 2) % 3]!
      const k = [key(a[0], a[1]), key(b[0], b[1])].sort().join('|')
      if (seen.get(k) !== 1) {
        continue
      }
      // The way in: across the edge, toward the triangle's third corner.
      const ex = b[0] - a[0],
        ey = b[1] - a[1]
      let inX = -ey,
        inY = ex
      if (inX * (c[0] - a[0]) + inY * (c[1] - a[1]) < 0) {
        inX = -inX
        inY = -inY
      }
      const n = Math.hypot(inX, inY) || 1
      edges.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], inX: inX / n, inY: inY / n })
    }
  }
  const onFloor = (x: number, y: number): boolean => {
    for (let i = 0; i < floorCount; i += 1) {
      if (inTriangle(x, y, floor, i * 6)) {
        return true
      }
    }
    return false
  }
  const toBoundary = (x: number, y: number): number => {
    let least = Number.POSITIVE_INFINITY
    for (const edge of edges) {
      least = Math.min(least, toSegment(x, y, edge.ax, edge.ay, edge.bx, edge.by))
    }
    return least
  }
  const fits = (x: number, y: number) => onFloor(x, y) && toBoundary(x, y) + 1e-6 >= cuttingRadius

  const found: Array<[number, number]> = []
  // Against every wall: along each boundary edge, a cutting radius in.
  const inset = cuttingRadius + 1e-3
  for (const edge of edges) {
    const length = Math.hypot(edge.bx - edge.ax, edge.by - edge.ay)
    const samples = Math.max(1, Math.min(12, Math.ceil(length / Math.max(cuttingRadius, 0.5))))
    for (let i = 0; i <= samples; i += 1) {
      const t = samples === 0 ? 0.5 : i / samples
      const x = edge.ax + (edge.bx - edge.ax) * t + edge.inX * inset
      const y = edge.ay + (edge.by - edge.ay) * t + edge.inY * inset
      if (fits(x, y)) {
        found.push([x, y])
      }
    }
  }
  // The interior: a coarse grid over the floor.
  let minX = Number.POSITIVE_INFINITY,
    maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY
  for (let i = 0; i < floor.length; i += 2) {
    minX = Math.min(minX, floor[i]!)
    maxX = Math.max(maxX, floor[i]!)
    minY = Math.min(minY, floor[i + 1]!)
    maxY = Math.max(maxY, floor[i + 1]!)
  }
  const spacing = Math.max(cuttingRadius, Math.max(maxX - minX, maxY - minY) / 14)
  for (let x = minX + spacing / 2; x < maxX; x += spacing) {
    for (let y = minY + spacing / 2; y < maxY; y += spacing) {
      if (fits(x, y)) {
        found.push([x, y])
      }
    }
  }
  if (found.length === 0) {
    // Nowhere the whole cutter fits: the floor's centre, as the least wrong place.
    let sx = 0,
      sy = 0
    for (let i = 0; i < floor.length; i += 2) {
      sx += floor[i]!
      sy += floor[i + 1]!
    }
    return [[sx / (floor.length / 2), sy / (floor.length / 2)]]
  }
  return found
}

export const worstSpot = (
  positions: ArrayLike<number>,
  feature: ReadonlyArray<Range>,
  direction: Vec3,
  bottom: number,
  steps: ReadonlyArray<Step>,
  margins: Margins,
  cuttingRadius = 0,
): WorstSpot | null => {
  const dir = normalize(direction)
  const [u, v] = basis(dir)
  const triangleCount = Math.floor(positions.length / 9)
  if (steps.length === 0 || triangleCount === 0) {
    return null
  }
  const reach = Math.max(...steps.map((step) => step.r)) + margins.radial

  const raw = candidatesOn(positions, feature, dir, u, v, cuttingRadius, triangleCount)
  if (raw.length === 0) {
    return null
  }
  const stride = Math.max(1, Math.ceil(raw.length / MAX_CANDIDATES))
  const candidates = raw.filter((_, index) => index % stride === 0)

  // The part near the feature: each triangle's footprint and its top above the bottom.
  let minU = Number.POSITIVE_INFINITY,
    maxU = Number.NEGATIVE_INFINITY
  let minV = Number.POSITIVE_INFINITY,
    maxV = Number.NEGATIVE_INFINITY
  for (const [cu, cv] of candidates) {
    minU = Math.min(minU, cu)
    maxU = Math.max(maxU, cu)
    minV = Math.min(minV, cv)
    maxV = Math.max(maxV, cv)
  }
  const footprints: Array<number> = []
  const tops: Array<number> = []
  for (let tri = 0; tri < triangleCount; tri += 1) {
    const at = tri * 9
    let top = Number.NEGATIVE_INFINITY
    let near = false
    const flat: Array<number> = []
    for (let corner = 0; corner < 3; corner += 1) {
      const x = positions[at + corner * 3]!,
        y = positions[at + corner * 3 + 1]!,
        z = positions[at + corner * 3 + 2]!
      const h = x * dir.x + y * dir.y + z * dir.z - bottom
      top = Math.max(top, h)
      const fu = x * u.x + y * u.y + z * u.z
      const fv = x * v.x + y * v.y + z * v.z
      flat.push(fu, fv)
      if (fu >= minU - reach && fu <= maxU + reach && fv >= minV - reach && fv <= maxV + reach) {
        near = true
      }
    }
    if (top <= 1e-6 || !near) {
      continue
    }
    footprints.push(...flat)
    tops.push(top)
  }
  const flat = Float64Array.from(footprints)

  let best: { index: number; slack: number } | null = null
  for (let c = 0; c < candidates.length; c += 1) {
    const [pu, pv] = candidates[c]!
    let slack = Number.POSITIVE_INFINITY
    for (let i = 0; i < tops.length; i += 1) {
      const h = tops[i]!
      const d = toTriangle(pu, pv, flat, i * 6)
      for (const step of steps) {
        if (d <= step.r + margins.radial) {
          slack = Math.min(slack, step.z - h - margins.axial)
        } else if (h > step.z) {
          slack = Math.min(slack, d - step.r - margins.radial)
        }
      }
    }
    if (best === null || slack < best.slack) {
      best = { index: c, slack }
    }
  }
  if (best === null) {
    return null
  }
  const [pu, pv] = candidates[best.index]!
  const tip: readonly [number, number, number] = [
    u.x * pu + v.x * pv + dir.x * bottom,
    u.y * pu + v.y * pv + dir.y * bottom,
    u.z * pu + v.z * pv + dir.z * bottom,
  ]
  return { tip, slack: best.slack, candidates: candidates.length }
}
