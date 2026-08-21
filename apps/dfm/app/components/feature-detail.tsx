import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { Badge, Button, IconButton, Tooltip } from '@toolpath/ui'
import { useEffect, useRef, useState } from 'react'
import type { PartFeature, PublicInspectionReport } from '../shared/contracts'
import { directionCss } from '../shared/direction-colors'
import { moveThroughList } from '../shared/list-keys'
import { measurements, stripMeasurements, STRIP_LABELS } from '../shared/measurements'
import { asRecord, directionLabel, facts, featureSummary, rawDatasheet } from '../shared/report'
import type { Unit } from '../shared/units'
import type { FeatureVerdict, Rule } from '../shared/rules'
import type { PartContext } from '../shared/metrics'
import { RuleVerdict } from './rule-verdict'
import type { FeatureScore } from '../shared/feature-score'
import { ScoreBadge } from './score-badge'
import { KindIcon, MeasurementIcon } from './feature-icons'

/** The Engine's own family for a feature, for the drawing that stands for it. */
const kindOf = (feature: PartFeature): string => {
  const kind = facts(feature)?.kind
  return typeof kind === 'string' ? kind : 'Other'
}

/** Which way up it is cut from, as a position in the part's own list. */
const directionOf = (report: PublicInspectionReport, feature: PartFeature): number =>
  report.candidateDirections.findIndex(
    (direction) =>
      direction.x === feature.machiningDirection.x &&
      direction.y === feature.machiningDirection.y &&
      direction.z === feature.machiningDirection.z,
  )

/** The last six of the tag: enough to tell two features apart, at a glance. */
const shortTag = (tag: string): string => tag.slice(-6)

/**
 * Every field the Engine sent, flattened.
 *
 * Under a disclosure rather than in the table: the table is the handful of
 * questions anybody asks, and this is the answer to "but what else is in
 * there", which is a different question asked far less often.
 */
function flatten(value: unknown, prefix = ''): [string, string][] {
  const record = asRecord(value)
  if (!record) return []

  return Object.entries(record).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const nested = asRecord(entry)
    if (nested) return flatten(nested, path)
    if (Array.isArray(entry)) return [[path, `[${entry.length}]`] as [string, string]]
    return [[path, String(entry)] as [string, string]]
  })
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-5">
    <h3 className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-zinc-500">{title}</h3>
    {children}
  </section>
)

/**
 * A compact, self-confirming clipboard action for the raw values below.
 *
 * The field name stays in the accessible label after copying, so a screen
 * reader still says what was copied rather than only confirming an action.
 */
const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false)
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (reset.current) clearTimeout(reset.current)
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (reset.current) clearTimeout(reset.current)
      reset.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access is unavailable in some embedded or non-secure views.
      // Leave the displayed value selectable in that case.
    }
  }

  const action = `Copy ${label}`
  return (
    <Tooltip tip={copied ? 'Copied' : action}>
      <IconButton size="sm" variant="muted" aria-label={action} title={action} onClick={copy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </IconButton>
    </Tooltip>
  )
}

export const FeatureDetail = ({
  feature,
  report,
  candidates,
  scores,
  onChoose,
  onZoom,
  onClose,
  unit,
  verdict,
  rules,
  part,
}: {
  feature: PartFeature | null
  report: PublicInspectionReport
  candidates: readonly PartFeature[]
  /** How hard each candidate is, so the list ranks as well as lists. */
  scores: ReadonlyMap<string, FeatureScore>
  onChoose: (featureTag: string) => void
  onZoom: (featureTag: string) => void
  onClose: () => void
  unit: Unit
  /** What the rules made of the feature being read, if any is. */
  verdict: FeatureVerdict | null
  rules: readonly Rule[]
  /** The context the verdict was judged with, so the working shows the same numbers. */
  part: PartContext
}) => (
  <aside className="flex size-full min-h-0 flex-col overflow-y-auto bg-zinc-900">
    {/* The readings a click could have meant, above the one being read: the
        click asked about a face, and which of its readings is on screen is the
        question still open. */}
    {candidates.length > 1 ? (
      <section className="border-b border-zinc-800 p-3">
        <h3 className="text-2xs font-bold uppercase tracking-wider text-zinc-500">
          Candidate features{' '}
          <span className="font-normal normal-case tracking-normal">
            {candidates.length} readings of this face
          </span>
        </h3>
        <ul
          className="mt-2 flex flex-col gap-0.5"
          data-keynav="candidates"
          onKeyDown={(event) => moveThroughList(event)}
        >
          {candidates.map((candidate, at) => {
            const summary = featureSummary(candidate)
            const chosen = candidate.featureTag === feature?.featureTag
            return (
              <li key={candidate.featureTag}>
                <button
                  type="button"
                  data-row={candidate.featureTag}
                  aria-pressed={chosen}
                  onClick={() => onChoose(candidate.featureTag)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition ${
                    chosen ? 'bg-info/15 text-info' : 'text-zinc-300 hover:bg-zinc-950/60'
                  }`}
                >
                  <span className="w-3 tabular-nums text-zinc-500">{at + 1}</span>
                  <span className="text-zinc-400">
                    <KindIcon featureType={candidate.featureType} kind={kindOf(candidate)} />
                  </span>
                  <span className="flex-1 truncate">{summary.type}</span>
                  <span className="text-2xs text-zinc-500">{summary.regionCount}f</span>
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: directionCss(directionOf(report, candidate)) }}
                  />
                  <Badge variant="secondary">{summary.direction}</Badge>
                  <ScoreBadge score={scores.get(candidate.featureTag)} />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    ) : null}

    {feature ? (
      <div className="p-3">
        <header className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold leading-tight">
              <KindIcon featureType={feature.featureType} kind={kindOf(feature)} />
              {featureSummary(feature).type}
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => onZoom(feature.featureTag)}>
                Zoom
              </Button>
              <Button size="sm" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {facts(feature)?.kind ? (
              <Badge variant="secondary">{facts(feature)?.kind}</Badge>
            ) : null}
            <Badge variant="info">{directionLabel(feature.machiningDirection)}</Badge>
            <span className="text-2xs text-zinc-400">
              {feature.regionIdxs.length} {feature.regionIdxs.length === 1 ? 'region' : 'regions'}
            </span>
            <span className="ml-auto font-mono text-2xs text-zinc-500" title={feature.featureTag}>
              {shortTag(feature.featureTag)}
            </span>
          </div>

          {/* The numbers a tool is chosen with, before the table of everything
              else — a selection from the same rows, so the two cannot disagree. */}
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {stripMeasurements(
              measurements({ feature, features: report.features, regions: report.regions, unit }),
            ).map((row) => (
              <span key={row.key} className="flex items-center gap-1.5">
                <span className="text-zinc-500">
                  <MeasurementIcon measurement={row.key} />
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold tabular-nums text-zinc-100">{row.value}</span>
                  <span className="text-2xs text-zinc-500">
                    {STRIP_LABELS[row.key] ?? row.label}
                  </span>
                </span>
              </span>
            ))}
          </div>
        </header>

        {verdict ? (
          <RuleVerdict feature={feature} part={part} rules={rules} unit={unit} verdict={verdict} />
        ) : null}

        <Section title="Measurements">
          <dl className="text-xs">
            {measurements({
              feature,
              features: report.features,
              regions: report.regions,
              unit,
            }).map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-4 py-1">
                <dt
                  className="flex items-center gap-2 whitespace-pre text-zinc-400"
                  // Every row says where it came from: a number a shop cannot
                  // trace is one they have to take on faith.
                  title={row.note ? `${row.from} — ${row.note}` : row.from}
                >
                  <span className="text-zinc-500">
                    <MeasurementIcon measurement={row.key} />
                  </span>
                  <span>
                    {row.label} <span className="text-zinc-500">ⓘ</span>
                  </span>
                </dt>
                <dd className="text-right font-medium tabular-nums text-zinc-200">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <details className="mt-5 border-t border-zinc-800 pt-3">
          <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-zinc-500">
            All datasheet fields
          </summary>
          <dl className="mt-2 text-2xs">
            {flatten(feature.datasheet).map(([path, value]) => (
              <div key={path} className="flex items-baseline justify-between gap-4 py-0.5">
                <dt className="font-mono text-zinc-500">{path}</dt>
                <dd className="flex shrink-0 items-center gap-1 text-right font-mono tabular-nums text-zinc-300">
                  <span>{value}</span>
                  <CopyButton value={value} label={`${path} value`} />
                </dd>
              </div>
            ))}
          </dl>
        </details>

        <details className="mt-3 border-t border-zinc-800 pt-3">
          <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-zinc-500">
            Raw API record
          </summary>
          <div className="mt-2">
            <div className="flex justify-end">
              <CopyButton value={rawDatasheet(feature)} label="raw API record" />
            </div>
            <pre className="max-h-80 overflow-auto rounded bg-transparent p-2 text-2xs leading-5 text-zinc-400">
              {rawDatasheet(feature)}
            </pre>
          </div>
        </details>
      </div>
    ) : (
      <p className="p-4 text-sm text-zinc-500">
        Click a face on the part, or a feature in the list, to read it.
      </p>
    )}
  </aside>
)
