import { expect, test } from '@playwright/test'

const readyEvent = {
  status: 'ready',
  report: {
    partId: 'part-1',
    reportId: 'report-1',
    jobId: 'job-1',
    kernelVersion: 'test',
    units: { length: 'mm', angle: 'deg' },
    regions: [],
    candidateDirections: [],
    meshPointCount: 0,
    meshTriangleCount: 0,
    hasMeshGlb: false,
    hasMeshStl: false,
    hasThumbnail: false,
    downloadMs: 1,
    analysisMs: 2,
    totalMs: 3,
    features: [
      {
        featureTag: 'hole-1',
        featureType: 'BlindHole',
        regionIdxs: [0],
        machiningDirection: { x: 0, y: 0, z: 1 },
        axis: { x: 0, y: 0, z: 1 },
        datasheet: {
          featureType: 'BlindHole',
          zMin: -25.4,
          zMax: 0,
          extendedZMin: -25.4,
          extendedZMax: 0,
          radialStockToLeave: 0,
          axialStockToLeave: 0,
          toleranceBand: { atolIgnore: 0, atolDeviate: 0, atolMax: 0 },
          hasFloor: true,
          hasWall: true,
          floorishArea: 0,
          wallishArea: 0,
          facts: {
            kind: 'Hole',
            diameter: 6.35,
            fullConeDeg: 118,
            isCounterbore: false,
            holeProcess: 'Drill',
            cd: {
              ignore: { min: 6.35, max: 6.35 },
              deviate: { min: 6.35, max: 6.35 },
              effectiveAdaptive: { min: 6.35, max: 6.35 },
              terminalCornerRadius: 0,
            },
            maxSpotDiameter: 0,
            maxDrillDiameter: 6.35,
            maxEndmillDiameter: 6.35,
            filletRadius: 0,
            filletHeight: 0,
          },
        },
      },
      {
        featureTag: 'wall-1',
        featureType: 'Wall',
        regionIdxs: [1],
        machiningDirection: { x: -1, y: 0, z: 0 },
        axis: { x: 1, y: 0, z: 0 },
      },
    ],
  },
}

test('connects, uploads, opens a redacted inspector, and focuses a feature', async ({ page }) => {
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
    if (url.pathname === '/api/parts/part-1/analyze' && request.method() === 'POST')
      return route.fulfill({ status: 202, json: { partId: 'part-1', jobId: 'job-1' } })
    if (url.pathname === '/api/parts/part-1/events' && url.searchParams.get('jobId') === 'job-1')
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: analysis\ndata: ${JSON.stringify(readyEvent)}\n\n`,
      })
    return route.fallback()
  })
  await page.route('https://upload.test/source', (route) => route.fulfill({ status: 200 }))

  await page.goto('/')
  await page.getByLabel('Toolpath Engine API key').fill('tp_key_must_not_render')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByLabel('CAD file')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('tp_key_must_not_render')

  await page.getByLabel('CAD file').setInputFiles({
    name: 'fixture.step',
    mimeType: 'model/step',
    buffer: Buffer.from('STEP fixture'),
  })
  const analyzePart = page.getByRole('button', { name: 'Analyze part' })
  await expect(analyzePart).toBeEnabled()
  await analyzePart.click()
  await expect(page).toHaveURL(/\/parts\/part-1\?job=job-1/)

  // The summary counts the types; opening one lists its features, and choosing
  // one reads it on the right. Nothing is read until somebody asks for it —
  // the panel opens on an invitation rather than on a guess.
  await expect(page.getByText('Click a face on the part')).toBeVisible()
  await page.getByRole('button', { name: /BlindHole/ }).click()
  await page
    .getByRole('button', { name: /wall-1|hole-1/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Blind Hole' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('signature=')
  await page.getByRole('link', { name: 'Upload another part' }).click()
  await expect(page.getByLabel('CAD file')).toBeVisible()
})
