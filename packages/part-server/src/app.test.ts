// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Hono } from 'hono'
import type { JobDetail } from '@toolpath/api'
import { readAnalysis } from './routes/analysis.js'
import { createPartApi } from './app.js'
import { createConnection } from './connection.js'
import type { AppEnv } from './types.js'

const APP_NAME = 'part-viewer'
const { setConnection } = createConnection(APP_NAME)
const createApp = () => createPartApi({ appName: APP_NAME })

const sameOrigin = { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' }

/** Creates a pre-existing session for tests that are unrelated to the connection flow. */
const cookieFor = async () => {
  const app = new Hono<AppEnv>()
  app.get('/', async (c) => {
    await setConnection(c, 'tp_secret_key')
    return c.body(null)
  })
  const response = await app.request('/')
  return response.headers.getSetCookie()[0].split(';')[0]
}

const report = (meshGlbUrl: string | null = null) => ({
  partId: 'part-1',
  reportId: 'report-1',
  jobId: 'job-1',
  kernelVersion: 'test',
  units: { length: 'mm', angle: 'rad' },
  regions: [],
  features: [],
  candidateDirections: [],
  meshPointCount: 0,
  meshTriangleCount: 0,
  thumbnailUrl: null,
  meshStlUrl: null,
  meshGlbUrl,
})

const analysisJob = (status: JobDetail['status'], error: string | null = null): JobDetail => ({
  partUuid: 'part-1',
  jobUuid: 'job-1',
  // Engine API 1.3.1 states both, nullable. This job holds no tool and came
  // from no import.
  holderUuid: null,
  fileUuid: null,
  importId: null,
  productType: 'analyze-part',
  status,
  progress: status === 'queued' ? null : 100,
  retriesRemaining: null,
  error,
  reportId: status === 'succeeded' ? 'report-1' : null,
  createdAt: new Date('2026-08-13T00:00:00.000Z'),
  updatedAt: new Date('2026-08-13T00:00:01.000Z'),
  durationMs: 1000,
})

const analysisStream = (job: JobDetail): Response =>
  new Response(
    `event: job\ndata: ${JSON.stringify({
      ...job,
      createdAt: job.createdAt.toISOString(),
    })}\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } },
  )

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('DFM Hono API', () => {
  test('serves an unauthenticated health probe', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ok')
  })

  test('hardens every response, and keeps API replies out of every cache', async () => {
    const app = createApp()
    const health = await app.request('/health')
    const session = await app.request('/api/session')

    // `secureHeaders()` is one line in `app.ts`, and until this ran, deleting it
    // failed nothing: the whole suite passed on an app serving no headers at all.
    expect(health.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(health.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(health.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(health.headers.get('Strict-Transport-Security')).toContain('max-age=')

    // A connection state or a part report held in a shared cache is somebody
    // else's session. The probe is deliberately cacheable; nothing under /api is.
    expect(session.headers.get('Cache-Control')).toBe('no-store')
    expect(session.headers.get('Pragma')).toBe('no-cache')
    expect(health.headers.get('Cache-Control')).toBeNull()
  })

  test('refuses a write that did not come from this origin', async () => {
    const app = createApp()

    /*
     * The connection cookie is `SameSite=Lax`, which still rides along on a
     * top-level request from another origin. `csrf()` is what refuses those.
     *
     * Every other test in this file sends `Sec-Fetch-Site: same-origin`, so
     * until this ran the guard could be deleted with the suite still green.
     */
    const crossSite = await app.request('/api/session', {
      method: 'DELETE',
      headers: { Cookie: await cookieFor(), 'Sec-Fetch-Site': 'cross-site' },
    })
    expect(crossSite.status).toBe(403)

    /*
     * A form-encoded body is the one shape a cross-origin page can post without
     * a preflight, so it is the request the guard exists for. The JSON posts
     * every other test makes are protected by the preflight instead, which is
     * why they are not refused here.
     */
    const forged = await app.request('/api/files', {
      method: 'POST',
      headers: {
        Cookie: await cookieFor(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://evil.test',
      },
      body: 'filename=fixture.step',
    })
    expect(forged.status).toBe(403)
  })

  test('validates and seals the BYOK key, reports connection state, and clears the session', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      expect(request.method).toBe('POST')
      expect(new URL(request.url).pathname).toBe('/v1/keys/validate')
      expect(request.headers.get('Authorization')).toBe('Bearer tp_secret_key')
      return Response.json({ valid: true, status: 'active' })
    })
    const app = createApp()
    const connected = await app.request('/api/session', {
      method: 'POST',
      headers: sameOrigin,
      body: JSON.stringify({ apiKey: 'tp_secret_key' }),
    })
    const cookie = connected.headers.getSetCookie()[0]
    expect(connected.status).toBe(201)
    expect(cookie).toContain('part-viewer-connection=')
    expect(cookie).toContain('HttpOnly')
    // Plain HTTP to localhost, but under `NODE_ENV=test` rather than a dev server.
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('tp_secret_key')

    const status = await app.request('/api/session', { headers: { Cookie: cookie } })
    await expect(status.json()).resolves.toEqual({ connected: true })
    const cleared = await app.request('/api/session', {
      method: 'DELETE',
      headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' },
    })
    expect(cleared.status).toBe(204)
    expect(cleared.headers.getSetCookie()[0]).toContain('Max-Age=0')
  })

  /**
   * WebKit drops a `Secure` cookie on http://localhost, where Chrome and Firefox
   * keep it, so a dev server there leaves it off. Nothing else does: `pnpm start`
   * sets no `NODE_ENV`, and must not lose `Secure` by being reached on localhost.
   */
  test('leaves Secure off only for a development server on plain-HTTP localhost', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ valid: true, status: 'active' }))
    const connectAt = async (nodeEnv: string | undefined, origin: string) => {
      vi.stubEnv('NODE_ENV', nodeEnv)
      const response = await createApp().request(`${origin}/api/session`, {
        method: 'POST',
        headers: sameOrigin,
        body: JSON.stringify({ apiKey: 'tp_secret_key' }),
      })
      expect(response.status).toBe(201)
      return response.headers.getSetCookie()[0]
    }

    expect(await connectAt('development', 'http://localhost:5174')).not.toContain('Secure')
    expect(await connectAt('development', 'http://[::1]:5173')).not.toContain('Secure')
    for (const nodeEnv of [undefined, 'test', 'production']) {
      expect(await connectAt(nodeEnv, 'http://localhost:5174')).toContain('Secure')
    }
    expect(await connectAt('development', 'https://localhost:5174')).toContain('Secure')
    expect(await connectAt('development', 'http://192.168.1.20:5174')).toContain('Secure')
    expect(await connectAt('development', 'https://catalog.example.com')).toContain('Secure')
  })

  test('seals a demo key from the Engine into a session', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      expect(request.method).toBe('POST')
      expect(new URL(request.url).pathname).toBe('/v1/demo/session')
      return Response.json({
        apiKey: 'tp_demo_key',
        expiresAt: '2026-09-26T13:48:03.172Z',
        orgId: 'org-1',
      })
    })
    const app = createApp()
    const connected = await app.request('/api/session/demo', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    })

    expect(connected.status).toBe(201)
    await expect(connected.json()).resolves.toEqual({ connected: true })
    const cookie = connected.headers.getSetCookie()[0]
    expect(cookie).toContain('part-viewer-connection=')
    expect(cookie).toContain('HttpOnly')
    // The demo key is as private as any other; it never reaches the browser.
    expect(cookie).not.toContain('tp_demo_key')
  })

  test('falls back to disconnected when no demo key is available', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: 'demo_unavailable' }, { status: 503 }),
    )
    const response = await createApp().request('/api/session/demo', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ connected: false })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  test('keeps an existing session rather than replacing it with a demo one', async () => {
    const fetchSpy = vi.fn<() => Promise<Response>>()
    vi.stubGlobal('fetch', fetchSpy)
    const response = await createApp().request('/api/session/demo', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), 'Sec-Fetch-Site': 'same-origin' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ connected: true })
    // A live session is not spent on a demo key it does not need.
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toEqual([])
  })

  test('rejects an invalid API key without creating a session', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ valid: false, status: 'revoked' }, { status: 401 }),
    )

    const response = await createApp().request('/api/session', {
      method: 'POST',
      headers: sameOrigin,
      body: JSON.stringify({ apiKey: 'tp_revoked_key' }),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_api_key',
      message: 'This API key has been revoked. Create a new key and try again.',
    })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  test('clears a malformed connection cookie without logging an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await createApp().request('/api/session', {
      headers: { Cookie: 'part-viewer-connection=not-a-valid-jwe' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ connected: false })
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(consoleError).not.toHaveBeenCalled()
  })

  test('clears an undecryptable connection cookie after a session-secret rotation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await createApp().request('/api/session', {
      headers: { Cookie: 'part-viewer-connection=a.b.c.d.e' },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ connected: false })
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(consoleError).not.toHaveBeenCalled()
  })

  test('rejects an expired session and unsupported CAD upload before contacting Engine', async () => {
    const app = createApp()
    const expired = await app.request('/api/files', {
      method: 'POST',
      headers: sameOrigin,
      body: JSON.stringify({ filename: 'fixture.step' }),
    })
    expect(expired.status).toBe(401)

    const invalidFilename = JSON.stringify({ filename: 'fixture.txt' })
    const unsupported = await app.request('/api/files', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: invalidFilename,
    })
    expect(unsupported.status).toBe(400)
    await expect(unsupported.json()).resolves.toMatchObject({
      message: 'Choose a supported CAD file.',
    })
  })

  test('rejects an unsupported filename before creating an Engine file', async () => {
    const fetchSpy = vi.fn<() => Promise<Response>>()
    vi.stubGlobal('fetch', fetchSpy)
    const response = await createApp().request('/api/files', {
      method: 'POST',
      headers: {
        Cookie: await cookieFor(),
        ...sameOrigin,
      },
      body: JSON.stringify({ filename: 'fixture.exe' }),
    })

    expect(response.status).toBe(400)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('logs Engine diagnostics server-side and returns a generic status-bearing error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { detail: 'Internal upstream detail that must not reach the browser.' },
        { status: 504 },
      ),
    )
    const response = await createApp().request('/api/files', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: JSON.stringify({ filename: 'fixture.step' }),
    })

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual({
      error: 'engine_request_failed',
      message: 'Toolpath Engine request failed (HTTP 504).',
    })
    expect(consoleError).toHaveBeenCalledWith(
      '[part-viewer] Engine request failed',
      expect.objectContaining({ operation: 'create file upload', status: 504 }),
    )
  })

  /**
   * A 402 is about the person's own account — a quota, a plan — and the
   * Engine's words for it are the only way they can act on it. Passed on for a
   * 4xx; a 5xx stays generic, as the test above pins.
   */
  test('passes the Engine’s own reason on for an account error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { message: 'Monthly analysis quota reached for this organization' },
        { status: 402 },
      ),
    )
    const response = await createApp().request('/api/files', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: JSON.stringify({ filename: 'fixture.step' }),
    })

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({
      error: 'engine_request_failed',
      message:
        'Toolpath Engine request failed (HTTP 402): Monthly analysis quota reached for this organization',
    })
  })

  test('streams a redacted ready report from Engine job events', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === '/v1/jobs/job-1/events') {
        return analysisStream(analysisJob('succeeded'))
      }
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        return Response.json(report('https://mesh.test/a?signature=secret'))
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })
    const body = await response.text()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('event: analysis')
    expect(body).toContain('"status":"ready"')
    expect(body).not.toContain('mesh.test')
    expect(body).not.toContain('signature=secret')
  })

  /**
   * Every datasheet arrives through the batch endpoint — the SDK's `PartFeature`
   * carries none — so this is what proves the curve survives that trip. Two
   * features, two curves.
   *
   * It was written when `@toolpath/api` 0.2.x dropped `reachCurve` on the way
   * through and the server read every batch a second time raw to graft it back.
   * The SDK declares the field since 0.4.0 and the graft is gone; the assertion
   * is unchanged, because what it pins is the curve reaching the browser rather
   * than the way it got there.
   */
  test('keeps the reach curve through the datasheet batch', async () => {
    const curve = { horizontalOffset: [0, 8], verticalOffset: [12, 30] }
    const feature = (id: string, tag: string, type: string, region: number) => ({
      featureId: id,
      featureTag: tag,
      featureType: type,
      regionIdxs: [region],
      machiningDirection: { x: 0, y: 0, z: 1 },
      axis: { x: 0, y: 0, z: 1 },
    })
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === '/v1/jobs/job-1/events') {
        return analysisStream(analysisJob('succeeded'))
      }
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        return Response.json({
          ...report(),
          features: [
            feature('feature-1', 'pocket-1', 'pocket', 0),
            feature('feature-2', 'hole-1', 'blind_hole', 1),
          ],
        })
      }
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1/features') {
        return Response.json({
          datasheets: [
            {
              featureId: 'feature-1',
              featureTag: 'pocket-1',
              featureType: 'pocket',
              datasheet: { facts: { kind: 'Pocket' }, zMin: -12, zMax: 0, reachCurve: curve },
            },
            {
              featureId: 'feature-2',
              featureTag: 'hole-1',
              featureType: 'blind_hole',
              datasheet: {
                facts: { kind: 'Hole', diameter: 6.35 },
                zMin: 2,
                zMax: 12,
                reachCurve: curve,
              },
            },
          ],
          notFound: [],
        })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })

    const event = await readAnalysis('tp_secret_key', 'part-1', analysisJob('succeeded'))

    expect(event.status).toBe('ready')
    const features = event.status === 'ready' ? event.report.features : []
    expect(features.map((each) => each.datasheet?.reachCurve)).toEqual([curve, curve])
  })

  test('stitches separately returned datasheets onto the ready report', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === '/v1/jobs/job-1/events') {
        return analysisStream(analysisJob('succeeded'))
      }
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        return Response.json({
          ...report(),
          features: [
            {
              featureId: 'feature-1',
              featureTag: 'hole-1',
              featureType: 'blind_hole',
              regionIdxs: [0],
              machiningDirection: { x: 0, y: 0, z: 1 },
              axis: { x: 0, y: 0, z: 1 },
            },
          ],
        })
      }
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1/features') {
        expect(url.searchParams.get('ids')).toBe('feature-1')
        return Response.json({
          datasheets: [
            {
              featureId: 'feature-1',
              featureTag: 'hole-1',
              featureType: 'blind_hole',
              datasheet: { facts: { kind: 'Hole', diameter: 6.35 }, zMin: 2, zMax: 12 },
            },
          ],
          notFound: [],
        })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })

    await expect(
      readAnalysis('tp_secret_key', 'part-1', analysisJob('succeeded')),
    ).resolves.toMatchObject({
      status: 'ready',
      report: {
        features: [
          {
            featureTag: 'hole-1',
            datasheet: { facts: { kind: 'Hole', diameter: 6.35 }, zMin: 2, zMax: 12 },
          },
        ],
      },
    })
  })

  test('fetches datasheet batches concurrently, under a cap, without losing one', async () => {
    // Ten batches of the fifty-feature URL-safe batch size. Serially that is ten round trips the
    // browser waits through after the analysis has already succeeded.
    const features = Array.from({ length: 500 }, (unused, index) => ({
      featureId: `feature-${index}`,
      featureTag: `hole-${index}`,
      featureType: 'blind_hole',
      regionIdxs: [0],
      machiningDirection: { x: 0, y: 0, z: 1 },
      axis: { x: 0, y: 0, z: 1 },
    }))
    let inFlight = 0
    let peakInFlight = 0
    let batches = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        return Response.json({ ...report(), features })
      }
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1/features') {
        batches += 1
        inFlight += 1
        peakInFlight = Math.max(peakInFlight, inFlight)
        const ids = url.searchParams.get('ids')?.split(',') ?? []
        // Hold the batch open so overlapping requests are observable at all.
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        return Response.json({
          datasheets: ids.map((id) => ({
            featureId: id,
            featureTag: id.replace('feature-', 'hole-'),
            featureType: 'blind_hole',
            datasheet: { facts: { kind: 'Hole', diameter: 6.35 }, zMin: 2, zMax: 12 },
          })),
          notFound: [],
        })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })

    const analysis = await readAnalysis('tp_secret_key', 'part-1', analysisJob('succeeded'))

    expect(batches).toBe(10)
    expect(peakInFlight).toBeGreaterThan(1)
    expect(peakInFlight).toBeLessThanOrEqual(4)
    expect(analysis.status).toBe('ready')
    // Every batch writes into one shared map, so a lost or overwritten key would show up here.
    expect(
      analysis.status === 'ready' && analysis.report.features.every((feature) => feature.datasheet),
    ).toBe(true)
  })

  test('maps queued and failed Engine job events without requesting a report', async () => {
    await expect(readAnalysis('tp_secret_key', 'part-1', analysisJob('queued'))).resolves.toEqual({
      status: 'pending',
      progress: null,
      message: 'Analysis is queued…',
    })

    await expect(
      readAnalysis('tp_secret_key', 'part-1', analysisJob('failed', 'Invalid geometry')),
    ).resolves.toEqual({
      status: 'failed',
      message: 'Invalid geometry',
    })
  })

  test('says a part no longer matches its file without the Engine’s own text', async () => {
    const job = analysisJob('failed', 'body_mismatch: body 1 now reads as 412 faces')

    await expect(readAnalysis('tp_secret_key', 'part-1', job)).resolves.toStrictEqual({
      status: 'failed',
      message:
        'Toolpath reads this file’s bodies differently now. Upload the file again to choose its body.',
    })
  })

  test('refuses a job that is another part’s, rather than reading its report', async () => {
    const requests: Array<string> = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      requests.push(url.pathname)
      if (url.pathname === '/v1/jobs/job-1/events') {
        return analysisStream({ ...analysisJob('succeeded'), partUuid: 'part-2' })
      }
      throw new Error(`Unexpected request ${String(input)}`)
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })

    await expect(response.text()).resolves.toContain('This analysis is not for this part.')
    expect(requests).toEqual(['/v1/jobs/job-1/events'])
  })

  test('says so when a succeeded job has no report behind it', async () => {
    // Engine reported success and then 404s the report. Rare, and the alternative
    // to saying something is a page that waits for ever on work already finished.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/v1/parts/part-1') {
        return Response.json({ detail: 'Not found' }, { status: 404 })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })

    await expect(
      readAnalysis('tp_secret_key', 'part-1', analysisJob('succeeded')),
    ).resolves.toEqual({
      status: 'failed',
      message: 'Analysis completed, but the report was not available. Try opening the part again.',
    })
  })

  test('sends a terminal event when the Engine event stream fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', async () => {
      throw new Error('Engine unavailable')
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('"status":"failed"')
    /*
     * The browser is told one fixed sentence. Asserting only `"status":"failed"`
     * would pass just as happily on a handler that forwarded the Engine's own
     * words, which is the thing this whole layer exists to prevent.
     *
     * It is the generic sentence rather than a status-bearing one because the
     * SDK wraps `engineFetch`'s `EngineError` in its own `FetchError` before the
     * route sees it. The diagnostic is not lost — it is in the server log
     * asserted below — and either way nothing from Engine reaches the page.
     */
    expect(body).toContain('Could not monitor this analysis. Try opening the part again.')
    expect(body).not.toContain('Engine unavailable')
    expect(consoleError).toHaveBeenCalledWith(
      '[part-viewer] Engine transport failure',
      expect.objectContaining({ error: 'Engine unavailable' }),
    )
  })

  test('refuses a job event it cannot read, rather than forwarding one', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/v1/jobs/job-1/events') {
        return new Response('event: job\ndata: {"nothing":"like a job"}\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })

    const body = await response.text()
    expect(body).toContain('"status":"failed"')
    expect(body).toContain('Could not monitor this analysis. Try opening the part again.')
    // Whatever Engine actually sent stays server-side.
    expect(body).not.toContain('like a job')
  })

  test('reports an empty event stream instead of waiting on it', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/v1/jobs/job-1/events') {
        return new Response(null, { headers: { 'Content-Type': 'text/event-stream' } })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })

    await expect(response.text()).resolves.toContain(
      'Could not monitor this analysis. Try opening the part again.',
    )
  })

  test('reports a stream that ends before the analysis does', async () => {
    /*
     * A proxy timing the connection out mid-analysis. The last thing the browser
     * heard was `pending`, so the alternative to a terminal event here is a
     * progress card that never resolves — `analysis-states.spec.ts` pins the
     * browser's half of the same failure.
     */
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/v1/jobs/job-1/events') {
        return analysisStream(analysisJob('running'))
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })

    const body = await response.text()
    expect(body).toContain('"status":"pending"')
    expect(body).toContain('Could not monitor this analysis. Try opening the part again.')
  })

  test('retries a mesh artifact once with a fresh report URL', async () => {
    let reportReads = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        reportReads += 1
        return Response.json(
          report(`https://mesh.test/${reportReads === 1 ? 'expired' : 'fresh'}.glb`),
        )
      }
      if (url.pathname === '/expired.glb') {
        return new Response(null, { status: 403 })
      }
      if (url.pathname === '/fresh.glb') {
        return new Response('mesh bytes', { headers: { 'Content-Type': 'model/gltf-binary' } })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/mesh?jobId=job-1&format=glb', {
      headers: { Cookie: await cookieFor() },
    })
    expect(reportReads).toBe(2)
    await expect(response.text()).resolves.toBe('mesh bytes')
    // The bytes behind a presigned URL are as private as the URL was.
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  test('says a mesh is unavailable when the report carries no artifact for it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (request.method === 'GET' && new URL(request.url).pathname === '/v1/parts/part-1') {
        return Response.json(report(null))
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/mesh?jobId=job-1&format=glb', {
      headers: { Cookie: await cookieFor() },
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'mesh_unavailable',
      message: 'Toolpath Engine request failed (HTTP 404).',
    })
    expect(consoleError).toHaveBeenCalled()
  })

  test('gives up after one mesh retry rather than looping on a refused artifact', async () => {
    /*
     * Both reads mint a URL that is still refused: the artifact is genuinely
     * gone rather than merely stale. The retry that fixes an expiry has to stop
     * being a retry at some point, and the tests above only ever prove the read
     * that succeeds the second time.
     */
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let reportReads = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        reportReads += 1
        return Response.json(report('https://mesh.test/gone.glb'))
      }
      if (url.pathname === '/gone.glb') {
        return new Response(null, { status: 403 })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/mesh?jobId=job-1&format=glb', {
      headers: { Cookie: await cookieFor() },
    })

    expect(reportReads).toBe(2)
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'mesh_unavailable',
      message: 'Toolpath Engine request failed (HTTP 403).',
    })
    expect(consoleError).toHaveBeenCalled()
  })

  test('releases the discarded mesh response before retrying', async () => {
    let cancelled = false
    let reportReads = 0
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1') {
        reportReads += 1
        return Response.json(
          report(`https://mesh.test/${reportReads === 1 ? 'expired' : 'fresh'}.glb`),
        )
      }
      if (url.pathname === '/expired.glb') {
        return new Response(
          new ReadableStream({
            start: (controller) => {
              controller.enqueue(new TextEncoder().encode('<Error>AccessDenied</Error>'))
            },
            cancel: () => {
              cancelled = true
            },
          }),
          { status: 403 },
        )
      }
      if (url.pathname === '/fresh.glb') {
        return new Response('mesh bytes', { headers: { 'Content-Type': 'model/gltf-binary' } })
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/mesh?jobId=job-1&format=glb', {
      headers: { Cookie: await cookieFor() },
    })

    await expect(response.text()).resolves.toBe('mesh bytes')
    // An unread, uncancelled body holds its socket until the response is collected.
    expect(cancelled).toBe(true)
  })
})

describe('uploading through a file', () => {
  const box = { lower: { x: 0, y: 0, z: 0 }, upper: { x: 10, y: 20, z: 5 } }
  const fileBodies = [
    { index: 0, faceCount: 6, boundingBox: box, shape: 0 },
    { index: 1, name: 'Bracket', faceCount: 24, boundingBox: box, shape: 1 },
  ]
  const inspectionJob = (
    status: JobDetail['status'],
    error: string | null = null,
    fileUuid = 'file-1',
  ): JobDetail => ({
    ...analysisJob(status, error),
    partUuid: null,
    fileUuid,
    jobUuid: 'job-9',
    productType: 'inspect-file',
    reportId: null,
  })
  const fileResponse = (bodies: Array<unknown>) => ({
    fileId: 'file-1',
    filename: 'fixture.step',
    createdAt: '2026-08-13T00:00:00.000Z',
    bodies,
    shapes: [],
    hasMesh: false,
    inspectJobId: 'job-9',
  })
  /** The one `data:` line of a single-event stream, parsed. */
  const eventOf = (body: string): unknown =>
    JSON.parse(
      body
        .split('\n')
        .find((line) => line.startsWith('data: '))!
        .slice('data: '.length),
    )

  /** Stubs the Engine's file endpoints; returns every request it saw. */
  const engine = (
    { bodies = fileBodies, job = inspectionJob('succeeded') } = {} as {
      bodies?: Array<unknown>
      job?: JobDetail
    },
  ) => {
    const requests: Array<Request> = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request.clone())
      const url = new URL(request.url)
      const route = `${request.method} ${url.pathname}`
      expect(request.headers.get('Authorization')).toBe('Bearer tp_secret_key')
      if (route === 'POST /v1/files') {
        return Response.json(
          {
            fileId: 'file-1',
            uploadUrl: 'https://upload.test/source?signature=secret',
            sourceBucket: 'files',
            sourceS3Key: 'source',
          },
          { status: 201 },
        )
      }
      if (route === 'PATCH /v1/files/file-1') {
        return Response.json(
          { jobId: 'job-9', fileId: 'file-1', status: 'queued' },
          { status: 202 },
        )
      }
      if (route === 'GET /v1/jobs/job-9/events') {
        return analysisStream(job)
      }
      if (route === 'GET /v1/files/file-1') {
        return Response.json(fileResponse(bodies))
      }
      if (route === 'POST /v1/files/file-1/parts') {
        const { bodies: named } = (await request.json()) as { bodies: Array<number> }
        return Response.json(
          {
            fileId: 'file-1',
            parts: named.map((bodyIndex) => ({
              partId: `part-${bodyIndex + 7}`,
              bodyIndex,
              created: true,
              shape: { index: bodyIndex, bodies: [bodyIndex], count: 1 },
            })),
          },
          { status: 201 },
        )
      }
      if (route === 'PATCH /v1/parts/part-8') {
        return Response.json(
          { partId: 'part-8', jobId: 'job-8', status: 'queued' },
          { status: 202 },
        )
      }
      throw new Error(`Unexpected request ${route}`)
    })
    return requests
  }

  test('creates a file for a direct upload, then starts its inspection', async () => {
    const requests = engine()
    const app = createApp()
    const created = await app.request('/api/files', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: JSON.stringify({ filename: 'fixture.step' }),
    })

    expect(created.status).toBe(201)
    // The upload URL is the browser's to PUT to, and nothing else reaches it.
    await expect(created.json()).resolves.toEqual({
      fileId: 'file-1',
      uploadUrl: 'https://upload.test/source?signature=secret',
    })
    expect(new URL(requests[0].url).searchParams.get('filename')).toBe('fixture.step')

    const inspected = await app.request('/api/files/file-1', {
      method: 'PATCH',
      headers: { Cookie: await cookieFor(), 'Sec-Fetch-Site': 'same-origin' },
    })
    expect(inspected.status).toBe(202)
    await expect(inspected.json()).resolves.toEqual({ fileId: 'file-1', jobId: 'job-9' })
    expect(requests[1].headers.get('Idempotency-Key')).toMatch(/.+/)
  })

  test('ends the inspection in every body the file holds, a missing name as null', async () => {
    engine()
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })
    const body = await response.text()

    expect(body).toContain('event: inspection')
    expect(eventOf(body)).toStrictEqual({
      status: 'ready',
      bodies: [
        { index: 0, name: null, faceCount: 6, boundingBox: box },
        { index: 1, name: 'Bracket', faceCount: 24, boundingBox: box },
      ],
    })
  })

  /**
   * Engine API 1.34.1 lists a file with no `shapes` and no `hasMesh`, which
   * `@toolpath/api` 0.12.0's `FileResponseFromJSON` cannot read: it threw, and
   * every inspection failed after its job had succeeded. Only `bodies` is read.
   */
  test('reads the bodies of a file listed without the fields it does not use', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/v1/files/file-1') {
        return Response.json({
          fileId: 'file-1',
          filename: 'fixture.step',
          createdAt: '2026-08-13T00:00:00.000Z',
          bodies: fileBodies,
          inspectJobId: 'job-9',
        })
      }
      return analysisStream(inspectionJob('succeeded'))
    })
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })

    expect(eventOf(await response.text())).toMatchObject({
      status: 'ready',
      bodies: [
        { index: 0, name: null },
        { index: 1, name: 'Bracket' },
      ],
    })
  })

  test('fails an inspection whose bodies it cannot read, in public words', async () => {
    engine({ bodies: [{ ...fileBodies[0], index: -1 }, 'a body'] })
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })
    const body = await response.text()

    expect(eventOf(body)).toStrictEqual({
      status: 'failed',
      message: 'The Toolpath Engine could not read this file.',
    })
    expect(body).not.toContain('a body')
  })

  test('ends the inspection of a one-body file in that one body', async () => {
    engine({ bodies: [fileBodies[1]] })
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })

    expect(eventOf(await response.text())).toMatchObject({
      status: 'ready',
      bodies: [{ index: 1, name: 'Bracket' }],
    })
  })

  test('says a file holds no solid body in words, not the Engine’s', async () => {
    engine({ job: inspectionJob('failed', 'no_solid_bodies: 0 solids among 3 shells') })
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })
    const body = await response.text()

    expect(eventOf(body)).toStrictEqual({
      status: 'failed',
      message:
        'This file holds no solid body to machine. Export the part as a solid and upload it again.',
    })
    expect(body).not.toContain('no_solid_bodies')
  })

  test('refuses an inspection that is another file’s, rather than reading its bodies', async () => {
    const requests = engine({ job: inspectionJob('succeeded', null, 'file-2') })
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })

    expect(eventOf(await response.text())).toStrictEqual({
      status: 'failed',
      message: 'This inspection is not for this file. Upload the file again.',
    })
    expect(requests.map((each) => new URL(each.url).pathname)).toEqual(['/v1/jobs/job-9/events'])
  })

  test('says how the inspection is going while it runs', async () => {
    engine({ job: { ...inspectionJob('running'), progress: 40 } })
    const response = await createApp().request('/api/files/file-1/events?jobId=job-9', {
      headers: { Cookie: await cookieFor() },
    })
    const body = await response.text()

    expect(body).toContain('"status":"pending"')
    expect(body).toContain('Reading the file’s bodies…')
    // The Engine closed the stream before the job settled; the browser is told.
    expect(body).toContain('Could not follow the inspection of this file. Upload it again.')
  })

  test('makes a part of the chosen body and starts its analysis', async () => {
    const requests = engine()
    const response = await createApp().request('/api/files/file-1/parts', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: JSON.stringify({ bodyIndex: 1 }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ partId: 'part-8', jobId: 'job-8' })
    await expect(requests[0].json()).resolves.toEqual({ bodies: [1] })
    const analysis = new URL(requests[1].url)
    expect(analysis.pathname).toBe('/v1/parts/part-8')
    expect(analysis.searchParams.get('featureDetails')).toBe('true')
    expect(requests[1].headers.get('Idempotency-Key')).toMatch(/.+/)
  })

  test('refuses a body index that is not a whole number a part can name', async () => {
    const fetchSpy = vi.fn<() => Promise<Response>>()
    vi.stubGlobal('fetch', fetchSpy)
    const app = createApp()

    for (const bodyIndex of [-1, 1.5, '1', 1_000_000, null]) {
      const response = await app.request('/api/files/file-1/parts', {
        method: 'POST',
        headers: { Cookie: await cookieFor(), ...sameOrigin },
        body: JSON.stringify({ bodyIndex }),
      })
      expect(response.status).toBe(400)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('no longer serves the part-upload routes the file flow replaced', async () => {
    const app = createApp()
    const created = await app.request('/api/parts', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: JSON.stringify({ filename: 'fixture.step' }),
    })
    const started = await app.request('/api/parts/part-1', {
      method: 'PATCH',
      headers: { Cookie: await cookieFor(), 'Sec-Fetch-Site': 'same-origin' },
    })

    expect(created.status).toBe(404)
    expect(started.status).toBe(404)
  })
})
