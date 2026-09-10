import { useCallback, useEffect, useState } from 'react'
import {
  NO_PREFERENCES,
  togglePreferred,
  type Pass,
  type Preferences,
} from '@toolpath/catalog-data'

/**
 * What this shop reaches for, in this browser.
 *
 * Not keyed by part: a preference is the shop's, and it is the same on the next
 * part. The part's own material is separate and lives with the part.
 */
const KEY = 'tool-catalog.preferences'

const read = (storage: Pick<Storage, 'getItem'> | null): Preferences => {
  const raw = storage?.getItem(KEY)
  if (!raw) {
    return NO_PREFERENCES
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return NO_PREFERENCES
    }
    const { rough, finish } = parsed as Partial<Preferences>
    return {
      rough: Array.isArray(rough) ? rough.filter((each) => typeof each === 'string') : [],
      finish: Array.isArray(finish) ? finish.filter((each) => typeof each === 'string') : [],
    }
  } catch {
    return NO_PREFERENCES
  }
}

export const usePreferences = () => {
  const [preferences, setPreferences] = useState<Preferences>(NO_PREFERENCES)

  useEffect(() => {
    setPreferences(read(globalThis.localStorage ?? null))
  }, [])

  const prefer = useCallback((pass: Pass, toolGuid: string) => {
    setPreferences((current) => {
      const next = togglePreferred(current, pass, toolGuid)
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { preferences, prefer }
}

/**
 * The part's workpiece material, which belongs to the part rather than the shop.
 *
 * An ISO 513 group letter, or null for "not said" — and "not said" is what a
 * fresh part is, never a default guess at steel.
 */
const materialKey = (partId: string): string => `tool-catalog.material.${partId}`

export const usePartMaterial = (partId: string) => {
  const [materialGroup, setGroup] = useState<string | null>(null)

  useEffect(() => {
    setGroup(globalThis.localStorage?.getItem(materialKey(partId)) ?? null)
  }, [partId])

  const choose = useCallback(
    (group: string | null) => {
      setGroup(group)
      if (group === null) {
        globalThis.localStorage?.removeItem(materialKey(partId))
      } else {
        globalThis.localStorage?.setItem(materialKey(partId), group)
      }
    },
    [partId],
  )

  return { materialGroup, choose }
}
