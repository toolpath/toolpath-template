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
const NOTHING = { x: 0.05, y: 0.06 } // the top-left corner, off the part and away from the view cube

const PROMPT = /Click a face on the part/

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
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + box.width * point.x, box.y + box.height * point.y)
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

test('Escape puts the reading down', async ({ page }) => {
  await ready(page)

  await page.keyboard.press('Escape')

  await expect(field(page)).toHaveText(PROMPT)
})

test('a click on nothing puts the reading down too', async ({ page }) => {
  await ready(page)

  await at(page, NOTHING)

  await expect(field(page)).toHaveText(PROMPT)
})
