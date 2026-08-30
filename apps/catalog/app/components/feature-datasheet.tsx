import { Card } from '@toolpath/ui'
import type { PartFeature } from '@toolpath/part-contracts'
import { featureDetailRows, featureSummary, rawDatasheet } from '@toolpath/part-contracts/report'

/**
 * What Toolpath measured about one feature.
 *
 * The same rows the DFM application shows, from the same reader in
 * `@toolpath/part-contracts` — so a number a shop checks here reads identically
 * there. Nothing is recomputed on this side; a second implementation is how two
 * screens start disagreeing about one part.
 *
 * The raw record is kept behind a disclosure rather than omitted: a shop that
 * wants to check a derived number against what the kernel actually said should
 * not have to leave the page to do it.
 */
export const FeatureDatasheet = ({ feature }: { feature: PartFeature }) => {
  const summary = featureSummary(feature)
  const rows = featureDetailRows(feature)

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">Datasheet</h3>
        <p className="mt-1 text-sm text-zinc-200">
          {summary.type}
          {summary.headline ? (
            <span className="ml-2 font-mono text-xs text-zinc-500">{summary.headline}</span>
          ) : null}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">Toolpath reports no measurements for this feature.</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-zinc-400">{row.label}</dt>
              <dd className="text-right font-mono text-zinc-200">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
          The record as the kernel stated it
        </summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
          {rawDatasheet(feature)}
        </pre>
      </details>
    </Card>
  )
}
