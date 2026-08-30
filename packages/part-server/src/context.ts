import type { Connection } from './connection.js'

/**
 * What every route in this package needs and nothing more: which application it
 * is serving, and that application's BYOK connection.
 *
 * Passed as an argument rather than read from a module global, so two
 * applications can build two part APIs in one process — which is what the tests
 * do, and what a future single-deployment of both applications would need.
 */
export interface PartApiContext {
  readonly appName: string
  readonly connection: Connection
}
