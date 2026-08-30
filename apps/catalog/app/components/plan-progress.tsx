import type { PassProgress } from '@toolpath/catalog-data'

const LABELS: Record<string, string> = { rough: 'Roughing', finish: 'Finishing' }

/**
 * How far each pass has got, in features.
 *
 * Two bars rather than one number: a part whose every feature has a rougher and
 * no finisher is half-planned in a specific way, and one number would hide
 * which half.
 *
 * **Not a score.** A part is allowed to ship with features nobody maps, so
 * nothing here celebrates 100% or marks anything short of it as wrong.
 */
export const PlanProgress = ({ progress }: { progress: ReadonlyArray<PassProgress> }) => (
  <dl className="flex flex-wrap gap-6">
    {progress.map((pass) => (
      <div key={pass.pass} className="min-w-40 flex-1">
        <dt className="flex items-baseline justify-between text-2xs font-semibold tracking-wide text-zinc-400 uppercase">
          {LABELS[pass.pass] ?? pass.pass}
          <span className="font-mono text-xs text-zinc-300">
            {pass.mapped} of {pass.total}
          </span>
        </dt>
        <dd className="mt-1">
          <div
            className="h-1.5 overflow-hidden rounded bg-zinc-800"
            role="progressbar"
            aria-label={`${LABELS[pass.pass] ?? pass.pass} features mapped`}
            aria-valuenow={pass.mapped}
            aria-valuemin={0}
            aria-valuemax={pass.total}
          >
            <div
              className="bg-primary h-full"
              style={{ width: `${Math.round(pass.fraction * 100)}%` }}
            />
          </div>
        </dd>
      </div>
    ))}
  </dl>
)
