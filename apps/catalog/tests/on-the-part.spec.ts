import { expect, test, type Page } from '@playwright/test'
import { openCube } from './cube-fixture'

/**
 * What a click on the part means.
 *
 * **The stack no other spec reaches.** The tool half of this application needs
 * no part, so until this file nothing here ever mounted geometry — and the
 * arrows shipped unwired on 2026-08-28 with the whole suite green. What a click
 * *resolves to* is pinned in `shared/part-interaction.test.ts`, where it is
 * cheap; this file pins that a click on the canvas reaches it at all, and that
 * what it resolves to reaches the panel.
 *
 * The cube is the viewer package's own fixture: six planar faces, four
 * candidate ways up, twenty-four readings, one real GLB.
 *
 * **The click point is found, not chosen.** It was scanned off the rendered
 * canvas under the default camera; the comment says what it hits. Nothing here
 * orbits, so it stays put. The 3D arrows are not clicked from here — they are
 * three.js objects with no DOM — which is why their wiring is pinned in
 * `components/part-viewer.test.tsx` instead.
 */
const FACE = { x: 0.5, y: 0.5 } // the face under the default camera's centre
// Off the part, and clear of everything over it: the filter rail took the
// top-left corner on 2026-08-31, the view cube has the top-right, and the
// viewer's own controls sit along the bottom middle.
const NOTHING = { x: 0.86, y: 0.86 }

const PROMPT = /Click a face on the part/

/**
 * A window somebody would actually work in.
 *
 * The default is 1280×720, which leaves the viewer 898×327 — and the cards
 * over the part reach the middle of a viewport that short, so the click that
 * finds the face lands on a card instead (2026-08-31). The layout is the
 * thing under test here as much as the picking is.
 */
test.use({ viewport: { width: 1680, height: 1000 } })

const field = (page: Page) => page.getByRole('status', { name: 'Selected feature' })

/**
 * Two frames, rather than a guess at how long a render takes.
 *
 * A pick is a discrete event, so React commits it before the next paint; asking
 * the browser for two frames waits exactly as long as this machine needs to
 * draw them and no longer.
 */
const drawn = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((settle) => {
        requestAnimationFrame(() => requestAnimationFrame(() => settle()))
      }),
  )

const at = async (page: Page, point: { x: number; y: number }) => {
  // The viewer is mounted, unmounted and mounted again while the mesh is on
  // its way, so a click that is only *scheduled* after the canvas was seen can
  // still land in a gap where there is none to measure. `toBeVisible` is not
  // enough on its own: a canvas that has mounted but not been laid out is
  // visible and has no box, which read as `Cannot read properties of null`
  // once in a hundred runs (2026-09-02). Waiting for the box is waiting for
  // the thing the click actually needs.
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  let box = await canvas.boundingBox()
  await expect(async () => {
    box = await canvas.boundingBox()
    expect(box).not.toBeNull()
  }).toPass({ timeout: 10_000 })
  const seen = box!
  await page.mouse.click(seen.x + seen.width * point.x, seen.y + seen.height * point.y)
  await drawn(page)
}

/**
 * The mesh arrives over the network and is parsed before anything is pickable,
 * and this application has no readout that says when. So the first click that
 * names a reading is the app's own word that the geometry is there: it is
 * retried until it does, and costs what the mesh costs rather than a fixed
 * wait that is a coin flip on a cold runner.
 */
const ready = async (page: Page) => {
  await expect(async () => {
    await at(page, FACE)
    await expect(field(page)).not.toHaveText(PROMPT)
  }).toPass({ timeout: 20_000 })
}

test.beforeEach(async ({ page }) => {
  await openCube(page)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(field(page)).toHaveText(PROMPT)
})

test('a click on a face names its reading, and lists the tools that cut it', async ({ page }) => {
  await ready(page)

  await expect(field(page)).not.toHaveText(PROMPT)
  await expect(page.getByText(/^Cuts the /)).toBeVisible()
})

/** The Engine reports a feature per way up, so one face has several. */
test('clicking the same face again walks its readings', async ({ page }) => {
  await ready(page)
  const first = (await field(page).textContent()) ?? ''

  await at(page, FACE)

  await expect(field(page)).not.toHaveText(PROMPT)
  await expect(field(page)).not.toHaveText(first)
})

/**
 * **One click, not two.** A chosen feature writes the filters it suggests into
 * the URL, and until 2026-08-30 that write rebuilt the page underneath it: the
 * route asked `recallPart` on every render, so the first render returned
 * `Analysing` and every render after it returned `Inspecting` — two different
 * components in one position, which is an unmount. The click selected a
 * feature and then destroyed the selection, leaving its filters standing over
 * a part with nothing on it. A second click on the same face worked, because
 * by then the URL no longer changed. That is what made the part feel sticky.
 *
 * Every other test here clicks until something happens, which is exactly the
 * workaround somebody using it had to find, so none of them could catch it.
 * This one measures **one click on a page that has just been built**: the
 * part is forgotten and the page reloaded first, because the swap only
 * happens on the first visit, before the part is remembered.
 */
test('a click keeps the selection whose filters it just wrote', async ({ page }) => {
  // No `ready` first: the swap happened on the **first** write to the URL
  // after the page was built, so the measured click has to be that one. A
  // click that finds no mesh yet writes nothing and changes nothing, which is
  // why it is safe to retry — the page is still in the state the bug needs.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await at(page, FACE)
    if (new URL(page.url()).searchParams.getAll('form').length > 0) {
      await expect(field(page)).not.toHaveText(PROMPT)
      return
    }
  }
  throw new Error('no click ever wrote a filter')
})

test('Escape puts the reading down', async ({ page }) => {
  await ready(page)

  await page.keyboard.press('Escape')

  await expect(field(page)).toHaveText(PROMPT)
})

/**
 * **One click cancels, the next puts it down** (Paul, 2026-09-01).
 *
 * A click on nothing is how somebody dismisses what they have just opened —
 * an armed arrow, a face still asking which reading it is — and it was
 * throwing the selection away in the same press. The first miss answers the
 * open question; the second is the one that clears.
 */
test('a click on nothing answers the open question, then puts the reading down', async ({
  page,
}) => {
  await ready(page)

  await at(page, NOTHING)
  await expect(field(page)).not.toHaveText(PROMPT)

  await at(page, NOTHING)
  await expect(field(page)).toHaveText(PROMPT)
})

/**
 * One question open at a time.
 *
 * Each bubble on the rail closes itself when a press lands outside it, and
 * until 2026-08-31 "outside" meant outside *the rail* — so opening a second
 * question left the first standing, and a few clicks left four panels over
 * the part (Paul: "they are stacking up"). The panels are `fixed` and overlap,
 * so this is measured by counting them, not by looking at one.
 */
test('opening one filter closes the one that was open', async ({ page }) => {
  await openCube(page)
  const expanded = page.locator('[data-rail-item] button[aria-expanded="true"]')

  await page.getByRole('button', { name: /^Type/ }).click()
  await expect(expanded).toHaveCount(1)
  await page.getByRole('button', { name: /^Flutes/ }).click()

  await expect(expanded).toHaveCount(1)
})

/**
 * **What is read is what is judged.**
 *
 * The tool list is judged against the readings that are *kept*; naming one —
 * from its card on the part, or from the dropdown in the feature box — moved
 * the focus and left the kept list where it was. So a feature read that way
 * showed its own numbers in the panel over a list judged against something
 * else, or against nothing at all: "no tool in the catalog matches every part
 * of this selection", under a hole with a drill already on the bill (Paul,
 * 2026-08-31).
 */
test('a reading named by hand is the one the list is for', async ({ page }) => {
  await ready(page)
  const named = await page.getByRole('status', { name: 'Selected feature' }).innerText()

  // The candidates dropdown names a reading without clicking the part.
  const opener = page.getByRole('button', { name: 'What this face reads as' })
  if ((await opener.count()) > 0) {
    await opener.click()
    const others = page.getByRole('listitem')
    if ((await others.count()) > 1) {
      await others.nth(1).click()
      await drawn(page)
    }
  }

  await expect(field(page)).not.toHaveText(PROMPT)
  /*
   * The list is *judged for* the named reading — which the header says out
   * loud, because judging happens against what is kept and produces a count of
   * what the rules removed. With the reading focused but nothing kept, that
   * line is absent: the list was judged against no feature at all.
   */
  await expect(page.getByText(/removed by the rules/)).toBeVisible()
  expect(named).not.toBe('')
})

/**
 * **A tool is kept from the panel, and nowhere else** (Paul, 2026-09-01: "add
 * to list should always happen in the right hand panel… clicking a row should
 * open the right hand panel. Button in the top right to save tool").
 *
 * The row used to carry its own keep button; taking it away made the panel the
 * only way through, which is the path everything else — the holder, the collet,
 * the drawing — is already on. Nothing covered it end to end, so this is the
 * one test that walks it: read a face, click a tool, keep it from the panel.
 */
test('a tool is read in the panel and kept from it', async ({ page }) => {
  await ready(page)

  const row = page.getByRole('table').getByRole('row').nth(1)
  const number = ((await row.getByRole('rowheader').textContent()) ?? '').trim()
  expect(number).not.toBe('')
  await row.click()

  const panel = page.getByRole('img', { name: /drawn from its stated dimensions/ })
  await expect(panel).toBeVisible()

  const keep = page.getByRole('button', { name: 'Add to list' })
  await expect(keep).toBeVisible()
  await keep.click()

  // The panel says it is kept, and so does the row it was chosen from.
  await expect(page.getByRole('button', { name: /On list/ })).toBeVisible()
  await expect(page.getByRole('table').getByText('on list').first()).toBeVisible()

  /**
   * **And it reaches the bill, under the number a shop orders by** (Paul,
   * 2026-09-01). The vendor's own page now hangs off that number rather than a
   * "Product" column of its own — the sample catalog publishes no links, so
   * what is checked here is the column that carried them being gone and the
   * number being the thing on the row.
   */
  await page.getByRole('link', { name: 'Order list' }).click()

  const bill = page.getByRole('table')
  await expect(bill.getByText(number.replace('near miss', '').trim())).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Product' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Model' })).toHaveCount(0)
  // One grouping: the assembly (Paul, 2026-09-01: "we can remove by feature").
  await expect(page.getByRole('button', { name: 'By feature' })).toHaveCount(0)
})

/**
 * **"Means nothing, never show it"** (Paul, 2026-09-01). The length-below-holder
 * cell carried "no holder grips this shank" for every tool whose shank size
 * nothing in the crib takes — which is most of a seventeen-thousand-tool
 * catalog, and is a fact about the crib rather than about the length the cell
 * is for.
 */
test('never says a holder does not grip the shank', async ({ page }) => {
  await ready(page)

  await expect(page.getByText('no holder grips this shank')).toHaveCount(0)
})

/**
 * **The vendors this catalog actually holds** (Paul, 2026-09-01: "get rid of
 * the 'not in this catalog yet' section and be sure to show the tool vendors we
 * actually have"). Ten greyed brands nobody can pick took the picker's space,
 * and the ones in the catalog were behind a "more".
 */
test('the vendor picker lists what is in the catalog, and nothing else', async ({ page }) => {
  await page.getByRole('button', { name: /^Vendor/ }).click()

  const picker = page.getByRole('group', { name: 'Vendor' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Kennametal' })).toBeVisible()
  await expect(page.getByText('Not in this catalog yet')).toHaveCount(0)
})
