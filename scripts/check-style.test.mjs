import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { styleViolations } from './check-style.mjs'

/*
 * Built rather than written out, so this file does not trip the check it is
 * testing: a line here that began with the word would be a violation of its
 * own.
 */
const KEYWORD = 'function'

const withFixture = (files, run) => {
  const root = mkdtempSync(join(tmpdir(), 'check-style-'))
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true })
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(root, 'scripts', name), contents)
    }
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('reports every form of the declaration', () => {
  withFixture(
    {
      'a.ts': `${KEYWORD} plain() {}\n`,
      'b.ts': `export ${KEYWORD} exported() {}\n`,
      'c.ts': `export default ${KEYWORD} Component() {}\n`,
      'd.ts': `  export async ${KEYWORD} indented() {}\n`,
    },
    (root) => {
      const found = styleViolations(root, ['scripts'])
      assert.deepEqual(found.map((violation) => violation.file).sort(), [
        'scripts/a.ts',
        'scripts/b.ts',
        'scripts/c.ts',
        'scripts/d.ts',
      ])
      assert.equal(found[0].line, 1)
    },
  )
})

test('passes arrows, and prose that only mentions the word', () => {
  withFixture(
    {
      'a.ts': 'export const named = (): void => {}\n',
      'b.ts': `/**\n * A ${KEYWORD} named() {} is what this avoids.\n */\nconst ok = () => {}\n`,
      'c.ts': `const inline = () => useMemo(${KEYWORD} () {}, [])\n`,
    },
    (root) => {
      assert.deepEqual(styleViolations(root, ['scripts']), [])
    },
  )
})

test('skips generated and vendored directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-style-'))
  try {
    mkdirSync(join(root, 'apps/node_modules'), { recursive: true })
    mkdirSync(join(root, 'apps/build'), { recursive: true })
    writeFileSync(join(root, 'apps/node_modules/a.js'), `${KEYWORD} vendored() {}\n`)
    writeFileSync(join(root, 'apps/build/b.js'), `${KEYWORD} generated() {}\n`)
    assert.deepEqual(styleViolations(root, ['apps']), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ignores files it does not check', () => {
  withFixture({ 'notes.md': `${KEYWORD} documented() {}\n` }, (root) => {
    assert.deepEqual(styleViolations(root, ['scripts']), [])
  })
})
