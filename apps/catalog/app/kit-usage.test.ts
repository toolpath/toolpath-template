import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Production catalog controls belong to `@toolpath/ui` unless the kit has no equivalent. */
const componentFiles = (dir: string): Array<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return componentFiles(path)
    }
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })

/**
 * The file with its comments taken out.
 *
 * A sensor that reads source rather than exercising it counts whatever the
 * regex sees, and on 2026-09-09 that was five `<button>`s written *in prose* —
 * `feature-list-panel.tsx` explaining which box a rule is given on, and
 * `assembly-tree-panel.tsx` explaining `min-width: auto`. The kit was being
 * used correctly everywhere and the gate was red, which is the one thing a
 * sensor must never do: a false alarm gets the check disabled, and then the
 * real rule is a comment again.
 *
 * `/* … *\/` covers a JSX comment too, since `{/* … *\/}` is a block comment in
 * braces. A `//` only counts from the start of a line so that a `https://` in a
 * string does not swallow the rest of its line along with a tag on it.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const countTag = (file: string, tag: string): number =>
  withoutComments(readFileSync(file, 'utf8')).match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0

describe('catalog uses Toolpath UI controls', () => {
  const files = componentFiles('app')

  it('has no hand-authored production buttons', () => {
    const total = files.reduce((sum, file) => sum + countTag(file, 'button'), 0)
    expect(total).toBe(0)
  })

  it('has no native select controls', () => {
    const total = files.reduce(
      (sum, file) =>
        sum + countTag(file, 'select') + countTag(file, 'option') + countTag(file, 'optgroup'),
      0,
    )
    expect(total).toBe(0)
  })

  it('keeps the one native file input required by the CAD drop target', () => {
    const inputs = files.flatMap((file) =>
      Array.from({ length: countTag(file, 'input') }, () => file),
    )
    expect(inputs).toEqual(['app/components/part-upload-overlay.tsx'])
  })
})
