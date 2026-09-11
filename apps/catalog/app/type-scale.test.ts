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

/**
 * The faces, by role — and only the three `@toolpath/ui`'s theme actually
 * defines (`theme.css`: `--font-body`, `--font-display`, `--font-mono`).
 *
 * `font-heading` was on all four of this application's headings and is not a
 * token, so it compiled to nothing: `root.tsx` asked Google for Nunito, the
 * browser downloaded it, and not one character was ever set in it. A font class
 * naming a variable that does not exist fails silently, which is why this is a
 * check rather than a convention.
 */
const FACES = ['font-body', 'font-display', 'font-mono', 'font-sans']

/** Any Tailwind font-family or font-weight class. */
const FACE = /\bfont-(?!\d)[a-z]+\b/g

/**
 * Three weights, for three jobs.
 *
 * `font-bold` is a display heading; `font-semibold` is emphasis in the body
 * face; 400 is everything else, and `font-normal` says so only where a `<th>`
 * or an inherited weight has to be undone. `font-medium` was a fourth doing
 * `font-semibold`'s job in two places.
 */
const WEIGHTS = ['font-bold', 'font-semibold', 'font-normal']

/** A class list, as written — the string between one pair of quotes. */
const QUOTED = /(['"`])((?:[^'"`\\]|\\.)*?)\1/g

/**
 * One class *expression*, not one string.
 *
 * `cn('text-2xs … tracking-wide', chosen ? 'uppercase' : '')` is one set of
 * classes on one element, and reading its strings separately says the capitals
 * carry no tracking when the element plainly has some. So a `cn(…)` call is a
 * unit, and only the strings outside every such call are units of their own.
 */
const expressions = (source: string): Array<string> => {
  const calls: Array<string> = []
  const spans: Array<[number, number]> = []
  for (let at = source.indexOf('cn('); at !== -1; at = source.indexOf('cn(', at + 1)) {
    if (/[A-Za-z0-9_$]/.test(source[at - 1] ?? '')) {
      continue
    }
    let depth = 0
    let end = at + 2
    for (; end < source.length; end += 1) {
      const char = source[end]
      if (char === '(') {
        depth += 1
      } else if (char === ')') {
        depth -= 1
        if (depth === 0) {
          break
        }
      }
    }
    calls.push(source.slice(at, end + 1))
    spans.push([at, end + 1])
  }

  let rest = ''
  let cursor = 0
  for (const [start, end] of spans) {
    if (start >= cursor) {
      rest += source.slice(cursor, start)
      cursor = end
    }
  }
  rest += source.slice(cursor)

  return [...calls, ...[...rest.matchAll(QUOTED)].map(([, , classes]) => classes ?? '')]
}

const appDir = 'app'

/**
 * The file with its comments taken out.
 *
 * These checks read source as text, and a note *about* a class is not a use of
 * one — `shared/type.ts` documents why `font-heading` and a bold mono are
 * wrong, and without this that documentation is itself the failure.
 */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')

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
      (code(readFileSync(file, 'utf8')).match(SIZE) ?? [])
        .filter((size) => !SCALE.includes(size))
        .map((size) => `${file}: ${size}`),
    )

    expect(
      [...new Set(stray)].sort(),
      'A fifth text size. Use one of the four, and colour, weight or brackets for the distinction.',
    ).toEqual([])
  })
})

describe('the faces and weights', () => {
  it(`are only ${[...FACES, ...WEIGHTS].join(', ')}`, () => {
    const stray = sourceFiles(appDir).flatMap((file) =>
      (code(readFileSync(file, 'utf8')).match(FACE) ?? [])
        .filter((name) => !FACES.includes(name) && !WEIGHTS.includes(name))
        .map((name) => `${file}: ${name}`),
    )

    expect(
      [...new Set(stray)].sort(),
      'A font class that is not one of the three faces or the three weights. `font-heading` is the one that compiles to nothing.',
    ).toEqual([])
  })

  it('never puts a weight on the mono face', () => {
    const faked = sourceFiles(appDir).flatMap((file) =>
      expressions(code(readFileSync(file, 'utf8')))
        .filter(
          (classes) =>
            /\bfont-mono\b/.test(classes) && /\bfont-(bold|semibold|medium)\b/.test(classes),
        )
        .map((classes) => `${file}: ${classes}`),
    )

    expect(
      faked,
      'Roboto Mono is requested at 400 and nothing else (`root.tsx`), so a weight on it is one the browser synthesises. Use size and colour, or add the weight to the font request first.',
    ).toEqual([])
  })

  /**
   * The components that draw a grid, and are therefore set in one face.
   *
   * Each declares `TABLE_FACE` on its container and nothing inside it names a
   * face at all, so a row cannot change font between one column and the next.
   */
  const TABLES = [
    'app/components/part-tool-table.tsx',
    'app/components/component-table.tsx',
    'app/components/component-tally.tsx',
    'app/routes/order-list.tsx',
  ]

  it('sets a table in one face', () => {
    const named = TABLES.flatMap((file) => {
      const source = code(readFileSync(file, 'utf8'))
      return expressions(source)
        .filter((classes) => /\bfont-(mono|sans|body|display)\b/.test(classes))
        .map((classes) => `${file}: ${classes}`)
    })

    expect(
      named,
      'A table is one face, declared once as `TABLE_FACE` on its container. A `font-*` class on a cell is the row changing font halfway across.',
    ).toEqual([])
  })

  it('sets small capitals one way', () => {
    const wrong = sourceFiles(appDir).flatMap((file) =>
      expressions(code(readFileSync(file, 'utf8')))
        .filter((classes) => /\buppercase\b/.test(classes))
        .filter((classes) => !/\btext-2xs\b/.test(classes) || !/\btracking-wide\b/.test(classes))
        .map((classes) => `${file}: ${classes}`),
    )

    expect(
      wrong,
      'Capitals are `text-2xs tracking-wide` — `SECTION_LABEL` in `shared/type.ts` is the whole recipe. A second tracking is a second kind of label.',
    ).toEqual([])
  })
})
