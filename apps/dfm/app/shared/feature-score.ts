import type { Band, FeatureVerdict } from './rules'
import { scoreFeature } from './rules'

/** How a feature came out, small enough to sit on a row. */
export interface FeatureScore {
  /** The worst band any rule put it in, or `null` where nothing judged it. */
  readonly band: Band | null
  /** 0–100 across every rule that applied, or `null` where none did. */
  readonly score: number | null
}

/**
 * Every feature's verdict, by tag, ready for a list to show.
 *
 * Band and score answer different questions and both are carried: the band says
 * how hard the worst of it is, the score says how it did across everything that
 * looked at it. A feature failing one rule of five reads differently from one
 * failing all five, and a row showing only the colour cannot tell them apart.
 */
export function featureScores(verdicts: readonly FeatureVerdict[]): Map<string, FeatureScore> {
  const scores = new Map<string, FeatureScore>()

  for (const verdict of verdicts) {
    const score = scoreFeature(verdict)

    scores.set(verdict.tag, {
      band: verdict.band,
      score: score === null ? null : Math.round(score * 100),
    })
  }

  return scores
}
