import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Four sizes of type, and no fifth.
 *
 * The interface had drifted to eight (Paul, 2026-09-09: "make sure there are
 * not more than 4 text sizes"): `text-2xs` through `text-2xl`, plus
 * `text-[0.6rem]` and `text-[0.65em]` written inline where a step was wanted
 * and none existed. Nine and ten pixels are not two sizes, they are one size
 * typed twice, and `0.65em` inside a `text-2xs` label is 6.5px — small print
 * nobody can read rather than small print somebody skims.
 *
 * So the ramp is the four below and the rule is judgment no longer. Reach for
 * colour, weight, `font-mono` or brackets when two things beside each other
 * need telling apart; a fifth size is the one tool that is not available.
 *
 * `text-2xs` is `@toolpath/ui`'s own token (10px/14px, `theme.css`), which is
 * why it sits under `text-xs` rather than above it.
 */
const SCALE = ['text-2xs', 'text-xs', 'text-sm', 'text-lg']

/** Any Tailwind text-size class, including an arbitrary `text-[…]` value. */
const SIZE = /\btext-(?:\[[^\]]+\]|(?:\d?xs|sm|base|lg|\d?xl)\b)/g

const appDir = 'app'

const sourceFiles = (dir: string): Array<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
  })

describe('the type scale', () => {
  it(`is only ${SCALE.join(', ')}`, () => {
    const stray = sourceFiles(appDir).flatMap((file) =>
      (readFileSync(file, 'utf8').match(SIZE) ?? [])
        .filter((size) => !SCALE.includes(size))
        .map((size) => `${file}: ${size}`),
    )

    expect(
      [...new Set(stray)].sort(),
      'A fifth text size. Use one of the four, and colour, weight or brackets for the distinction.',
    ).toEqual([])
  })
})
