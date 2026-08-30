import { isReachCurve, type PartFeature, type ReachCurve } from '@toolpath/part-contracts'

/**
 * Puts back the one field the SDK throws away.
 *
 * Engine API 1.0.4 added `reachCurve` to every feature datasheet. `@toolpath/api`
 * 0.2.x was generated before that, and its `FeatureDatasheetFromJSONTyped`
 * copies thirteen named fields and drops the rest — so a server that reads the
 * typed value never sees the curve. This reads the same response twice: once
 * through the SDK for everything it knows, once raw for the curve, and grafts
 * the curve onto the typed datasheet by feature tag.
 *
 * Only the datasheet batch (`GET /v1/parts/{id}/features`) is read this way:
 * the SDK's `PartFeature` carries no datasheet at all, so a report never
 * brings one through typed, and `getWholePartReport` fetches every datasheet
 * from the batch.
 *
 * **Temporary by construction.** `reach-curve.test.ts` reads the installed
 * SDK's own `FeatureDatasheet` declaration and fails the day it names
 * `reachCurve` — at which point this file and the `getPartFeaturesRaw` call in
 * `engine.ts` are deleted and the field is read typed, like the other thirteen.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The curves in a raw datasheet-batch body, by feature tag.
 *
 * Anything that is not a well-formed curve is left out rather than passed on:
 * a malformed curve is not a curve, and the sweep would lie on it.
 */
export const curvesByTag = (body: unknown): Map<string, ReachCurve> => {
  const curves = new Map<string, ReachCurve>()
  if (!isRecord(body) || !Array.isArray(body.datasheets)) {
    return curves
  }
  for (const entry of body.datasheets as Array<unknown>) {
    if (!isRecord(entry) || typeof entry.featureTag !== 'string' || !isRecord(entry.datasheet)) {
      continue
    }
    const curve = entry.datasheet.reachCurve
    if (isReachCurve(curve)) {
      curves.set(entry.featureTag, curve)
    }
  }
  return curves
}

/** A datasheet with its curve back on it, or as it was when there is no curve to put back. */
export const withReachCurve = <
  T extends { featureTag: string; datasheet?: PartFeature['datasheet'] },
>(
  entry: T,
  curves: ReadonlyMap<string, ReachCurve>,
): T => {
  const curve = curves.get(entry.featureTag)
  if (!curve || !entry.datasheet) {
    return entry
  }
  return { ...entry, datasheet: { ...entry.datasheet, reachCurve: curve } }
}
