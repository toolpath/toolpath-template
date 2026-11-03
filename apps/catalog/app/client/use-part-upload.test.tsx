import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

const { usePartUpload } = await import('./use-part-upload')

const box = { lower: { x: 0, y: 0, z: 0 }, upper: { x: 40, y: 15, z: 8 } }
const body = (index: number) => ({ index, name: null, faceCount: 6, boundingBox: box })

/**
 * This application's server, as `@toolpath/part-client` reaches it: a file
 * inspected to `bodies`, and a part made of whichever body is named.
 */
const serve = (bodies: Array<ReturnType<typeof body>>) => {
  const made: Array<unknown> = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'http://catalog.test'), init)
    const path = new URL(request.url).pathname
    if (path === '/api/files') {
      return Response.json({ fileId: 'file-1', uploadUrl: 'https://upload.test/source' })
    }
    if (request.url === 'https://upload.test/source') {
      return new Response(null, { status: 200 })
    }
    if (path === '/api/files/file-1') {
      return Response.json({ fileId: 'file-1', jobId: 'job-9' }, { status: 202 })
    }
    if (path === '/api/files/file-1/parts') {
      const { bodyIndex } = (await request.json()) as { bodyIndex: number }
      made.push(bodyIndex)
      return Response.json({ partId: `part-${bodyIndex + 2}`, jobId: `job-${bodyIndex + 2}` })
    }
    throw new Error(`Unexpected request ${request.method} ${request.url}`)
  })
  class Inspection extends EventTarget {
    onerror: (() => void) | null = null
    constructor() {
      super()
      queueMicrotask(() =>
        this.dispatchEvent(
          Object.assign(new Event('inspection'), {
            data: JSON.stringify({ status: 'ready', bodies }),
          }),
        ),
      )
    }
    close() {}
  }
  vi.stubGlobal('EventSource', Inspection)
  return made
}

const step = () => new File(['STEP fixture'], 'part.step')

afterEach(() => {
  vi.unstubAllGlobals()
  mocks.navigate.mockReset()
})

describe('part upload routing', () => {
  it('opens the part of a one-body file without asking which', async () => {
    const made = serve([body(0)])
    const { result } = renderHook(() => usePartUpload())

    await act(() => result.current.upload(step()))

    expect(made).toEqual([0])
    expect(result.current.bodies).toBeNull()
    expect(mocks.navigate).toHaveBeenCalledWith('/parts/part-2?job=job-2')
  })

  it('hands a replacement job to the current workspace instead of navigating away', async () => {
    serve([body(0)])
    const onStarted = vi.fn()
    const { result } = renderHook(() => usePartUpload({ onStarted }))

    await act(() => result.current.upload(step()))

    expect(onStarted).toHaveBeenCalledWith({ partId: 'part-2', jobId: 'job-2' })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('waits on a choice for a file of several bodies, then opens the one chosen', async () => {
    const made = serve([body(0), body(1)])
    const { result } = renderHook(() => usePartUpload())

    await act(() => result.current.upload(step()))

    expect(result.current.bodies).toEqual([body(0), body(1)])
    expect(result.current.status).toBe('idle')
    expect(made).toEqual([])

    await act(() => result.current.choose(1))

    expect(made).toEqual([1])
    expect(mocks.navigate).toHaveBeenCalledWith('/parts/part-3?job=job-3')
  })

  it('goes back to choosing a file, leaving the bodies behind', async () => {
    serve([body(0), body(1)])
    const { result } = renderHook(() => usePartUpload())

    await act(() => result.current.upload(step()))
    act(() => result.current.reset())

    await waitFor(() => expect(result.current.bodies).toBeNull())
    expect(result.current.status).toBe('idle')
  })

  it('keeps the choice open, and says why, when a part cannot be made', async () => {
    serve([body(0), body(1)])
    const { result } = renderHook(() => usePartUpload())
    await act(() => result.current.upload(step()))
    vi.stubGlobal('fetch', async () =>
      Response.json({ error: 'engine_request_failed', message: 'No part today.' }, { status: 409 }),
    )

    await act(() => result.current.choose(0))

    expect(result.current.error).toBe('No part today.')
    expect(result.current.status).toBe('idle')
    expect(result.current.bodies).toHaveLength(2)
  })
})
