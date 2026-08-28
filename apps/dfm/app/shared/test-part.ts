import type { PartFeature, PartReport, PublicInspectionReport } from './contracts'

/**
 * A part built the way this app's other tests build one — by hand, in the
 * Engine's own wire shape.
 *
 * Deliberately not a captured report from anywhere else. The plan model is being
 * recreated here against *this* app's `PartReport`, so its fixtures are this
 * app's too: a report from another codebase would be testing that codebase's
 * normalisation as much as this one's arithmetic.
 *
 * Six faces of 100 mm² — six hundred all told, so a share is readable by eye.
 * Four ways up, and **region 2 is reachable from three of them**, which is the
 * ambiguity the whole mapping exists to resolve: an arrangement that took every
 * reading of it would machine that one face three times.
 */
const UP = { x: 0, y: 0, z: 1 }
const DOWN = { x: 0, y: 0, z: -1 }
const LEFT = { x: 0, y: 1, z: 0 }
const RIGHT = { x: 0, y: -1, z: 0 }

export const TEST_DIRECTIONS = [UP, DOWN, LEFT, RIGHT]

export const testFeature = (
  featureTag: string,
  featureType: string,
  machiningDirection: { x: number; y: number; z: number },
  regionIdxs: Array<number>,
): PartFeature =>
  ({
    featureTag,
    featureType,
    machiningDirection,
    axis: machiningDirection,
    regionIdxs,
    datasheet: null,
  }) as unknown as PartFeature

export const testPart = (): PartReport =>
  ({
    partId: 'part-under-test',
    reportId: 'report-1',
    jobId: 'job-1',
    kernelVersion: 'test',
    units: { length: 'mm', angle: 'deg' },
    regions: [0, 1, 2, 3, 4, 5].map((idx) => ({
      idx,
      splitOrigin: 0,
      shapeKind: 'Plane',
      area: 100,
      triangleStart: idx * 2,
      triangleEnd: idx * 2 + 2,
    })),
    candidateDirections: TEST_DIRECTIONS,
    directionZBounds: null,
    meshPointCount: 8,
    meshTriangleCount: 12,
    thumbnailUrl: null,
    meshStlUrl: null,
    meshGlbUrl: null,
    downloadMs: 1,
    recognitionMs: 1,
    enrichmentMs: 1,
    totalMs: 3,
    features: [
      testFeature('up-face', 'face', UP, [0]),
      testFeature('up-wall', 'wall', UP, [2, 3]),
      testFeature('down-face', 'face', DOWN, [1]),
      testFeature('down-profile', 'profile', DOWN, [2, 3, 4, 5]),
      testFeature('left-wall', 'wall', LEFT, [2]),
      testFeature('left-profile', 'profile', LEFT, [0, 2]),
      testFeature('right-wall', 'wall', RIGHT, [3]),
      testFeature('right-profile', 'profile', RIGHT, [1, 3]),
    ],
  }) as unknown as PartReport

/**
 * The same part as the page sees it, with the artifact URLs already taken off.
 *
 * `testPart` is the Engine's report; this is what the server hands the browser
 * — a `PublicInspectionReport`, which is the type every panel is now given
 * through context. Tests used to build one inline as `{ ...testPart(), features }`
 * and were only accepted because each panel asked for a structural subset of
 * its own.
 */
export const testReport = (features?: ReadonlyArray<PartFeature>): PublicInspectionReport => {
  const { meshGlbUrl, meshStlUrl, thumbnailUrl, ...rest } = testPart()

  return {
    ...rest,
    ...(features ? { features: [...features] } : {}),
    hasMeshGlb: false,
    hasMeshStl: false,
    hasThumbnail: false,
  }
}
