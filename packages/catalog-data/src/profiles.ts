import type { HolderProfile as MeasuredProfile, ProfilesDocument } from '@toolpath/tool-scraper'
import type { ProfileDatum, ProfilePoint } from '@toolpath/tool-support'

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
 * The silhouette from the gage line out.
 *
 * `@toolpath/tool-support`'s. The note that stood here said the crossing had a
 * twin in `@toolpath/tool-drawing` and that the two interpolations *"have to
 * agree or a holder meets its gage line in two places"* — which nothing was
 * checking. The trim is shared now and the drawing's split is asserted against
 * it by a test in that package.
 */
export { belowGageLine } from '@toolpath/tool-support'
