import { collets, holders, allTools } from '../shared/catalog'
import {
  detailedMatch,
  matchKey,
  prepareMatch,
  recommendationMatch,
  type DetailedResult,
  type MatchRequest,
  type MatchResponse,
  type RecommendationResult,
} from '../shared/catalog-matcher'

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

self.onmessage = (event: MessageEvent<MatchRequest>) => {
  const request = event.data
  try {
    if (request.kind === 'table') {
      const cached = tables.get(request.key)
      const results =
        cached ??
        (() => {
          const prepared = prepareMatch(request.context, catalog)
          const matched = request.demands.map((demand) =>
            detailedMatch(request.context, demand, catalog, prepared),
          )
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
