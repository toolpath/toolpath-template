import { afterEach, describe, expect, test, vi } from 'vitest'
import { getSession, startDemoSession } from './api.js'

afterEach(() => vi.unstubAllGlobals())

describe('the browser session', () => {
  test('reads the browser session with a bounded request', async () => {
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ connected: false })
    })

    await expect(getSession()).resolves.toEqual({ connected: false })
  })

  test('asks the server for a demo session', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(new URL(String(input), 'http://catalog.test'), init)
      expect(request.method).toBe('POST')
      expect(request.url).toBe('http://catalog.test/api/session/demo')
      return Response.json({ connected: true })
    })

    await expect(startDemoSession()).resolves.toEqual({ connected: true })
  })
})
