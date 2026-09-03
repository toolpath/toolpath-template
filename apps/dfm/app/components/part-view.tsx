import { type UnitSystem } from '@toolpath/tool-support'
import { createContext, useContext, type ReactNode } from 'react'

import type { Vec3 } from '@toolpath/api'

import type { PublicInspectionReport } from 'shared/contracts'
import type { FeatureScore } from 'shared/feature-score'
import type { FeatureVerdict } from 'shared/rules'
import type { Pass, SetupPlan } from 'shared/setups'

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
  /**
   * The part every panel on this page is looking at: the Engine's report with
   * the readings somebody drew here merged into its `features`.
   *
   * **Not the report as the server passed it on**, and the distinction is a bug
   * somebody has already hit. `made` in `part-inspector` says why the drawn
   * readings are merged in rather than carried beside the reported ones:
   * otherwise every list, the plan, the coverage and the paint each need to
   * know about a second source — "and the one that forgot would quietly leave a
   * made reading out of the plan it is part of".
   *
   * This context was that second source twice over. It was handed the raw
   * report, so `report.features` was the Engine's list and panels reading it
   * stopped seeing made readings — clicking a face of a reading you had just
   * drawn listed every reading of that face except the one you drew. The repair
   * pointed the field at the part and left a second `features` beside it, so
   * the same object carried two lists that were equal only by convention.
   *
   * It is one object and one list now, under the name of the thing it actually
   * is. `part.features` cannot disagree with itself, and it does not invite the
   * reading that `report.features` did — that the list is what the Engine
   * reported, which is exactly the wrong idea and is why five panels reached
   * for it.
   *
   * Narrowing the type to keep the readings out of reach is not the answer, and
   * was tried: `feature-viewer` spreads this whole object into the mesh
   * viewer's own report prop, and `face-list` hands it to `facesOf` and
   * `cutElsewhere`. All three answer "what owns this face" from the `features`
   * they find on it, and a spread still type-checks, so they return to the
   * original bug in silence. What keeps this honest is that there is only one
   * list to reach for.
   */
  part: PublicInspectionReport
  /** The ways up the part can be held, in the order the arrows number them. */
  directions: ReadonlyArray<Vec3>
  /** The arrangement on screen. */
  plan: SetupPlan
  /** How hard each reading is, by tag. */
  scores: Map<string, FeatureScore>
  /** What the rules made of each reading. */
  verdicts: ReadonlyArray<FeatureVerdict>
  /** Millimetres or inches — every measurement on the page reads in this. */
  unit: UnitSystem
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
