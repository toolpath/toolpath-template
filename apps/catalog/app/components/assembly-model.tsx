import { useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Mesh, Quaternion, Vector2, Vector3, type BufferAttribute, type Object3D } from 'three'
import { REGION_ATTRIBUTE } from '@toolpath/viewer'
import {
  assemblyOutline,
  type Assembly,
  type Margins,
  type OutlinePart,
} from '@toolpath/catalog-data'
import { worstSpot, type Step } from 'shared/worst-spot'

/**
 * The assembly in the 3D viewer, standing in the feature.
 *
 * Paul's "something really crazy" (2026-08-30): the stack the drawing shows,
 * as a body of revolution in the scene, at the one place that matters — where
 * the holder has the least clearance on this part, axial or radial, whichever
 * is worse — not wherever the part was clicked, and not movable. The reach
 * curve is a worst case over the feature and does not say where on it that
 * worst case lies, so `worstSpot` finds it from the mesh: the stack's own
 * steps swept against the part at every candidate tip on the feature's
 * floor. The tip is at the feature's bottom (`zMin`) along the machining
 * direction; the floor's centre is the fallback when nothing can be swept.
 *
 * Every segment is the drawing's own outline lathed — the same numbers, what
 * collides painted red. Flat colours, no lighting gradient: solid greys,
 * darker than the part but lighter than the drawing's (Paul's call).
 *
 * The scene is millimetres, as the outline is; a lathe revolves its profile
 * about +Y, so the group turns +Y onto the machining direction.
 */
export interface AssemblyPlacement {
  readonly assembly: Assembly
  /** The way up the feature is cut from: the tool's axis, tip to spindle. */
  readonly direction: { readonly x: number; readonly y: number; readonly z: number }
  /** The feature's bottom along that direction — the datasheet's `zMin`, mm. */
  readonly bottom: number
  /** The feature's regions as triangle ranges into the part mesh, `[start, end)`. */
  readonly triangles: ReadonlyArray<{ readonly start: number; readonly end: number }>
  /** The parts the sweep reports colliding, painted. */
  readonly hit: ReadonlySet<OutlinePart>
  /** The room wanted, as the sweep keeps it. */
  readonly margins: Margins
}

const SWEPT: ReadonlySet<OutlinePart> = new Set<OutlinePart>([
  'neck',
  'shank',
  'collet',
  'nose',
  'body',
  'flange',
])

/** The stack's steps above the flutes, as the sweep sees them: every outline point's radius and height. */
export const sweptSteps = (assembly: Assembly): Array<Step> =>
  assemblyOutline(assembly).segments.flatMap((segment) =>
    SWEPT.has(segment.part) ? segment.points.map((point) => ({ r: point.r, z: point.z })) : [],
  )

const COLOR: Record<OutlinePart, string> = {
  tip: '#efe3a3',
  flutes: '#efe3a3',
  neck: '#a7abb3',
  shank: '#b9bdc4',
  collet: '#8d929b',
  nose: '#8d929b',
  body: '#8d929b',
  flange: '#767b84',
}
const HIT = '#ef4444'

export interface LatheProfile {
  readonly part: OutlinePart
  /** (radius, height) pairs, bottom to top, closed onto the axis at both ends. */
  readonly points: ReadonlyArray<readonly [number, number]>
  readonly color: string
}

/** The drawing's segments as lathe profiles: each closed onto the axis so it revolves into a solid. */
export const latheProfiles = (
  assembly: Assembly,
  hit: ReadonlySet<OutlinePart>,
): Array<LatheProfile> =>
  assemblyOutline(assembly).segments.flatMap((segment) => {
    const points = [...segment.points].sort((a, b) => a.z - b.z)
    const first = points[0]
    const last = points[points.length - 1]
    if (!first || !last || first.z === last.z) {
      return []
    }
    return [
      {
        part: segment.part,
        points: [
          [0, first.z] as const,
          ...points.map((point) => [point.r, point.z] as const),
          [0, last.z] as const,
        ],
        color: hit.has(segment.part) ? HIT : COLOR[segment.part],
      },
    ]
  })

/**
 * Where on the feature the stack stands: the area-weighted centre of its
 * floor — the triangles facing the way up — or of all its triangles where
 * nothing does. Pure over a non-indexed position buffer, so it can be tested.
 */
export const featureAnchor = (
  positions: ArrayLike<number>,
  triangles: ReadonlyArray<{ readonly start: number; readonly end: number }>,
  direction: { readonly x: number; readonly y: number; readonly z: number },
): readonly [number, number, number] | null => {
  const floor = { area: 0, x: 0, y: 0, z: 0 }
  const all = { area: 0, x: 0, y: 0, z: 0 }
  for (const range of triangles) {
    for (let triangle = range.start; triangle < range.end; triangle += 1) {
      const at = triangle * 9
      if (at + 8 >= positions.length) {
        break
      }
      const ax = positions[at]!,
        ay = positions[at + 1]!,
        az = positions[at + 2]!
      const bx = positions[at + 3]!,
        by = positions[at + 4]!,
        bz = positions[at + 5]!
      const cx = positions[at + 6]!,
        cy = positions[at + 7]!,
        cz = positions[at + 8]!
      // Twice the area, as the cross product's length; its direction is the normal.
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      const twice = Math.hypot(nx, ny, nz)
      if (twice === 0) {
        continue
      }
      const facing = (nx * direction.x + ny * direction.y + nz * direction.z) / twice
      const mx = (ax + bx + cx) / 3,
        my = (ay + by + cy) / 3,
        mz = (az + bz + cz) / 3
      all.area += twice
      all.x += mx * twice
      all.y += my * twice
      all.z += mz * twice
      if (facing > 0.7) {
        floor.area += twice
        floor.x += mx * twice
        floor.y += my * twice
        floor.z += mz * twice
      }
    }
  }
  const from = floor.area > 0 ? floor : all
  return from.area > 0 ? [from.x / from.area, from.y / from.area, from.z / from.area] : null
}

/** The tip: the anchor dropped to the feature's bottom along the way up. */
export const tipAt = (
  anchor: readonly [number, number, number],
  direction: { readonly x: number; readonly y: number; readonly z: number },
  bottom: number,
): readonly [number, number, number] => {
  const along = anchor[0] * direction.x + anchor[1] * direction.y + anchor[2] * direction.z
  const drop = bottom - along
  return [
    anchor[0] + direction.x * drop,
    anchor[1] + direction.y * drop,
    anchor[2] + direction.z * drop,
  ]
}

/** The part mesh in the scene: the one geometry carrying the viewer's region attribute. */
const partMeshIn = (root: Object3D): Mesh | null => {
  let found: Mesh | null = null
  root.traverse((object) => {
    if (
      found === null &&
      object instanceof Mesh &&
      object.geometry.getAttribute(REGION_ATTRIBUTE)
    ) {
      found = object
    }
  })
  return found
}

const UP = new Vector3(0, 1, 0)

export const AssemblyModel = ({
  assembly,
  direction,
  bottom,
  triangles,
  hit,
  margins,
}: AssemblyPlacement) => {
  const scene = useThree((state) => state.scene)
  const [tip, setTip] = useState<readonly [number, number, number] | null>(null)
  const steps = useMemo(() => sweptSteps(assembly), [assembly])
  const key = `${triangles.map((each) => `${String(each.start)}-${String(each.end)}`).join(',')}|${String(bottom)}|${steps.map((step) => `${step.r.toFixed(3)}:${step.z.toFixed(3)}`).join(',')}|${String(margins.radial)}|${String(margins.axial)}`
  const [placedFor, setPlacedFor] = useState<string | null>(null)

  // The mesh arrives when it arrives: look for it each frame until it is there, then stop.
  useFrame(() => {
    if (placedFor === key) {
      return
    }
    const mesh = partMeshIn(scene)
    if (!mesh) {
      return
    }
    const attribute = mesh.geometry.getAttribute('position') as BufferAttribute | undefined
    const worst = attribute
      ? worstSpot(
          attribute.array,
          triangles,
          direction,
          bottom,
          steps,
          margins,
          (assembly.tool.geometry.DC ?? 0) / 2,
        )
      : null
    if (worst) {
      setTip(worst.tip)
    } else {
      const anchor = attribute ? featureAnchor(attribute.array, triangles, direction) : null
      setTip(anchor ? tipAt(anchor, direction, bottom) : null)
    }
    setPlacedFor(key)
  })

  const profiles = useMemo(() => latheProfiles(assembly, hit), [assembly, hit])
  const quaternion = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(
        UP,
        new Vector3(direction.x, direction.y, direction.z).normalize(),
      ),
    [direction],
  )
  const lathes = useMemo(
    () =>
      profiles.map((profile) => ({
        ...profile,
        vectors: profile.points.map(([r, z]) => new Vector2(r, z)),
      })),
    [profiles],
  )
  if (tip === null) {
    return null
  }
  return (
    <group position={[tip[0], tip[1], tip[2]]} quaternion={quaternion}>
      {lathes.map((lathe, index) => (
        <mesh key={`${lathe.part}-${String(index)}`}>
          <latheGeometry args={[lathe.vectors, 48]} />
          <meshBasicMaterial color={lathe.color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
