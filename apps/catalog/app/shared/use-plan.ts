import { useCallback, useEffect, useState } from 'react'
import type { Assembly, CatalogTool, Pass, Plan } from '@toolpath/catalog-data'
import { mapTool, unmap } from '@toolpath/catalog-data'

/**
 * One part's plan, kept in this browser and nowhere else.
 *
 * Keyed by part id, because a plan is about a part and opening a second one
 * must not inherit the first one's decisions. Nothing is sent anywhere: this is
 * a person's working notes, and the scope says no accounts and no database.
 */
const storageKey = (partId: string): string => `tool-catalog.plan.${partId}`

const read = (storage: Pick<Storage, 'getItem'> | null, partId: string): Plan => {
  const raw = storage?.getItem(storageKey(partId))
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (each): each is Plan[number] =>
        typeof each === 'object' &&
        each !== null &&
        typeof each.featureTag === 'string' &&
        typeof each.toolGuid === 'string' &&
        (each.pass === 'rough' || each.pass === 'finish'),
    )
  } catch {
    // A person's unreadable plan is not an application error; the part still
    // opens, and they map it again.
    return []
  }
}

export const usePlan = (partId: string) => {
  const [plan, setPlan] = useState<Plan>([])

  useEffect(() => {
    setPlan(read(globalThis.localStorage ?? null, partId))
  }, [partId])

  const keep = useCallback(
    (next: Plan) => {
      setPlan(next)
      globalThis.localStorage?.setItem(storageKey(partId), JSON.stringify(next))
    },
    [partId],
  )

  const map = useCallback(
    (featureTag: string, pass: Pass, tool: CatalogTool, assembly?: Assembly | null) => {
      keep(mapTool(plan, featureTag, pass, tool, assembly))
    },
    [keep, plan],
  )

  const clear = useCallback(
    (featureTag: string, pass: Pass) => {
      keep(unmap(plan, featureTag, pass))
    },
    [keep, plan],
  )

  return { plan, map, clear }
}
