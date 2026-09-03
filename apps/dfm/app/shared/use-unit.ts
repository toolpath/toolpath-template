import { useUnit as useStoredUnit } from '@toolpath/ui'
import type { UnitSystem } from '@toolpath/tool-support'

/**
 * This application's own key for the unit preference.
 *
 * **Unchanged since the preference lived in `shared/units.ts`**, which named
 * this string rather than taking it from the caller. The value is in people's
 * browsers under it right now, so renaming it would move every inch shop to
 * millimetres — silently, because the fallback is a valid unit.
 *
 * The catalog names its own, and deliberately: the two applications can run on
 * one origin, and whether they share a unit is a decision each makes rather
 * than inherits from the package they both read the preference through.
 */
export const UNIT_STORAGE_KEY = 'part-viewer.unit'

/**
 * The unit every reading is shown in.
 *
 * The hook is `@toolpath/ui`'s, beside the `loadUnit`/`saveUnit` it wraps; all
 * this application supplies is the key. Both applications had the same fifteen
 * lines of `useState` and `useEffect` here, identical but for that string,
 * which is the duplicate AGENTS.md § Shared Code exists to prevent.
 */
export const useUnit = (): [UnitSystem, (next: UnitSystem) => void] =>
  useStoredUnit(UNIT_STORAGE_KEY)
