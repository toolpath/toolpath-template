import type { CatalogTool } from '@toolpath/catalog-data'
import { collets, holders, allTools } from '../shared/catalog'
import {
  detailedMatch,
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
  const key = matchKey('table', widened, [demand])
  const cached = pools.get(key)
  if (cached !== undefined) {
    return cached
  }
  const built = facetPool(context, demand, catalog)
  pools.set(key, built)
  return built
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
      const cached = tables.get(request.key)
      const results =
        cached ??
        (() => {
          const prepared = prepareMatch(request.context, catalog)
          const matched = request.demands.map((demand) => {
            const pool = facetsNarrowing(request.context.query)
              ? poolFor(request.context, demand)
              : undefined
            return detailedMatch(request.context, demand, catalog, prepared, pool)
          })
          tables.set(request.key, matched)
          return matched
        })()
      const response: MatchResponse = {
        requestId: request.requestId,
        kind: 'table',
        key: request.key,
        results,
      }
      self.postMessage(response)
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
