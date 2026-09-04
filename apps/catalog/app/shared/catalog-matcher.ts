import type { CatalogTool, Collet, Holder, HolderFilters, Margins } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { withClampingLength, type ClampingRule } from './clamping-length'
import { filterTools, type ToolQuery } from './filter'
import { holdable, policyOf, type HoldThresholds } from './holder-choice'
import { holdableTools, splitHolding } from './holding'
import { type Format, type Reason, type Verdict } from './judge'
import { sectionOf } from './section-of'
import { fittingTools } from './tool-fit'
import { holeAt } from './hole-mode'
import { RULES, type Knob } from './rules'

/** The serializable inputs which can affect a catalog answer. */
export interface MatchContext {
  readonly features: ReadonlyArray<PartFeature>
  readonly query: ToolQuery
  readonly knobs: ReadonlyArray<Knob>
  readonly clamping: ClampingRule
  readonly unit: UnitSystem
  readonly holderFilters: HolderFilters
  readonly margins: Margins
  readonly thresholds: HoldThresholds
}

/** One question in a table request or a recommendation batch. */
export interface MatchDemand {
  readonly demandKey: string
  readonly tags: ReadonlyArray<string>
  /** A threaded hole is judged at its effective tap-drill bore. */
  readonly bores?: Readonly<Record<string, number>>
  /** The feature whose reach curve decides whether an assembly is usable. */
  readonly reachTag?: string | null
}

export type MatchKind = 'table' | 'recommendations'

export interface MatchRequest {
  readonly requestId: number
  readonly kind: MatchKind
  readonly key: string
  readonly context: MatchContext
  readonly demands: ReadonlyArray<MatchDemand>
}

interface CompactReason {
  /** The route resolves this back to its local parsed rule, including its condition. */
  readonly ruleLine: number | null
  readonly text: string
  readonly shortfall?: number
}

/** A verdict without the catalog record duplicated into the worker message. */
export interface CompactVerdict {
  readonly toolGuid: string
  readonly removed: ReadonlyArray<CompactReason>
  readonly warned: ReadonlyArray<CompactReason>
  readonly demoted: ReadonlyArray<CompactReason>
  readonly key: ReadonlyArray<number>
  readonly readings: ReadonlyArray<string>
}

export interface DetailedResult {
  readonly demandKey: string
  readonly fitting: ReadonlyArray<CompactVerdict>
  readonly excluded: ReadonlyArray<CompactVerdict>
  readonly narrowedGuids: ReadonlyArray<string>
  readonly heldGuids: ReadonlyArray<string>
}

export interface RecommendationResult {
  readonly demandKey: string
  readonly state: 'ready' | 'nothing-fits'
  readonly toolGuid: string | null
}

export type MatchResponse =
  | {
      readonly requestId: number
      readonly kind: 'table'
      readonly key: string
      readonly results: ReadonlyArray<DetailedResult>
    }
  | {
      readonly requestId: number
      readonly kind: 'recommendations'
      readonly key: string
      readonly results: ReadonlyArray<RecommendationResult>
    }
  | {
      readonly requestId: number
      readonly kind: 'error'
      /** The slot that owns this failure; errors must not be guessed from a key. */
      readonly requestKind: MatchKind
      readonly key: string
      readonly message: string
    }

const stable = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) =>
        item === undefined || typeof item === 'function' || typeof item === 'symbol'
          ? 'null'
          : stable(item),
      )
      .join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => {
        const item = record[key]
        return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol'
      })
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** A deterministic key for response ownership and the worker's optional cache. */
export const matchKey = (
  kind: MatchKind,
  context: MatchContext,
  demands: ReadonlyArray<MatchDemand>,
): string =>
  stable({
    kind,
    // Recommendation verdicts contain only a GUID, so display units cannot affect
    // either the answer or its cache entry.
    context: kind === 'recommendations' ? { ...context, unit: 'millimeters' } : context,
    demands,
  })

const matcherFormat =
  (unit: UnitSystem): Format =>
  (value, numberUnit) => {
    switch (numberUnit) {
      case 'mm':
        return formatLength(value, unit)
      case 'deg':
        return `${value.toFixed(1)}°`
      case '%':
        return `${String(Math.round(value))} %`
      default:
        return Number.isInteger(value) ? String(value) : value.toFixed(2)
    }
  }

const effectiveFeatures = (context: MatchContext, demand: MatchDemand): Array<PartFeature> => {
  const wanted = new Set(demand.tags)
  return context.features.flatMap((feature) => {
    if (!wanted.has(feature.featureTag)) {
      return []
    }
    const bore = demand.bores?.[feature.featureTag]
    return [bore === undefined ? feature : holeAt(feature, bore)]
  })
}

const compactReason = (reason: Reason): CompactReason => ({
  ruleLine: reason.rule?.line ?? null,
  text: reason.text,
  ...(reason.shortfall === undefined ? {} : { shortfall: reason.shortfall }),
})

const compact = (verdict: Verdict): CompactVerdict => ({
  toolGuid: verdict.tool.guid,
  removed: verdict.removed.map(compactReason),
  warned: verdict.warned.map(compactReason),
  demoted: verdict.demoted.map(compactReason),
  key: verdict.key,
  readings: verdict.readings,
})

/** Reattach local catalog records after a worker returns compact verdict data. */
export const rehydrateVerdicts = (
  compactVerdicts: ReadonlyArray<CompactVerdict>,
  tools: ReadonlyArray<CatalogTool>,
): Array<Verdict> => {
  const byGuid = new Map(tools.map((tool) => [tool.guid, tool]))
  const reason = (compactReason: CompactReason): Reason => ({
    rule:
      compactReason.ruleLine === null
        ? null
        : (RULES.rules.find((rule) => rule.line === compactReason.ruleLine) ?? null),
    text: compactReason.text,
    ...(compactReason.shortfall === undefined ? {} : { shortfall: compactReason.shortfall }),
  })
  return compactVerdicts.flatMap((verdict) => {
    const tool = byGuid.get(verdict.toolGuid)
    return tool === undefined
      ? []
      : [
          {
            tool,
            removed: verdict.removed.map(reason),
            warned: verdict.warned.map(reason),
            demoted: verdict.demoted.map(reason),
            key: verdict.key,
            readings: verdict.readings,
          },
        ]
  })
}

export interface MatcherCatalog {
  readonly tools: ReadonlyArray<CatalogTool>
  readonly holders: ReadonlyArray<Holder>
  readonly collets: ReadonlyArray<Collet>
}

/** Work shared by every demand in one worker request. */
export interface PreparedMatch {
  /** Table matching uses the catalog's configured setup length. */
  readonly tools: ReadonlyArray<CatalogTool>
  /** Recommendations are narrowed before the existing rule pipeline runs. */
  readonly admitted: ReadonlyArray<CatalogTool>
}

export const prepareMatch = (context: MatchContext, catalog: MatcherCatalog): PreparedMatch => {
  const tools = withClampingLength(catalog.tools, context.clamping, policyOf(context.thresholds))
  const { tools: toolQuery, holding } = splitHolding(context.query)
  return { tools, admitted: holdableTools(filterTools(tools, toolQuery), holding) }
}

interface DemandMatch {
  readonly fitting: ReadonlyArray<Verdict>
  readonly excluded: ReadonlyArray<Verdict>
  readonly narrowed: ReadonlyArray<Verdict>
  readonly held: ReadonlyArray<Verdict>
}

/**
 * The one matching truth for a demand.
 *
 * Table rows and one-each picks used to run separate versions of this pipeline.
 * That let a pocket list held tools in the table yet report no recommendation.
 */
const matchDemand = (
  context: MatchContext,
  demand: MatchDemand,
  catalog: MatcherCatalog,
  prepared: PreparedMatch,
): DemandMatch => {
  const fitting = fittingTools(
    effectiveFeatures(context, demand),
    context.features,
    prepared.tools,
    matcherFormat(context.unit),
    context.knobs,
  )
  const admitted = new Set(prepared.admitted.map((tool) => tool.guid))
  const narrowed = fitting.fitting.filter((verdict) => admitted.has(verdict.tool.guid))
  const reachFeature = context.features.find(
    (feature) => feature.featureTag === (demand.reachTag ?? demand.tags[0]),
  )
  const curve = reachFeature ? (sectionOf(reachFeature, context.features)?.curve ?? null) : null
  /*
   * A cutting-tool-only catalog has no evidence that a holder *cannot* grip a
   * tool. The table deliberately keeps those tools available; one-each must
   * use the same policy rather than turn the absent holding dataset into a
   * no-fit verdict for every feature.
   */
  const held =
    catalog.holders.length === 0
      ? narrowed
      : narrowed.filter((verdict) =>
          holdable(
            verdict.tool,
            catalog.holders,
            catalog.collets,
            context.holderFilters,
            curve,
            context.margins,
            context.thresholds,
          ),
        )
  return { fitting: fitting.fitting, excluded: fitting.excluded, narrowed, held }
}

/** Runs the existing detailed table pipeline with only cloneable request inputs. */
export const detailedMatch = (
  context: MatchContext,
  demand: MatchDemand,
  catalog: MatcherCatalog,
  prepared: PreparedMatch = prepareMatch(context, catalog),
): DetailedResult => {
  const matched = matchDemand(context, demand, catalog, prepared)
  return {
    demandKey: demand.demandKey,
    fitting: matched.fitting.map(compact),
    excluded: matched.excluded.map(compact),
    narrowedGuids: matched.narrowed.map((verdict) => verdict.tool.guid),
    heldGuids: matched.held.map((verdict) => verdict.tool.guid),
  }
}

/** The first held verdict from the same pipeline used to build the table. */
export const recommendationMatch = (
  context: MatchContext,
  demand: MatchDemand,
  catalog: MatcherCatalog,
  prepared: PreparedMatch = prepareMatch(context, catalog),
): RecommendationResult => {
  const features = effectiveFeatures(context, demand)
  if (features.length === 0) {
    return { demandKey: demand.demandKey, state: 'nothing-fits', toolGuid: null }
  }
  const first = matchDemand(context, demand, catalog, prepared).held[0]
  return {
    demandKey: demand.demandKey,
    state: first === undefined ? 'nothing-fits' : 'ready',
    toolGuid: first?.tool.guid ?? null,
  }
}
