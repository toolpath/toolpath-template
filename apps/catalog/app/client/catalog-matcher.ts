import { useCallback, useEffect, useRef, useState } from 'react'
import {
  matchKey,
  type DetailedResult,
  type MatchContext,
  type MatchDemand,
  type MatchRequest,
  type MatchResponse,
  type RecommendationResult,
} from 'shared/catalog-matcher'

export type MatchState<Result> =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly key: string }
  | { readonly status: 'ready'; readonly key: string; readonly results: ReadonlyArray<Result> }
  | { readonly status: 'error'; readonly key: string; readonly message: string }

const idle = { status: 'idle' } as const

/** Reports carry viewer helpers at runtime; the worker receives data only. */
const cloneable = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value

/** Owns the one per-tab matcher worker and rejects stale response slots. */
export const useCatalogMatcher = () => {
  const worker = useRef<Worker | null>(null)
  const latest = useRef({ table: 0, recommendations: 0 })
  const latestKey = useRef({ table: '', recommendations: '' })
  const latestRequest = useRef<{
    table: MatchRequest | null
    recommendations: MatchRequest | null
  }>({
    table: null,
    recommendations: null,
  })
  const queued = useRef<{ table: MatchRequest | null; recommendations: MatchRequest | null }>({
    table: null,
    recommendations: null,
  })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [table, setTable] = useState<MatchState<DetailedResult>>(idle)
  const [recommendations, setRecommendations] = useState<MatchState<RecommendationResult>>(idle)

  const flush = useCallback(() => {
    timer.current = null
    const current = worker.current
    if (current === null) {
      return
    }
    for (const kind of ['table', 'recommendations'] as const) {
      const request = queued.current[kind]
      if (request === null) {
        continue
      }
      queued.current[kind] = null
      current.postMessage(cloneable(request))
    }
  }, [])

  const schedule = useCallback(() => {
    if (timer.current === null) {
      timer.current = setTimeout(flush, 0)
    }
  }, [flush])

  useEffect(() => {
    const current = new Worker(new URL('./catalog-matcher.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.current = current
    setReady(true)
    schedule()
    current.onmessage = (event: MessageEvent<MatchResponse>) => {
      const response = event.data
      const slot = response.kind === 'error' ? response.requestKind : response.kind
      if (response.requestId !== latest.current[slot]) {
        return
      }
      if (response.kind === 'error') {
        const error = { status: 'error', key: response.key, message: response.message } as const
        if (slot === 'table') {
          setTable(error)
        } else {
          setRecommendations(error)
        }
        return
      }
      if (response.kind === 'table') {
        setTable({ status: 'ready', key: response.key, results: response.results })
      } else {
        setRecommendations({ status: 'ready', key: response.key, results: response.results })
      }
    }
    current.onerror = () => {
      const message = 'Catalog matching worker failed. Retry the current selection.'
      if (latest.current.table > 0) {
        setTable((state) =>
          state.status === 'pending' ? { status: 'error', key: state.key, message } : state,
        )
      }
      if (latest.current.recommendations > 0) {
        setRecommendations((state) =>
          state.status === 'pending' ? { status: 'error', key: state.key, message } : state,
        )
      }
    }
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
      }
      current.terminate()
      if (worker.current === current) {
        worker.current = null
      }
      setReady(false)
    }
  }, [schedule])

  const send = useCallback(
    (
      kind: 'table' | 'recommendations',
      context: MatchContext,
      demands: ReadonlyArray<MatchDemand>,
    ) => {
      const key = matchKey(kind, context, demands)
      if (latestKey.current[kind] === key) {
        return key
      }
      const requestId = latest.current[kind] + 1
      latest.current[kind] = requestId
      latestKey.current[kind] = key
      const pending = { status: 'pending', key } as const
      if (kind === 'table') {
        setTable(pending)
      } else {
        setRecommendations(pending)
      }
      const request: MatchRequest = { requestId, kind, key, context, demands }
      latestRequest.current[kind] = request
      queued.current[kind] = request
      schedule()
      return key
    },
    [schedule],
  )

  const matchTable = useCallback(
    (context: MatchContext, demands: ReadonlyArray<MatchDemand>) => send('table', context, demands),
    [send],
  )
  const matchRecommendations = useCallback(
    (context: MatchContext, demands: ReadonlyArray<MatchDemand>) =>
      send('recommendations', context, demands),
    [send],
  )

  const retry = useCallback(
    (kind: 'table' | 'recommendations') => {
      const previous = latestRequest.current[kind]
      if (previous === null) {
        return
      }
      const requestId = latest.current[kind] + 1
      latest.current[kind] = requestId
      const request = { ...previous, requestId }
      latestRequest.current[kind] = request
      queued.current[kind] = request
      const pending = { status: 'pending', key: request.key } as const
      if (kind === 'table') {
        setTable(pending)
      } else {
        setRecommendations(pending)
      }
      schedule()
    },
    [schedule],
  )

  return { ready, table, recommendations, matchTable, matchRecommendations, retry }
}
