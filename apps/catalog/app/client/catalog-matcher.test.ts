import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stopMatcherWorker, useCatalogMatcher } from './catalog-matcher'
import type { MatchContext, MatchResponse } from 'shared/catalog-matcher'
import type { PartFeature } from '@toolpath/part-contracts'
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
  overrides: [],
}

afterEach(() => {
  // The worker outlives a component now, so it has to be ended between tests
  // or the second one inherits the first one's stub — and its caches.
  stopMatcherWorker()
  StubWorker.instances = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('catalog matcher worker lifecycle', () => {
  it('keeps only the current table response', () => {
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
  })

  /**
   * **The worker is the tab's, not the page's** (Paul, 2026-09-09: "many
   * workflows will start in the parts page, then go to the order list, then
   * back to the parts page multiple times … it is still loading the parts page
   * a bit slowly").
   *
   * Terminating it on unmount meant every return to the part page built
   * another one: the catalog imported and parsed a second time — 25 MB of
   * tools — both caches empty, and the report sent across again. Measured on
   * that round trip before this: 438 ms to remount and 565 ms to re-answer the
   * feature the worker had answered a moment earlier.
   */
  it('keeps one worker across a remount, and what it already holds', () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.useFakeTimers()
    const features: Array<PartFeature> = [
      { featureTag: 'a', featureType: 'hole', machiningDirection: { x: 0, y: 0, z: 1 } },
    ] as unknown as Array<PartFeature>
    const withPart: MatchContext = { ...context, features }

    const first = renderHook(() => useCatalogMatcher())
    act(() => {
      first.result.current.matchTable(withPart, [{ demandKey: 'one', tags: [] }])
      vi.runAllTimers()
    })
    const worker = StubWorker.instances[0]!
    expect(worker.postMessage.mock.calls[0]?.[0].context.features).toHaveLength(1)

    first.unmount()
    expect(worker.terminate).not.toHaveBeenCalled()

    const second = renderHook(() => useCatalogMatcher())
    act(() => {
      second.result.current.matchTable(withPart, [{ demandKey: 'two', tags: [] }])
      vi.runAllTimers()
    })
    // One worker for both mounts, and the part crossed to it only once.
    expect(StubWorker.instances).toHaveLength(1)
    expect(worker.postMessage.mock.calls[1]?.[0].context.features).toHaveLength(0)
    second.unmount()
  })

  it('drops a failed worker so the next mount gets a new one', () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.useFakeTimers()
    const first = renderHook(() => useCatalogMatcher())
    act(() => {
      first.result.current.matchTable(context, [{ demandKey: 'one', tags: [] }])
      vi.runAllTimers()
    })
    act(() => {
      StubWorker.instances[0]!.onerror?.()
    })
    expect(StubWorker.instances[0]!.terminate).toHaveBeenCalledOnce()
    first.unmount()

    renderHook(() => useCatalogMatcher())
    expect(StubWorker.instances).toHaveLength(2)
  })

  it('sends only the latest request queued in one turn', () => {
    vi.stubGlobal('Worker', StubWorker)
    vi.useFakeTimers()
    const { result } = renderHook(() => useCatalogMatcher())
    const worker = StubWorker.instances[0]!

    // One send on its own, to read the counter from rather than pin a number:
    // ids run per tab rather than per mount, so what this test is about is the
    // *step*, not the value.
    act(() => {
      result.current.matchTable(context, [{ demandKey: 'base', tags: [] }])
      vi.runAllTimers()
    })
    const base = (worker.postMessage.mock.calls[0]?.[0] as { requestId: number }).requestId

    act(() => {
      result.current.matchRecommendations(context, [{ demandKey: 'first', tags: [] }])
      result.current.matchRecommendations(context, [{ demandKey: 'second', tags: [] }])
    })
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    act(() => {
      vi.runAllTimers()
    })
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(worker.postMessage.mock.calls[1]?.[0]).toMatchObject({
      kind: 'recommendations',
      // Two on, not one: the request that was replaced still took an id, so a
      // late answer to it can never be read as an answer to its replacement.
      requestId: base + 2,
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
