import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { EXCLUDE_FROM_FRAME } from '@toolpath/viewer'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, Vector3, type BufferGeometry, type Group, type Mesh } from 'three'

/** Served from `public/`. 746 KB, positions and indices only. */
const BANANA_URL = '/banana.glb'

/** Ripe, and not so saturated it competes with the direction colours. */
const SKIN = '#e8b530'

/** A tenth of the part's reach, so it stands clear without drifting off screen. */
const GAP = 0.1

/**
 * A banana, beside the part, for scale.
 *
 * The part fills the viewport whatever its size, so nothing on screen says
 * whether it is a bracket or a keyway — and the grid answers in numbers
 * somebody has to stop and read. This answers at a glance, which is the whole
 * reason the joke has outlived every attempt to replace it with a legend.
 *
 * Scene furniture, like the grid, and flagged the same way — because the same
 * flag does two jobs. It keeps the camera off it, and it keeps it out of
 * `useContentBox`, which is what the direction arrows are placed against: a
 * banana in that box pushes every arrow out around a part-and-banana it is not
 * pointing at. Arrows belong to the part, whatever else is on screen.
 *
 * But the banana is half of a comparison, and one with a side off screen is no
 * comparison — so rather than dropping the flag, it hands out the bounds of
 * *both* and the viewer is asked to frame those explicitly.
 *
 * The mesh carries no normals — dropping them is most of why the file is 746 KB
 * rather than 6.3 MB — so they are computed here, which is smooth, which is
 * what a banana wants anyway.
 */
export const Banana = ({ onPlaced }: { onPlaced?: (both: Box3) => void }) => {
  const scene = useThree((state) => state.scene)
  const gltf = useGLTF(BANANA_URL)
  const group = useRef<Group>(null)

  const geometry = useMemo(() => {
    let found: BufferGeometry | null = null

    gltf.scene.traverse((object) => {
      const mesh = object as Mesh
      if (found === null && mesh.isMesh) {
        found = mesh.geometry
      }
    })

    if (found === null) {
      return null
    }

    const own = (found as BufferGeometry).clone()
    own.computeVertexNormals()
    /*
     * Modelled standing on end, curve in the XZ plane: 92.7 long-ways across
     * the bend, 31.2 thick, 154.4 tall. Two turns lay it down — length along X
     * and the bend flat on the ground — so it reads as a banana next to a thing
     * rather than a yellow arch over it.
     */
    own.rotateY(Math.PI / 2)
    own.rotateX(Math.PI / 2)
    own.computeBoundingBox()

    return own
  }, [gltf])

  /*
   * Stood beside whatever else is in the scene, on the same ground.
   *
   * Measured off the scene rather than off the report, because the report says
   * nothing about the part's size — `useRules` is called without a bounding box
   * — and because the mesh on screen is the thing being compared against.
   *
   * The banana is skipped by node rather than by the frame flag, because it is
   * no longer carrying one: measuring itself would have it walk a little
   * further out every time anything re-ran.
   */
  useLayoutEffect(() => {
    const node = group.current
    if (!node || !geometry?.boundingBox) {
      return
    }

    node.userData[EXCLUDE_FROM_FRAME] = true
    node.position.set(0, 0, 0)

    const part = new Box3()
    scene.updateWorldMatrix(true, true)
    scene.traverse((object) => {
      if (object.userData[EXCLUDE_FROM_FRAME]) {
        return
      }
      let ancestor = object.parent
      while (ancestor && ancestor !== scene) {
        if (ancestor.userData[EXCLUDE_FROM_FRAME]) {
          return
        }
        ancestor = ancestor.parent
      }
      if ('isMesh' in object) {
        part.expandByObject(object)
      }
    })

    if (part.isEmpty()) {
      return
    }

    const size = part.getSize(new Vector3())
    const own = geometry.boundingBox
    const reach = Math.max(size.x, size.y, size.z)

    node.position.set(
      part.max.x + reach * GAP - own.min.x,
      part.getCenter(new Vector3()).y - (own.min.y + own.max.y) / 2,
      part.min.z - own.min.z,
    )

    /*
     * The two of them together, for the caller to frame.
     *
     * Worked out here because this is the only place that knows where the
     * banana ended up, and handed over rather than acted on because framing is
     * the viewer's to do.
     */
    node.updateWorldMatrix(true, true)
    onPlaced?.(part.clone().union(new Box3().setFromObject(node)))
  }, [scene, geometry, onPlaced])

  if (!geometry) {
    return null
  }

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={SKIN} roughness={0.85} metalness={0} />
      </mesh>
    </group>
  )
}

/*
 * Deliberately not preloaded.
 *
 * `useGLTF.preload` at module scope fetches 746 KB on every page load, for a
 * thing that is off by default and that most sessions never turn on. It arrives
 * when somebody asks for it, behind a Suspense boundary with no fallback, so
 * the wait costs nothing but the banana.
 */
