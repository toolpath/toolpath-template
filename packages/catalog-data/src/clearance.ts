/**
 * Whether a tool and what holds it clear the material around a feature.
 *
 * **`@toolpath/tool-support`'s**, re-exported here so nothing in
 * `apps/catalog` moved in lockstep.
 *
 * The reason it could not live in `@toolpath/tool-drawing` is the reason it is
 * worth having a package below both: this decision has a dozen callers that
 * never draw anything, and the lines an overlay draws *from* a verdict are the
 * drawing package's. Neither could depend on the other, so `heightAt` stood in
 * two copies with a note on each saying they had to agree. They are one
 * function now, and the sweep that reads it is one too.
 *
 * `SilhouettePart` went with it and is no longer a second spelling of the
 * drawing's `OutlinePart`: `@toolpath/tool-support` names the eight parts once
 * and derives the swept six from them.
 */

export {
  NO_MARGINS,
  clearance,
  describeCollision,
  heightAt,
  holderSilhouette,
  toolCollisions,
  toolSilhouette,
  type Clearance,
  type Collision,
  type Margins,
  type Silhouette,
  type SilhouettePart,
} from '@toolpath/tool-support'
