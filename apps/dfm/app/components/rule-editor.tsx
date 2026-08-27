import { useState } from 'react'
import type { ReactNode } from 'react'
import { CaretDownIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { Button, Input, TextArea } from '@toolpath/ui'
import { bandCss } from '../shared/bands'
import { COMPLETE, Caption, NumberBox } from './number-box'
import { KindIcon } from './feature-icons'
import { METRICS } from '../shared/metrics'
import type { RuleHit } from '../shared/rule-text'
import { costlyCount, worstOf } from '../shared/rules-summary'
import type { FeatureScore } from '../shared/feature-score'
import { ScoreBadge } from './score-badge'
import {
  displayDecimals,
  formatMetric,
  fromDisplay,
  ruleLimits,
  toDisplay,
  unitSuffix,
} from '../shared/rule-text'
import type { Band, FlagRule, MatchRule, Rule, RuleType, ThresholdRule } from '../shared/rules'
import {
  BANDS,
  FLAG_TESTS,
  PLAN_RULE_IDS,
  RULE_TYPES,
  asType,
  bandName,
  judgesPlan,
  plainType,
} from '../shared/rules'
import type { Unit } from '../shared/units'
import { decimalsFor } from '../shared/units'
import { rowAttributes } from '../shared/row-nav'

/**
 * A rule, editable.
 *
 * The limits are on the row itself rather than behind a press: moving one is
 * the thing a shop is here to do, and putting the commonest change behind a
 * click makes every other change look equally likely. Everything that is
 * decided once — what it reads, who it judges, its shape, its arithmetic —
 * lives under `more`.
 */

const SELECT =
  'h-7 rounded border border-edge-strong bg-transparent px-1.5 text-2xs text-ink-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-info'

/**
 * The sizes a shop holds, as one comma-separated line.
 *
 * Same draft as {@link NumberBox} and for the same reason: parsing the line on
 * every keystroke and rendering the result back rewrites what somebody is in
 * the middle of typing. Without it a decimal point is unreachable — `3, 6, 1.`
 * parses to `3, 6, 1` and the point is gone before the digit after it arrives —
 * and a comma cannot be typed either, because a trailing empty piece is
 * dropped and the separator goes with it.
 */
const SizeList = ({
  rule,
  unit,
  onChange,
}: {
  rule: MatchRule
  unit: Unit
  onChange: (rule: Rule) => void
}) => {
  const [draft, setDraft] = useState<string | null>(null)

  const settled = rule.standards
    .map((size) => Number(toDisplay(size, rule.metric, unit).toFixed(decimalsFor(unit))))
    .join(', ')

  return (
    <div className="flex min-w-40 flex-1 flex-col gap-0.5">
      <Caption>sizes held</Caption>
      <Input
        aria-label="Sizes held"
        className="w-full tabular-nums"
        id={`${rule.id}-standards`}
        name={`${rule.id}-standards`}
        size="md"
        value={draft ?? settled}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange({
            ...rule,
            standards: event.target.value
              .split(',')
              .map((piece) => piece.trim())
              .filter((piece) => COMPLETE.test(piece))
              .map((piece) => fromDisplay(Number(piece), rule.metric, unit)),
          })
        }}
      />
    </div>
  )
}

/**
 * A limit and the span it makes, in one column.
 *
 * The span sits under the box that sets it and shares its width, so the two
 * stay together when the panel is narrowed and the row wraps — a range that
 * reflows out from under its own number is worse than no range at all. Italic
 * and small because it is derived: it says what the number above it means, and
 * it is not another thing to type into.
 */
const ThresholdColumn = ({ range, children }: { range?: string; children: ReactNode }) => (
  <div className="flex w-24 flex-col gap-0.5">
    {children}
    <span className="truncate text-2xs italic tabular-nums text-ink-dim" title={range}>
      {range}
    </span>
  </div>
)

/** The five bands as dots, named on hover — one line, whatever the width. */
const BandDots = ({ rule, unit }: { rule: Rule; unit: Unit }) => {
  const limits = ruleLimits(rule, unit)

  if (limits.length === 0) return null

  return (
    <ul className="flex flex-wrap items-center gap-1">
      {limits.map((limit) => (
        <li
          key={limit.band}
          className="flex shrink-0 items-center gap-1 rounded bg-ground/60 px-1.5 py-0.5 text-2xs tabular-nums text-ink-body"
          title={`${limit.name} ${limit.range}`}
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ background: bandCss(limit.band) }}
          />
          {limit.range}
        </li>
      ))}
    </ul>
  )
}

/** The limits themselves, always open. */
const Limits = ({
  rule,
  unit,
  onChange,
}: {
  rule: Rule
  unit: Unit
  onChange: (rule: Rule) => void
}) => {
  if (rule.type === 'threshold') {
    const write = (at: number, value: number) => {
      const thresholds = [...rule.thresholds] as ThresholdRule['thresholds']
      thresholds[at] = value
      onChange({ ...rule, thresholds })
    }

    const limits = ruleLimits(rule, unit)

    return (
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        {rule.thresholds.map((threshold, at) => (
          <ThresholdColumn key={BANDS[at]} range={limits[at]?.range}>
            <NumberBox
              band={BANDS[at]}
              id={`${rule.id}-band-${at}`}
              label={`${bandName(BANDS[at] as Band, undefined, rule.bandNames)} to`}
              metric={rule.metric}
              onChange={(value) => write(at, value)}
              unit={unit}
              value={threshold}
            />
          </ThresholdColumn>
        ))}
        <ThresholdColumn range={limits.at(-1)?.range}>
          <NumberBox
            band="no go"
            id={`${rule.id}-no-go`}
            label={`${bandName('no go', undefined, rule.bandNames)} past`}
            metric={rule.metric}
            onChange={(value) => onChange({ ...rule, noGo: value })}
            // The one limit a rule can go without: emptying it means "nothing
            // is ever this bad", which is a setting rather than a blank.
            onClear={() => {
              const { noGo: _dropped, ...rest } = rule
              onChange(rest)
            }}
            placeholder="none"
            unit={unit}
            value={rule.noGo}
          />
        </ThresholdColumn>
      </div>
    )
  }

  if (rule.type === 'range') {
    return (
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
        {rule.spans.map((span, at) =>
          ([0, 1] as const).map((edge) => (
            <NumberBox
              key={`${BANDS[at]}-${edge}`}
              id={`${rule.id}-span-${at}-${edge}`}
              label={`${BANDS[at]} ${edge === 0 ? 'from' : 'to'}`}
              metric={rule.metric}
              onChange={(value) => {
                const spans = [...rule.spans] as typeof rule.spans
                const [from, to] = span
                spans[at] = edge === 0 ? [value, to] : [from, value]
                onChange({ ...rule, spans })
              }}
              unit={unit}
              value={span[edge]}
            />
          )),
        )}
      </div>
    )
  }

  if (rule.type === 'match') {
    return (
      // `items-end` throughout: the controls are what should line up, so they
      // sit on a common bottom edge and any caption that has to be shorter or
      // taller than its neighbours grows upwards instead of shunting its own
      // control down the row.
      <div className="flex flex-wrap items-end gap-2">
        <SizeList onChange={onChange} rule={rule} unit={unit} />
        <NumberBox
          id={`${rule.id}-tolerance`}
          label="within"
          metric={rule.metric}
          onChange={(value) => onChange({ ...rule, tolerance: value })}
          unit={unit}
          value={rule.tolerance}
        />
      </div>
    )
  }

  if (rule.type === 'flag') {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <Field label="test">
          <select
            aria-label="Test"
            className={SELECT}
            value={rule.op ?? '≠'}
            onChange={(event) => onChange({ ...rule, op: event.target.value as FlagRule['op'] })}
          >
            {FLAG_TESTS.map((test) => (
              <option key={test} value={test}>
                {test}
              </option>
            ))}
          </select>
        </Field>
        <NumberBox
          id={`${rule.id}-against`}
          label="against"
          metric={rule.metric}
          onChange={(value) => onChange({ ...rule, against: value })}
          unit={unit}
          value={typeof rule.against === 'number' ? rule.against : 0}
        />
        <Field label="raises">
          <BandSelect
            id={`${rule.id}-raises`}
            label="raises"
            onChange={(raises) => onChange({ ...rule, raises })}
            value={rule.raises}
          />
        </Field>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {Object.entries(rule.bands).map(([type, band]) => (
        <span key={type} className="flex items-center gap-1 text-2xs text-ink-muted">
          {type.replaceAll('_', ' ')}
          <BandSelect
            id={`${rule.id}-baseline-${type}`}
            label={`${type} starts at`}
            onChange={(next) => onChange({ ...rule, bands: { ...rule.bands, [type]: next } })}
            value={band as Band}
          />
        </span>
      ))}
    </div>
  )
}

/**
 * A band, chosen.
 *
 * Carries the band's own colour, because a column of identical dropdowns
 * reading "rats rats rats meh" is a list somebody has to read word by word to
 * find the one that differs.
 */
const BandSelect = ({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: Band
  onChange: (band: Band) => void
}) => (
  <span className="inline-flex items-center gap-1">
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: bandCss(value) }}
    />
    <select
      aria-label={label}
      className={SELECT}
      id={id}
      onChange={(event) => onChange(event.target.value as Band)}
      style={{ color: bandCss(value) }}
      value={value}
    >
      {BANDS.map((band) => (
        <option key={band} className="text-ink-strong" value={band}>
          {band}
        </option>
      ))}
    </select>
  </span>
)

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <Caption>{label}</Caption>
    {children}
  </div>
)

/** Every part of a rule, in the shape the feature picker settled on. */
const Settings = ({
  rule,
  types,
  unit,
  onChange,
  onRemove,
}: {
  rule: Rule
  types: readonly string[]
  unit: Unit
  onChange: (rule: Rule) => void
  onRemove: () => void
}) => {
  // Matched the way the rules match: the chips come from the part's own
  // vocabulary and the audience is written in the SDK's, so a literal `has`
  // lights none of them.
  const chosen = new Set(rule.featureTypes.map(plainType))
  const metric = rule.type === 'baseline' ? undefined : rule.metric

  return (
    <div className="ml-4 mt-1 flex flex-col gap-2 rounded border border-info/40 bg-info/5 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name">
          <Input
            aria-label="Rule name"
            className="w-48"
            id={`${rule.id}-name`}
            name={`${rule.id}-name`}
            size="md"
            value={rule.name}
            onChange={(event) => onChange({ ...rule, name: event.target.value })}
          />
        </Field>

        <NumberBox
          id={`${rule.id}-weight`}
          label="Weight"
          metric={undefined}
          onChange={(value) => onChange({ ...rule, weight: value })}
          raw
          unit={unit}
          value={rule.weight}
          width="w-16"
        />

        <Field label="Shape">
          <select
            aria-label="Rule shape"
            className={SELECT}
            onChange={(event) => onChange(asType(rule, event.target.value as RuleType))}
            value={rule.type}
          >
            {RULE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reads">
          {/* A baseline reads the kind of feature rather than a measurement.
              Saying so here beats hiding the control: "what does this rule
              read" is asked of every rule, and a gap where the answer should be
              reads as a control somebody forgot to fill in.

              A **part** rule reads the arrangement, and there are exactly two
              things it can read — which is why it is named rather than chosen.
              Offering the feature metrics here would be offering a rule about
              setups a choice of hole diameters. */}
          {judgesPlan(rule) ? (
            <select aria-label="Measurement" className={`${SELECT} max-w-64`} disabled value="plan">
              <option value="plan">
                {rule.id === PLAN_RULE_IDS.setups
                  ? 'How many setups the plan runs'
                  : 'Faces per operation, averaged over the plan'}
              </option>
            </select>
          ) : rule.type === 'baseline' ? (
            <select aria-label="Measurement" className={`${SELECT} max-w-64`} disabled value="type">
              <option value="type">The kind of feature</option>
            </select>
          ) : (
            <select
              aria-label="Measurement"
              className={`${SELECT} max-w-64`}
              onChange={(event) => onChange({ ...rule, metric: event.target.value as never })}
              value={rule.metric}
            >
              {METRICS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.field ? ` — ${entry.field}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {rule.type === 'threshold' ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Direction">
            <select
              aria-label="Which way the numbers get worse"
              className={SELECT}
              onChange={(event) =>
                onChange({ ...rule, direction: event.target.value as ThresholdRule['direction'] })
              }
              value={rule.direction}
            >
              <option value="higher is harder">higher is harder</option>
              <option value="lower is harder">lower is harder</option>
            </select>
          </Field>

          <Limits onChange={onChange} rule={rule} unit={unit} />
        </div>
      ) : null}

      {rule.type === 'range' ? (
        <div className="flex flex-col gap-1">
          {rule.spans.map((span, at) => (
            <div key={BANDS[at]} className="flex items-center gap-2">
              <span className="flex w-16 items-center gap-1 text-2xs text-ink-body">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ background: bandCss(BANDS[at] ?? null) }}
                />
                {BANDS[at]}
              </span>
              <NumberBox
                id={`${rule.id}-span-${at}-from`}
                label={`${BANDS[at]} from`}
                metric={metric}
                onChange={(value) => {
                  const spans = [...rule.spans] as typeof rule.spans
                  spans[at] = [value, span[1]]
                  onChange({ ...rule, spans })
                }}
                unit={unit}
                value={span[0]}
              />
              <span className="text-2xs text-ink-dim">to</span>
              <NumberBox
                id={`${rule.id}-span-${at}-to`}
                label={`${BANDS[at]} to`}
                metric={metric}
                onChange={(value) => {
                  const spans = [...rule.spans] as typeof rule.spans
                  spans[at] = [span[0], value]
                  onChange({ ...rule, spans })
                }}
                unit={unit}
                value={span[1]}
              />
            </div>
          ))}
          <label className="flex items-center gap-1.5 text-2xs text-ink-body">
            <input
              checked={rule.refuseOutside}
              className="size-3 accent-info"
              onChange={(event) => onChange({ ...rule, refuseOutside: event.target.checked })}
              type="checkbox"
            />
            Outside every span is a no go
          </label>
        </div>
      ) : null}

      {rule.type === 'match' ? (
        <div className="flex flex-col gap-2">
          <Field label="Sizes held">
            <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
              {/* Keyed by position alone. With the size in the key, every edit
                  changed the key of the box being typed into, so React unmounted
                  it and mounted a fresh one — dropping the half-typed draft and
                  the focus with it. The list is positional (`standards[at]`), so
                  the index is the identity. */}
              {rule.standards.map((size, at) => (
                // `items-end` so the remove button sits on the box's own line
                // rather than centred against the caption above it.
                <span key={at} className="flex items-end gap-0.5">
                  <NumberBox
                    id={`${rule.id}-size-${at}`}
                    label={`Size ${at + 1}`}
                    metric={metric}
                    onChange={(value) => {
                      const standards = [...rule.standards]
                      standards[at] = value
                      onChange({ ...rule, standards })
                    }}
                    unit={unit}
                    value={size}
                  />
                  <button
                    aria-label={`Remove size ${at + 1}`}
                    className="flex h-7 items-center px-0.5 text-2xs text-ink-dim hover:text-danger"
                    onClick={() =>
                      onChange({ ...rule, standards: rule.standards.filter((_, i) => i !== at) })
                    }
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ))}
              <Button
                onClick={() => onChange({ ...rule, standards: [...rule.standards, 0] })}
                size="sm"
                variant="secondary"
              >
                Add size
              </Button>
            </div>
          </Field>

          <div className="flex flex-wrap items-end gap-2">
            <NumberBox
              id={`${rule.id}-tolerance`}
              label="Tolerance"
              metric={metric}
              onChange={(value) => onChange({ ...rule, tolerance: value })}
              unit={unit}
              value={rule.tolerance}
            />
            <Field label="On the list">
              <BandSelect
                id={`${rule.id}-matched`}
                label="Where a match lands"
                onChange={(matched) => onChange({ ...rule, matched })}
                value={rule.matched}
              />
            </Field>
            <Field label="Off the list">
              <BandSelect
                id={`${rule.id}-unmatched`}
                label="Where anything else lands"
                onChange={(unmatched) => onChange({ ...rule, unmatched })}
                value={rule.unmatched}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {rule.type === 'flag' ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Fires when it">
            <select
              aria-label="Test"
              className={SELECT}
              onChange={(event) => {
                if (event.target.value === 'is set') {
                  const { op: _o, against: _a, ...rest } = rule
                  onChange(rest)
                  return
                }
                onChange({
                  ...rule,
                  op: event.target.value as FlagRule['op'],
                  against: rule.against ?? 0,
                })
              }}
              value={rule.op ?? 'is set'}
            >
              <option value="is set">is set</option>
              {FLAG_TESTS.map((test) => (
                <option key={test} value={test}>
                  {test}
                </option>
              ))}
            </select>
          </Field>

          {rule.op ? (
            <NumberBox
              id={`${rule.id}-against`}
              label="this"
              metric={metric}
              onChange={(value) => onChange({ ...rule, against: value })}
              unit={unit}
              value={typeof rule.against === 'number' ? rule.against : 0}
            />
          ) : null}

          <Field label="When it fires">
            <BandSelect
              id={`${rule.id}-raises`}
              label="Where a flagged feature lands"
              onChange={(raises) => onChange({ ...rule, raises })}
              value={rule.raises}
            />
          </Field>
        </div>
      ) : null}

      {rule.type === 'baseline' ? (
        <div className="flex flex-col gap-1">
          {Object.entries(rule.bands).map(([type, band]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="flex-1 text-2xs text-ink-body">{type.replaceAll('_', ' ')}</span>
              <BandSelect
                id={`${rule.id}-baseline-${type}`}
                label={`Where ${type} starts`}
                onChange={(next) => onChange({ ...rule, bands: { ...rule.bands, [type]: next } })}
                value={band as Band}
              />
              <button
                aria-label={`Stop judging ${type}`}
                className="px-0.5 text-2xs text-ink-dim hover:text-danger"
                onClick={() => {
                  const bands = { ...rule.bands }
                  delete bands[type as keyof typeof bands]
                  onChange({ ...rule, bands })
                }}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          <select
            aria-label="Add a feature type"
            className={SELECT}
            onChange={(event) =>
              onChange({ ...rule, bands: { ...rule.bands, [event.target.value]: 'meh' } })
            }
            value=""
          >
            <option value="">Add a feature type…</option>
            {types
              .filter((type) => !(type in rule.bands))
              .map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll('_', ' ')}
                </option>
              ))}
          </select>
        </div>
      ) : null}

      {/*
        A part rule has no audience.
        
        It is judged **once, over the plan** rather than against a pocket, so a
        list of feature types here would be a control that changes nothing —
        and the commonest reading of a control that changes nothing is that the
        app is broken.
      */}
      {judgesPlan(rule) ? (
        <p className="text-2xs leading-4 text-ink-dim">
          Judged once, over the whole plan — not against any one feature.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-2xs text-ink-muted">
            Applies to {chosen.size === 0 ? 'every feature type' : `${chosen.size} types`}
          </span>
          <div className="flex flex-wrap gap-1">
            {types.map((type) => (
              <button
                key={type}
                aria-pressed={chosen.has(plainType(type))}
                className={`rounded px-1.5 py-0.5 text-2xs ${
                  chosen.has(type) ? 'bg-info/25 text-info' : 'bg-raised text-ink-muted'
                }`}
                onClick={() =>
                  onChange({
                    ...rule,
                    featureTypes: chosen.has(plainType(type))
                      ? rule.featureTypes.filter((each) => plainType(each) !== plainType(type))
                      : [...rule.featureTypes, type],
                  })
                }
                type="button"
              >
                {type.replaceAll('_', ' ')}
              </button>
            ))}
            <button
              aria-pressed={chosen.size === 0}
              className={`rounded px-1.5 py-0.5 text-2xs ${
                chosen.size === 0 ? 'bg-info/25 text-info' : 'bg-raised text-ink-muted'
              }`}
              onClick={() => onChange({ ...rule, featureTypes: [] })}
              type="button"
            >
              Every type
            </button>
          </div>
        </div>
      )}

      <Field label="Custom arithmetic">
        <Input
          aria-label="Custom expression"
          className="w-full font-mono"
          id={`${rule.id}-expression`}
          name={`${rule.id}-expression`}
          placeholder="e.g. depthBelowPartTop / requiredCutter"
          size="md"
          value={rule.expression ?? ''}
          onChange={(event) => {
            const { expression: _dropped, ...rest } = rule
            onChange(event.target.value === '' ? rest : { ...rule, expression: event.target.value })
          }}
        />
      </Field>

      <Field label="Note">
        <TextArea
          aria-label="Rule note"
          className="w-full"
          id={`${rule.id}-note`}
          name={`${rule.id}-note`}
          rows={3}
          size="md"
          value={rule.note}
          onChange={(event) => onChange({ ...rule, note: event.target.value })}
        />
      </Field>

      <div className="flex justify-end">
        <Button onClick={onRemove} size="sm" variant="danger">
          Delete rule
        </Button>
      </div>
    </div>
  )
}

export const RuleCard = ({
  rule,
  hits,
  scores,
  types,
  unit,
  open,
  editing,
  focusedTag,
  onOpen,
  onEdit,
  onChange,
  onRemove,
  onChoose,
  onHover,
}: {
  rule: Rule
  hits: readonly RuleHit[]
  scores: ReadonlyMap<string, FeatureScore>
  types: readonly string[]
  unit: Unit
  /** Whether the rule is showing anything at all below its name. */
  open: boolean
  /** Whether what a rule reads and judges is open for changing. */
  editing: boolean
  focusedTag: string | null
  onOpen: () => void
  onEdit: () => void
  onChange: (rule: Rule) => void
  onRemove: () => void
  onChoose: (tag: string) => void
  onHover: (tags: string[]) => void
}) => {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? hits : hits.slice(0, 4)

  return (
    <li className="border-b border-edge/60 py-1.5 last:border-b-0">
      <div className="flex items-center gap-1.5">
        <button
          aria-expanded={open}
          aria-label={`${rule.name}: limits and what it caught`}
          className="shrink-0 text-ink-dim hover:text-ink-strong"
          {...rowAttributes(rule.id)}
          onClick={onOpen}
          type="button"
        >
          <CaretDownIcon className={`size-3 transition ${open ? '' : '-rotate-90'}`} />
        </button>

        <span
          className={`min-w-0 flex-1 truncate ${rule.enabled ? 'text-ink-strong' : 'text-ink-dim'}`}
        >
          {rule.name}
        </span>

        {/* How hard this rule is being on this part, and how much of that a
            shop would mind: the two numbers somebody scans a list of limits
            for. A rule with nothing to say says so, rather than showing a zero
            that reads like a verdict. */}
        {/*
          A part rule measured nothing because it is about the plan.

          "nothing to measure" is the right answer for a rule aimed at a feature
          type this part has none of, and exactly the wrong one here — it reads
          as a rule that failed to fire, when this one has not been asked yet
          and will not be asked about any feature at all.
        */}
        {judgesPlan(rule) ? (
          <span className="shrink-0 text-2xs italic text-ink-dim">judged over the plan</span>
        ) : hits.length === 0 ? (
          <span className="shrink-0 text-2xs italic text-ink-dim">nothing to measure</span>
        ) : (
          <>
            <span
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-2xs"
              style={{ background: `${bandCss(worstOf(hits))}22`, color: bandCss(worstOf(hits)) }}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: bandCss(worstOf(hits)) }}
              />
              {bandName(worstOf(hits) ?? 'easy')}
            </span>
            <span
              className="shrink-0 tabular-nums text-ink-dim"
              title="Readings a shop would mind, of the readings it made"
            >
              {costlyCount(hits)} costly · {hits.length}
            </span>
          </>
        )}

        <button
          aria-label={`Edit ${rule.name}`}
          aria-pressed={editing}
          className={`shrink-0 rounded p-1 ${
            editing ? 'bg-info/20 text-info' : 'text-ink-dim hover:text-ink-strong'
          }`}
          onClick={onEdit}
          title="What it reads, who it judges, its shape"
          type="button"
        >
          <PencilSimpleIcon className="size-3" />
        </button>

        <label className="flex shrink-0 items-center" title="Whether this rule judges anything">
          <span className="sr-only">{rule.name} applies</span>
          <input
            checked={rule.enabled}
            className="size-3 accent-info"
            onChange={(event) => onChange({ ...rule, enabled: event.target.checked })}
            type="checkbox"
          />
        </label>
      </div>

      {open ? (
        <>
          {editing ? (
            <Settings
              onChange={onChange}
              onRemove={onRemove}
              rule={rule}
              types={types}
              unit={unit}
            />
          ) : (
            <div className="ml-4 mt-1 rounded border border-edge bg-transparent p-2">
              <Limits onChange={onChange} rule={rule} unit={unit} />
            </div>
          )}

          {/*
            Where the mapped work landed, in one line.

            The rows below name each feature and the badge at the top names the
            worst of them — neither answers *how much of my part is in trouble
            under this limit*, which is the question a threshold is argued with.
            One chip per band that has anything in it, so a rule that put two
            features in `rats` and thirty in `easy` reads as a rule worth
            keeping rather than one worth turning off.

            Bands with nothing in them are left out rather than drawn as zero: a
            row of five with three zeroes is four things to read to find one.
          */}
          {hits.length > 0 ? (
            <div className="ml-4 mt-1.5 flex flex-wrap items-center gap-1">
              {BANDS.filter((each) => hits.some((hit) => hit.band === each)).map((each) => (
                <span
                  key={each}
                  className="flex items-center gap-1 rounded px-1 py-px text-3xs font-semibold tabular-nums"
                  style={{ background: `${bandCss(each)}22`, color: bandCss(each) }}
                  title={`${String(hits.filter((hit) => hit.band === each).length)} of the mapped features are ${bandName(each)} under this rule`}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ background: bandCss(each) }}
                  />
                  {hits.filter((hit) => hit.band === each).length} {bandName(each)}
                </span>
              ))}
            </div>
          ) : null}

          {/* What the limit actually cost, which is what somebody looks at
              before deciding whether the limit or the part is wrong. */}
          {shown.length > 0 ? (
            <ul className="mt-1" onMouseLeave={() => onHover([])}>
              {shown.map((hit) => (
                <li key={hit.tag}>
                  <button
                    className={`flex w-full items-center gap-2 rounded py-0.5 pl-4 pr-1 text-left text-2xs ${
                      hit.tag === focusedTag
                        ? 'bg-info/15 text-info'
                        : 'text-ink-muted hover:bg-ground/60'
                    }`}
                    {...rowAttributes(hit.tag)}
                    onClick={() => onChoose(hit.tag)}
                    // Arrowing onto a row opens it on the right, so the keyboard
                    // thumbs through features rather than moving a highlight
                    // somebody then has to press to read.
                    onFocus={() => onChoose(hit.tag)}
                    onMouseEnter={() => onHover([hit.tag])}
                    type="button"
                  >
                    {/* The drawing of the type, as every other list of
                        features in the app shows it — the band is already on
                        the score at the other end of the row. */}
                    <span className="shrink-0 text-ink-dim">
                      <KindIcon featureType={hit.featureType} kind="Other" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                    <span className="shrink-0 text-ink-dim">{hit.direction}</span>
                    <span className="shrink-0 tabular-nums text-ink-dim">{hit.regions}f</span>
                    <ScoreBadge score={scores.get(hit.tag)} />
                  </button>
                </li>
              ))}

              {/* The fifth feature a rule bit on is as interesting as the first
                  to somebody auditing it, and "and 20 more" with no way to see
                  them is a number to be taken on trust. */}
              {hits.length > 4 ? (
                <li>
                  <button
                    className="pl-4 text-3xs text-ink-dim underline decoration-dotted"
                    onClick={() => setShowAll((all) => !all)}
                    type="button"
                  >
                    {showAll ? 'fewer' : `and ${hits.length - 4} more`}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  )
}
