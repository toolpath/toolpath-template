import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey } from './report'
import type { Pass, PartFaces, SetupPlan } from './setups'
import {
  PASSES,
  coveredRegions,
  cutOnce,
  cutRegions,
  cutsFace,
  noting,
  setupFor,
  withoutEmptied,
} from './setups'

/**
 * One face of a reading, and everything else that face belongs to.
 *
 * The level below a reading, and until now the app had no way to look at it: a
 * row said "12f" and that was the end of the sentence. But a face is what a
 * plan is actually made of — it is what gets cut once, what coverage counts and
 * what a claim takes. Somebody arguing with an arrangement is arguing about
 * faces, and they had to do it by clicking the part and hoping.
 */
export interface FaceRow {
  /** The region index — what the Engine and the viewer both call it. */
  idx: number
  /** How the Engine classified the surface: `Plane`, `Cylinder`, and so on. */
  shape: string
  area: number
  /**
   * Which passes the reading this list belongs to cuts this face in.
   *
   * Both passes, not the one on screen. A tick in this list means "this face is
   * part of this reading" and **writes both passes** — so reading back only one
   * of them left a face this reading finishes sitting unticked in its own
   * editor, above an expanded row showing that very reading with F lit.
   *
   * Empty is "not part of it", one is a split claim, two is whole.
   */
  passes: ReadonlyArray<Pass>
  /**
   * Every reading that covers this face — the Engine's own alternatives.
   *
   * Five to eight of them on a typical face, one per direction that can reach
   * it. This is what makes the panel worth opening: a face somebody wants cut
   * another way is one row away from the reading that does it.
   */
  owners: Array<PartFeature>
  /**
   * What cuts this face **in each pass** — including where that is not the
   * reading this list belongs to.
   *
   * That last case is the whole point of the field. A face missing from a
   * reading is not missing from the *part*: something else took it, from some
   * other way up, and this feature is therefore machined across two setups. A
   * panel that only said "not ticked" would leave somebody to go and find out
   * which, one click at a time.
   *
   * **Per pass, because the split is the interesting case.** One feature
   * roughs a face and another finishes it, from a different way up — and a
   * single answer had to pick one of the two to report, which left the panel
   * silent about exactly the arrangement somebody would most want to check.
   * "Roughed here, finished from −Z" needs both.
   *
   * `null` for a pass nothing cuts it in, which is a different answer and reads
   * as one.
   */
  cutBy: Readonly<Record<Pass, PartFeature | null>>
  /**
   * Whether this face was **handed to** the reading rather than reported in it.
   *
   * The list marks it, because an unmarked row would read as the Engine's own
   * answer — which is the one thing it is not. It is also the only way back:
   * an added face unticked leaves the reading altogether.
   */
  added: boolean
}

/**
 * What the face list needs of a report: the faces, and everything reading them.
 *
 * Narrowed rather than taking a whole report, for the reason F14 records: the
 * page renders from `PublicInspectionReport`, and a function demanding more than
 * it reads is one the page cannot call.
 */
export type FacePart = PartFaces & { features: ReadonlyArray<PartFeature> }

/**
 * The faces of one reading, in the part's own order.
 *
 * Order matters more than it looks. A list that reshuffled as faces were taken
 * and given back would move the row under the pointer while somebody was
 * working down a column of them.
 */
export const facesOf = (
  report: FacePart,
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
): Array<FaceRow> => {
  const cutIn = new Map(PASSES.map((each) => [each, new Set(cutRegions(plan, feature, each))]))
  const mine = new Set(feature.regionIdxs)
  const byIdx = new Map(report.regions.map((region) => [region.idx, region]))

  /*
   * Who cuts what, once, rather than per face: a part has thousands of faces
   * and this list is opened by pressing a count.
   *
   * Both passes rather than the one on screen. A face roughed by this reading
   * and finished by another is the arrangement worth reporting, and asking the
   * question of one pass can only ever return half of it.
   */
  const cutter = new Map(PASSES.map((each) => [each, new Map<number, PartFeature>()]))
  for (const other of report.features) {
    for (const each of PASSES) {
      for (const idx of cutRegions(plan, other, each)) cutter.get(each)?.set(idx, other)
    }
  }

  // Everything the reading is about, not only what it was reported with: a
  // face handed to it is one of its faces, and a list that left it out would
  // have no row to take it back off.
  return coveredRegions(plan, feature).map((idx) => ({
    idx,
    shape: byIdx.get(idx)?.shapeKind ?? 'unknown',
    area: byIdx.get(idx)?.area ?? 0,
    passes: PASSES.filter((each) => cutIn.get(each)?.has(idx)),
    /*
     * Every reading of this face — **including this one**, where the face was
     * handed to it.
     *
     * The Engine's own list is `regionIdxs`, and a face added by hand is by
     * definition not in it. So an added face opened onto a list that did not
     * contain the reading it had just been added to: a wall the Engine sees
     * only from −Y, handed to the +Y group, showed one row saying −Y with its
     * passes off. Pressing anything there enabled the face in the Engine's
     * direction, which is the opposite of what adding it meant.
     *
     * It goes first, because it is the answer to "where is this face now".
     */
    owners: [
      ...(mine.has(idx) ? [] : [feature]),
      ...report.features.filter((other) => other.regionIdxs.includes(idx)),
    ],
    cutBy: {
      rough: cutter.get('rough')?.get(idx) ?? null,
      finish: cutter.get('finish')?.get(idx) ?? null,
    },
    added: !mine.has(idx),
  }))
}

/**
 * The ways up cutting the faces this reading has given away.
 *
 * What makes "3 of 4" mean something: the fourth face is not lost, it is being
 * cut from somewhere else, and this feature is machined across two setups.
 */
export const cutElsewhere = (
  report: FacePart,
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
): Array<PartFeature> => {
  const mine = new Set(cutRegions(plan, feature, pass))
  const others = new Map<string, PartFeature>()

  for (const idx of coveredRegions(plan, feature)) {
    if (mine.has(idx)) continue
    for (const other of report.features) {
      if (other.featureTag === feature.featureTag) continue
      if (cutRegions(plan, other, pass).includes(idx)) others.set(other.featureTag, other)
    }
  }

  return [...others.values()]
}

/**
 * What a click on a face in the editor means, with a claim selected.
 *
 * **The switch says what the face should be, not what to toggle.** With Finish
 * selected, clicking a face the reading cuts in both passes used to *remove*
 * finishing — the face went from green to orange, and somebody who had said
 * "finish" watched a click labelled finish take finishing away. The switch was
 * naming which pass to toggle; it reads as naming what the face is for.
 *
 * So a click sets the face to exactly the selected passes, and the only click
 * that takes a face off is the one that would change nothing — pressing Finish
 * on a face already finished and nothing else. That keeps a second click an
 * undo of the first, which is the property that lets the whole thing work with
 * no confirmation and no arming.
 *
 * The alternative — *add* the selected pass, leaving the others — makes Finish
 * on an already-finished face a dead click, and a dead control in a mode worked
 * entirely by clicking is worse than a surprising one.
 */
export const claimFace = (
  plan: SetupPlan,
  directions: ReadonlyArray<Vec3>,
  allFeatures: ReadonlyArray<PartFeature>,
  feature: PartFeature,
  wanted: ReadonlyArray<Pass>,
  region: number,
): SetupPlan => {
  const now = PASSES.filter((pass) => cutsFace(plan, feature, pass, region))
  const asked = wanted.length === 0 ? PASSES : wanted

  // Already exactly what was asked for: the press has nothing to add, so it
  // lets go instead.
  if (now.length === asked.length && asked.every((pass) => now.includes(pass))) {
    return PASSES.reduce(
      (current, pass) =>
        setFacePass(current, directions, allFeatures, feature, pass, region, false),
      plan,
    )
  }

  return PASSES.reduce(
    (current, pass) =>
      setFacePass(current, directions, allFeatures, feature, pass, region, asked.includes(pass)),
    plan,
  )
}

/**
 * Add one face to what a reading cuts, or take it away.
 *
 * The face-level counterpart of pressing a pass: the same claim, aimed at one
 * face instead of a whole reading. Everything the pass buttons guarantee still
 * holds — cut once, per pass, and a reading that ends up cutting nothing leaves
 * the plan.
 *
 * **Adding to a reading nothing has claimed yet assigns it**, cutting that face
 * alone. That is how somebody builds a claim up face by face rather than taking
 * a whole reading and arguing it back down, and it is the reason this cannot
 * simply edit `without`: it may need a setup that does not exist.
 */
export const setFaceCut = (
  plan: SetupPlan,
  directions: ReadonlyArray<Vec3>,
  allFeatures: ReadonlyArray<PartFeature>,
  feature: PartFeature,
  passes: ReadonlyArray<Pass>,
  region: number,
  cut: boolean,
): SetupPlan => {
  /*
   * **Empty means "take this face off, in both passes"** — the same rule
   * `setPassFor` follows for a whole reading, and for the same reason: pressing
   * Both on something that already holds both is how somebody lets go of it.
   *
   * Without this the fold ran over an empty list and returned the plan
   * untouched, so Both on a face cut in both passes did **nothing at all**. The
   * button reported the state correctly and the press had no effect, which is
   * the hardest kind of dead control to notice.
   */
  const wanted = passes.length === 0 ? PASSES : passes
  const on = passes.length === 0 ? false : cut

  return wanted.reduce(
    (current, pass) => setFacePass(current, directions, allFeatures, feature, pass, region, on),
    plan,
  )
}

/**
 * One face, one pass.
 *
 * {@link setFaceCut} folds this over both passes, because **a face ticked in
 * this panel is roughed and finished** — the same default `assign` takes for a
 * generator, and for the same reason: somebody saying "cut this face here" is
 * describing the work, not one half of it. Splitting the passes is a deliberate
 * act, and R and F on a row are how it is said.
 */
const setFacePass = (
  plan: SetupPlan,
  directions: ReadonlyArray<Vec3>,
  allFeatures: ReadonlyArray<PartFeature>,
  feature: PartFeature,
  pass: Pass,
  region: number,
  cut: boolean,
): SetupPlan => {
  /*
   * A face the reading is not cutting is not its to give up. Taking one *on*
   * is open, though — that is the point of adding a face, and the reading's
   * reported faces are not a limit on what somebody can hand it.
   */
  if (!cut && !coveredRegions(plan, feature).includes(region)) return plan

  const index = directions.findIndex(
    (direction) => directionKey(direction) === directionKey(feature.machiningDirection),
  )
  if (index < 0) return plan

  const held = plan.setups.find((entry) => entry.directionIndex === index)
  const setup = held ?? setupFor(directions, index, plan.setups.length)
  const holding = plan.assigned[feature.featureTag]?.[pass] !== undefined

  /*
   * Taking a face off a reading nothing is cutting is already true, so it is
   * left alone rather than assigned in order to be un-assigned.
   */
  if (!cut && !holding) return plan

  /*
   * What it cuts after the press, as a set of faces.
   *
   * Said this way rather than as an edit to the note, because the note is two
   * lists now — what was given up and what was taken on — and keeping them
   * consistent by hand at every branch is how they drift apart. `cutOnce`
   * writes both from this set.
   *
   * A reading nothing has claimed yet is cutting nothing, so this comes out as
   * that one face alone: which is exactly what "add a face" means on something
   * not yet in the plan, with no special case needed to say so.
   */
  const kept = new Set(cutRegions(plan, feature, pass))
  if (cut) kept.add(region)
  else kept.delete(region)

  // Nothing left to cut. Unassigned outright, the same rule a claim follows
  // when it takes a reading's last face.
  if (kept.size === 0) {
    return withoutEmptied(
      plan,
      { ...plan, assigned: cutOnce(plan, allFeatures, feature, pass, undefined) },
      allFeatures,
    )
  }

  /*
   * Claiming goes through `cutOnce` first, so the face comes off whatever was
   * cutting it — a face added here is cut once like any other. Then the
   * reading's own note is written back, because `cutOnce` hands it everything.
   */
  const assigned = cut
    ? cutOnce(
        { ...plan, setups: [...plan.setups, ...(held ? [] : [setup])] },
        allFeatures,
        feature,
        pass,
        setup.id,
        // This one face, and no other. Claiming the whole reading here would
        // take faces off readings the press had nothing to do with.
        [region],
      )
    : { ...plan.assigned }

  assigned[feature.featureTag] = noting(
    { ...assigned[feature.featureTag], [pass]: setup.id },
    feature,
    [...kept],
    pass,
  )

  return withoutEmptied(
    plan,
    { setups: held ? plan.setups : [...plan.setups, setup], assigned },
    allFeatures,
  )
}

/**
 * The readings that have been **handed** one of these faces by hand.
 *
 * The Engine's answer to "what owns this face" is `regionIdxs`, and a face added
 * to a reading is by definition not in it — so a face somebody moved into a
 * wall disappeared from that wall's point of view the moment the editor closed.
 * The By-face list showed every reading the Engine reported and not the one the
 * face had actually been given to, which is the reading that matters most:
 * **it is the one cutting it**.
 *
 * The same mistake as the one inside the editor, one level out. Both come from
 * asking `regionIdxs` a question the plan is now the answer to.
 */
export const handedReadings = (
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  regions: Iterable<number>,
): Array<PartFeature> => {
  const wanted = new Set(regions)
  if (wanted.size === 0) return []

  return features.filter((feature) => {
    if (feature.regionIdxs.some((idx) => wanted.has(idx))) return false
    return coveredRegions(plan, feature).some((idx) => wanted.has(idx))
  })
}

/**
 * Whether the editor has changed anything about this reading.
 *
 * What `Save` keeps and `Cancel` puts back, asked as one question so the two
 * cannot disagree: the plan the editor opened against, the plan now, and the
 * reading being worked on. Every click in the editor writes straight to the
 * plan — that is what makes editing on the model worth doing — so without this
 * there is nothing on screen saying whether there is anything to keep.
 *
 * **Per pass, and by what is cut rather than by what is covered.** A face given
 * up to another reading and a face taken on by hand are both changes to this
 * reading, and both show in `cutRegions`; `regionIdxs` is the Engine's report
 * and never moves. Which setup holds each pass counts too — the same faces cut
 * from a different way up is a different decision.
 */
export const readingChanged = (
  before: SetupPlan,
  after: SetupPlan,
  feature: PartFeature,
): boolean => {
  const at = (plan: SetupPlan, pass: Pass) => plan.assigned[feature.featureTag]?.[pass]

  return PASSES.some((pass) => {
    if (at(before, pass) !== at(after, pass)) return true

    const was = [...cutRegions(before, feature, pass)].sort((a, b) => a - b)
    const now = [...cutRegions(after, feature, pass)].sort((a, b) => a - b)

    return was.length !== now.length || was.some((idx, index) => idx !== now[index])
  })
}
