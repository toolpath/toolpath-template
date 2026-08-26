import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

/**
 * The cube, with its mesh — the one fixture that mounts geometry.
 *
 * Every other spec here builds a report by hand and sets `hasMeshGlb: false`,
 * which means **the entire click-and-paint stack has never been exercised end to
 * end** (F51): picking a face, the region attribute, the highlight layers, and
 * every panel behaviour that begins with a click on the part. Those were
 * hand-verified only, and three of the bugs in the findings document reached a
 * user because nothing could catch them.
 *
 * This mounts the viewer package's own cube — six planar faces, four candidate
 * ways up, twenty-four readings, and a real GLB — served through the same API
 * routes the app calls. It is slower than a hand-built report and it is the only
 * thing that tests what a click means.
 */
const cube = JSON.parse(
  readFileSync(
    new URL('../../../packages/viewer/fixtures/reports/local-0.3.0-cube.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>

const mesh = readFileSync(
  new URL('../../../packages/viewer/fixtures/mesh/local-0.3.0-cube.glb', import.meta.url),
)

/** The report as the app's own boundary hands it over — URLs redacted to flags. */
const report = {
  ...cube,
  partId: 'part-1',
  reportId: 'report-1',
  jobId: 'job-1',
  units: { length: 'mm', angle: 'deg' },
  hasMeshGlb: true,
  hasMeshStl: false,
  hasThumbnail: false,
}
delete (report as Record<string, unknown>)['meshGlbUrl']
delete (report as Record<string, unknown>)['meshStlUrl']
delete (report as Record<string, unknown>)['thumbnailUrl']

export const openCube = async (page: Page, query = ''): Promise<void> => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/session') return route.fulfill({ json: { connected: true } })
    if (url.pathname === '/api/parts/part-1/events')
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: analysis\ndata: ${JSON.stringify({ status: 'ready', report })}\n\n`,
      })
    if (url.pathname === '/api/parts/part-1/mesh')
      return route.fulfill({ contentType: 'model/gltf-binary', body: mesh })
    return route.fallback()
  })
  await page.goto(`/parts/part-1?job=job-1${query}`)
}
