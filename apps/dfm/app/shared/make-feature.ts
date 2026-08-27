import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { DERIVED } from './worst-case'
import type { Pass } from './setups'
import { directionKey, facts, kindOf } from './report'
import { dot, normalize } from './directions'

/**
 * A reading somebody made, because the Engine did not report one.
 *
 * Every other feature in this app comes from the Engine, which reports what it
 * recognises **per direction**. That is almost always enough — but not always:
 * a shop looking at four faces they intend to run as one operation has no way
 * to say so if no reported feature covers exactly those four. This is how they
 * say it.
 *
 * A made feature is an ordinary {@link PartFeature} in every respect, so every
 * list, the plan, coverage and the paint take it without knowing. What it
 * carries extra is a mark — see {@link isMade} — because a plan is a document a
 * shop is asked to trust, and "the Engine found this" and "somebody drew this"
 * are not the same claim.
 */

/** The datasheet field a made feature is known by. */
export const MADE = 'madeHere'

/** Whether this reading was made here rather than reported by the Engine. */
export const isMade = (feature: PartFeature): boolean =>
  (feature.datasheet as Record<string, unknown> | null | undefined)?.[MADE] === true

/**
 * Builds one.
 *
 * The tag is prefixed rather than random alone, so a made reading is
 * recognisable in a log, a URL or a bug report without loading the plan that
 * explains it.
 *
 * `axis` matches the machining direction, as it does on a reported feature of
 * this shape — nothing here can know better, and leaving it out would make a
 * made feature the one kind the rest of the app has to special-case.
 */
export const makeFeature = ({
  direction,
  featureType,
  faces,
  kind,
}: {
  direction: Vec3
  featureType: string
  /** In the part's own face order, so a list of them does not reshuffle. */
  faces: ReadonlyArray<number>
  /** The Engine family this stands in for, for the rules that read it. */
  kind?: string
}): PartFeature =>
  ({
    featureTag: `made-${globalThis.crypto?.randomUUID?.() ?? String(faces.join('-'))}`,
    featureType,
    machiningDirection: direction,
    axis: direction,
    regionIdxs: [...faces].sort((a, b) => a - b),
    /*
     * `derivedHere` on a drawn reading too, though there is barely anything to
     * derive: what little it carries — the kind it stands for — is ours rather
     * than measured, and the flag is what tells a reader which kind of datasheet
     * it is holding. It goes when the Engine analyses this feature and answers
     * properly; see `withEngineDatasheet`.
     */
    datasheet: { [MADE]: true, [DERIVED]: true, facts: kind === undefined ? {} : { kind } },
  }) as unknown as PartFeature

/**
 * The readings that already cover **every** one of these faces.
 *
 * Shown while faces are being chosen, and it is the more useful half of this
 * panel: most of the time the Engine has already reported what somebody is
 * about to draw, and mapping the reported one is better than making a second
 * reading of the same geometry. A list that goes empty is the signal that this
 * really is new.
 *
 * Supersets, not exact matches — a reading covering these four faces and two
 * more is still worth seeing, because it may be the operation somebody means.
 */
export const coveringAll = (
  features: ReadonlyArray<PartFeature>,
  faces: ReadonlyArray<number>,
): Array<PartFeature> => {
  if (faces.length === 0) return []

  return features
    .filter((feature) => faces.every((idx) => feature.regionIdxs.includes(idx)))
    .sort((a, b) => a.regionIdxs.length - b.regionIdxs.length)
}

/** What a set of faces reads as from one way up, and how much of it agrees. */
export interface TypeGuess {
  featureType: string
  /** The Engine family, where the readings that voted for it agree on one. */
  kind: string | undefined
  /** How many of the chosen faces a reading of this type covers. */
  faces: number
}

/**
 * What these faces read as, from this way up.
 *
 * Once nothing covers all of them, the question becomes "what am I drawing" —
 * and the Engine has already answered it for the pieces. Every reading **from
 * this direction** that touches a chosen face votes for its own type, weighted
 * by how many of those faces it covers, and the winner is the type this is most
 * likely a part of.
 *
 * Deliberately not geometry. The app has no face normals — a region carries a
 * shape kind and an area, and that is all — so inventing a classifier here
 * would be guessing where the Engine has already looked. This reads its answer
 * instead, which also means a made feature is described in the same vocabulary
 * as every reported one.
 *
 * Best first, and every candidate is returned rather than only the winner: "a
 * wall covering three of these and a pocket covering all four" is the sentence
 * somebody needs, not a single word.
 */
export const readsAs = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  faces: ReadonlyArray<number>,
): Array<TypeGuess> => {
  if (faces.length === 0) return []

  const chosen = new Set(faces)
  const key = directionKey(direction)
  const votes = new Map<string, { faces: Set<number>; kinds: Set<string> }>()

  for (const feature of features) {
    if (directionKey(feature.machiningDirection) !== key) continue

    const covered = feature.regionIdxs.filter((idx) => chosen.has(idx))
    if (covered.length === 0) continue

    const vote = votes.get(feature.featureType) ?? { faces: new Set(), kinds: new Set() }
    for (const idx of covered) vote.faces.add(idx)

    const kind = (facts(feature) as Record<string, unknown> | null)?.['kind']
    if (typeof kind === 'string') vote.kinds.add(kind)
    votes.set(feature.featureType, vote)
  }

  return [...votes]
    .map(([featureType, vote]) => ({
      featureType,
      // Only where the readings that voted agree. Two kinds under one type is
      // the Engine telling us the type does not settle it.
      kind: vote.kinds.size === 1 ? [...vote.kinds][0] : undefined,
      faces: vote.faces.size,
    }))
    .sort((a, b) => b.faces - a.faces || a.featureType.localeCompare(b.featureType))
}

/**
 * What is being drawn, as the panel holds it.
 *
 * The order of the fields is the order somebody answers them: a way up, then
 * the faces, then what it is. The type comes **last** because it is the one the
 * app can guess — and it can only guess once there are faces to look at.
 */
export interface Draft {
  direction: number | null
  featureType: string | null
  /**
   * Whether somebody named the type themselves.
   *
   * Until they do, the guess follows the faces: adding a face can change what
   * the set reads as, and a type filled in from three faces should not stick
   * once there are five. Once they have named one it stops moving, because
   * disagreeing with the guess is the reason the field is editable.
   */
  named: boolean
  /** Chosen by clicking the part, in the part's own face order. */
  faces: readonly number[]
  /**
   * Whether a click runs a chain from the last face to this one.
   *
   * Off by default, because on it a stray click adds a run rather than a face
   * — a bigger mistake to notice and a bigger one to undo.
   */
  chaining: boolean
  /**
   * The face a chain would run **from**: the last one added.
   *
   * Held apart from `faces`, which is in the part's own order — the last one
   * clicked is not the last one in that list, and a chain from the wrong end
   * runs the wrong way round the part.
   */
  anchor: number | null
  /**
   * The passes it will be cut in, said while it is being drawn.
   *
   * A reading is only half of a decision, and somebody drawing one already
   * knows what they mean to do with it — asking again afterwards is asking them
   * to say the same thing twice.
   */
  passes: readonly Pass[]
}

export const EMPTY_DRAFT: Draft = {
  direction: null,
  featureType: null,
  named: false,
  faces: [],
  chaining: false,
  anchor: null,
  passes: [],
}

/**
 * Adds a face to the draft, or takes it off — the same click either way.
 *
 * With chaining on and a face already anchored, it adds **the run between
 * them** instead: click the first and the last, which is how a row of faces is
 * selected everywhere else. Taking a face off is always just that face; a click
 * that removed a run would be one nobody could predict the size of.
 */
export const withFace = (
  draft: Draft,
  region: number,
  /** The part, for working out what joins two faces. Chaining needs it. */
  part?: {
    features: ReadonlyArray<PartFeature>
    directions: ReadonlyArray<Vec3>
    touching?: Touching
  },
): Draft => {
  if (draft.faces.includes(region)) {
    return {
      ...draft,
      faces: draft.faces.filter((idx) => idx !== region),
      anchor: draft.anchor === region ? null : draft.anchor,
    }
  }

  const vector = part && draft.direction !== null ? part.directions[draft.direction] : undefined
  const run =
    part && vector && draft.chaining && draft.anchor !== null
      ? chainBetween(part.features, vector, draft.anchor, region, part.touching)
      : []

  // Nothing joins them from this way up, which is a real answer — the face is
  // still added, because the click was a request for that face.
  const added = run.length > 0 ? run : [region]

  return {
    ...draft,
    faces: [...new Set([...draft.faces, ...added])].sort((a, b) => a - b),
    anchor: region,
  }
}

/**
 * The draft with its type kept up to date with its faces.
 *
 * Called after anything that changes what the guess would be — a face added, a
 * face removed, the way up changed. Leaves a named type alone.
 */
export const withGuess = (
  draft: Draft,
  features: ReadonlyArray<PartFeature>,
  directions: ReadonlyArray<Vec3>,
): Draft => {
  if (draft.named) return draft

  const vector = draft.direction === null ? null : directions[draft.direction]
  const best = vector ? readsAs(features, vector, draft.faces)[0] : undefined

  return { ...draft, featureType: best?.featureType ?? null }
}

/**
 * How one way up stands to another.
 *
 * A reading that covers the same faces **from the other side of the part** is
 * not the same operation, and offering it as one is the panel giving bad
 * advice. Named rather than left to a direction label, because "−X" against
 * "+X" is a difference somebody has to spot for themselves, and the whole point
 * of this list is that it does the spotting.
 */
export type Relation = 'same' | 'opposite' | 'different'

/** Which faces touch which, as the viewer works it out from the mesh. */
export type Touching = ReadonlyMap<number, ReadonlySet<number>>

/** Cosine of the angle two ways up have to be within to count as one. */
const TOGETHER = 0.999

export const relationTo = (a: Vec3, b: Vec3): Relation => {
  const one = normalize(a)
  const other = normalize(b)
  if (!one || !other) return 'different'

  const along = dot(one, other)
  if (along >= TOGETHER) return 'same'
  if (along <= -TOGETHER) return 'opposite'
  return 'different'
}

/**
 * The run of faces between two, along the readings that join them.
 *
 * "Click the first and the last" is how somebody selects a row of faces
 * everywhere else, and doing it one face at a time on a twelve-face pocket is
 * the work this removes.
 *
 * **Adjacency comes from the Engine's own readings, not from geometry.** Two
 * faces are joined when some reading *from this way up* covers both — which is
 * as close to "next to each other, in an operation you could run" as this app
 * can get, because a region carries a shape kind and an area and no topology at
 * all. It is also the right question: a chain that crossed a face no reading
 * from here covers would be a chain no tool could follow.
 *
 * The shortest such run, so a chain does not wander through a reading that
 * happens to cover half the part. Empty when nothing joins them, which is a
 * real answer — the two faces are not part of one run from this way up.
 */
/**
 * Which faces are joined to which.
 *
 * **Edge topology, from the mesh**, handed over by the viewer — two faces are
 * joined when they share an edge, which is what "next to each other" means on a
 * solid.
 *
 * The fallback below is what this used before the viewer could say: two faces
 * taken as joined when some reading from this way up covers both. It reads as a
 * reasonable proxy and it is not. On a real part, a top face and the eleven
 * fillets around it are one continuous surface that no single reported reading
 * covers — so the proxy called them two pieces and refused a feature somebody
 * could plainly see was one. It stays only for the moment before the mesh
 * arrives, and for a report with no mesh at all.
 */
const joinsFrom = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  touching?: Touching,
): Map<number, Set<number>> => {
  /*
   * Real topology when the viewer has handed it over, which is almost always.
   *
   * **Empty means "not yet"**, not "nothing touches anything" — an empty `Map`
   * is truthy, and taking it at face value gave every face its own run, so a
   * plainly continuous set read as one piece per face and refused itself. The
   * mesh arrives a moment after the panel does, and a report with none never
   * sends one at all.
   */
  if (touching && touching.size > 0) {
    const joins = new Map<number, Set<number>>()
    for (const [idx, neighbours] of touching) joins.set(idx, new Set(neighbours))
    return joins
  }

  const key = directionKey(direction)
  const joins = new Map<number, Set<number>>()

  for (const feature of features) {
    if (directionKey(feature.machiningDirection) !== key) continue

    for (const idx of feature.regionIdxs) {
      const neighbours = joins.get(idx) ?? new Set<number>()
      for (const other of feature.regionIdxs) if (other !== idx) neighbours.add(other)
      joins.set(idx, neighbours)
    }
  }

  return joins
}

export const chainBetween = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  from: number,
  to: number,
  touching?: Touching,
): Array<number> => {
  if (from === to) return [from]

  const joins = joinsFrom(features, direction, touching)

  // Breadth first, so the first way through is the shortest one.
  const cameFrom = new Map<number, number>([[from, from]])
  const queue = [from]

  while (queue.length > 0) {
    const at = queue.shift()!
    if (at === to) break

    for (const next of joins.get(at) ?? []) {
      if (cameFrom.has(next)) continue
      cameFrom.set(next, at)
      queue.push(next)
    }
  }

  if (!cameFrom.has(to)) return []

  const run = [to]
  while (run[0] !== from) run.unshift(cameFrom.get(run[0]!)!)
  return run
}

/**
 * Every face around the outside of the part, from one way up.
 *
 * A profile **is** the boundary contour of its direction — that is what the
 * Engine means by the word, and it already reports one per direction that has
 * one. So the perimeter is the union of what those readings cover, rather than
 * a walk around the part this app works out for itself.
 *
 * Reading the Engine again, for the third time in this file and the same
 * reason: it has the topology and the tolerances, and a contour traced here
 * from a shape kind and an area would be a worse answer wearing more code.
 *
 * The union of *all* of them, because a direction can report more than one —
 * an open part has a contour per island — and somebody asking for the perimeter
 * means the outside of the part, not the largest piece of it.
 */
export const perimeterFrom = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
): Array<number> => {
  const key = directionKey(direction)
  const faces = new Set<number>()

  for (const feature of features) {
    if (directionKey(feature.machiningDirection) !== key) continue
    if (!isProfile(feature)) continue
    for (const idx of feature.regionIdxs) faces.add(idx)
  }

  return [...faces].sort((a, b) => a - b)
}

/**
 * Whether a reading is a contour.
 *
 * The Engine family first, because `profile`, `filleted_profile` and whatever
 * a later kernel calls the next one all answer `Profile` — and a spelling this
 * app has not seen would otherwise quietly stop counting. The type name is the
 * fallback for a report whose datasheet never arrived.
 */
const isProfile = (feature: PartFeature): boolean =>
  kindOf(feature) === 'Profile' || feature.featureType.toLowerCase().includes('profile')

/**
 * The chosen faces, split into the runs they actually form.
 *
 * **A feature is one continuous piece of geometry.** An operation runs over
 * faces that touch — a pocket is its floor and the walls around it, not a floor
 * here and a wall on the far side of the part — and a reading drawn from two
 * unconnected groups is one no toolpath could follow.
 *
 * One run means continuous. More than one is the answer to *why not*, and is
 * worth showing rather than reducing to a yes or a no: "these four and that
 * one" tells somebody which face to take off.
 *
 * Joined by {@link joinsFrom}, which is a proxy for touching — see its note.
 */
export const runsIn = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  faces: ReadonlyArray<number>,
  touching?: Touching,
): Array<Array<number>> => {
  const joins = joinsFrom(features, direction, touching)
  const left = new Set(faces)
  const runs: Array<Array<number>> = []

  while (left.size > 0) {
    const first = [...left][0]!
    const run: Array<number> = []
    const queue = [first]
    left.delete(first)

    while (queue.length > 0) {
      const at = queue.shift()!
      run.push(at)

      for (const next of joins.get(at) ?? []) {
        if (!left.has(next)) continue
        left.delete(next)
        queue.push(next)
      }
    }

    runs.push(run.sort((a, b) => a - b))
  }

  return runs.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
}

/**
 * The whole connected run the chosen faces sit in.
 *
 * What **Profile** does when the Engine reports no contour from this way up,
 * which on a real part is most ways up: it has two of them across seven
 * directions, and a greyed button on the other five is a control that is only
 * ever unavailable.
 *
 * Grown from what is already chosen rather than from nothing, because "the
 * perimeter" is only meaningful once somebody has said *which* surface they
 * mean — a part has an outside and any number of pockets, and a flood from
 * nothing would take whichever it happened to start in.
 *
 * Bounded by what this way up can **reach**: a run that crossed onto faces no
 * reading from here covers is a run no tool could follow, and it would wrap
 * around the part and take everything.
 */
export const growRun = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  faces: ReadonlyArray<number>,
  touching: Touching,
): Array<number> => {
  if (faces.length === 0) return []

  const key = directionKey(direction)
  const reachable = new Set<number>()
  for (const feature of features) {
    if (directionKey(feature.machiningDirection) !== key) continue
    for (const idx of feature.regionIdxs) reachable.add(idx)
  }

  const run = new Set(faces)
  const queue = [...faces]

  while (queue.length > 0) {
    const at = queue.shift()!
    for (const next of touching.get(at) ?? []) {
      if (run.has(next) || !reachable.has(next)) continue
      run.add(next)
      queue.push(next)
    }
  }

  return [...run].sort((a, b) => a - b)
}

/**
 * The same made reading, cut from a different way up.
 *
 * Drawing one is two decisions — which faces, and from where — and the second
 * is the one somebody changes their mind about: the faces are a fact about the
 * part, the way up is a choice about the setup. Redrawing the faces to change
 * it is asking them to redo the half that was right.
 *
 * The **type is re-derived**, because it was never a property of the faces. A
 * set that reads as a pocket from above reads as a wall from the side, and
 * carrying the old word over would leave the reading describing itself the way
 * it was cut before. Where the new way up has nothing to say, the old type
 * stands rather than being blanked — a name somebody chose beats no name.
 *
 * Only for a made reading. A reported one is the Engine's answer to "what is
 * cuttable from here", and pointing it somewhere else would be inventing an
 * answer it never gave.
 */
export const cutFrom = (
  features: ReadonlyArray<PartFeature>,
  feature: PartFeature,
  direction: Vec3,
): PartFeature => {
  if (!isMade(feature)) return feature

  const guess = readsAs(features, direction, feature.regionIdxs)[0]

  return {
    ...feature,
    machiningDirection: direction,
    axis: direction,
    featureType: guess?.featureType ?? feature.featureType,
    datasheet: {
      ...(feature.datasheet as Record<string, unknown> | null),
      facts: guess?.kind === undefined ? {} : { kind: guess.kind },
    },
  } as PartFeature
}
