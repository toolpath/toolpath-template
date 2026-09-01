import { useCallback, useEffect, useState } from 'react'
import type { ToolQuery } from './filter'

/**
 * Filters a shop has kept, by name.
 *
 * A shop asks the same three or four questions of the catalog all day — *the
 * 3 mm carbide we actually stock*, *taps for the tapping head* — and typing
 * each one again is the difference between using the filters and giving up on
 * them.
 *
 * In this browser only, like every other preference here. A saved filter holds
 * a query and nothing else: no tools, no results, so it still means the same
 * thing after the catalog is rebuilt.
 */
export interface SavedFilter {
  readonly name: string
  readonly query: ToolQuery
}

const KEY = 'tool-catalog.saved-filters'

/**
 * What is in storage, as saved filters — exported for its own test.
 *
 * Every field is checked because the value is a string somebody's browser
 * kept: a half-written entry, an older shape, or another tab's write. A row
 * this cannot read is dropped rather than failing the read, so one bad entry
 * does not lose the rest.
 */
export const read = (storage: Pick<Storage, 'getItem'> | null): Array<SavedFilter> => {
  const raw = storage?.getItem(KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (each): each is SavedFilter =>
        typeof each === 'object' &&
        each !== null &&
        typeof (each as SavedFilter).name === 'string' &&
        typeof (each as SavedFilter).query === 'object' &&
        (each as SavedFilter).query !== null,
    )
  } catch {
    // Somebody's saved filters being unreadable is not an application error.
    return []
  }
}

/** Saving under a name that exists replaces it: a name is the identity. */
export const withFilter = (
  saved: ReadonlyArray<SavedFilter>,
  filter: SavedFilter,
): Array<SavedFilter> => [...saved.filter((each) => each.name !== filter.name), filter]

export const withoutFilter = (
  saved: ReadonlyArray<SavedFilter>,
  name: string,
): Array<SavedFilter> => saved.filter((each) => each.name !== name)

export const useSavedFilters = () => {
  const [saved, setSaved] = useState<ReadonlyArray<SavedFilter>>([])

  useEffect(() => {
    setSaved(read(globalThis.localStorage ?? null))
  }, [])

  const keep = useCallback((next: ReadonlyArray<SavedFilter>) => {
    setSaved(next)
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next))
  }, [])

  const save = useCallback((name: string, query: ToolQuery) => {
    const trimmed = name.trim()
    if (trimmed === '') {
      return
    }
    setSaved((current) => {
      const next = withFilter(current, { name: trimmed, query })
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const forget = useCallback((name: string) => {
    setSaved((current) => {
      const next = withoutFilter(current, name)
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { saved, save, forget, keep }
}
