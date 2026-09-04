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

const countTag = (file: string, tag: string): number =>
  readFileSync(file, 'utf8').match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0

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
