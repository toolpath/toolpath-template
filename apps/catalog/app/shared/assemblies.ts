import type { Assembly } from '@toolpath/catalog-data'

/** How an assembly reads in one line: what to order, and how far it stands out. */
export const assemblyLabel = (assembly: Assembly): string =>
  [assembly.holder.catalogNumber, assembly.collet?.catalogNumber, assembly.tool.catalogNumber]
    .filter((part): part is string => Boolean(part))
    .join(' + ')

/** A saved assembly holds identities, never geometry. */
export interface SavedAssembly {
  readonly holderGuid: string
  readonly colletGuid: string | null
  readonly toolGuid: string
  /** As set when it was saved — a decision, not a measurement. Null only for a tool that states nothing to start from. */
  readonly stickout: number | null
}

const STORAGE_KEY = 'tool-catalog.assemblies'

/**
 * The assemblies somebody has kept, in this browser and nowhere else.
 *
 * **Identity only.** A saved assembly stores three guids and a stickout, and
 * resolves through the catalog on every render, so nothing in the browser
 * becomes a second source of truth for a diameter. The stickout is the one
 * number saved, because it is a decision rather than a measurement.
 */
export const loadAssemblies = (storage: Pick<Storage, 'getItem'> | null): Array<SavedAssembly> => {
  const raw = storage?.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (each): each is SavedAssembly =>
        typeof each === 'object' &&
        each !== null &&
        typeof (each as SavedAssembly).toolGuid === 'string' &&
        typeof (each as SavedAssembly).holderGuid === 'string',
    )
  } catch {
    // Unreadable storage is not an application error: somebody's saved list is
    // gone, and the catalog still works.
    return []
  }
}

export const saveAssemblies = (
  storage: Pick<Storage, 'setItem'> | null,
  assemblies: ReadonlyArray<SavedAssembly>,
): void => {
  storage?.setItem(STORAGE_KEY, JSON.stringify(assemblies))
}

/** Same holder, same collet, same tool, same stickout — one entry, not two. */
export const sameAssembly = (a: SavedAssembly, b: SavedAssembly): boolean =>
  a.holderGuid === b.holderGuid &&
  a.colletGuid === b.colletGuid &&
  a.toolGuid === b.toolGuid &&
  a.stickout === b.stickout

export const withAssembly = (
  saved: ReadonlyArray<SavedAssembly>,
  assembly: SavedAssembly,
): Array<SavedAssembly> =>
  saved.some((each) => sameAssembly(each, assembly)) ? [...saved] : [...saved, assembly]

export const withoutAssembly = (
  saved: ReadonlyArray<SavedAssembly>,
  assembly: SavedAssembly,
): Array<SavedAssembly> => saved.filter((each) => !sameAssembly(each, assembly))
