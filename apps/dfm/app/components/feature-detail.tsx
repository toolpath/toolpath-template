import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { Badge, Button, IconButton, Tooltip } from '@toolpath/ui'
import { useEffect, useRef, useState } from 'react'
import type { PartFeature, PublicInspectionReport } from '../shared/contracts'
import type { PickMode } from '../shared/pick-mode'
import { directionCss } from '../shared/direction-colors'
import { measurements, stripMeasurements, STRIP_LABELS } from '../shared/measurements'
import {
  asRecord,
  directionLabel,
  facts,
  featureSummary,
  kindOf,
  rawDatasheet,
} from '../shared/report'
import { cutRegions, cutState, faceCounts, takenOn } from '../shared/setups'
import { PassButtons } from './pass-buttons'
import type { Pass, SetupPlan } from '../shared/setups'
import { setupForReading } from '../shared/plan-actions'
import type { Unit } from '../shared/units'
import type { FeatureVerdict, Rule } from '../shared/rules'
import type { PartContext } from '../shared/metrics'
import { RuleVerdict } from './rule-verdict'
import type { FeatureScore } from '../shared/feature-score'
import { FaceCount } from './face-count'
import { isMade } from '../shared/make-feature'
import { addedFrom, asPlanned, isDerived } from '../shared/worst-case'
import { KindIcon, MeasurementIcon } from './feature-icons'
import { pluralLabel, typeLabel } from '../shared/part-summary'

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
    <h3 className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-ink-dim">{title}</h3>
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
  mode,
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
  plan,
  siblings,
  showingPass,
  onSetPass,
  onShowFaces,
  onDelete,
}: {
  feature: PartFeature | null
  /** Which mode the panel above is in, so the invitation names its gesture. */
  mode: PickMode
  report: PublicInspectionReport
  candidates: readonly PartFeature[]
  /** How hard each candidate is, so the list ranks as well as lists. */
  scores: ReadonlyMap<string, FeatureScore>
  onChoose: (featureTag: string) => void
  /** The mapping so far, so a reading can say which way up already cuts it. */
  plan: SetupPlan
  /**
   * Identical holes this one stands for — same diameter, depth and way up.
   *
   * A datasheet reading "Blind hole" when sixteen of them are lit on the part
   * describes one of the sixteen and says nothing about the other fifteen. It
   * says **how many** and nothing more: *which* sixteen is a question about the
   * plan, so the list of them lives in Map features, where each one can be
   * assigned, read and lit on its own. A second copy here was a table that
   * could only be looked at.
   */
  siblings: readonly PartFeature[]
  /** Which pass the face count is counting. */
  showingPass: Pass
  /** Assign this reading to its own direction. Empty passes takes it off both. */
  onSetPass: (feature: PartFeature, passes: ReadonlyArray<Pass>) => void
  /** Open this reading's faces, in place of this panel. */
  onShowFaces: (featureTag: string) => void
  /** Take a made reading off the part. Reported ones cannot be deleted. */
  onDelete: (featureTag: string) => void
  onZoom: (featureTag: string) => void
  onClose: () => void
  unit: Unit
  /** What the rules made of the feature being read, if any is. */
  verdict: FeatureVerdict | null
  rules: readonly Rule[]
  /** The context the verdict was judged with, so the working shows the same numbers. */
  part: PartContext
}) => {
  /*
   * The reading as the **plan** has it, not as the Engine reported it.
   *
   * A face handed to this reading is a face one tool now has to reach, and the
   * datasheet had no idea: it went on reporting the depth, the corner and the
   * area of the reading as it was before, which is a measurement of something
   * nobody is going to cut. The reading the added face came from is folded in
   * as a worst case — the same arithmetic a merge does, and named below for the
   * same reason.
   */
  const planned =
    feature === null ? null : asPlanned(report, takenOn(plan, feature, showingPass), feature)
  const built = planned === null ? [] : addedFrom(planned)

  return (
    <aside className="flex size-full min-h-0 flex-col overflow-y-auto bg-ground">
      {feature ? (
        <div className="p-3">
          <header className="flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold leading-tight">
                <KindIcon featureType={feature.featureType} kind={kindOf(feature)} />
                {siblings.length > 1
                  ? pluralLabel(featureSummary(feature).type)
                  : featureSummary(feature).type}
                {siblings.length > 1 ? (
                  <span
                    className="rounded bg-raised px-1.5 py-0.5 font-sans text-sm font-semibold text-ink-body"
                    title={`${String(siblings.length)} identical holes — same diameter, depth and way up`}
                  >
                    ×{siblings.length}
                  </span>
                ) : null}
              </h2>
              <div className="flex shrink-0 items-center gap-1.5">
                {/*
                Only a made one, and only here.
                
                A reading the Engine reported is a fact about the part and
                cannot be deleted — it can be left unmapped, which is what
                disagreeing with it means. One somebody drew is theirs, and a
                thing that can be made and not unmade is a trap.
              */}
                {isMade(feature) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onDelete(feature.featureTag)}
                  >
                    Delete
                  </Button>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => onZoom(feature.featureTag)}>
                  Zoom
                </Button>
                <Button size="sm" variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>

            {/*
            Mapping the feature being read, whichever way it was reached.
            The readings list above only appears for a face with more than one
            reading, and only after a click on the part — but a feature with a
            single reading is the one most worth mapping, because nothing else
            can cut it. So the same three presses live here too.
          */}
            <div className="flex items-center gap-2 rounded border border-edge bg-ground/40 px-2 py-1.5">
              <span className="text-2xs font-bold uppercase tracking-wider text-ink-dim">
                Cut from
              </span>
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: directionCss(directionOf(report, feature)) }}
              />
              <span className="flex-1 truncate text-xs font-medium text-ink-body">
                {directionLabel(feature.machiningDirection)}
              </span>
              <PassButtons
                label={directionLabel(feature.machiningDirection)}
                rough={cutState(
                  plan,
                  feature,
                  'rough',
                  setupForReading(plan, report.candidateDirections, feature),
                )}
                finish={cutState(
                  plan,
                  feature,
                  'finish',
                  setupForReading(plan, report.candidateDirections, feature),
                )}
                onSetPass={(passes) => onSetPass(feature, passes)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {facts(feature)?.kind ? (
                <Badge variant="secondary">{facts(feature)?.kind}</Badge>
              ) : null}
              <Badge variant="info">{directionLabel(feature.machiningDirection)}</Badge>
              {/* The same doorway the lists carry: a face is the level below a
                reading, and this is how you get to it from here. */}
              <FaceCount
                {...faceCounts(plan, feature)}
                onShow={() => onShowFaces(feature.featureTag)}
              />
              <span className="ml-auto font-mono text-2xs text-ink-dim" title={feature.featureTag}>
                {shortTag(feature.featureTag)}
              </span>
            </div>

            {/*
            What these numbers were worked out from, where they are not simply
            this reading's own.
            
            A merged reading is a decision to machine several things as one, and
            a reading handed a face is that decision made one face at a time.
            Either way the measurements below are the **worst** of several
            readings, and showing only the result would ask a shop to trust
            arithmetic it cannot see the inputs to.
          */}
            {built.length === 0 ? null : (
              <div className="mt-1.5 rounded border border-proposed/40 bg-proposed/10 px-2 py-1">
                <p className="text-2xs font-semibold text-proposed">
                  Handed a face, so it also carries:
                </p>
                <ul className="mt-0.5 flex flex-col">
                  {built.map((source) => (
                    <li
                      key={source.featureTag}
                      className="flex items-center gap-2 text-2xs text-ink-muted"
                    >
                      <span aria-hidden="true">└</span>
                      <span className="flex-1 truncate">{typeLabel(source.featureType)}</span>
                      <span className="shrink-0 text-ink-dim">{source.from}</span>
                      <span className="shrink-0 tabular-nums text-ink-dim">{source.faces}f</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/*
              Whose numbers these are.
              
              Everything below is **our arithmetic** over readings the Engine
              measured — defensible rules, not an analysis: nobody has looked at
              the geometry of the merged shape. A made feature is meant to go
              back to the Engine, and what comes back replaces these wholesale
              (`withEngineDatasheet`). Until then the panel says which kind it is
              showing, because a derived number presented as a measured one is
              the worst thing this panel could do.
            */}
            {planned === null || !isDerived(planned) ? null : (
              <p className="mt-1.5 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs leading-4 text-warning">
                Worked out here, not measured. The Engine has not analysed this feature — these are
                the worst of its sources&rsquo; numbers, which is the safe answer for choosing a
                tool and not a measurement of the shape.
              </p>
            )}

            {/* The numbers a tool is chosen with, before the table of everything
              else — a selection from the same rows, so the two cannot disagree. */}
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
              {stripMeasurements(
                measurements({
                  feature: planned ?? feature,
                  features: report.features,
                  regions: report.regions,
                  unit,
                }),
              ).map((row) => (
                <span key={row.key} className="flex items-center gap-1.5">
                  <span className="text-ink-dim">
                    <MeasurementIcon measurement={row.key} />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-semibold tabular-nums text-ink">{row.value}</span>
                    <span className="text-2xs text-ink-dim">
                      {STRIP_LABELS[row.key] ?? row.label}
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </header>

          {verdict ? (
            <RuleVerdict
              feature={feature}
              part={part}
              rules={rules}
              unit={unit}
              verdict={verdict}
            />
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
                    className="flex items-center gap-2 whitespace-pre text-ink-muted"
                    // Every row says where it came from: a number a shop cannot
                    // trace is one they have to take on faith.
                    title={row.note ? `${row.from} — ${row.note}` : row.from}
                  >
                    <span className="text-ink-dim">
                      <MeasurementIcon measurement={row.key} />
                    </span>
                    <span>
                      {row.label} <span className="text-ink-dim">ⓘ</span>
                    </span>
                  </dt>
                  <dd className="text-right font-medium tabular-nums text-ink-strong">
                    {row.value}
                    {/* The other unit, quietly. A shop reads in one and buys
                        tooling in the other, and the sum between them is the
                        kind somebody gets wrong once and then trusts. */}
                    {row.alt === undefined ? null : (
                      <span className="ml-1.5 font-normal text-ink-dim">{row.alt}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>

          <details className="mt-5 border-t border-edge pt-3">
            <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-ink-dim">
              {isDerived(feature) ? 'All fields (worked out here)' : 'All datasheet fields'}
            </summary>
            <dl className="mt-2 text-2xs">
              {flatten(feature.datasheet).map(([path, value]) => (
                <div key={path} className="flex items-baseline justify-between gap-4 py-0.5">
                  <dt className="font-mono text-ink-dim">{path}</dt>
                  <dd className="flex shrink-0 items-center gap-1 text-right font-mono tabular-nums text-ink-body">
                    <span>{value}</span>
                    <CopyButton value={value} label={`${path} value`} />
                  </dd>
                </div>
              ))}
            </dl>
          </details>

          <details className="mt-3 border-t border-edge pt-3">
            <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wider text-ink-dim">
              {isDerived(feature) ? 'Raw record — ours, not the API’s' : 'Raw API record'}
            </summary>
            <div className="mt-2">
              <div className="flex justify-end">
                <CopyButton
                  value={rawDatasheet(feature)}
                  label={isDerived(feature) ? 'raw record' : 'raw API record'}
                />
              </div>
              <pre className="max-h-80 overflow-auto rounded bg-transparent p-2 text-2xs leading-5 text-ink-muted">
                {rawDatasheet(feature)}
              </pre>
            </div>
          </details>
        </div>
      ) : (
        /*
          The invitation says what the *mode above it* is waiting for.
          
          It read "click a face, or a feature in the list" everywhere, which is
          the By feature gesture — and in By direction a click on a face does
          nothing at all until a way up is held, so the panel was inviting a
          press it would ignore.
        */
        <p className="p-4 text-sm text-ink-dim">
          {mode === 'direction'
            ? 'Click an arrow to define your machining direction, then select faces to map features to it.'
            : 'Click a face on the part, or a feature in the list, to read it.'}
        </p>
      )}
    </aside>
  )
}
