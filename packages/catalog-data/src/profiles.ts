import type { HolderProfile as MeasuredProfile, ProfilesDocument } from '@toolpath/tool-scraper'

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

/** One vertex of a silhouette: `[z, r]`, both in millimetres. */
export type ProfilePoint = readonly [z: number, r: number]

/**
 * What `z = 0` means.
 *
 * `gage-line` is the spindle face, `z` increasing toward the cutting end, so
 * the taper is negative and the nose positive. `nose` is what a holder with no
 * cone to solve a gauge plane on is measured in — stated rather than silently
 * referenced to an arbitrary end, because there is no gauge length to read off
 * one and a UI must not print a number for it.
 */
export type ProfileDatum = 'gage-line' | 'nose'

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
 * The silhouette from the gage line out, where the measurement knows where the
 * gage line is.
 *
 * A CAT40 model is measured whole, and about half of what comes back is the
 * 7:24 cone and the retention knob — the part that is inside the spindle when
 * the holder is in the machine. Drawing it says nothing a machinist is asking
 * this picture, and it costs the frame: the tool being drawn ends up a third of
 * the height it could be because the drawing is scaled to fit a taper nobody is
 * looking at.
 *
 * So a `gage-line` profile is cut at `z = 0`, which is the spindle face, and
 * where the polyline crosses it between two vertices the crossing point is
 * interpolated so the cut is the face rather than the nearest vertex to it.
 * **Nothing below the gage line is touched** — the vertices that survive are
 * the measurement, grooves and thread reliefs included.
 *
 * A `nose`-datumed profile is returned whole: with no gauge plane solved there
 * is no line to cut on, and guessing one would be inventing the very number the
 * datum exists to say is missing. A profile that would be left shorter than a
 * segment is also returned whole, because a holder measured entirely inside the
 * spindle is bad data and drawing a stub of it hides that.
 *
 * **The crossing has a twin in `@toolpath/tool-drawing`**, and that is
 * deliberate for now. `profileSegments` in its `model/outline.ts` finds the
 * same `z = 0` crossing and interpolates the same meeting point — it keeps both
 * halves and draws the upper one as a darker `flange`, which is the package's
 * own decision about what a spindle connection looks like. Cutting it is a
 * change to that decision, so it belongs upstream as an option rather than as a
 * silent trim here; until the package offers one, this is the cut, and the two
 * interpolations have to agree or a holder meets its gage line in two places.
 *
 * This copy stays regardless of when that lands, for the reason `hasNeck` gives
 * about its own twin: `clearance()` will want the same trim the day it sweeps a
 * `[z, r]` polyline, and a package that draws tools may not depend on this one.
 */
export const belowGageLine = (profile: HolderProfile): ReadonlyArray<ProfilePoint> => {
  if (profile.datum !== 'gage-line') {
    return profile.points
  }

  const cut = profile.points.findIndex(([z]) => z >= 0)
  const inside = profile.points[cut - 1]
  const outside = profile.points[cut]
  if (cut <= 0 || inside === undefined || outside === undefined) {
    return profile.points
  }

  const kept = profile.points.slice(cut)
  if (kept.length < 2) {
    return profile.points
  }
  if (outside[0] === 0) {
    return kept
  }

  const meet: ProfilePoint = [
    0,
    inside[1] + (-inside[0] / (outside[0] - inside[0])) * (outside[1] - inside[1]),
  ]
  return [meet, ...kept]
}
