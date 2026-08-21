// @vitest-environment node
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Hono } from 'hono'
import type { JobDetail } from '@toolpath/api'
import { readAnalysis } from './routes/analysis'
import { createApp } from './app'
import { setConnection } from './connection'
import type { AppEnv } from './types'

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
  downloadMs: 1,
  analysisMs: 2,
  totalMs: 3,
})

const analysisJob = (status: JobDetail['status'], error: string | null = null): JobDetail => ({
  partUuid: 'part-1',
  jobUuid: 'job-1',
  productType: 'analyze-part',
  status,
  progress: status === 'queued' ? null : 100,
  error,
  reportId: status === 'succeeded' ? 'report-1' : null,
  createdAt: new Date('2026-08-13T00:00:00.000Z'),
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
})

describe('DFM Hono API', () => {
  test('serves an unauthenticated health probe', async () => {
    const response = await createApp().request('/health')

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ok')
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

  test('uses the SDK only to create a direct upload and start analysis', async () => {
    const requests: Request[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/v1/parts') {
        expect(request.headers.get('Authorization')).toBe('Bearer tp_secret_key')
        return Response.json(
          {
            partId: 'part-1',
            uploadUrl: 'https://upload.test/source',
            sourceBucket: 'parts',
            sourceS3Key: 'source',
          },
          { status: 201 },
        )
      }
      if (request.method === 'PATCH' && url.pathname === '/v1/parts/part-1') {
        expect(request.headers.get('Idempotency-Key')).toMatch(/.+/)
        expect(url.searchParams.get('featureDetails')).toBe('true')
        return Response.json(
          { partId: 'part-1', jobId: 'job-1', status: 'queued' },
          { status: 202 },
        )
      }
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })

    const app = createApp()
    const created = await app.request('/api/parts', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: JSON.stringify({ filename: 'fixture.step' }),
    })
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toEqual({
      partId: 'part-1',
      uploadUrl: 'https://upload.test/source',
    })
    expect(requests).toHaveLength(1)

    const analysis = await app.request('/api/parts/part-1?featureDetails=true', {
      method: 'PATCH',
      headers: { Cookie: await cookieFor(), 'Sec-Fetch-Site': 'same-origin' },
    })
    expect(analysis.status).toBe(202)
    await expect(analysis.json()).resolves.toEqual({ partId: 'part-1', jobId: 'job-1' })
    expect(requests).toHaveLength(2)
  })

  test('rejects an expired session and unsupported CAD upload before contacting Engine', async () => {
    const app = createApp()
    const expired = await app.request('/api/parts', {
      method: 'POST',
      headers: sameOrigin,
      body: JSON.stringify({ filename: 'fixture.step' }),
    })
    expect(expired.status).toBe(401)

    const invalidFilename = JSON.stringify({ filename: 'fixture.txt' })
    const unsupported = await app.request('/api/parts', {
      method: 'POST',
      headers: { Cookie: await cookieFor(), ...sameOrigin },
      body: invalidFilename,
    })
    expect(unsupported.status).toBe(400)
    await expect(unsupported.json()).resolves.toMatchObject({
      message: 'Choose a supported CAD file.',
    })
  })

  test('rejects an unsupported filename before creating an Engine part', async () => {
    const fetchSpy = vi.fn<() => Promise<Response>>()
    vi.stubGlobal('fetch', fetchSpy)
    const response = await createApp().request('/api/parts', {
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
    const response = await createApp().request('/api/parts', {
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
      expect.objectContaining({ operation: 'create part upload', status: 504 }),
    )
  })

  test('streams a redacted ready report from Engine job events', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === '/v1/jobs/job-1/events') return analysisStream(analysisJob('succeeded'))
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1')
        return Response.json(report('https://mesh.test/a?signature=secret'))
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

  test('stitches separately returned datasheets onto the ready report', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === '/v1/jobs/job-1/events') return analysisStream(analysisJob('succeeded'))
      if (request.method === 'GET' && url.pathname === '/v1/parts/part-1')
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

  test('sends a terminal event when the Engine event stream fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('Engine unavailable')
    })
    const response = await createApp().request('/api/parts/part-1/events?jobId=job-1', {
      headers: { Cookie: await cookieFor() },
    })

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain('"status":"failed"')
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
      if (url.pathname === '/expired.glb') return new Response(null, { status: 403 })
      if (url.pathname === '/fresh.glb')
        return new Response('mesh bytes', { headers: { 'Content-Type': 'model/gltf-binary' } })
      throw new Error(`Unexpected request ${request.method} ${request.url}`)
    })
    const response = await createApp().request('/api/parts/part-1/mesh?jobId=job-1&format=glb', {
      headers: { Cookie: await cookieFor() },
    })
    expect(reportReads).toBe(2)
    await expect(response.text()).resolves.toBe('mesh bytes')
  })
})
