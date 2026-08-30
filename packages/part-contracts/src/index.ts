/**
 * The server-safe half of this package.
 *
 * Nothing reachable from here imports `@toolpath/viewer`, which installs camera
 * controls against a DOM the moment it loads. The report readers and the
 * selection model do need it, so they are reached at `/report`, `/picks` and
 * `/selection` — a browser import, deliberately kept off the path a Hono server
 * takes.
 */
export {
  isReachCurve,
  parseAnalysisEvent,
  toPublicInspectionReport,
  type AnalysisEvent,
  type ApiProblem,
  type PartFeature,
  type PartReport,
  type PublicInspectionReport,
  type ReachCurve,
} from './contracts.js'
export { CAD_EXTENSIONS, MAX_UPLOAD_BYTES, isSupportedCadFilename, validateCadFile } from './cad.js'
