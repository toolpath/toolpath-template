import { bandCss } from 'shared/bands'
import type { FeatureScore } from 'shared/feature-score'
import { bandName } from 'shared/rules'

/**
 * How hard a feature is, small enough to sit at the end of any row.
 *
 * The number, in the band's colour. Nothing else.
 *
 * Two things in the space of one, because they answer different questions: the
 * colour says how hard the worst rule found it, the number says how it did
 * across everything that looked at it — so a wall that failed one rule of six
 * reads differently from one that failed all six, which a coloured dot alone
 * cannot say.
 *
 * No icon and no fill. It sits at the end of every row in the app, and anything
 * drawn around it turns two hundred rows into a column of badges rather than a
 * list of features. Colour is the only decoration a number this small can carry
 * without becoming the loudest thing on its row.
 *
 * The feature picker painted the part by band and left the score on the detail
 * panel, so the ranking a shop actually sorts by was one click away from every
 * list. This is that number, everywhere a feature is named.
 *
 * A feature no rule reached shows nothing at all. A dash would be a verdict,
 * and "nobody looked" is not one.
 */
export const ScoreBadge = ({ score }: { score: FeatureScore | undefined }) => {
  if (!score || score.band === null || score.score === null) {
    return null
  }

  const colour = bandCss(score.band)

  return (
    <span
      className="shrink-0 text-2xs tabular-nums opacity-80"
      style={{ color: colour }}
      title={`${bandName(score.band)} — scores ${score.score} across the rules that applied`}
    >
      {score.score}
    </span>
  )
}
