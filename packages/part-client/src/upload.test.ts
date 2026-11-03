import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PartBody } from '@toolpath/part-contracts'
import { makePart, openFile, uploadFile } from './upload.js'

const box = { lower: { x: 0, y: 0, z: 0 }, upper: { x: 10, y: 20, z: 5 } }
const body = (index: number, name: string | null = null): PartBody => ({
  index,
  name,
  faceCount: 6,
  boundingBox: box,
})

/**
 * `EventSource` answering every stream it opens with `events`, in turn — or
 * failing to open, for `null`. Node has none; the browser's is what runs.
 */
const scriptEvents = (events: Array<unknown> | null) => {
  const opened: Array<string> = []
  const closed: Array<string> = []
  class ScriptedEventSource extends EventTarget {
    onerror: (() => void) | null = null
    constructor(readonly url: string) {
      super()
      opened.push(url)
      queueMicrotask(() => {
        if (events === null) {
          this.onerror?.()
          return
        }
        for (const data of events) {
          this.dispatchEvent(Object.assign(new Event('inspection'), { data: JSON.stringify(data) }))
        }
      })
    }
    close() {
      closed.push(this.url)
    }
  }
  vi.stubGlobal('EventSource', ScriptedEventSource)
  return { opened, closed }
}

/** This application's server and object storage, answering one upload. */
const serveUpload = () => {
  const requests: Array<Request> = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'http://app.test'), init)
    requests.push(request.clone())
    const route = `${request.method} ${request.url}`
    if (route === 'POST http://app.test/api/files') {
      return Response.json({ fileId: 'file-1', uploadUrl: 'https://upload.test/source?secret' })
    }
    if (route === 'PUT https://upload.test/source?secret') {
      return new Response(null, { status: 200 })
    }
    if (route === 'PATCH http://app.test/api/files/file-1') {
      return Response.json({ fileId: 'file-1', jobId: 'job-9' }, { status: 202 })
    }
    if (route === 'POST http://app.test/api/files/file-1/parts') {
      return Response.json({ partId: 'part-1', jobId: 'job-1' }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${route}`)
  })
  return requests
}

const step = () => new File(['STEP fixture'], 'fixture.step')

afterEach(() => vi.unstubAllGlobals())

describe('uploading a CAD file', () => {
  test('creates a file, PUTs it directly, inspects it, and waits for its bodies', async () => {
    const requests = serveUpload()
    const { opened, closed } = scriptEvents([
      { status: 'pending', progress: null, message: 'Inspection is queued…' },
      { status: 'ready', bodies: [body(0), body(1, 'Bracket')] },
    ])
    const phases: Array<string> = []

    await expect(
      uploadFile(step(), { onPhaseChange: (phase) => phases.push(phase) }),
    ).resolves.toEqual({ fileId: 'file-1', bodies: [body(0), body(1, 'Bracket')] })

    await expect(requests[0].json()).resolves.toEqual({ filename: 'fixture.step' })
    await expect(requests[1].text()).resolves.toBe('STEP fixture')
    expect(requests.map((each) => `${each.method} ${new URL(each.url).pathname}`)).toEqual([
      'POST /api/files',
      'PUT /source',
      'PATCH /api/files/file-1',
    ])
    expect(opened).toEqual(['/api/files/file-1/events?jobId=job-9'])
    expect(closed).toEqual(opened)
    expect(phases).toEqual(['creating-file', 'uploading-file', 'inspecting-file'])
  })

  test('says why an inspection failed, in the server’s words', async () => {
    serveUpload()
    scriptEvents([{ status: 'failed', message: 'This file holds no solid body to machine.' }])

    await expect(uploadFile(step())).rejects.toThrow('This file holds no solid body to machine.')
  })

  test('says the session went when the inspection stream will not open', async () => {
    serveUpload()
    scriptEvents(null)

    await expect(uploadFile(step())).rejects.toThrow(/session expired/)
  })

  test('refuses an update it cannot read rather than waiting on it', async () => {
    serveUpload()
    scriptEvents([{ status: 'ready', bodies: [body(1), body(1)] }])

    await expect(uploadFile(step())).rejects.toThrow(/invalid update/)
  })

  test('rejects an invalid file before creating one', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(uploadFile(new File(['not CAD'], 'fixture.txt'))).rejects.toThrow(
      'Supported files',
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('makes a part of the body named', async () => {
    const requests = serveUpload()

    await expect(makePart('file-1', 1)).resolves.toEqual({ partId: 'part-1', jobId: 'job-1' })
    await expect(requests[0].json()).resolves.toEqual({ bodyIndex: 1 })
  })
})

describe('opening a file', () => {
  test('goes straight on to the part of a file holding one body', async () => {
    const requests = serveUpload()
    scriptEvents([{ status: 'ready', bodies: [body(3)] }])
    const phases: Array<string> = []

    await expect(
      openFile(step(), { onPhaseChange: (phase) => phases.push(phase) }),
    ).resolves.toEqual({ part: { partId: 'part-1', jobId: 'job-1' } })
    await expect(requests.at(-1)!.json()).resolves.toEqual({ bodyIndex: 3 })
    expect(phases.at(-1)).toBe('starting-analysis')
  })

  test('stops for a choice on a file holding several, making no part', async () => {
    const requests = serveUpload()
    scriptEvents([{ status: 'ready', bodies: [body(0), body(1)] }])

    await expect(openFile(step())).resolves.toEqual({
      choice: { fileId: 'file-1', bodies: [body(0), body(1)] },
    })
    expect(requests.some((each) => each.url.endsWith('/parts'))).toBe(false)
  })

  test('stops where it is when abandoned', async () => {
    serveUpload()
    const { closed } = scriptEvents([])
    const controller = new AbortController()

    const opening = openFile(step(), { signal: controller.signal })
    setTimeout(() => controller.abort(new Error('abandoned')), 10)

    await expect(opening).rejects.toThrow('abandoned')
    expect(closed).toHaveLength(1)
  })
})
