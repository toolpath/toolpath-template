/**
 * How far a tool stands out of whatever holds it.
 *
 * **This module's contents now live in `@toolpath/tool-support`**, and are
 * re-exported here so nothing in this application moved in lockstep.
 *
 * It was written here because the quantity had four unconnected answers that
 * disagreed by a factor of two on an ordinary tool, and collapsing them into
 * one was the fix. What that fix could not do from inside one application is
 * stop the next consumer of a tool catalog and a tool drawing reproducing it:
 * the quantity is a pure function of the tool, the collet and a shop's policy,
 * and until `@toolpath/tool-support` existed it had no home that both a Node
 * ingest script and a React renderer could reach.
 *
 * The reasoning, the four-way table and the tests went with it.
 */

export {
  DEFAULT_STICKOUT_POLICY,
  HELD_SHARE,
  minStickout,
  setupStickout,
  stickoutCeiling,
  stickoutRange,
  type StickoutLimit,
  type StickoutPolicy,
  type StickoutRange,
  type StickoutRequest,
  type StickoutTool,
} from '@toolpath/tool-support'
