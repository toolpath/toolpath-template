import { directionCss } from '../shared/direction-colors'
import type { Vec3 } from '@toolpath/api'
import { directionLabel } from '../shared/report'

/**
 * The other ways up a made reading could be cut from.
 *
 * Drawing one is two decisions — which faces, and from where — and the second
 * is the one somebody changes their mind about: the faces are a fact about the
 * part, the way up is a choice about the setup. Redrawing the faces to change
 * it is asking them to redo the half that was right.
 *
 * Only made readings get this. A reported one is the Engine's answer to "what
 * is cuttable from here", and pointing it elsewhere would be inventing an
 * answer it never gave.
 */
export const CutFrom = ({
  directions,
  current,
  onCutFrom,
}: {
  directions: ReadonlyArray<Vec3>
  /** The way up it is cut from now, so that one reads as held rather than offered. */
  current: Vec3
  onCutFrom: (direction: number) => void
}) => {
  const here = directionLabel(current)

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-2xs font-bold uppercase tracking-wider text-ink-dim">
        Cut from
      </span>
      {directions.map((direction, index) => {
        const holds = directionLabel(direction) === here

        return (
          <button
            key={index}
            type="button"
            aria-pressed={holds}
            title={`Cut this from ${directionLabel(direction)}`}
            onClick={() => onCutFrom(index)}
            className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-semibold transition ${
              holds
                ? 'border-info bg-info/20 text-info'
                : 'border-edge-strong text-ink-muted hover:border-edge-hover hover:text-ink-strong'
            }`}
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: directionCss(index) }}
            />
            {directionLabel(direction)}
          </button>
        )
      })}
    </div>
  )
}
