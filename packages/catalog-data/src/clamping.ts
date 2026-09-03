/**
 * How much shank stays in the holder.
 *
 * **This module's contents now live in `@toolpath/tool-support`**, and are
 * re-exported here so nothing in this application moved in lockstep. It is one
 * of the three caps `stickoutRange` combines, and it had to travel with them.
 */

export {
  DEFAULT_CLAMPING,
  clampShortfall,
  clampWanted,
  headLength,
  heldDiameter,
  type ClampingRule,
} from '@toolpath/tool-support'
