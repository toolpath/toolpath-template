import { createPartApi } from '@toolpath/part-server'
import type { Hono } from 'hono'
import type { AppEnv } from '@toolpath/part-server'

/**
 * This application's part API.
 *
 * Everything it serves lives in `@toolpath/part-server`, which the tool catalog
 * serves too. A route that is genuinely this application's — a DFM-only report
 * transformation, say — is registered here rather than added to the package.
 */
export const createApp = (): Hono<AppEnv> => createPartApi({ appName: 'part-viewer' })
