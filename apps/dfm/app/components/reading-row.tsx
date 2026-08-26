import { KindIcon } from './feature-icons'
import { ScoreBadge } from './score-badge'
import { directionLabel, kindOf } from '../shared/report'
import { isMade } from '../shared/make-feature'
import { typeLabel } from '../shared/part-summary'
import type { PartFeature } from '../shared/contracts'
import type { FeatureScore } from '../shared/feature-score'

/**
 * One shape for "a reading", wherever it is being read.
 *
 * The confirmed directions and the face editor both draw it: icon, what it is,
 * which way up, how hard. They were two copies of the same markup held together
 * by a test that compared the two files character for character — which caught
 * drift but could not prevent it, and had to be argued with every time either
 * file was touched.
 *
 * It is one component now, so the rows cannot differ. What they are allowed to
 * differ in is stated as a prop: see {@link ReadingRowProps.showDirection}.
 */
export interface ReadingRowProps {
  reading: PartFeature
  score: FeatureScore | undefined
  /**
   * Whether the row names its own way up.
   *
   * **The one honest difference between the two lists.** The face editor's
   * owners are alternatives from every direction that reaches a face, so each
   * has to say which it is read from. The confirmed directions are already
   * grouped under a header that names it, and repeating it there cost the row
   * more width than the reading itself — on a way up with no short name it drew
   * `(-0.33, 0.00, 0.95)` on every line, and `Wall` came out as `W.`.
   */
  showDirection?: boolean
}

/** The classes the row wears, shared for the same reason its markup is. */
export function readingRowClass(chosen: boolean): string {
  return `flex min-w-0 flex-1 items-center gap-2 rounded-r px-2 py-1 text-left text-2xs transition ${
    chosen ? 'bg-info/15 text-info' : 'text-zinc-400 hover:bg-zinc-950/60'
  }`
}

export function ReadingRow({ reading, score, showDirection = false }: ReadingRowProps) {
  return (
    <>
      <span className="shrink-0 text-zinc-500">
        <KindIcon featureType={reading.featureType} kind={kindOf(reading)} />
      </span>
      <span className="flex-1 truncate">{typeLabel(reading.featureType)}</span>
      {isMade(reading) ? (
        // Somebody drew this. A plan is a document a shop is asked to trust,
        // and "the Engine found this" is not the same claim.
        <span
          className="shrink-0 rounded bg-proposed/20 px-1 text-2xs font-semibold text-proposed"
          title="Made here — the Engine did not report this reading"
        >
          made
        </span>
      ) : null}
      {showDirection ? (
        <span className="shrink-0 text-zinc-500">{directionLabel(reading.machiningDirection)}</span>
      ) : null}
      <ScoreBadge score={score} />
    </>
  )
}
