import { useUnit as useStoredUnit } from '@toolpath/ui'
import type { UnitSystem } from '@toolpath/tool-support'

/**
 * This application's own key for the shared unit preference.
 *
 * The catalog and the DFM application can run on one origin, and whether they
 * share a unit is a decision each of them makes rather than inherits from the
 * package they both read the preference through.
 */
export const UNIT_STORAGE_KEY = 'tool-catalog.unit'

/**
 * The unit everything is read in.
 *
 * The hook is `@toolpath/ui`'s, beside the `loadUnit`/`saveUnit` it wraps; all
 * this application supplies is the key. Both applications had the same fifteen
 * lines of `useState` and `useEffect` here, identical but for that string,
 * which is the duplicate AGENTS.md § Shared Code exists to prevent.
 */
export const useUnit = (): [UnitSystem, (next: UnitSystem) => void] =>
  useStoredUnit(UNIT_STORAGE_KEY)
