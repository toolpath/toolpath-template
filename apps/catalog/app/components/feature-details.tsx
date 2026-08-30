import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { IconButton, Tooltip } from '@toolpath/ui'
import type { PartFeature } from '@toolpath/part-contracts'
import { asRecord } from '@toolpath/part-contracts/datasheet'
import {
  STRIP_LABELS,
  measurements,
  stripMeasurements,
} from '@toolpath/part-contracts/measurements'
import { featureSummary, kindOf, rawDatasheet } from '@toolpath/part-contracts/report'
import type { Unit } from '@toolpath/domain/units'
import { KindIcon, MeasurementIcon } from './feature-icons'

/**
 * Everything Toolpath has to say about one feature.
 *
 * **The DFM application's panel, as it stands there**, minus the parts that
 * belong to its plan: no rule verdict, no pass buttons, no cut/uncut face
 * counts. Those answer *should this be made, and how is it going*, which is
 * that application's question; this one asks what the feature measures so a
 * tool can be chosen for it.
 *
 * What is here is the same in both, from the same readers: the strip of numbers
 * a tool is chosen with, every measurement under it with where it came from,
 * the datasheet's own fields, and the raw record.
 */

const flatten = (value: unknown, prefix = ''): Array<[string, string]> => {
  const record = asRecord(value)
  if (!record) {
    return []
  }

  return Object.entries(record).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const nested = asRecord(entry)
    if (nested) {
      return flatten(nested, path)
    }
    if (Array.isArray(entry)) {
      return [[path, `[${entry.length}]`] as [string, string]]
    }
    return [[path, String(entry)] as [string, string]]
  })
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-5">
    <h3 className="text-2xs mb-1.5 font-bold tracking-wider text-zinc-500 uppercase">{title}</h3>
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
      if (reset.current) {
        clearTimeout(reset.current)
      }
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (reset.current) {
        clearTimeout(reset.current)
      }
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

export const FeatureDetails = ({
  features,
  allFeatures,
  regions,
  unit,
  siblings = 1,
}: {
  readonly features: ReadonlyArray<PartFeature>
  /** The whole part, so depth can be measured from its top. */
  readonly allFeatures: ReadonlyArray<PartFeature>
  readonly regions: ReadonlyArray<{ idx: number; shapeKind: string }>
  readonly unit: Unit
  /** Identical holes this one stands for, so the heading can say how many. */
  readonly siblings?: number
}) => {
  const feature = features[0]

  if (!feature) {
    return (
      <p className="p-4 text-sm text-zinc-400">
        Select a feature to see what Toolpath measured about it.
      </p>
    )
  }

  const summary = featureSummary(feature)
  const rows = measurements({ feature, features: allFeatures, regions, unit })

  return (
    <div className="p-3">
      <header className="flex flex-col gap-1.5">
        <h2 className="font-heading flex flex-wrap items-center gap-2 text-lg leading-tight font-bold text-zinc-100">
          <KindIcon featureType={feature.featureType} kind={kindOf(feature)} />
          {summary.type}
          {siblings > 1 ? (
            <span
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm font-semibold text-zinc-200"
              title={`${String(siblings)} identical holes — same diameter, depth and way up`}
            >
              ×{siblings}
            </span>
          ) : null}
        </h2>

        <p className="text-2xs text-zinc-500">
          {summary.direction} · {summary.regionCount} faces
        </p>

        {/* The numbers a tool is chosen with, before the table of everything
            else — a selection from the same rows, so the two cannot disagree. */}
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          {stripMeasurements(rows).map((row) => (
            <span key={row.key} className="flex items-center gap-1.5">
              <span className="text-zinc-500">
                <MeasurementIcon measurement={row.key} />
              </span>
              <span className="flex flex-col">
                <span className="font-semibold tabular-nums text-zinc-100">{row.value}</span>
                <span className="text-2xs text-zinc-500">{STRIP_LABELS[row.key] ?? row.label}</span>
              </span>
            </span>
          ))}
        </div>
      </header>

      <Section title="Measurements">
        <dl className="text-xs">
          {rows.map((row) => (
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
                  {row.label} <span className="text-zinc-600">ⓘ</span>
                </span>
              </dt>
              <dd className="text-right font-medium tabular-nums text-zinc-100">
                {row.value}
                {/* The other unit, quietly. A shop reads in one and buys tooling
                    in the other, and the sum between them is the kind somebody
                    gets wrong once and then trusts. */}
                {row.alt === undefined ? null : (
                  <span className="ml-1.5 font-normal text-zinc-500">{row.alt}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <details className="mt-5 border-t border-zinc-800 pt-3">
        <summary className="text-2xs cursor-pointer font-bold tracking-wider text-zinc-500 uppercase">
          All datasheet fields
        </summary>
        <dl className="text-2xs mt-2">
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
        <summary className="text-2xs cursor-pointer font-bold tracking-wider text-zinc-500 uppercase">
          Raw API record
        </summary>
        <div className="mt-2">
          <div className="flex justify-end">
            <CopyButton value={rawDatasheet(feature)} label="raw API record" />
          </div>
          <pre className="text-2xs max-h-80 overflow-auto rounded p-2 leading-5 text-zinc-400">
            {rawDatasheet(feature)}
          </pre>
        </div>
      </details>
    </div>
  )
}
