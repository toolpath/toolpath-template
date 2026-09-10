import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Where hand-written source lives. Everything else is generated or vendored.
 *
 * Both applications: `paul/directions-mapping` landed on 2026-09-02, which is
 * what this list used to be waiting for.
 */
const SEARCHED_DIRECTORIES = ['apps', 'packages', 'scripts']

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'build',
  'dist',
  '.react-router',
  '.turbo',
  'test-results',
  'playwright-report',
])

const CHECKED_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/

/**
 * A `function name() {}` declaration at the head of a line.
 *
 * AGENTS.md asks for `const name = () => {}` everywhere instead. Anchoring to
 * the start of the line is what keeps prose out of it: the word inside a doc
 * comment is preceded by `*`, and inside a sentence by whatever came before it.
 *
 * Taken from the DFM repository's `scripts/check-style.mjs`, where it has held
 * since 2026-08-27.
 */
const DECLARATION = /^[ \t]*(?:export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?function\b/

const filesUnder = (directory) => {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue
      }
      found.push(...filesUnder(join(directory, entry.name)))
      continue
    }
    if (CHECKED_EXTENSIONS.test(entry.name)) {
      found.push(join(directory, entry.name))
    }
  }
  return found
}

/**
 * Every function declaration that should have been written as an arrow.
 *
 * Returns them rather than printing them so a test can read the answer.
 */
export const styleViolations = (
  rootDirectory = defaultRootDirectory,
  searched = SEARCHED_DIRECTORIES,
) => {
  const violations = []
  for (const name of searched) {
    const directory = resolve(rootDirectory, name)
    for (const path of filesUnder(directory)) {
      const lines = readFileSync(path, 'utf8').split('\n')
      lines.forEach((text, index) => {
        if (DECLARATION.test(text)) {
          violations.push({
            file: relative(rootDirectory, path),
            line: index + 1,
            text: text.trim(),
          })
        }
      })
    }
  }
  return violations
}

/** Only report when run as a command, so a test can import the check itself. */
const runAsCommand = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)

const violations = runAsCommand ? styleViolations() : []
if (violations.length > 0) {
  console.error(
    `Found ${violations.length} function declaration${violations.length === 1 ? '' : 's'}. ` +
      'AGENTS.md asks for `const name = () => {}` instead:\n',
  )
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.text}`)
  }
  process.exit(1)
}
