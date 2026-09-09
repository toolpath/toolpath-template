import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

/**
 * The cube, with its mesh — the one fixture that mounts geometry.
 *
 * Every other spec here works the tool half of the application, which needs no
 * part at all. That leaves **the entire click-on-the-part stack unreached**:
 * picking a face, the arrows, the highlight layers, and every panel behaviour
 * that begins with a click on the part. On 2026-08-28 that stack shipped with
 * arrows that were never wired to a handler at all, and nothing could have
 * said so.
 *
 * This mounts the viewer package's own cube — six planar faces, four candidate
 * ways up, twenty-four readings, and a real GLB — served through the same API
 * routes the app calls. It is slower than a hand-built report and it is the
 * only thing that tests what a click means.
 *
 * The two files are vendored into `tests/fixtures/`, copied from the DFM
 * application's own copies. `@toolpath/viewer` publishes `dist` only, so there
 * is nothing to reach for; and geometry is the one thing that cannot be written
 * out by hand, which is what makes this the single exception to *never check in
 * a captured report*. Read the DFM application's `tests/cube-fixture.ts` before
 * adding anything beside it.
 */
const cube = JSON.parse(
  readFileSync(new URL('./fixtures/local-0.3.0-cube.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

const mesh = readFileSync(new URL('./fixtures/local-0.3.0-cube.glb', import.meta.url))

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

/**
 * The cube, analysed and on screen.
 *
 * The tool assembly tree is the page — it was behind a flag until 2026-09-08
 * and every spec had to say which of the two shapes it meant. There is one
 * shape now, so a spec says nothing and gets it.
 */
/**
 * The same cube, read as a part of threaded holes.
 *
 * **The one fixture that reaches the threaded-hole half of the part page.**
 * Everything a threaded hole decides — which taps the list holds, which
 * predrill the drills are judged against, what the chrome says, which forms the
 * filter keeps — begins with a hole, and the viewer's cube has six planar faces
 * and none. Three defects shipped into that gap in one day (2026-09-09): the
 * cut/form control drawn over the drills alone, the drill list filtered on the
 * hole as modelled rather than on its predrill, and the tap forms erased by the
 * write that follows choosing a thread. Every one of them was found by Paul
 * looking at the screen, because nothing here could look.
 *
 * **Every reading becomes a hole**, rather than one of them: which feature the
 * centre click resolves to is the picker's business and is pinned in
 * `part-interaction.test.ts`, so a fixture that made exactly one of them a hole
 * would be a fixture that tests the picker again and breaks when the camera
 * moves. Making them all holes of one size means the click lands on a hole
 * whatever it hits — and the panel offers the group, exactly as it does on a
 * real part where forty-two holes are identical.
 *
 * The datasheet is written by hand and is the shape the rules read: `diameter`
 * is the bore, `maxDrillDiameter` and `maxEndmillDiameter` are the kernel's own
 * limits on what can enter it, and the cone is a drilled bottom. `apps/dfm`'s
 * `tests/part-fixture.ts` § `richHole` is the same idea in the other
 * application, and the two are deliberately separate: a fixture shared across
 * applications is a package, and neither app needs the other's.
 *
 * @param diameter the bore as modelled, in millimetres. The default is the
 *   1/4-20 UNC tap drill (⌀0.201 in), so the page guesses that thread the way
 *   it does on a real part — "M6 because ⌀5.00 is its tap drill".
 * @param depth how deep the hole goes, in millimetres.
 */
export const openCubeWithHole = async (
  page: Page,
  { diameter = 0.201 * 25.4, depth = 8, query = '' } = {},
): Promise<void> => {
  const holed = {
    ...report,
    features: (report.features as ReadonlyArray<Record<string, unknown>>).map((feature) => ({
      ...feature,
      featureType: 'BlindHole',
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
    })),
  }
  await serve(page, holed)
  await page.goto(`/parts/part-1?job=job-1${query}`)
}

/**
 * The four routes the page calls, answered from one report.
 *
 * Taken out of {@link openCube} when {@link openCubeWithHole} arrived: the two
 * differ in what the analysis event carries and in nothing else, and a second
 * copy of the route table is a second place for the mesh path to go stale.
 */
const serve = async (page: Page, served: Record<string, unknown>): Promise<void> => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/session') {
      return route.fulfill({ json: { connected: true } })
    }
    if (url.pathname === '/api/parts/part-1/events') {
      return route.fulfill({
        contentType: 'text/event-stream',
        body: `event: analysis\ndata: ${JSON.stringify({ status: 'ready', report: served })}\n\n`,
      })
    }
    if (url.pathname === '/api/parts/part-1/mesh') {
      return route.fulfill({ contentType: 'model/gltf-binary', body: mesh })
    }
    return route.fallback()
  })
}

export const openCube = async (page: Page, query = ''): Promise<void> => {
  await serve(page, report)
  await page.goto(`/parts/part-1?job=job-1${query}`)
}
