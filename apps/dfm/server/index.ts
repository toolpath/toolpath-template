import { createPartApi } from '@toolpath/part-server'

/**
 * The DFM application's part API, served from the shared package.
 *
 * `appName` is `part-viewer` rather than `dfm` on purpose: it names the
 * `part-viewer-connection` cookie and the key that seals it, which this
 * application used before it moved onto the package. Renaming it would sign
 * every open session out.
 */
export default createPartApi({ appName: 'part-viewer' })
