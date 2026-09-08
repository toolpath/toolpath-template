import type { HolderProfile as MeasuredProfile, ProfilesDocument } from '@toolpath/tool-scraper'
import { belowGageLine } from '@toolpath/tool-support'
import type { ProfileDatum, ProfilePoint } from '@toolpath/tool-support'
import type { Holder } from './toolholding.js'

/**
 * A holder as its own CAD model measures it, keyed by the holder's guid.
 *
 * `toolholding.ts` is what a vendor *publishes* about a holder — a nose, a
 * body, a projection, nine numbers off a DIN 4000 sheet. This is the other
 * half: the silhouette measured off the vendor's STEP model by the Toolpath
 * Engine API, carrying the V-flange groove and the thread relief that a
 * machinist actually looks for.
 *
 * ## Why it is a second document and not a field on `Holder`
 *
 * A profile is ~110 vertices that only an assembly drawing needs, and the
 * catalog is loaded by every page. `@toolpath/tool-scraper` states the same
 * rule from the other side and ships its measurement as its own document; this
 * mirrors that, so the catalog stays the size it was for every page that never
 * draws a holder.
 *
 * ## It does not replace the parametric holder
 *
 * The two are alternatives, not a refinement of one by the other. **`clearance()`
 * still decides the verdict from the parametric fields**, which means a drawn
 * measured envelope and the number under it are answering from different
 * geometry — deliberate, for now, and the reason {@link HolderProfile.measured}
 * exists: a UI that draws one has to be able to say so. Teaching `clearance.ts`
 * to sweep a `[z, r]` polyline is the change that closes it, and it is a change
 * to a dozen callers that draw nothing at all.
 */

/** Bumped when {@link Profiles} changes shape in a way a consumer must handle. */
export const PROFILES_VERSION = 1

/**
 * One vertex of a silhouette: `[z, r]`, both in millimetres.
 *
 * `@toolpath/tool-support`'s, re-exported under this package's own name.
 */
export type { ProfilePoint } from '@toolpath/tool-support'

/**
 * What `z = 0` means.
 *
 * `@toolpath/tool-support`'s. It was declared here, in the drawing package and
 * in the scraper — three copies of two strings, one of which decides whether a
 * consumer may print a gauge length at all.
 */
export type { ProfileDatum } from '@toolpath/tool-support'

/** One holder's measured silhouette, and how far it agrees with the vendor. */
export interface HolderProfile {
  /** The holder this measures, in the guid space `toolholding.ts` mints into. */
  readonly guid: string
  readonly catalogNumber: string
  readonly datum: ProfileDatum
  /** The silhouette, `z` ascending. Two vertices share a `z` where the solid steps. */
  readonly points: ReadonlyArray<ProfilePoint>
  /**
   * Whether the model reaches the gage length the vendor publishes.
   *
   * False is a fact about the vendor's model, not about the holder: five
   * BTKV30 models stop at the threaded nose and omit the collet nut entirely.
   * A drawing built from an incomplete profile is short by
   * {@link HolderProfile.shortfallMm} and has to say so rather than look like
   * a shorter holder.
   */
  readonly complete: boolean
  /** How far the model falls short, in millimetres; null where it does not. */
  readonly shortfallMm: number | null
}

/** Every measured holder of a run, keyed by guid. */
export interface Profiles {
  readonly profilesVersion: number
  /** Always millimetres — a shape measures what it measures. */
  readonly unit: 'millimeters'
  /** What pins the numbers to a kernel. */
  readonly kernelVersion: string
  readonly holders: Readonly<Record<string, HolderProfile>>
}

/** An empty document, for a dataset measured on no machine. */
export const NO_PROFILES: Profiles = {
  profilesVersion: PROFILES_VERSION,
  unit: 'millimeters',
  kernelVersion: '',
  holders: {},
}

/**
 * The scraper's measurement document, as this catalog holds one.
 *
 * A field-by-field map rather than a cast, for the reason
 * `apps/catalog/app/shared/tool-drawing-input.ts` gives about the drawing: the
 * coupling between two independently-versioned shapes belongs in one file that
 * stops compiling when either side moves.
 *
 * The guid is lifted out of the key and onto the record, because everything
 * downstream passes one profile around and a profile that does not know which
 * holder it measures is a bug waiting for a second caller.
 */
export const ingestProfiles = (document: ProfilesDocument): Profiles => ({
  profilesVersion: PROFILES_VERSION,
  unit: 'millimeters',
  kernelVersion: document.kernelVersion,
  holders: Object.fromEntries(
    Object.entries(document.holders).map(([guid, profile]) => [guid, holderProfile(guid, profile)]),
  ),
})

const holderProfile = (guid: string, profile: MeasuredProfile): HolderProfile => ({
  guid,
  catalogNumber: profile.catalogNumber,
  datum: profile.datum,
  points: profile.points.map(([z, r]) => [z, r] as ProfilePoint),
  complete: profile.complete,
  shortfallMm: profile.shortfallMm ?? null,
})

/** The profile measured for one holder, or null where none was. */
export const profileFor = (profiles: Profiles, guid: string): HolderProfile | null =>
  profiles.holders[guid] ?? null

/**
 * A rise smaller than this is measurement noise rather than a step, in mm.
 *
 * The same figure `wallCorners` uses on the other side of the drawing seam, and
 * for the same reason: a STEP model tessellated to a polyline wobbles by
 * fractions of a hundredth, and treating that as a shoulder would put a nose
 * length of nothing on every holder.
 */
const STEP = 0.05

/**
 * The share of a band's final width at which that band is taken to have begun.
 *
 * A holder is a staircase and the sweep's model has three treads, so the two
 * boundaries have to land on the risers that matter — the flange, and the
 * shoulder behind the collet nut — rather than on the chamfer off the nut's own
 * face. Nine tenths clears every chamfer in the measured rack and still catches
 * a real step.
 */
const MOST = 0.9

/** The five numbers a parametric {@link Holder} states, read off a measurement. */
export interface MeasuredDimensions {
  readonly noseDiameter: number
  readonly noseLength: number
  readonly bodyDiameter: number
  readonly bodyLength: number
  readonly projection: number
  readonly flangeDiameter: number
}

/**
 * A measured silhouette reduced to the layers a clearance sweep reads.
 *
 * **Because most of the rack publishes none of them.** A `HolderRecord` carries
 * identity, a taper and a gauge length and no geometry at all, so
 * `clearance()` — which builds its silhouette from the published nose, body and
 * flange — swept nothing and answered "clears" for every one of them. That is
 * not a cosmetic wrong answer: `requiredStickout` comes out `null` with it, so
 * nothing told the stack to stand out, and a tool for a pocket two inches deep
 * was set up at its flute length with the holder drawn a inch and a half inside
 * the part (Paul, 2026-09-07, with a screenshot of exactly that).
 *
 * The measurement is the vendor's own model, so these are *derived from the
 * vendor* rather than invented — and every field is marked `derived` by
 * {@link withMeasuredDimensions} so nothing shows them as the vendor's word.
 *
 * ## Conservative by construction
 *
 * The sweep's model is three layers, each a radius from a height upward; a real
 * silhouette is a staircase of forty. Each band therefore takes the **widest**
 * radius in it, never a mean or a sample. A reduction that over-states girth can
 * only report interference that is not there; one that under-states it puts a
 * holder through a wall and calls it clear. Only the first is safe to be wrong
 * in, and this is wrong in that direction on purpose.
 *
 * ## Which end is the nose
 *
 * `belowGageLine` returns the model from the spindle face down, `z` ascending —
 * so **`z = 0` is the gage line and the last vertex is the nose**, and a height
 * above the nose is `noseZ - z`. Reading it the other way up derives a nose
 * diameter from the flange, which is a holder that clears nothing.
 *
 * Null for a model of fewer than two vertices, which is no holder.
 */
export const dimensionsFromProfile = (
  profile: Pick<HolderProfile, 'points' | 'datum'>,
): MeasuredDimensions | null => {
  const points = belowGageLine(profile)
  if (points.length < 2) {
    return null
  }
  const noseZ = Math.max(...points.map(([z]) => z))
  /** How far a vertex stands above the nose face, in mm. */
  const above = ([z]: ProfilePoint): number => noseZ - z
  const widestWhere = (keep: (point: ProfilePoint) => boolean): number => {
    const radii = points.filter(keep).map(([, r]) => r)
    return radii.length === 0 ? 0 : Math.max(...radii)
  }

  /**
   * Where a band begins: the lowest height at which the holder has reached
   * most of the width it is going to have.
   *
   * **Not the first rise.** A collet nut is chamfered off its own face, so the
   * first step above the tip is a fraction of a millimetre — and splitting
   * there made the band above it the whole rest of the holder, which is a
   * BT30 chuck modelled as Ø45 from a tenth of a millimetre above the tip. The
   * real steps are the flange and the shoulder behind the nut; `MOST` is what
   * tells those from a chamfer.
   */
  const startOf = (width: number, within: ReadonlyArray<ProfilePoint>): number => {
    const reached = within.filter(([, r]) => r >= width * MOST).map(above)
    return reached.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...reached)
  }

  const flangeRadius = widestWhere(() => true)
  const projection = startOf(flangeRadius, points)
  const belowFlange = points.filter((point) => above(point) < projection)
  // Everything under the flange, at its widest: the band the tool reaches
  // through, and the one that decides whether a deep pocket can be cut at all.
  const underRadius =
    belowFlange.length === 0 ? flangeRadius : widestWhere((point) => above(point) < projection)
  const noseLength = startOf(underRadius, belowFlange)
  const noseRadius = widestWhere((point) => above(point) < noseLength)
  const bodyRadius = widestWhere((point) => above(point) >= noseLength && above(point) < projection)

  const nose = noseRadius === 0 ? underRadius : noseRadius
  const body = bodyRadius === 0 ? underRadius : bodyRadius
  return {
    noseDiameter: nose * 2,
    // A holder whose nose *is* the whole of it below the flange has one band,
    // not a zero-length one: the split found nothing to split on.
    noseLength: Number.isFinite(noseLength) ? noseLength : projection,
    bodyDiameter: body * 2,
    bodyLength: Math.max(projection - (Number.isFinite(noseLength) ? noseLength : projection), 0),
    projection,
    flangeDiameter: flangeRadius * 2,
  }
}

/**
 * A holder with the geometry its own model measures, where the vendor states
 * none.
 *
 * **Only the silence is filled.** A number a vendor published is that vendor's
 * claim and stays exactly as it is, whatever the model says — the two
 * disagreeing is worth knowing about and is not this function's to settle.
 */
export const withMeasuredDimensions = (holder: Holder, profile: HolderProfile | null): Holder => {
  const measured = profile === null ? null : dimensionsFromProfile(profile)
  if (measured === null) {
    return holder
  }
  const fill = <K extends keyof MeasuredDimensions>(
    field: K,
    stated: number | null,
  ): { value: number | null; derived: boolean } =>
    stated === null ? { value: measured[field], derived: true } : { value: stated, derived: false }

  const nose = fill('noseDiameter', holder.noseDiameter)
  const noseLength = fill('noseLength', holder.noseLength)
  const body = fill('bodyDiameter', holder.bodyDiameter)
  const bodyLength = fill('bodyLength', holder.bodyLength)
  const projection = fill('projection', holder.projection)
  const flange = fill('flangeDiameter', holder.flangeDiameter)
  const derived = Object.entries({
    noseDiameter: nose,
    noseLength,
    bodyDiameter: body,
    bodyLength,
    projection,
    flangeDiameter: flange,
  }).flatMap(([field, held]) => (held.derived ? [[field, 'derived'] as const] : []))

  return {
    ...holder,
    noseDiameter: nose.value,
    noseLength: noseLength.value,
    bodyDiameter: body.value,
    bodyLength: bodyLength.value,
    projection: projection.value,
    flangeDiameter: flange.value,
    provenance: { ...holder.provenance, ...Object.fromEntries(derived) },
  }
}

/**
 * The silhouette from the gage line out.
 *
 * `@toolpath/tool-support`'s. The note that stood here said the crossing had a
 * twin in `@toolpath/tool-drawing` and that the two interpolations *"have to
 * agree or a holder meets its gage line in two places"* — which nothing was
 * checking. The trim is shared now and the drawing's split is asserted against
 * it by a test in that package.
 */
export { belowGageLine }
