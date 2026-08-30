import { createPartApi } from '@toolpath/part-server'

/**
 * The catalog's part API.
 *
 * The tool data in this application is bundled and needs no server at all. Parts
 * do: uploading one, following its analysis and reading its mesh all require the
 * user's Toolpath API key, and that key must never reach a browser. So the
 * catalog serves the same part API the DFM app does, from the same package.
 *
 * `appName` is this application's own, which keeps its session cookie separate
 * from the DFM app's even when both are deployed on one origin.
 */
export default createPartApi({ appName: 'tool-catalog' })
