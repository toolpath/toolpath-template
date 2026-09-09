import type { Assembly } from '@toolpath/catalog-data'

/**
 * How an assembly reads in one line: what to order, and how far it stands out.
 *
 * All that is left of this module. It used to carry a `tool-catalog.assemblies`
 * storage layer as well — `loadAssemblies`, `saveAssemblies` and the three
 * helpers that added to and removed from it — kept from before the order list
 * existed. `shared/assembly-tree.ts` (`readTrees`/`writeTrees`) holds what a
 * feature's stacks are and `shared/order-list.ts` holds what has been ordered,
 * so nothing had read or written that key since; it was a second, silent
 * source of truth for the same question, and the way those diverge is that one
 * of them is never looked at.
 */
export const assemblyLabel = (assembly: Assembly): string =>
  [assembly.holder.catalogNumber, assembly.collet?.catalogNumber, assembly.tool.catalogNumber]
    .filter((part): part is string => Boolean(part))
    .join(' + ')
