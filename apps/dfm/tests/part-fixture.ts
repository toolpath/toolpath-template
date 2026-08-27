import { type Page, expect } from '@playwright/test'

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
  await openStream(
    page,
    `event: analysis\ndata: ${JSON.stringify({ status: 'ready', report: part })}\n\n`,
  )
}

/**
 * The same route, with whatever the stream should say.
 *
 * `ready` is the only status the fixtures above can produce, and it is the one
 * status the part route does the least with — everything else it draws (the
 * progress card, the failure card) is reachable only by saying something else
 * here. Takes the body rather than a status so a malformed event is expressible
 * too: parsing is the app's, and what it does with a bad one is behaviour.
 *
 * Pass `null` to refuse the stream outright, which is what an expired
 * connection cookie looks like from the browser.
 */
export const openStream = async (page: Page, body: string | null): Promise<void> => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/session') return route.fulfill({ json: { connected: true } })
    if (url.pathname === '/api/parts/part-1/events') {
      if (body === null) return route.fulfill({ status: 401, json: { error: 'expired' } })
      return route.fulfill({ contentType: 'text/event-stream', body })
    }
    return route.fallback()
  })
  await page.goto('/parts/part-1?job=job-1')
}

/** One `analysis` event, as the server frames it. */
export const analysisEvent = (data: unknown): string =>
  `event: analysis\ndata: ${JSON.stringify(data)}\n\n`

/** Opens a feature type in the summary, then one feature under it. */
export const openFeature = async (page: Page, type: RegExp, tag: RegExp): Promise<void> => {
  await page.getByRole('button', { name: type }).first().click()
  await page.getByRole('button', { name: tag }).first().click()
}

/**
 * A hole with a datasheet a rule can actually read.
 *
 * {@link feature} carries only enough for the mapping to have an opinion. The
 * rules page needs the rest of what a current Engine reports — the cutter
 * diameters, the tolerance bands, the cone angle — because a limit with nothing
 * to bite on is a limit that reads as "nothing here" rather than as a pass.
 *
 * Written out once rather than in each spec that wants one: it was copied by
 * hand into two, sixty lines apiece, and a datasheet that drifts between two
 * copies is two specs testing two different Engines.
 */
export const richHole = (
  featureTag: string,
  machiningDirection: Direction,
  regionIdxs: Array<number>,
  { diameter = 6.35, depth = 25.4 }: { diameter?: number; depth?: number } = {},
) => ({
  featureTag,
  featureType: 'BlindHole',
  machiningDirection,
  axis: machiningDirection,
  regionIdxs,
  // 25.4 deep in a 6.35 bore is 4:1, which the shipped rule set calls `alright`.
  datasheet: {
    featureType: 'BlindHole',
    zMax: 0,
    zMin: -depth,
    extendedZMax: 0,
    extendedZMin: -depth,
    radialStockToLeave: 0,
    axialStockToLeave: 0,
    toleranceBand: { atolIgnore: 0, atolDeviate: 0, atolMax: 0 },
    hasFloor: true,
    hasWall: true,
    floorishArea: 0,
    wallishArea: 0,
    facts: {
      kind: 'Hole',
      diameter,
      fullConeDeg: 118,
      isCounterbore: false,
      holeProcess: 'Drill',
      cd: {
        ignore: { min: diameter, max: diameter },
        deviate: { min: diameter, max: diameter },
        effectiveAdaptive: { min: diameter, max: diameter },
        terminalCornerRadius: 0,
      },
      maxSpotDiameter: 0,
      maxDrillDiameter: diameter,
      maxEndmillDiameter: diameter,
      filletRadius: 0,
      filletHeight: 0,
    },
  },
})

/**
 * The whole way in: connect, upload, analyze, and land on the inspector.
 *
 * {@link openPart} deliberately skips all of this — most specs want a report on
 * screen and nothing else. The two that do not are testing the path itself, and
 * they had a copy each of the same route table: the same four endpoints, the
 * same presigned upload, the same STEP buffer.
 *
 * `key` is worth passing where the point is that it must not reach the page.
 */
export const uploadTo = async (
  page: Page,
  part: unknown,
  { key = 'tp_key' }: { key?: string } = {},
): Promise<void> => {
  let connected = false

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/api/session') {
      if (request.method() === 'GET') return route.fulfill({ json: { connected } })
      if (request.method() === 'POST') {
        connected = true
        return route.fulfill({ status: 201, json: { connected: true } })
      }
      connected = false
      return route.fulfill({ status: 204 })
    }
    if (url.pathname === '/api/parts' && request.method() === 'POST')
      return route.fulfill({
        status: 201,
        json: { partId: 'part-1', uploadUrl: 'https://upload.test/source' },
      })
    if (url.pathname === '/api/parts/part-1' && request.method() === 'PATCH')
      return route.fulfill({ status: 202, json: { partId: 'part-1', jobId: 'job-1' } })
    if (url.pathname === '/api/parts/part-1/events' && url.searchParams.get('jobId') === 'job-1')
      return route.fulfill({
        contentType: 'text/event-stream',
        body: analysisEvent({ status: 'ready', report: part }),
      })

    return route.fallback()
  })
  // The browser uploads CAD straight to object storage; nothing large goes
  // through the app's own server.
  await page.route('https://upload.test/source', (route) => route.fulfill({ status: 200 }))

  await page.goto('/')
  await page.getByLabel('Toolpath Engine API key').fill(key)
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByLabel('CAD file')).toBeVisible()

  await page.getByLabel('CAD file').setInputFiles({
    name: 'fixture.step',
    mimeType: 'model/step',
    buffer: Buffer.from('STEP fixture'),
  })
  const analyze = page.getByRole('button', { name: 'Analyze part' })
  await expect(analyze).toBeEnabled()
  await analyze.click()
  await expect(page).toHaveURL(/\/parts\/part-1\?job=job-1/)
}
