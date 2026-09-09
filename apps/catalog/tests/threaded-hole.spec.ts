import { expect, test, type Page } from '@playwright/test'
import { openCubeWithHole } from './cube-fixture'

/**
 * A threaded hole, from the click on the part to the two lists it opens.
 *
 * **The half of the part page nothing could reach.** `on-the-part.spec.ts`
 * works the cube as the viewer package ships it — six planar faces — so every
 * rule a *thread* decides was checked by somebody looking at the screen. Three
 * defects shipped into that gap on 2026-09-09 alone: the cut/form control drawn
 * over the drills and never over the taps, the drill list filtered on the hole
 * as modelled rather than on the predrill it is judged against, and the taps
 * erased from the form filter by the suggestion write that follows choosing a
 * thread. Each was found by Paul, in the browser, after the suite went green.
 * Each has a test here.
 *
 * A file of its own rather than a block in `on-the-part.spec.ts` because the
 * fixture is the whole difference: that file mounts the plain cube in a
 * `beforeEach` and a spec that needs holes cannot inherit it. Same fixture
 * module, same click, a report of holes.
 *
 * **The catalog underneath is the committed sample**, pinned by
 * `playwright.config.ts`, which is why these assertions can name catalog
 * numbers. Its two taps are deliberately not interchangeable: `VTSFT0250` is a
 * ⌀6.35 mm **cutting** tap and `VTSFT0375` a ⌀9.525 mm **forming** one. A
 * 1/4-20 UNC thread is ⌀6.35, so the cutting tap is its size and the forming
 * one is not — one hole, and the filter proved in both directions.
 *
 * Its three drills are ⌀3, ⌀6 and ⌀10, and the 1/4-20 predrills are ⌀5.11 and
 * ⌀5.70, so **no drill in this catalog makes either** — which is the state the
 * mills stand in for, and the reason that half is testable here at all.
 */

test.use({ viewport: { width: 1680, height: 1000 } })

/** The face under the default camera's centre, scanned in `on-the-part.spec.ts`. */
const FACE = { x: 0.5, y: 0.5 }

const at = async (page: Page, spot: { x: number; y: number }): Promise<void> => {
  const box = await page.locator('canvas').boundingBox()
  if (box === null) {
    throw new Error('the viewer never drew a canvas')
  }
  await page.mouse.click(box.x + box.width * spot.x, box.y + box.height * spot.y)
}

const field = (page: Page) => page.getByRole('status', { name: 'Selected feature' })
const chrome = (page: Page) => page.locator('[data-list-chrome]')
const tree = (page: Page) => page.locator('[data-assembly-tree]')
const table = (page: Page) => page.getByRole('grid').first()

/**
 * A hole read as a 1/4-20 UNC thread: the state every test below starts from.
 *
 * Every face of this cube is a hole, so the click lands on one whatever it
 * hits — and six readings share that face, which is why the chooser is opened
 * rather than assumed. The thread itself is **chosen**, not guessed: the model
 * says a bore and nothing about a thread, which is the whole reason the picker
 * exists.
 */
const threaded = async (page: Page): Promise<void> => {
  await expect(async () => {
    await at(page, FACE)
    await expect(field(page)).toBeVisible()
  }).toPass({ timeout: 20_000 })

  const reading = page.getByRole('combobox', { name: 'What this face reads as' })
  if ((await reading.count()) > 0) {
    await reading.click()
    await page.getByRole('option').first().click()
  }

  await page.getByRole('button', { name: 'Thread' }).click()
  await page
    .getByRole('option', { name: /1\/4-20 UNC/ })
    .first()
    .click()
  await expect(chrome(page).getByText(/1\/4-20 UNC/)).toBeVisible()
}

/** The stack the tree has open is what decides which list the table shows. */
const open = async (page: Page, slot: 'TAP' | 'DRILL'): Promise<void> => {
  await tree(page)
    .getByRole('button', { name: new RegExp(`^${slot} for `) })
    .click()
}

test.beforeEach(async ({ page }) => {
  await openCubeWithHole(page)
  await expect(page.locator('canvas')).toBeVisible()
  await threaded(page)
})

/**
 * **The taps must be in the form filter or the tap list has nothing to read**
 * (Paul, 2026-09-09: "the tap type is no longer automatically being enabled in
 * tapped holes. It needs to be to show the taps!"). A feature's own row says a
 * hole is drilled — true before anybody threads it — and the write that
 * follows the thread overruled the axis with it, emptying the list whose whole
 * question was which tap.
 */
test('holds the taps in the filter, and the tap of that size in the list', async ({ page }) => {
  await open(page, 'TAP')

  await expect(table(page).getByText('VTSFT0250')).toBeVisible()
  const forms = new URL(page.url()).searchParams.getAll('form')
  expect(forms).toContain('tap right hand')
  expect(forms).toContain('drill')
})

/**
 * **And keeps them once the drill list has been looked at** (Paul, 2026-09-09:
 * "the tap type is no longer automatically being enabled in tapped holes").
 *
 * The drill list turns the predrill mills on where no drill makes the hole, and
 * that write goes through the same axis the taps are in. Walking to the drills
 * and back is the flow the taps disappeared on, and the one test above does not
 * take: it asks the question before anything else has written that filter.
 */
test('keeps the taps after the drill list has turned the mills on', async ({ page }) => {
  await open(page, 'DRILL')
  await expect(chrome(page).getByText(/no drill matches/)).toBeVisible()
  // The press that moves the predrill, which is what re-asks the filters.
  await chrome(page).getByRole('button', { name: 'Form Tap' }).click()
  await chrome(page).getByRole('button', { name: 'Cut Tap' }).click()

  await open(page, 'TAP')

  await expect(table(page).getByText('VTSFT0250')).toBeVisible()
  expect(new URL(page.url()).searchParams.getAll('form')).toContain('tap right hand')
})

/**
 * **One control, over both lists** (Paul, 2026-09-09: "I'd like Cut Tap and
 * Form Tap buttons to show up at the top of the table, like it does for Drills
 * in a tapped hole right now"). It decides which taps the list holds and which
 * hole the drills are judged against, and it stood over the drills alone.
 */
test('offers cut and form over the taps as well as over the drills', async ({ page }) => {
  await open(page, 'TAP')
  await expect(chrome(page).getByRole('button', { name: 'Cut Tap' })).toBeVisible()
  await expect(chrome(page).getByRole('button', { name: 'Form Tap' })).toBeVisible()

  await open(page, 'DRILL')
  await expect(chrome(page).getByRole('button', { name: 'Cut Tap' })).toBeVisible()
  await expect(chrome(page).getByRole('button', { name: 'Form Tap' })).toBeVisible()
})

/**
 * The catalog's `threadMethod`, end to end: `@toolpath/tool-scraper` 2.4.0
 * records how a tap makes its thread, and this is the list reading it. The
 * sample's only ⌀6.35 tap is a cutting one, so *Form Tap* empties the list —
 * a true answer, and the one that says the shop has no form tap that size.
 */
test('shows the cutting tap for a cut tap, and not for a form tap', async ({ page }) => {
  await open(page, 'TAP')
  await expect(table(page).getByText('VTSFT0250')).toBeVisible()

  await chrome(page).getByRole('button', { name: 'Form Tap' }).click()

  await expect(table(page).getByText('VTSFT0250')).toBeHidden()
})

/** Each list says what it was swept on, and they are two different numbers. */
test('names the thread diameter over the taps and the predrill over the drills', async ({
  page,
}) => {
  await open(page, 'TAP')
  await expect(chrome(page).getByText(/matched on ⌀6\.35 mm thread diameter/)).toBeVisible()

  await open(page, 'DRILL')
  await expect(chrome(page).getByText(/⌀5\.11 mm/)).toBeVisible()
  await expect(chrome(page).getByText(/cut tap/)).toBeVisible()
})

/**
 * **The bound follows the predrill, not the model** (Paul, 2026-09-09:
 * "shouldn't there be some closest match drills shown here? There are certainly
 * drills that meet the diameter and flute length requirements"). They did meet
 * them: the list was judged against the predrill and filtered by a bound read
 * off the hole as drawn, so every drill that fits was cut before a rule saw it.
 *
 * ⌀5.11 predrill plus the sheet's 0.1016 oversize is 5.207; the hole as
 * modelled is that same ⌀5.11 here, so the number that proves it is the **form
 * tap's** — ⌀5.70 plus the same knob, which no bound written off the model
 * could produce.
 */
test('bounds the drills at the predrill of the tap that is chosen', async ({ page }) => {
  await open(page, 'DRILL')
  await expect.poll(async () => new URL(page.url()).searchParams.get('max.DC')).toBe('5.207')

  await chrome(page).getByRole('button', { name: 'Form Tap' }).click()

  await expect.poll(async () => new URL(page.url()).searchParams.get('max.DC')).toBe('5.802')
})

/**
 * **No drill makes it, so the mills that can are turned on and said** (Paul,
 * 2026-09-09). The sample's drills are ⌀3, ⌀6 and ⌀10 and the predrill is
 * ⌀5.11, so this is the state a shop meets on a real part whose hole is drawn
 * at the other tap's size.
 */
test('stands the mills in where no drill makes the predrill, and says so', async ({ page }) => {
  await open(page, 'DRILL')

  await expect(
    chrome(page).getByText(/no drill matches the ⌀5\.11 mm cut tap predrill/),
  ).toBeVisible()
  const forms = new URL(page.url()).searchParams.getAll('form')
  expect(forms).toContain('flat end mill')
  expect(forms).toContain('bull nose end mill')
})

/**
 * **Nothing on the control is marked** (Paul, 2026-09-09: "we also shouldn't
 * show the X on drills"). A red `✗` said *no standard drill makes this predrill
 * from the model as drawn* and was read as *this option is unavailable* — over
 * a list of taps, and over a drill list end mills can still fill.
 */
test('marks neither way of making the thread', async ({ page }) => {
  await open(page, 'TAP')
  await expect(chrome(page).locator('.text-danger')).toHaveCount(0)

  await open(page, 'DRILL')
  await expect(chrome(page).locator('.text-danger')).toHaveCount(0)
})
