/**
 * The material around a feature, as a drawing.
 *
 * **`@toolpath/tool-support`'s**, re-exported here. It sat in this package
 * because it has two consumers that are not both drawings — a clearance overlay
 * draws the wall from it and `section.ts` draws a feature section from it — so
 * moving it into a rendering package would have put the second behind a
 * dependency it has no use for. In a package that depends on nothing it is
 * behind nothing.
 */

export { materialProfile, type OutlinePoint } from '@toolpath/tool-support'
