import { useEffect, useState } from 'react'
import { loadUnit, saveUnit, type Unit } from '@toolpath/domain/units'

/**
 * This application's own key for the shared unit preference.
 *
 * The catalog and the DFM application can run on one origin, and whether they
 * share a unit is a decision each of them makes rather than inherits from the
 * package they both read the preference through.
 */
const UNIT_STORAGE_KEY = 'tool-catalog.unit'

/**
 * The unit everything is read in.
 *
 * Loaded after mount rather than during render: the first paint is produced by
 * the build, and reading `localStorage` while rendering would make it depend on
 * a browser that is not there yet.
 */
export const useUnit = (): [Unit, (next: Unit) => void] => {
  const [unit, setUnit] = useState<Unit>('mm')

  useEffect(() => {
    setUnit(loadUnit(globalThis.localStorage ?? null, UNIT_STORAGE_KEY))
  }, [])

  const choose = (next: Unit) => {
    setUnit(next)
    saveUnit(globalThis.localStorage ?? null, UNIT_STORAGE_KEY, next)
  }

  return [unit, choose]
}
