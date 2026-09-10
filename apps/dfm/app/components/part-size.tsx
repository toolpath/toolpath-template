import {
  convertLength,
  decimalsFor,
  UNIT_ABBREVIATION,
  type UnitSystem,
} from '@toolpath/tool-support'
import { useContentBox } from '@toolpath/viewer'
import { useEffect } from 'react'
import { Vector3, type Box3 } from 'three'

/**
 * The part's own size, measured off the mesh and handed out.
 *
 * The report says nothing about how big the part is — it describes features,
 * not stock — so the only honest source is the geometry on screen. `useContentBox`
 * is the viewer's own measurement, taken on a frame rather than an effect
 * because a Suspense-loaded mesh does not exist when the effects around it run,
 * and it already skips scene furniture: the grid and the banana do not count
 * toward how big the part is.
 */
export const PartSize = ({ onMeasured }: { onMeasured: (box: Box3) => void }) => {
  const box = useContentBox()

  useEffect(() => {
    if (!box.isEmpty()) {
      onMeasured(box)
    }
  }, [box, onMeasured])

  return null
}

/**
 * Three sides, largest first.
 *
 * Sorted rather than kept as X, Y and Z, because how the part happened to be
 * drawn is not a fact about the part — the same reasoning the machine envelope
 * is matched largest against largest.
 */
export const sidesOf = (box: Box3): [number, number, number] => {
  const size = box.getSize(new Vector3())

  return [size.x, size.y, size.z].sort((a, b) => b - a) as [number, number, number]
}

/** `50.8 × 50.8 × 25.4 mm`, in whichever unit is being read. */
export const formatSides = (sides: ReadonlyArray<number>, unit: UnitSystem): string =>
  `${sides
    .map((side) => convertLength(side, 'millimeters', unit).toFixed(decimalsFor(unit)))
    .join(' × ')} ${UNIT_ABBREVIATION[unit]}`
