import { createContext, useContext, type ReactNode } from 'react'

import type { Vec3 } from '@toolpath/api'

import type { PartFeature, PublicInspectionReport } from 'shared/contracts'
import type { FeatureScore } from 'shared/feature-score'
import type { FeatureVerdict } from 'shared/rules'
import type { Pass, SetupPlan } from 'shared/setups'
import type { Unit } from 'shared/units'

/**
 * What every panel on the part page is looking at.
 *
 * Six values — the part, its readings, the ways up, the plan, how each reading
 * scores, and the two view settings — were threaded to five panels as
 * individually named props, identically, from a component that re-renders on
 * any of its thirty-odd state changes. `MapFeaturesPanel` took forty-two props,
 * `FeatureViewer` thirty, `FaceList` twenty-seven; eight of each were these.
 *
 * They are all **read-only**: a panel is shown the part and the plan, and says
 * what it wants done through a callback. Nothing here is a way to change
 * anything, which is what makes a context the right shape for it — there is no
 * write path to hide, and no question about who owns the value.
 *
 * The callbacks stay props, deliberately. They close over the page's state, so
 * lifting them in here without stabilising their identity first would trade a
 * long prop list for a class of stale-closure bug — a worse trade than the one
 * being made.
 */
export interface PartView {
  /** The Engine's report, as the server passed it on. */
  report: PublicInspectionReport
  /**
   * Every reading on the part, including the ones somebody made.
   *
   * Not `report.features`: a made reading is an ordinary reading to every list
   * that draws one, and a panel reaching past this to the report would not see
   * it.
   */
  features: ReadonlyArray<PartFeature>
  /** The ways up the part can be held, in the order the arrows number them. */
  directions: ReadonlyArray<Vec3>
  /** The arrangement on screen. */
  plan: SetupPlan
  /** How hard each reading is, by tag. */
  scores: Map<string, FeatureScore>
  /** What the rules made of each reading. */
  verdicts: ReadonlyArray<FeatureVerdict>
  /** Millimetres or inches — every measurement on the page reads in this. */
  unit: Unit
  /** Which pass the part is coloured by, and which the lists report. */
  showingPass: Pass
}

const Context = createContext<PartView | null>(null)

export const PartViewProvider = ({ view, children }: { view: PartView; children: ReactNode }) => (
  <Context.Provider value={view}>{children}</Context.Provider>
)

/**
 * The part and plan the panel is drawing.
 *
 * Throws rather than handing back a default. A panel drawn outside the provider
 * would otherwise render an empty part and look like a part with nothing on it,
 * which is a real state and so would not read as the mistake it is.
 */
export const usePartView = (): PartView => {
  const view = useContext(Context)
  if (!view) {
    throw new Error('A part panel was drawn outside PartViewProvider')
  }
  return view
}
