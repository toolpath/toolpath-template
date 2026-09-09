import { configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

/**
 * How long a `findBy*` waits for something to appear.
 *
 * Testing Library's default is one second, which is generous for a render and
 * not generous at all for one under load: Vitest runs these eighty-odd files
 * across every core at once, and the heading filters are the slowest thing
 * here — a menu that mounts, measures its anchor and positions itself. On
 * 2026-09-09 a full run failed on `findByRole('checkbox')` in
 * `part-tool-table.test.tsx` and `component-table.test.tsx` while every one of
 * those tests passed on its own, and *which* of them failed changed from run to
 * run. That is the signature of a timeout rather than a defect, and a suite
 * that fails somewhere different each time is one nobody can read.
 *
 * This buys the slow machine time without slowing the fast one down: a `findBy`
 * settles as soon as the element is there, so a passing test costs the same and
 * only a genuinely absent element waits out the five seconds.
 */
configure({ asyncUtilTimeout: 5_000 })

globalThis.ResizeObserver = class {
  observe = () => {}
  unobserve = () => {}
  disconnect = () => {}
}
