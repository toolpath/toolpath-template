import { useCallback, useEffect, useRef, useState } from 'react'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  featuresKey,
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

/**
 * Reports carry viewer helpers at runtime; the worker receives data only.
 *
 * **The part is made plain once, not once a request** (Paul, 2026-09-07: "it
 * still lags quite a bit when I finish with one feature then go to select
 * another"). A `JSON.parse(JSON.stringify(…))` of the whole request meant
 * serialising and re-parsing every feature's datasheet on the way to a worker
 * that already had them — measured at 3.4 MB a message on a 400-feature part,
 * three of them to a selection. The features are stripped once against their
 * own identity; everything else in a request is a query, a few knobs and a
 * handful of tags.
 */
const cloneable = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value

const PLAIN = new WeakMap<object, ReadonlyArray<PartFeature>>()

const plainFeatures = (features: ReadonlyArray<PartFeature>): ReadonlyArray<PartFeature> => {
  const had = PLAIN.get(features)
  if (had !== undefined) {
    return had
  }
  const made = cloneable(features)
  PLAIN.set(features, made)
  return made
}

/**
 * The request as it goes over the wire: the features once, then their key.
 *
 * `sent` is what the worker is known to hold. It is a ref rather than state
 * because it changes as a side effect of sending and nothing renders from it.
 */
const forWire = (request: MatchRequest, sent: string | null): MatchRequest => ({
  ...cloneable({ ...request, context: { ...request.context, features: [] } }),
  context: {
    ...cloneable({ ...request.context, features: [] }),
    features: sent === request.featuresKey ? [] : plainFeatures(request.context.features),
  },
})

/**
 * The one matcher worker in this tab, **kept across visits to the part page**
 * (Paul, 2026-09-09: "many workflows will start in the parts page, then go to
 * the order list, then back to the parts page multiple times … it is still
 * loading the parts page a bit slowly").
 *
 * It used to be built in the hook's effect and terminated in its cleanup, so
 * leaving the part page threw the worker away and coming back built another.
 * A new worker imports the catalog again — 25 MB of tools, fetched and parsed
 * a second time — and starts with both caches empty, so every question the
 * last visit had already answered was matched against the whole catalog again.
 * Measured on the round trip a shop makes many times a job: 438 ms to remount
 * and 565 ms to re-answer the feature it had just answered.
 *
 * A worker is a tab-lived thing rather than a component-lived one, so it lives
 * here. {@link stopMatcherWorker} is the only way to end it.
 */
let shared: Worker | null = null

/**
 * The features that worker holds, **beside it rather than in the hook**.
 *
 * The report crosses once (see {@link forWire}), and "once" has to outlive the
 * component or every return to the part page resends it — megabytes on a part
 * with several hundred features, which is exactly the part this is slow on.
 */
let heldFeatures: string | null = null

/**
 * Request ids, per tab rather than per mount.
 *
 * The handler drops any response whose id is not the one it is waiting for. A
 * counter that restarted at zero on every mount could hand a new request the
 * id of one still in flight from the last one, and the stale answer would be
 * taken for the new one.
 */
let nextRequestId = 0

const matcherWorker = (): Worker => {
  if (shared === null) {
    shared = new Worker(new URL('./catalog-matcher.worker.ts', import.meta.url), {
      type: 'module',
    })
    // A new worker holds nothing, so the next request carries the part again.
    heldFeatures = null
  }
  return shared
}

/**
 * End this tab's worker, so the next mount builds a fresh one.
 *
 * Two callers: a worker that failed — where a new one is the only way back —
 * and a test, which would otherwise inherit the previous test's worker.
 */
export const stopMatcherWorker = (): void => {
  shared?.terminate()
  shared = null
  heldFeatures = null
}

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
      current.postMessage(forWire(request, heldFeatures))
      heldFeatures = request.featuresKey
    }
  }, [])

  const schedule = useCallback(() => {
    if (timer.current === null) {
      timer.current = setTimeout(flush, 0)
    }
  }, [flush])

  useEffect(() => {
    const current = matcherWorker()
    worker.current = current
    setReady(true)
    schedule()
    current.onmessage = (event: MessageEvent<MatchResponse>) => {
      const response = event.data
      const slot =
        response.kind === 'error' || response.kind === 'needs-features'
          ? response.requestKind
          : response.kind
      if (response.requestId !== latest.current[slot]) {
        return
      }
      /*
        **The worker does not hold this report.** It restarted, or it has never
        seen this one; either way the answer is to send it, which is what the
        client kept a copy of. `held` is cleared first so the resend carries the
        features rather than naming them again.
      */
      if (response.kind === 'needs-features') {
        const previous = latestRequest.current[slot]
        heldFeatures = null
        if (previous !== null) {
          queued.current[slot] = previous
          schedule()
        }
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
      // A worker that failed to start answers nothing ever again, and the page
      // used to get a new one only because leaving it terminated this one.
      // Dropping it here is what keeps that way back now that it is shared.
      stopMatcherWorker()
      worker.current = null
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
      // **Not terminated.** The worker outlives this page on purpose; the
      // handlers are what belong to this mount, so only they come off.
      if (current.onmessage !== null) {
        current.onmessage = null
        current.onerror = null
      }
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
      nextRequestId += 1
      const requestId = nextRequestId
      latest.current[kind] = requestId
      latestKey.current[kind] = key
      const pending = { status: 'pending', key } as const
      if (kind === 'table') {
        setTable(pending)
      } else {
        setRecommendations(pending)
      }
      const request: MatchRequest = {
        requestId,
        kind,
        key,
        context,
        featuresKey: featuresKey(context.features),
        demands,
      }
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
      nextRequestId += 1
      const requestId = nextRequestId
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
