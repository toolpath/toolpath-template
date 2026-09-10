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
 * `<button>` appears in this application's prose about as often as in its
 * markup, and every mention is a component explaining why it reached for a kit
 * `Button` instead — so counting the raw text reports the rule being *kept* as
 * the rule being broken. It did: five mentions across `feature-list-panel.tsx`
 * and `assembly-tree-panel.tsx` failed this check against a budget of zero on
 * 2026-09-10, with no hand-authored button anywhere in either file.
 *
 * Scanning rather than parsing, which is what the rest of this file does. The
 * `[^:]` is what keeps `https://` from eating the rest of a line, and with it
 * a real control written after a URL.
 */
const withoutComments = (source: string): string =>
  source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|[^:])\/\/.*$/gm, '$1')

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
