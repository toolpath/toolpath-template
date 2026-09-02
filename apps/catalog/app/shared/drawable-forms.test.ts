import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Catalog, ToolForm } from '@toolpath/catalog-data'
import { describe, expect, it } from 'vitest'
import { allTools } from './catalog'
import { DRAWABLE_FORMS, UNDRAWABLE_FORMS } from './tool-drawing-input'

/**
 * Every form in the data has a generator, or is named as one that does not.
 *
 * `tool-drawing-input.test.ts` checks the *vocabulary* — every `ToolForm` the
 * catalog can produce is classified, and the classification matches what
 * `@toolpath/tool-drawing` actually draws. That is a sensor on the code. This
 * file is the sensor on the **data**: the vocabulary is closed, so a newly
 * scraped family can only ever arrive carrying a form already in it, and the
 * only thing that changes is which of those forms somebody is now looking at.
 *
 * Without this, a family of thread mills entering the catalog is invisible:
 * every one of them draws nothing, the vocabulary test still passes, and the
 * first anyone hears of it is an empty panel on a tool page.
 *
 * ## Which dataset this binds to — decided, not ambient
 *
 * `apps/catalog/vite.config.ts` resolves `catalog-dataset` to the gitignored
 * `scrape-out/catalog.json` where a scrape has been ingested and to the
 * committed sample otherwise, so *what the application draws* differs from one
 * machine to the next. A test that inherited that would pass in CI and fail
 * locally, or the reverse, and neither result would mean anything.
 *
 * So there are two layers, and they are different kinds of check:
 *
 * 1. **The committed sample**, reached through {@link allTools}.
 *    `vitest.config.ts` pins `catalog-dataset` to it for exactly this reason,
 *    so this layer gives the same answer on every machine and in CI. It is the
 *    one that gates a merge.
 * 2. **The local scrape**, read off disk, and **skipped where there is not
 *    one**. It cannot run in CI — 29 MB of vendor data that is the vendor's and
 *    is never committed — and it is the only place the real form mix exists.
 *    A machine that has run a scrape is the machine that can answer the
 *    question, and this is it answering.
 *
 * The trade is deliberate and worth stating plainly: layer 2's result depends
 * on the machine, which is the thing `vitest.config.ts` was written to avoid.
 * What makes it acceptable is the direction. It can only ever *add* a failure,
 * never remove one; layer 1 stands entirely on its own; and when layer 2 goes
 * red it is telling the truth about the dataset that machine's dev server is
 * serving. A skip says "not checked here", which is honest, where inheriting
 * the alias would have said "checked" and meant nothing.
 */

/**
 * Forms that are in a dataset and that nobody can draw.
 *
 * **Empty, and that is the finding.** Measured 2026-09-01: the committed sample
 * carries four forms and the 35,573-tool local scrape carries six, and every
 * one of the ten has a generator. Nothing is being drawn wrong and nothing is
 * being drawn blank.
 *
 * An entry here is an acknowledgement, not a fix: it says somebody looked at a
 * form arriving in the data, decided an empty panel with a caption is better
 * than an invented shape, and left the gap open. Adding one should be a
 * decision somebody takes, which is what the failure this list silences is for.
 */
const UNDRAWN_IN_THE_DATASET: ReadonlySet<ToolForm> = new Set<ToolForm>([])

interface Counted {
  readonly form: ToolForm
  readonly tools: number
}

const formsIn = (tools: ReadonlyArray<{ readonly form: ToolForm }>): ReadonlyArray<Counted> => {
  const counts = new Map<ToolForm, number>()
  for (const tool of tools) {
    counts.set(tool.form, (counts.get(tool.form) ?? 0) + 1)
  }
  return [...counts]
    .map(([form, count]) => ({ form, tools: count }))
    .sort((a, b) => b.tools - a.tools)
}

/** Forms present that neither draw nor have been signed off as undrawn. */
const unaccountedIn = (tools: ReadonlyArray<{ readonly form: ToolForm }>): ReadonlyArray<Counted> =>
  formsIn(tools).filter(
    (each) => !DRAWABLE_FORMS.has(each.form) && !UNDRAWN_IN_THE_DATASET.has(each.form),
  )

describe('the committed sample', () => {
  it('carries only forms the drawing package can draw, or ones signed off as undrawn', () => {
    // The counts ride along so a failure says how many tools go blank, not just
    // which form did.
    expect(unaccountedIn(allTools)).toEqual([])
  })

  it('is classified end to end: no form present is outside the vocabulary', () => {
    const unknown = formsIn(allTools)
      .map((each) => each.form)
      .filter((form) => !DRAWABLE_FORMS.has(form) && !UNDRAWABLE_FORMS.has(form))

    expect(unknown).toEqual([])
  })
})

/**
 * The gitignored scrape, where this machine has one.
 *
 * Resolved from this file rather than from the working directory: a test's cwd
 * is whatever runner started it, and the repository root is a fixed four levels
 * up from `apps/catalog/app/shared`.
 */
const SCRAPE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../scrape-out/catalog.json',
)
const scraped = existsSync(SCRAPE)

describe('the local scrape', () => {
  // Named so the runner's skip line says which layer did not run and why,
  // rather than a bare strikethrough. `pnpm --filter @toolpath/catalog-data
  // ingest` is what puts the file there.
  it.skipIf(!scraped)(
    'carries only forms the drawing package can draw, or ones signed off as undrawn (skipped where no scrape has been ingested on this machine)',
    () => {
      const catalog = JSON.parse(readFileSync(SCRAPE, 'utf8')) as Catalog

      expect(unaccountedIn(catalog.tools)).toEqual([])
    },
  )
})
