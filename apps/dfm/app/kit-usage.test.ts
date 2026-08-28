import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A ratchet on hand-authored controls, not a ban on them.
 *
 * AGENTS.md asks for `@toolpath/ui` components over hand-authored HTML, and
 * that rule was judgment for long enough to drift: 78 raw `<button>` elements
 * across 16 components, while the kit exports both `Button` and `IconButton`.
 * Migrating them all is a refactor with its own risk, so instead the count is
 * pinned here. It may fall freely; it may not rise.
 *
 * Lower BUDGET whenever a migration lands. That is the whole maintenance
 * burden, and a failure here is the rule being violated rather than a flaky
 * test.
 *
 * Counted over the whole of `app/`, not `app/components` alone. Every raw
 * control happens to live there today, so widening the walk did not move the
 * number — but a button written into a route module, or into a folder somebody
 * adds next year, would otherwise have been ground the ratchet never held.
 */
const BUDGET = 78

const appDir = 'app'

/** Every hand-written component file, at any depth. */
const componentFiles = (dir: string): Array<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return componentFiles(path)
    }
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })

const rawButtonsIn = (file: string) =>
  readFileSync(file, 'utf8').match(/<button[\s>]/g)?.length ?? 0

describe('hand-authored controls only fall', () => {
  const counted = componentFiles(appDir)
    .map((file) => ({ file, count: rawButtonsIn(file) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count)

  it(`holds raw <button> at or below ${BUDGET}, preferring Button and IconButton`, () => {
    const total = counted.reduce((sum, { count }) => sum + count, 0)
    const worst = counted
      .slice(0, 5)
      .map(({ file, count }) => `${file} (${count})`)
      .join(', ')

    expect(
      total,
      `Raw <button> rose to ${total}, over the budget of ${BUDGET}. Use Button or IconButton from @toolpath/ui. Densest: ${worst}.`,
    ).toBeLessThanOrEqual(BUDGET)
  })

  it('lowers the budget once a migration has landed', () => {
    const total = counted.reduce((sum, { count }) => sum + count, 0)

    expect(
      BUDGET - total,
      `Raw <button> is down to ${total}. Lower BUDGET in this file to ${total} so the ground is kept.`,
    ).toBeLessThan(10)
  })
})
