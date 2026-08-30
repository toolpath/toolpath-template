import { afterEach, describe, expect, test, vi } from 'vitest'
import { getSession, uploadPart } from './api.js'

afterEach(() => vi.unstubAllGlobals())

describe('direct CAD upload', () => {
  test('reads the browser session with a bounded request', async () => {
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ connected: false })
    })

    await expect(getSession()).resolves.toEqual({ connected: false })
  })

  test('creates a part, PUTs the file directly, then starts analysis', async () => {
    const requests: Array<Request> = []
    const phases: Array<string> = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(new URL(String(input), 'http://part-viewer.test'), init)
      requests.push(request)
      if (request.url === 'http://part-viewer.test/api/parts') {
        expect(await request.json()).toEqual({ filename: 'fixture.step' })
        return Response.json({ partId: 'part-1', uploadUrl: 'https://upload.test/source?secret' })
      }
      if (request.url === 'https://upload.test/source?secret') {
        expect(request.method).toBe('PUT')
        await expect(request.text()).resolves.toBe('STEP fixture')
        return new Response(null, { status: 200 })
      }
      if (request.url === 'http://part-viewer.test/api/parts/part-1?featureDetails=true') {
        expect(request.method).toBe('PATCH')
        return Response.json({ partId: 'part-1', jobId: 'job-1' }, { status: 202 })
      }
      throw new Error(`Unexpected request: ${request.url}`)
    })

    await expect(
      uploadPart(new File(['STEP fixture'], 'fixture.step'), {
        onPhaseChange: (phase) => phases.push(phase),
      }),
    ).resolves.toEqual({
      partId: 'part-1',
      jobId: 'job-1',
    })
    expect(requests).toHaveLength(3)
    expect(phases).toEqual(['creating-part', 'uploading-file', 'starting-analysis'])
  })

  test('rejects an invalid file before creating a part', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(uploadPart(new File(['not CAD'], 'fixture.txt'))).rejects.toThrow(
      'Supported files',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
