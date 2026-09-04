import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCatalogMatcher } from './catalog-matcher'
import type { MatchContext, MatchResponse } from 'shared/catalog-matcher'
import { EMPTY_QUERY } from 'shared/filter'
import { SHEET_CLAMPING } from 'shared/clamping-length'
import { thresholdsFrom } from 'shared/holder-choice'

class StubWorker {
  static instances: Array<StubWorker> = []
  onmessage: ((event: MessageEvent<MatchResponse>) => void) | null = null
  onerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()

  constructor() {
    StubWorker.instances.push(this)
  }

  emit(response: MatchResponse) {
    this.onmessage?.({ data: response } as MessageEvent<MatchResponse>)
  }
}

const context: MatchContext = {
  features: [],
  query: EMPTY_QUERY,
  knobs: [],
  clamping: SHEET_CLAMPING,
  unit: 'millimeters',
  holderFilters: { taper: [], colletSeries: [] },
  margins: { radial: 0, axial: 0 },
  thresholds: thresholdsFrom(),
}

afterEach(() => {
  StubWorker.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('catalog matcher worker lifecycle', () => {
  it('keeps only the current table response and terminates on cleanup', () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useCatalogMatcher())
    const worker = StubWorker.instances[0]!

    act(() => {
      result.current.matchTable(context, [{ demandKey: 'first', tags: [] }])
      result.current.matchTable(context, [{ demandKey: 'second', tags: [] }])
      vi.runAllTimers()
    })
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(result.current.table.status).toBe('pending')

    act(() => {
      worker.emit({ requestId: 1, kind: 'table', key: 'old', results: [] })
    })
    expect(result.current.table.status).toBe('pending')

    act(() => {
      const current = worker.postMessage.mock.calls[0]?.[0]
      worker.emit({
        requestId: 2,
        kind: 'error',
        requestKind: 'table',
        key: current.key,
        message: 'worker failed',
      })
    })
    expect(result.current.table).toMatchObject({ status: 'error', message: 'worker failed' })

    unmount()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('sends only the latest request queued in one turn', () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.useFakeTimers()
    const { result } = renderHook(() => useCatalogMatcher())
    const worker = StubWorker.instances[0]!

    act(() => {
      result.current.matchRecommendations(context, [{ demandKey: 'first', tags: [] }])
      result.current.matchRecommendations(context, [{ demandKey: 'second', tags: [] }])
    })
    expect(worker.postMessage).not.toHaveBeenCalled()

    act(() => {
      vi.runAllTimers()
    })
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage.mock.calls[0]?.[0]).toMatchObject({
      kind: 'recommendations',
      requestId: 2,
      demands: [{ demandKey: 'second', tags: [] }],
    })
  })

  it('assigns a worker failure to its declared slot', () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.useFakeTimers()
    const { result } = renderHook(() => useCatalogMatcher())
    const worker = StubWorker.instances[0]!

    act(() => {
      result.current.matchTable(context, [{ demandKey: 'table', tags: [] }])
      result.current.matchRecommendations(context, [{ demandKey: 'recommendations', tags: [] }])
      vi.runAllTimers()
    })
    const request = worker.postMessage.mock.calls.find(
      ([message]) => (message as { kind: string }).kind === 'recommendations',
    )?.[0] as { requestId: number; key: string }

    act(() => {
      worker.emit({
        requestId: request.requestId,
        kind: 'error',
        requestKind: 'recommendations',
        key: request.key,
        message: 'recommendations failed',
      })
    })

    expect(result.current.recommendations).toMatchObject({
      status: 'error',
      message: 'recommendations failed',
    })
    expect(result.current.table.status).toBe('pending')
  })
})
