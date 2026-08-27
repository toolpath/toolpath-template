import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { coverFaces, inferable } from './infer'
import type { Infer } from './infer'
import type { SetupPlan } from './setups'
import type { FeatureVerdict } from './rules'

/**
 * A standing offer — work the app is suggesting, and nothing more.
 *
 * The middle state of the three the mapping page keeps visibly distinct:
 * nothing, **proposed** (violet on the part; nothing has changed), and assigned.
 * It exists so the app can suggest without deciding, which is the whole
 * difference between a time-saver and *"it's enabling features without me
 * telling it to"*.
 *
 * **The offer is a set of faces, not a set of readings.** That is the part
 * people get wrong. Pruning a face does not delete the reading that contained
 * it — the offer is re-covered from what is left, which may be several smaller
 * readings in place of one big one. Holding readings instead would make
 * enabling one wall summon the profile that contains it.
 */
export interface Proposal {
  /** The way up this is offered for. */
  direction: number
  /** The faces on offer. Pruning removes from here, and the readings follow. */
  faces: ReadonlySet<number>
  /**
   * Readings somebody has explicitly kept, which stay kept.
   *
   * Re-covering is otherwise free to swap a wall for the better-scoring profile
   * containing it, so enabling one wall quietly enables the whole outline.
   */
  kept: ReadonlySet<string>
}

export const propose = (
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  directions: ReadonlyArray<Vec3>,
  direction: number,
  kind: Infer,
  verdicts?: ReadonlyArray<FeatureVerdict>,
  setupId?: string,
): Proposal | null => {
  const vector = directions[direction]
  if (!vector) return null

  const offered = inferable(features, plan, vector, kind, verdicts, setupId)
  if (offered.length === 0) return null

  return {
    direction,
    faces: new Set(offered.flatMap((feature) => feature.regionIdxs)),
    kept: new Set(),
  }
}

/** The readings an offer currently amounts to. */
export const proposedReadings = (
  features: ReadonlyArray<PartFeature>,
  directions: ReadonlyArray<Vec3>,
  proposal: Proposal,
  verdicts?: ReadonlyArray<FeatureVerdict>,
): Array<PartFeature> => {
  const vector = directions[proposal.direction]
  if (!vector) return []
  return coverFaces(features, vector, proposal.faces, verdicts, proposal.kept)
}

/**
 * Taking one face out of an offer.
 *
 * Only that face. The highlight comes off it and nothing else moves — then the
 * offer is re-covered, so a wall losing one of its eight faces keeps the other
 * seven as whatever smaller readings cover them.
 */
export const withoutFace = (proposal: Proposal, face: number): Proposal | null => {
  const faces = new Set(proposal.faces)
  faces.delete(face)
  if (faces.size === 0) return null
  return { ...proposal, faces }
}

/** Taking a whole reading out of an offer — the X on its row. */
export const withoutReading = (proposal: Proposal, feature: PartFeature): Proposal | null => {
  const faces = new Set(proposal.faces)
  for (const idx of feature.regionIdxs) faces.delete(idx)
  if (faces.size === 0) return null

  const kept = new Set(proposal.kept)
  kept.delete(feature.featureTag)
  return { ...proposal, faces, kept }
}

/**
 * Adding a face from outside the offer.
 *
 * The smallest reading of that face from the offer's own direction comes in with
 * it — a feature is one operation, so half of one is not addable. Taken only if
 * it treads on nothing already spoken for, which is the same rule as the
 * inference that made the offer: this is one more of the same, not an exception
 * to it.
 */
export const withReading = (
  proposal: Proposal,
  reading: PartFeature,
  claimed: ReadonlySet<number>,
): Proposal => {
  if (reading.regionIdxs.some((idx) => claimed.has(idx))) return proposal

  const faces = new Set(proposal.faces)
  for (const idx of reading.regionIdxs) faces.add(idx)
  return { ...proposal, faces }
}

/** Assigning a reading keeps it, so re-covering can never take it back. */
export const keeping = (proposal: Proposal, features: ReadonlyArray<PartFeature>): Proposal => {
  const kept = new Set(proposal.kept)
  for (const feature of features) kept.add(feature.featureTag)
  return { ...proposal, kept }
}

/**
 * What is still being read once an offer has been pruned.
 *
 * A reading taken out of an offer is not being read any more, and leaving the
 * focus on it leaves the part lit for something that is no longer on screen —
 * the highlight sticks with nothing in any list to explain it.
 *
 * Only a focus that **was** in the offer is dropped. A reading being read from
 * somewhere else is not the offer's to clear: pruning is a statement about the
 * offer, not about everything somebody happens to be looking at.
 */
export const focusAfterPrune = (
  focused: string | null,
  before: ReadonlyArray<{ featureTag: string }>,
  after: ReadonlyArray<{ featureTag: string }>,
): string | null => {
  if (focused === null) return null
  const wasOffered = before.some((feature) => feature.featureTag === focused)
  if (!wasOffered) return focused
  return after.some((feature) => feature.featureTag === focused) ? focused : null
}
