import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Where `regionIdxs` may be read, and nowhere else.
 *
 * **The most expensive mistake in this app, four times over.** `regionIdxs` is
 * what the *Engine* reported for a reading — the faces it is about, fixed for
 * ever. `cutRegions(plan, feature, pass)` is what the **plan** has it cutting,
 * which since partial claims can be fewer (it gave a face up) or more (a face
 * was handed to it), and differs per pass. `coveredRegions` is everything it is
 * about, handed faces included.
 *
 * Before partial claims all three were the same list, so `regionIdxs` was
 * correct everywhere. It is now correct in two places and wrong in the rest —
 * and it *reads* correct in all of them, which is why the same substitution
 * caused four bugs weeks apart, each looking like a different kind of bug:
 *
 * | F51 | which faces to paint    |
 * | F58 | coverage                |
 * | F62 | which rows to highlight |
 * | —   | the direction wash      |
 *
 * Renaming the field would say it better, but it is not ours: it comes from
 * `@toolpath/api` on the SDK's own `PartFeature`, and diverging from the API's
 * vocabulary trades one confusion for another. So the rule is enforced here
 * instead — cheap, permanent, and it fails on the way in rather than months
 * later on a screenshot.
 *
 * **Adding a file to this list is a claim**: that it wants the Engine's answer
 * rather than the plan's. Say which in a comment beside the use.
 */
const MAY_READ = new Set([
  // The plan layer. These are what everything else asks instead.
  'setups.ts',
  'faces.ts',
  /*
   * Reachability, and it is the Engine's answer by definition.
   *
   * *Which directions can see this face*, *is this face reachable only one way*
   * — both are facts about the shape the Engine described. A plan cannot change
   * what a direction can reach, and a face handed to another way up is still
   * reachable from this one. So the Engine's list is the right one here, and
   * `cutRegions` would be the wrong question entirely.
   */
  'reach.ts',
  'best-reading.ts',
  'generate.ts',
  'infer.ts',
  'proposal.ts',
  'map-features.ts',
  'make-feature.ts',
  'merge.ts',
  'hole-groups.ts',
  'worst-case.ts',
  'setup-offers.ts',
  'paint.ts',
  'highlighting.ts',
  'selection.ts',
  'picks.ts',
  'plan-actions.ts',
  'plan-summary.ts',
  'directions.ts',
  'direction-rows.ts',
  'test-part.ts',
  /*
   * The rules layer, and it is a different claim rather than an exception.
   *
   * A rule judges the **feature** — how hard this pocket is to cut — which is a
   * fact about the shape the Engine described, not about what a plan decided to
   * do with it. A pocket does not get easier because half of it went to another
   * way up. So the Engine's list is the right one here, and would be even if
   * the plan said something different.
   */
  'measurements.ts',
  'metrics.ts',
  'report.ts',
  'rule-text.ts',
])

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [path] : []
  })

describe('who may ask the Engine what a reading covers', () => {
  it('keeps the plan layer the only place that reads regionIdxs', () => {
    const offenders = walk(join(import.meta.dirname, '..'))
      .filter((path) => !path.includes('.test.'))
      .filter((path) => !MAY_READ.has(path.split('/').at(-1) ?? ''))
      .filter((path) => {
        const source = readFileSync(path, 'utf8')

        // A mention in a comment is somebody explaining the rule, which is the
        // opposite of breaking it.
        return source
          .split('\n')
          .some((line) => line.includes('regionIdxs') && !line.trim().startsWith('*'))
      })
      .map((path) => path.slice(path.indexOf('/app/') + 1))

    /*
     * The components that legitimately do. Each is asking about a reading the
     * plan has **no opinion on yet** — a candidate row, a proposal, something
     * being drawn — where the Engine's answer is the only one there is.
     */
    expect(offenders.sort()).toEqual([
      'app/components/create-feature.tsx',
      'app/components/map-features.tsx',
      'app/components/part-inspector.tsx',
      'app/components/setups-panel.tsx',
    ])
  })
})
