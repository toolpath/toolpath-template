import type { CatalogTool } from '@toolpath/catalog-data'
import { collets, holders, allTools } from '../shared/catalog'
import {
  detailedMatch,
  facetCountsFor,
  facetPool,
  matchKey,
  prepareMatch,
  recommendationMatch,
  type DetailedResult,
  type MatchContext,
  type MatchRequest,
  type MatchResponse,
  type RecommendationResult,
} from '../shared/catalog-matcher'
import { facetsNarrowing, withoutFacets } from '../shared/filter'

const catalog = { tools: allTools, holders, collets }

class Lru<Value> {
  private readonly values = new Map<string, Value>()

  constructor(private readonly limit: number) {}

  get = (key: string): Value | undefined => {
    const value = this.values.get(key)
    if (value === undefined) {
      return undefined
    }
    this.values.delete(key)
    this.values.set(key, value)
    return value
  }

  set = (key: string, value: Value): void => {
    this.values.delete(key)
    this.values.set(key, value)
    if (this.values.size > this.limit) {
      const oldest = this.values.keys().next().value
      if (oldest !== undefined) {
        this.values.delete(oldest)
      }
    }
  }
}

// Detailed verdicts can contain thousands of rows; recommendations are small
// and recur for every feature and one-each draft, so they get the larger cache.
const tables = new Lru<ReadonlyArray<DetailedResult>>(4)
const recommendations = new Lru<RecommendationResult>(256)
/**
 * The widened pools the facet counts are measured over, by the question with
 * every facet cleared.
 *
 * **A tick must not cost a judging pass.** The counts beside the Vendor
 * checkboxes are measured over the question *without* the vendor, so that pool
 * is identical for every vendor, every family and every type ticked on the same
 * feature — which is exactly the sequence somebody makes while narrowing. Keyed
 * on the facet-free question so the cache hits across all of them, and never
 * sent anywhere: only the counts cross the boundary.
 */
const pools = new Lru<ReadonlyArray<CatalogTool>>(4)

/**
 * The part this worker is answering about, kept between requests.
 *
 * **The report crosses once** (Paul, 2026-09-07). A request used to carry every
 * feature and its datasheet — megabytes, three times to a selection, all of it
 * identical to the last one. Now it carries their key, and this is where they
 * live; a request naming a key this worker does not hold is answered with
 * `needs-features`, and the client sends them.
 */
let held: { readonly key: string; readonly features: MatchContext['features'] } | null = null

/** The widened pool for one demand, judged once and kept for the next tick. */
const poolFor = (
  context: MatchContext,
  demand: MatchRequest['demands'][number],
): ReadonlyArray<CatalogTool> => {
  const widened = { ...context, query: withoutFacets(context.query) }
  /*
    **The stack is left out of the key, deliberately.** What it narrows is the
    counts taken *over* this pool, never the pool itself — `facetCountsFor` in
    `shared/catalog-matcher.ts` is where it is applied — so a holder or a collet
    picked in the tree must not evict a judging pass that would come back
    identical. `stable` drops an undefined value, so this is the key a demand
    with no stack writes.

    The `form` axis is out of it too, because `withoutFacets` clears it: one
    pool now serves every type ticked, the predrill button and a thread being
    chosen, where each of those used to rebuild it.
  */
  const key = matchKey('table', widened, [{ ...demand, stack: undefined }])
  const cached = pools.get(key)
  if (cached !== undefined) {
    return cached
  }
  const built = facetPool(context, demand, catalog)
  pools.set(key, built)
  return built
}

/**
 * The table request whose counts have still to be worked out.
 *
 * **The counts are not the answer, and must not be paid for like one** (Paul,
 * 2026-09-10). Widening the pool past the `form` axis is what makes a threaded
 * hole's Type column say how many end mills work — and it is a judging pass
 * over the whole catalog rather than the sixteen thousand drills and taps the
 * filter admits: measured at 502 ms an answer against 170 ms without it. So the
 * rows are posted first and this is what comes after them, a task later so a
 * newer question can overtake it.
 *
 * A newer table request clears it, because counts for the question before last
 * are numbers beside somebody else's checkboxes.
 */
let counting: number | null = null

const countLater = (request: MatchRequest, answered: ReadonlyArray<DetailedResult>): void => {
  counting = request.requestId
  setTimeout(() => {
    if (counting !== request.requestId) {
      return
    }
    counting = null
    try {
      // Aligned by construction: `answered` is `request.demands` mapped.
      const results = answered.map((already, at) => {
        const demand = request.demands[at]
        return demand === undefined
          ? already
          : {
              ...already,
              facetCounts: facetCountsFor(
                request.context,
                demand,
                catalog,
                poolFor(request.context, demand),
              ),
            }
      })
      tables.set(request.key, results)
      const response: MatchResponse = {
        requestId: request.requestId,
        kind: 'table',
        key: request.key,
        results,
      }
      self.postMessage(response)
    } catch {
      /*
        **A count that fails is not an answer that failed.** The rows are on
        screen already and this task cannot take them away — reporting an error
        here would replace a good table with a message about the numbers beside
        its checkboxes. The page falls back to counting its own rows, which is
        what it does whenever the worker has nothing to say.
      */
    }
  }, 0)
}

self.onmessage = (event: MessageEvent<MatchRequest>) => {
  const incoming = event.data
  if (incoming.context.features.length > 0) {
    held = { key: incoming.featuresKey, features: incoming.context.features }
  }
  if (held === null || held.key !== incoming.featuresKey) {
    const asking: MatchResponse = {
      requestId: incoming.requestId,
      kind: 'needs-features',
      requestKind: incoming.kind,
      key: incoming.key,
    }
    self.postMessage(asking)
    return
  }
  /*
    Every rule below reads the features off the context, so the held ones are
    put back into it rather than threaded through as a second argument.
  */
  const request: MatchRequest = {
    ...incoming,
    context: { ...incoming.context, features: held.features },
  }
  try {
    if (request.kind === 'table') {
      // A question already answered has its counts with it, so nothing is left
      // to work out and nothing is scheduled.
      const cached = tables.get(request.key)
      if (cached !== undefined) {
        counting = null
        const response: MatchResponse = {
          requestId: request.requestId,
          kind: 'table',
          key: request.key,
          results: cached,
        }
        self.postMessage(response)
        return
      }
      const prepared = prepareMatch(request.context, catalog)
      // `null` is the pool this pass does not build — `detailedMatch` says why.
      const results = request.demands.map((demand) =>
        detailedMatch(request.context, demand, catalog, prepared, null),
      )
      const response: MatchResponse = {
        requestId: request.requestId,
        kind: 'table',
        key: request.key,
        results,
      }
      self.postMessage(response)
      /*
        **Only a finished answer is cached.** An answer still waiting for its
        counts would be handed back whole on the next ask of the same question,
        and the counts would never be worked out at all — the cache hit returns
        before anything is scheduled. So the entry is written by `countLater`,
        and the one case with nothing to wait for is written here. The cost of
        that is re-answering a question asked twice inside one task, which the
        client's own key dedupe already makes hard to do.
      */
      if (facetsNarrowing(request.context.query)) {
        countLater(request, results)
      } else {
        counting = null
        tables.set(request.key, results)
      }
      return
    }

    const misses = request.demands.filter(
      (demand) =>
        recommendations.get(matchKey('recommendations', request.context, [demand])) === undefined,
    )
    const prepared = misses.length === 0 ? null : prepareMatch(request.context, catalog)
    const results = request.demands.map((demand) => {
      const key = matchKey('recommendations', request.context, [demand])
      const cached = recommendations.get(key)
      if (cached !== undefined) {
        return cached
      }
      const matched = recommendationMatch(request.context, demand, catalog, prepared ?? undefined)
      recommendations.set(key, matched)
      return matched
    })
    const response: MatchResponse = {
      requestId: request.requestId,
      kind: 'recommendations',
      key: request.key,
      results,
    }
    self.postMessage(response)
  } catch (error) {
    const response: MatchResponse = {
      requestId: request.requestId,
      kind: 'error',
      requestKind: request.kind,
      key: request.key,
      message: error instanceof Error ? error.message : 'Catalog matching failed.',
    }
    self.postMessage(response)
  }
}
