import type { CatalogTool, Collet, Holder, HolderFilters, Margins } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { withClampingLength, type ClampingRule } from './clamping-length'
import { filterTools, type ToolQuery } from './filter'
import { holdable, policyOf, type HoldThresholds } from './holder-choice'
import { holdableTools, splitHolding } from './holding'
import { closestMisses, closestPerForm, type Format, type Reason, type Verdict } from './judge'
import { sectionOf } from './section-of'
import {
  fittingTools,
  overridableCount,
  overridableTally,
  overridableTools,
  ruleTally,
} from './tool-fit'
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
  /**
   * The geometry columns whose rules the person has set aside, by code.
   *
   * **A filter overrules the rule it is the same question as, and no other**
   * (Paul, 2026-09-08: "it should only override for that specific rule, related
   * to the specific filter"). Widening the Diameter bound and confirming it in
   * that column's dialog puts `DC` here; a tool the flute-length rows turned
   * down stays off the list, because nobody looked at that question.
   *
   * Part of the context rather than of a demand: it changes what an answer *is*,
   * so it has to be in the key that owns the answer. `matchKey` leaves it out of
   * a recommendation batch for the same reason it leaves the unit out — a
   * one-each pick is never drawn from the removed set, so an override cannot
   * move it and must not evict its cache entry.
   */
  readonly overrides: ReadonlyArray<string>
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
  /**
   * The identity of `context.features`, so the part crosses the boundary once.
   *
   * **The report is the same report all session** (Paul, 2026-09-07: "it still
   * lags quite a bit when I finish with one feature then go to select another …
   * the hover highlight and ability to click on the model hangs for a couple of
   * seconds"). Every request carried the whole feature list — measured at
   * 3.4 MB a message on a 400-feature part, three messages to a selection, each
   * one serialised twice on the way out and cloned again by the browser. None of
   * it changes between requests.
   *
   * So the features travel once and the worker keeps them under this key; a
   * later request states the key and sends `context.features` empty. A worker
   * that does not hold the key says so, and the client sends them again — which
   * is what makes this safe across a worker that restarted or a cache that was
   * never warmed.
   */
  readonly featuresKey: string
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
  /**
   * The removed tools that came closest, and only those.
   *
   * **The whole excluded set does not cross the worker boundary** (2026-09-07).
   * A drill question against the scraped catalog removes some 37,000 tools, and
   * sending them was a 21 MB structured clone each way for a list of eight near
   * misses, a tally and a count — measured at ~90 ms in each direction before a
   * row was drawn, with four of them held in the worker's table cache.
   *
   * {@link NEAR_MISSES} of them, ranked the way `closestMisses` ranks, so the
   * eight the panel asks for are the eight it would have picked from the whole
   * set. What is lost is a verdict for a tool nothing was going to show — which
   * is why the two things a count *is* used for travel beside it as numbers.
   */
  readonly nearMisses: ReadonlyArray<CompactVerdict>
  /**
   * The removed tools the **filters** still admit: what overriding the rules
   * offers, nearest first.
   *
   * Distinct from {@link nearMisses} in both directions. Those are the closest
   * misses to the *rules*, drawn without the ranges so that a tool a little
   * outside one can be offered when nothing fits; these are what the person's
   * own ranges ask for, however far outside a rule they land. `tool-fit.ts`
   * `overridableTools` is the rule and says why the two cannot be one list.
   *
   * Empty until {@link MatchContext.overrides} names a column: nothing is
   * forgiven that nobody asked to have forgiven.
   */
  readonly overridable: ReadonlyArray<CompactVerdict>
  /**
   * How many tools each column alone is keeping off the list, forgiven or not.
   *
   * What the filter dialog offers before anything is overridden, and the reason
   * the count is taken here: it is measured over the whole removed set, which
   * only exists on this side of the boundary.
   */
  readonly overridableByCode: Readonly<Record<string, number>>
  /**
   * How many {@link overridable} would hold uncapped — what the list says it is
   * not showing. **No silent caps**: a truncated list that reads as the whole
   * answer is the defect this number exists to prevent.
   */
  readonly overridableCount: number
  /** How many tools the rules removed in all, since {@link nearMisses} is a slice of them. */
  readonly excludedCount: number
  /** How many each rule removed first: what `tightestOf` reads. */
  readonly ruleTally: Readonly<Record<string, number>>
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
      /**
       * The features this request names are not the ones the worker holds.
       *
       * Not an error: the client answers it by sending them, which is the whole
       * of the recovery. A worker that restarted, or one that never saw this
       * report, both land here.
       */
      readonly requestId: number
      readonly kind: 'needs-features'
      readonly requestKind: MatchKind
      readonly key: string
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

/**
 * The identity of a report's features, computed once for each array.
 *
 * **A key is asked for on every render; the report is read once.** `stable` over
 * a few hundred features with their datasheets builds megabytes of string, and
 * `matchKey` runs on every selection, every filter change and every keystroke in
 * the search box — so the walk is done once per features array and remembered
 * against it. A different array is a different report and gets a different
 * digest.
 *
 * Digested rather than kept whole so that remembering it costs a few bytes
 * instead of the megabytes it was built from. FNV-1a over the serialisation,
 * with the length beside it: a hash collision would have to land on two
 * different reports of exactly the same size.
 */
const FINGERPRINTS = new WeakMap<object, string>()

export const featuresKey = (features: ReadonlyArray<PartFeature>): string => {
  const had = FINGERPRINTS.get(features)
  if (had !== undefined) {
    return had
  }
  const written = stable(features)
  let hash = 0x811c9dc5
  for (let at = 0; at < written.length; at += 1) {
    hash ^= written.charCodeAt(at)
    hash = Math.imul(hash, 0x01000193)
  }
  const made = `${String(written.length)}:${(hash >>> 0).toString(16)}`
  FINGERPRINTS.set(features, made)
  return made
}

/**
 * A deterministic key for response ownership and the worker's optional cache.
 *
 * The features are in it by their digest rather than in full: two reports with
 * the same digest are the same report, and serialising a part's whole geometry
 * into a cache key on every render is what this key cost before.
 */
export const matchKey = (
  kind: MatchKind,
  context: MatchContext,
  demands: ReadonlyArray<MatchDemand>,
): string =>
  stable({
    kind,
    // Recommendation verdicts contain only a GUID, so display units cannot affect
    // either the answer or its cache entry.
    context: {
      ...(kind === 'recommendations'
        ? { ...context, unit: 'millimeters', overrides: [] }
        : { ...context, overrides: [...context.overrides].sort() }),
      features: featuresKey(context.features),
    },
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
/**
 * The catalog by guid, built once for each tools array.
 *
 * Every answer that comes back from the worker names its tools by guid, and the
 * index to resolve them was rebuilt from all 38,000 of them each time — once a
 * table result, once a recommendation batch. The array is the module-level
 * catalog and never changes, so the map is remembered against it.
 */
const INDEXES = new WeakMap<object, Map<string, CatalogTool>>()

const toolIndex = (tools: ReadonlyArray<CatalogTool>): Map<string, CatalogTool> => {
  const had = INDEXES.get(tools)
  if (had !== undefined) {
    return had
  }
  const made = new Map(tools.map((tool) => [tool.guid, tool]))
  INDEXES.set(tools, made)
  return made
}

export const rehydrateVerdicts = (
  compactVerdicts: ReadonlyArray<CompactVerdict>,
  tools: ReadonlyArray<CatalogTool>,
): Array<Verdict> => {
  const byGuid = toolIndex(tools)
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
  /** The whole catalog at the shop's configured setup length. */
  readonly tools: ReadonlyArray<CatalogTool>
  /**
   * The tools any answer is drawn from: the discrete filters, **without the
   * ranges**.
   *
   * **This is what the rules are run over** (2026-09-07). Judging the whole
   * catalog and narrowing afterwards cost 340 ms a demand against the scraped
   * 38,114 tools — a drill question paying to judge 11,566 taps and 21,132 end
   * mills before discarding them — and the feature list asks one demand per
   * row, so a forty-hole part spent twelve seconds of the one worker thread
   * before a single drill reached the table. Judging this set instead is 65 ms.
   *
   * The ranges are deliberately left out rather than folded in with the rest:
   * `closeCandidates` drops them too, because "close" is exactly a tool a
   * little outside a range, and a near miss judged away here could not be
   * offered as one later.
   */
  readonly considered: ReadonlyArray<CatalogTool>
  /** Those of them the filters actually admit — what a row may show. */
  readonly admitted: ReadonlyArray<CatalogTool>
  /**
   * The same set by guid, built once for the whole request.
   *
   * Every demand asks it twice — once to narrow what fits, once to work out
   * what an override would offer — and a request carries one demand per feature
   * row, so building it per demand was a 38,000-entry set per question.
   */
  readonly admittedGuids: ReadonlySet<string>
}

export const prepareMatch = (context: MatchContext, catalog: MatcherCatalog): PreparedMatch => {
  const tools = withClampingLength(catalog.tools, context.clamping, policyOf(context.thresholds))
  const { tools: toolQuery, holding } = splitHolding(context.query)
  const considered = holdableTools(filterTools(tools, { ...toolQuery, ranges: {} }), holding)
  // The same set the old one-pass filter gave: the discrete predicate is
  // idempotent and the holding one is independent of it, so applying the ranges
  // to what is already discretely filtered leaves the ranges as the difference.
  const admitted = filterTools(considered, toolQuery)
  return { tools, considered, admitted, admittedGuids: new Set(admitted.map((each) => each.guid)) }
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
    prepared.considered,
    matcherFormat(context.unit),
    context.knobs,
    /*
      **A form the filter asks for is a form the question is about.** The type
      table is the feature's default, and the `form` filter is the one place
      that says which forms are being asked about — so a group added there
      (`formsAsking`, `shared/tool-type.ts`) reaches the judging rather than being
      removed by the type table under a filter that had just admitted it. It is
      already in the context, so no cache key changes and no second state can
      disagree with it.
    */
    context.query.terms.form ?? [],
  )
  const narrowed = fitting.fitting.filter((verdict) =>
    prepared.admittedGuids.has(verdict.tool.guid),
  )
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

/**
 * How many of the removed tools travel back with a table answer.
 *
 * The panel asks for eight. The rest of the headroom is for `closeCandidates`,
 * which narrows them again by the discrete filters before the eight are taken,
 * and for the marks the table paints on a near miss it draws.
 */
const NEAR_MISSES = 50

/**
 * How many of the rules' removals an override may offer.
 *
 * The same reasoning as {@link NEAR_MISSES} — the whole removed set is tens of
 * thousands of verdicts and must not cross the boundary — but **not the same
 * number, and this is why**:
 *
 * It was 200, which is a fill-of-last-resort's cap on a list that is the
 * answer. Nearest first, so those 200 were the tools that miss the rule by the
 * least, and asking a 38,000-tool catalog for `diameter at most 0.500 in`
 * against a pocket that wants 0.400 in filled every slot with ⌀12 mm cutters
 * and never reached the 663 half-inch ones the filter was typed to find (Paul,
 * 2026-09-08: "it still doesn't seem to be going up to the bounds — I'm sure
 * there are 1/2 inch tools with greater than 0.980 inch flute length in this
 * library"). A cap that hides exactly the end of the range somebody widened
 * *to* is worse than no override at all.
 *
 * So it is the table's own row cap: the list cannot draw more than this
 * anyway, and what is left out is left out by the same number and said in the
 * same place as every other truncation on this page.
 */
const OVERRIDABLE = 2000

/**
 * The removed tools worth sending: the nearest overall, and the nearest of
 * each form the filters are asking about.
 *
 * **The slice cannot be form-blind while the filters name forms** (Paul,
 * 2026-09-09: ticking the end mills on a predrill and getting none). The
 * fifty nearest to a ⌀0.089 in bore are fifty drills, so an end mill's own
 * nearest miss never crossed the boundary and no amount of asking on the other
 * side could show one. `closestPerForm` is the rule; this is where the set it
 * ranks still exists.
 *
 * One form, or none, is the whole removed set ranked once, which is what it
 * always was.
 */
const nearestFew = (
  excluded: ReadonlyArray<Verdict>,
  forms: ReadonlyArray<string>,
): Array<Verdict> => {
  const overall = closestMisses(excluded, NEAR_MISSES)
  if (forms.length < 2) {
    return overall
  }
  const sent = new Set(overall.map((verdict) => verdict.tool.guid))
  return [
    ...overall,
    ...closestPerForm(excluded, forms, NEAR_MISSES).filter(
      (verdict) => !sent.has(verdict.tool.guid),
    ),
  ]
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
    nearMisses: nearestFew(matched.excluded, context.query.terms.form ?? []).map(compact),
    overridable: overridableTools(
      matched.excluded,
      prepared.admittedGuids,
      context.overrides,
      OVERRIDABLE,
    ).map(compact),
    overridableByCode: overridableTally(matched.excluded, prepared.admittedGuids),
    /**
     * How many the forgiven columns put back in all, so a truncated
     * {@link overridable} can say what it left out rather than reading as the
     * whole answer.
     */
    overridableCount: overridableCount(matched.excluded, prepared.admittedGuids, context.overrides),
    excludedCount: matched.excluded.length,
    ruleTally: ruleTally(matched.excluded),
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
