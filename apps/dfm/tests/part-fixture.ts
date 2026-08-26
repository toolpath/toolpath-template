import type { Page } from '@playwright/test'

/**
 * A part served straight to the inspector, without the upload flow.
 *
 * The specs that exercise **mapping** all want the same thing: a report on
 * screen, built by hand, with no mesh. Reaching it through upload is three
 * round trips of setup before the first assertion, and every spec that wrote its
 * own copy of this route handler wrote the same twenty lines.
 *
 * The upload and connection specs deliberately do **not** use this — they are
 * testing the path this skips.
 */

export const UP = { x: 0, y: 0, z: 1 }
export const DOWN = { x: 0, y: 0, z: -1 }
export const SIDE = { x: 0, y: -1, z: 0 }

export type Direction = { x: number; y: number; z: number }

/**
 * A feature in the Engine's wire shape.
 *
 * Built by hand rather than captured: the data is this app's, and a foreign
 * report tests another codebase's normalisation too (F15).
 */
export const feature = (
  featureTag: string,
  featureType: string,
  machiningDirection: Direction,
  regionIdxs: Array<number>,
  facts: Record<string, unknown> = { kind: 'Pocket' },
) => ({
  featureTag,
  featureType,
  machiningDirection,
  axis: machiningDirection,
  regionIdxs,
  datasheet: {
    featureType,
    facts,
    zMin: -10,
    zMax: 0,
    extendedZMin: -10,
    extendedZMax: 0,
    radialStockToLeave: 0,
    axialStockToLeave: 0,
    toleranceBand: { atolIgnore: 0, atolDeviate: 0, atolMax: 0 },
    hasFloor: true,
    hasWall: true,
    floorishArea: 0,
    wallishArea: 0,
  },
})

/**
 * A hole, which is the one feature type the app groups.
 *
 * The three things that make two holes the same job: the way up, the diameter
 * and the depth. `depth` is the whole of `zMax - zMin`, so two holes differing
 * only in it are two rows.
 */
export const hole = (
  featureTag: string,
  machiningDirection: Direction,
  regionIdxs: Array<number>,
  { diameter = 6.35, depth = 10 }: { diameter?: number; depth?: number } = {},
) => ({
  ...feature(featureTag, 'blind_hole', machiningDirection, regionIdxs, {
    kind: 'Hole',
    diameter,
  }),
  datasheet: {
    featureType: 'blind_hole',
    facts: { kind: 'Hole', diameter },
    zMin: -depth,
    zMax: 0,
  },
})

/** Equal-area faces, so a direction holding one of four has mapped 25%. */
export const faces = (count: number) =>
  Array.from({ length: count }, (_, idx) => ({
    idx,
    splitOrigin: 0,
    shapeKind: 'Plane',
    area: 100,
    triangleStart: idx,
    triangleEnd: idx + 1,
  }))

export const report = ({
  regions,
  candidateDirections,
  features,
}: {
  regions: ReturnType<typeof faces>
  candidateDirections: readonly Direction[]
  features: ReadonlyArray<ReturnType<typeof feature>>
}) => ({
  partId: 'part-1',
  reportId: 'report-1',
  jobId: 'job-1',
  kernelVersion: 'test',
  units: { length: 'mm', angle: 'deg' },
  regions,
  candidateDirections,
  meshPointCount: 0,
  meshTriangleCount: regions.length,
  hasMeshGlb: false,
  hasMeshStl: false,
  hasThumbnail: false,
  downloadMs: 1,
  analysisMs: 2,
  totalMs: 3,
  features,
})

/**
 * Serves that report as the one analysis event and opens the inspector on it.
 *
 * One event and then nothing: the app subscribes once and holds the report in
 * component state, so a single `ready` is the whole of the stream (F16).
 */
export const openPart = async (page: Page, part: ReturnType<typeof report>): Promise<void> => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/session') return route.fulfill({ json: { connected: true } })
    if (url.pathname === '/api/parts/part-1/events')
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: analysis\ndata: ${JSON.stringify({ status: 'ready', report: part })}\n\n`,
      })
    return route.fallback()
  })
  await page.goto('/parts/part-1?job=job-1')
}

/** Opens a feature type in the summary, then one feature under it. */
export const openFeature = async (page: Page, type: RegExp, tag: RegExp): Promise<void> => {
  await page.getByRole('button', { name: type }).first().click()
  await page.getByRole('button', { name: tag }).first().click()
}
