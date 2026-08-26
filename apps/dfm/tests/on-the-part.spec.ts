import { type Page, expect, test } from '@playwright/test'
import { openCube } from './cube-fixture'

/**
 * What a click on the part means.
 *
 * **The stack no other spec reaches.** Every other fixture here builds a report
 * by hand with `hasMeshGlb: false`, so picking, the region attribute, the
 * highlight layers and every panel behaviour that begins on the part were
 * hand-verified only (F51) — and three of the bugs in the findings document
 * reached a user because nothing could catch them.
 *
 * The cube is the viewer package's own fixture: six planar faces, four
 * candidate ways up, twenty-four readings, one real GLB.
 *
 * **The click points are found, not chosen.** They were scanned off the rendered
 * canvas; the comment beside each says what it hits under the default camera.
 * Nothing here orbits, so they stay put.
 */
const FACE = { x: 0.5, y: 0.5 } // region 0, a floor
const WALL = { x: 0.5, y: 0.32 } // region 3, a wall the floor's readings do not cover
const OTHER = { x: 0.6, y: 0.45 } // region 2, a second wall

/** One of the face editor's three claim buttons. */
const cut = (page: Page, option: string) =>
  page
    .getByRole('group', { name: 'Clicking a face' })
    .getByRole('button', { name: option, exact: true })

const at = async (page: Page, point: { x: number; y: number }, modifier?: 'Meta') => {
  const box = (await page.locator('canvas').boundingBox())!
  if (modifier) await page.keyboard.down(modifier)
  await page.mouse.click(box.x + box.width * point.x, box.y + box.height * point.y)
  if (modifier) await page.keyboard.up(modifier)
  await page.waitForTimeout(150)
}

test.beforeEach(async ({ page }) => {
  await openCube(page)
  await expect(page.locator('canvas')).toBeVisible()
  // The mesh arrives over the network and is parsed before anything is pickable.
  await page.waitForTimeout(1200)
})

test('a click lists every reading that owns the face', async ({ page }) => {
  // The Engine reports a feature per direction, so one face has several — which
  // is the whole reason this panel exists.
  await at(page, FACE)

  const readings = page.locator('[data-keynav="map"] [data-row]')
  await expect(readings.first()).toBeVisible()
  expect(await readings.count()).toBeGreaterThan(1)
})

test('holding the modifier gathers a second face rather than replacing the first', async ({
  page,
}) => {
  await at(page, FACE)
  await at(page, WALL, 'Meta')

  await expect(page.getByText(/Every reading of\s*2\s*picked faces/)).toBeVisible()
})

test('a reading drawn on the part covers the faces that were clicked', async ({ page }) => {
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '+Z', exact: true }).click()

  await at(page, FACE)
  await at(page, OTHER)

  // The running list names what was clicked, before anything is committed.
  const chosen = page.getByText('Which faces').locator('../..')
  await expect(chosen.getByText(/^Face \d+$/).first()).toBeVisible()
  expect(await chosen.getByText(/^Face \d+$/).count()).toBe(2)

  // And it knows this is new, which is the more useful half of that panel.
  await expect(page.getByText(/Nothing covers all 2 of these/)).toBeVisible()

  await page.getByRole('button', { name: 'Create feature' }).click()
  await expect(page.getByText(/It is a reading like any other now/)).toBeVisible()
})

test('a right click on the part opens nothing, because no list asked', async ({ page }) => {
  /*
   * F55: `contextmenu` fires on mouse-*down*, so every pan opened a datasheet.
   * Right reads from a list somebody put up, and with none up it does nothing.
   */
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + box.width * FACE.x, box.y + box.height * FACE.y, {
    button: 'right',
  })
  await page.waitForTimeout(250)

  await expect(page.getByText(/Click a face on the part, or a feature in the list/)).toBeVisible()
})

test('a first click opens the easiest reading of the face, then whatever cuts it', async ({
  page,
}) => {
  /*
   * The rules already work out which reading of a face is least trouble to cut,
   * and that answer was being computed and then thrown away by an override that
   * opened the first axis-aligned reading instead. Once something cuts the
   * face, the question changes: a click is then nearly always about that cut.
   */
  await at(page, FACE)

  // Readings only — a `data-row` beginning `direction-` is a group header, and
  // its buttons press the whole way up rather than one reading.
  const readings = page.locator('[data-keynav="map"] [data-row]:not([data-row^="direction-"])')
  const tags = await readings.evaluateAll((els) => els.map((e) => e.getAttribute('data-row')))
  const opened = await page
    .locator('[data-keynav="map"] [data-row][aria-pressed="true"]')
    .getAttribute('data-row')

  expect(tags).toContain(opened)

  // Map a different reading of the same face, then ask about the face again.
  const other = tags.find((tag) => tag !== opened)!
  await page
    .locator(`[data-keynav="map"] [data-row="${other}"]`)
    .locator('..')
    .getByRole('button', { name: 'Both' })
    .click()

  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await at(page, FACE)

  await expect(page.locator(`[data-keynav="map"] [data-row="${other}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('in Edit Feature the part is the control — a click puts a face in or takes it out', async ({
  page,
}) => {
  /*
   * The whole of face editing, done on the model. It reverses an earlier rule
   * that a click here should only *find* the face in the list — what changed is
   * that the editor is entered and left deliberately, so a click inside it is
   * not ambiguous, and the row still opens so the gesture shows its result.
   */
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  const ticks = page.locator('[data-keynav="faces"] input[type="checkbox"]')
  await expect(ticks).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Clicking a face' })).toBeVisible()
  await expect(page.getByText(/Puts it in or takes it out/)).toBeVisible()

  // Not in the reading: the click adds it.
  await at(page, WALL)
  await expect(ticks).toHaveCount(2)

  // In it now: the same click takes it out again.
  await at(page, WALL)
  await expect(ticks).toHaveCount(1)
})

test('the Cut switch decides which passes a face joins in', async ({ page }) => {
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  await cut(page, 'F').click()

  await at(page, WALL)

  /*
   * Finished, not roughed — a face can be machined in one pass here and another
   * somewhere else, which is what the R/F split is for. The tick reads `mixed`
   * for exactly that, and nothing is fully cut.
   *
   * By state rather than by position: a face added after the list opened goes
   * to the top of it.
   */
  const ticks = page.locator('[data-keynav="faces"] input[type="checkbox"]')
  const state = await ticks.evaluateAll((els) =>
    els.map((el) => ({
      checked: (el as HTMLInputElement).checked,
      mixed: (el as HTMLInputElement).indeterminate,
    })),
  )

  expect(state.filter((tick) => tick.mixed)).toHaveLength(1)
  expect(state.filter((tick) => tick.checked && !tick.mixed)).toHaveLength(0)
})

test('the switch says what a face is for, not which pass to take off it', async ({ page }) => {
  /*
   * Paul's report: a face cut in both passes, clicked with Finish selected,
   * turned orange. The switch was naming which pass to *toggle*, and it reads
   * as naming what the face is *for* — so a click labelled finish took
   * finishing away from a face that had it.
   */
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  // Both, so the face the reading already cuts is cut in both passes.
  await cut(page, 'Both').click()
  await at(page, WALL)

  const ticks = page.locator('[data-keynav="faces"] input[type="checkbox"]')
  const states = async () =>
    ticks.evaluateAll((els) =>
      els.map((el) => ({
        checked: (el as HTMLInputElement).checked,
        mixed: (el as HTMLInputElement).indeterminate,
      })),
    )

  expect((await states()).filter((tick) => tick.checked && !tick.mixed)).toHaveLength(1)

  // Finish, then the same face: it becomes finished only — one pass, not none.
  await cut(page, 'F').click()
  await at(page, WALL)

  const after = await states()
  expect(after.filter((tick) => tick.mixed)).toHaveLength(1)
  expect(after.filter((tick) => tick.checked && !tick.mixed)).toHaveLength(0)

  // And the click that would change nothing is the one that lets go, so a
  // second press still undoes the first.
  await at(page, WALL)
  expect(await ticks.count()).toBe(1)
})

test('nothing needs arming, because every click in the editor already means membership', async ({
  page,
}) => {
  /*
   * `Add a face` existed because a click in here could mean "add this" or "I am
   * done, show me that instead". It cannot: the editor is entered and left
   * deliberately, so there is no second meaning to disambiguate.
   */
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  await expect(page.getByRole('button', { name: 'Add a face' })).toHaveCount(0)
})

test('the editor groups faces by what the plan does with each', async ({ page }) => {
  /*
   * The question the panel is opened with. A face roughed here and finished
   * from the other side costs a second setup, and that fact was previously
   * spread through a column of rows for the eye to gather.
   *
   * Each heading carries the swatch the model is painted in, so the list is
   * also the key to the part — no separate legend to keep in step. Only the
   * groups this reading has faces for appear: an empty heading is a claim about
   * the reading that is not true of it.
   */
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  /*
   * Nothing mapped yet, so there is one group and it says so.
   *
   * Asked of the list. The same four names appear beside the Cut switch too,
   * on purpose — the headings say what this reading *has*, the key says what
   * the colours *mean*, and only one of them is a claim about the reading.
   */
  const list = page.getByRole('list', { name: 'Faces' })
  await expect(list.getByText('Not cut here', { exact: true })).toBeVisible()
  await expect(list.getByText('Roughed and finished', { exact: true })).toHaveCount(0)

  /*
   * `All unmapped`, because `Select all` is gone — it put every face in
   * whether or not something else was cutting it, which is right when the
   * reading is the answer for all of them and silently overrides a decision
   * the rest of the time.
   */
  await page.getByRole('button', { name: /All unmapped/ }).click()
  await expect(list.getByText('Roughed and finished', { exact: true })).toBeVisible()
  await expect(list.getByText('Not cut here', { exact: true })).toHaveCount(0)

  // And a face claimed in one pass only lands in its own group.
  await cut(page, 'R').click()
  await at(page, WALL)
  await expect(list.getByText('Roughed only', { exact: true })).toBeVisible()
})

test('every face row says which passes hold it', async ({ page }) => {
  // The tick says *whether* and reads mixed for a split claim, which is honest
  // and does not say which — and which is the question.
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  await cut(page, 'R').click()
  await at(page, WALL)

  // The row of the face just added, found by its tick rather than by position:
  // grouping puts it under "Roughed only", which is the point.
  const row = page.locator('[data-keynav="faces"] input[type="checkbox"]').first().locator('../..')

  await expect(row.getByTitle('Roughed here')).toBeVisible()
  await expect(row.getByTitle('Finished somewhere else, or not at all')).toBeVisible()
})

test('a face given to a reading lists that reading, marked as given', async ({ page }) => {
  /*
   * Paul's case. He moved faces into a wall, closed the editor, clicked one of
   * them again — and the wall it had been given to was not among that face's
   * readings. The viewer answers "what owns this face" from the Engine's
   * `regionIdxs`, so the reading actually cutting it was the one missing.
   */
  await at(page, FACE)
  const editing = (await page
    .locator('[data-keynav="map"] [data-row][aria-pressed="true"]')
    .getAttribute('data-row'))!

  /*
   * The editor for **that** reading, not whichever `Edit Feature` comes first
   * in the document.
   *
   * They are not the same button once the rules reorder the list, and taking
   * the first one silently edited a different reading than the one this spec
   * had just named — so it asked about a face it had never handed anywhere.
   */
  await page
    .locator(`[data-keynav="map"] [data-row="${editing}"]`)
    .locator('xpath=ancestor::li[1]')
    .getByRole('button', { name: /Edit feature/ })
    .click()

  /*
   * A face this reading does **not** already cover, checked rather than
   * assumed.
   *
   * It used to use `WALL` on the strength of a comment saying the floor's
   * readings do not cover it. Which reading opens on a click is decided by
   * score, so a rule change moved it to one that does — and the click then set
   * the face instead of adding it, leaving nothing for this spec to find. The
   * premise is now an assertion, so the next time it rots it says so.
   */
  const held = page.locator('[data-keynav="faces"] [data-row]')
  const before = await held.count()
  await at(page, OTHER)
  expect(await held.count()).toBeGreaterThan(before)

  await page.getByRole('button', { name: 'Save' }).click()

  // Ask the part about the face that was moved.
  await at(page, OTHER)

  const row = page.locator(`[data-keynav="map"] [data-row="${editing}"]`)
  await expect(row).toBeVisible()

  /*
   * And it says the Engine did not put it there.
   *
   * Addressed by the row's own list item rather than by `..`: how many
   * elements sit between the button and its badge is a fact about the markup,
   * and this spec is about the plan.
   */
  await expect(row.locator('xpath=ancestor::li[1]').getByText('added')).toBeVisible()
})

test('a reading can be told it is something else, and the part agrees', async ({ page }) => {
  /*
   * The type is not a label. It decides which rules speak about a reading —
   * so it decides what the reading scores and where a generator puts it — and
   * after faces have been added a machinist is often right to disagree.
   */
  await at(page, FACE)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  const type = page.getByLabel('Feature type')
  const was = await type.inputValue()
  // The editor's own title, not the mapping panel's — `Map features` is an h2
  // too, and it sits above this one in the document.
  const heading = page
    .locator('[data-keynav="faces"]')
    .locator('xpath=../..')
    .getByRole('heading', {
      level: 2,
    })
  const titled = await heading.textContent()

  const other = (await type.locator('option').all()).map((option) => option.getAttribute('value'))
  const next = (await Promise.all(other)).find((value) => value !== null && value !== was)
  expect(next).toBeTruthy()

  await type.selectOption(next!)

  /*
   * The heading is read off **the part**, not off the panel's own state — the
   * editor looks its reading up in `part.features` every render. So a changed
   * title is the whole app agreeing, rather than a select remembering what was
   * chosen in it.
   */
  await expect(type).toHaveValue(next!)
  await expect(heading).not.toHaveText(titled!)
})

test('the Cut switch is Both every time the editor opens', async ({ page }) => {
  /*
   * It is session state and nothing put it back. An editor opened after a
   * session of splitting passes came up armed to cut *finishing only*, and the
   * next click on the part quietly did that instead of what it looks like it
   * does — a mode that persists across the thing it belongs to is a mode
   * nobody remembers setting.
   */
  const openEditor = async () => {
    await at(page, FACE)
    await page
      .getByRole('button', { name: /Edit feature/ })
      .first()
      .click()
  }

  await openEditor()
  await expect(cut(page, 'Both')).toHaveAttribute('aria-pressed', 'true')

  // Leave it somewhere else, then come back.
  await cut(page, 'F').click()
  await expect(cut(page, 'F')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Save' }).click()

  await openEditor()
  await expect(cut(page, 'Both')).toHaveAttribute('aria-pressed', 'true')
  await expect(cut(page, 'F')).toHaveAttribute('aria-pressed', 'false')
})

test('an edit is kept by Save and put back by Cancel', async ({ page }) => {
  /*
   * Every click writes straight to the plan — that is what makes editing on
   * the model worth doing — so what was missing was not a draft but a way back
   * out. The only undo was clicking each face again and remembering what it
   * had been.
   */
  const openEditor = async () => {
    await at(page, FACE)
    await page
      .getByRole('button', { name: /Edit feature/ })
      .first()
      .click()
  }

  const ticks = page.locator('[data-keynav="faces"] input[type="checkbox"]')

  await openEditor()
  const before = await ticks.count()

  /*
   * Unlit until there is something to keep.
   *
   * `Save` is always available and for most of a session there is nothing
   * behind it, so a button that looks the same either way is one nobody can
   * read. It answers what `Cancel` answers, from the other side.
   */
  const save = page.getByRole('button', { name: 'Save' })
  await expect(save).toHaveAttribute('aria-pressed', 'false')

  // Take a face on, then put the whole session back.
  await at(page, OTHER)
  await expect(save).toHaveAttribute('aria-pressed', 'true')
  expect(await ticks.count()).toBeGreaterThan(before)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await openEditor()
  expect(await ticks.count()).toBe(before)

  // And the same edit, kept.
  await at(page, OTHER)
  const after = await ticks.count()
  await page.getByRole('button', { name: 'Save' }).click()

  await openEditor()
  expect(await ticks.count()).toBe(after)
})

test('leaving the editor any way but Save puts the work back', async ({ page }) => {
  /*
   * Paul's rule, and the better one: **Save is what keeps the changes**, so
   * everything else has to be the other answer. A way out that sometimes
   * commits and sometimes does not is one somebody has to remember the rule
   * for — and the whole point of a Save button is not having to.
   */
  const openEditor = async () => {
    await at(page, FACE)
    await page
      .getByRole('button', { name: /Edit feature/ })
      .first()
      .click()
  }

  const ticks = page.locator('[data-keynav="faces"] input[type="checkbox"]')

  await openEditor()
  const before = await ticks.count()

  // Escape, which used to keep the work.
  await at(page, OTHER)
  expect(await ticks.count()).toBeGreaterThan(before)
  await page.keyboard.press('Escape')
  await expect(page.getByText(/Every face this reading covers/)).toHaveCount(0)

  await openEditor()
  expect(await ticks.count()).toBe(before)
})

test('the mapping list is frozen while a feature is being edited', async ({ page }) => {
  /*
   * The editor stands in place of the datasheet below, so the mapping list
   * above it stays on screen — and every row in it is a live control. Pressing
   * one mid-edit maps a different reading, or lights a different way up,
   * against a plan that anything but `Save` is about to put back. The work
   * either vanishes or half of it does, and neither reads as a decision
   * anybody made.
   */
  await at(page, FACE)

  const rows = page.locator('[data-keynav="map"] [data-row]')
  await expect(rows.first()).toBeEnabled()

  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  /*
   * Still on screen — it is context, and hiding it would move the editor under
   * the pointer. It just cannot be pressed: `inert` takes the subtree off the
   * pointer, the keyboard and the accessibility tree in one word.
   */
  const editor = page.getByText(/Every face this reading covers/)
  await expect(editor).toBeVisible()
  await expect(page.locator('[data-keynav="map"]')).toBeVisible()

  // Forced, because the point is that the press does not land. Without
  // `force` Playwright refuses to click an element that takes no pointer
  // events, which is the same finding by a different route.
  await rows.first().click({ force: true })
  await expect(editor).toBeVisible()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(rows.first()).toBeEnabled()
  await rows.first().click()
  await expect(editor).toHaveCount(0)
})

test('Edit Feature opens the row it was pressed on, not the focused one', async ({ page }) => {
  /*
   * They are not always the same: pressing `Edit Feature` on a row opens that
   * reading's editor whether or not it is the row the datasheet is focused on.
   * The arrow followed the focus, so the part showed the way up of a reading
   * nobody was working on — while every face click was landing on the one that
   * is.
   */
  await at(page, FACE)

  const rows = page.locator('[data-keynav="map"] [data-row]')
  const focused = (await page
    .locator('[data-keynav="map"] [data-row][aria-pressed="true"]')
    .getAttribute('data-row'))!

  // A different row's editor, opened without focusing that row first.
  const other = (await rows.evaluateAll((els, held) => {
    const found = els.map((el) => el.getAttribute('data-row')).filter((tag) => tag !== held)
    return found.at(-1) ?? null
  }, focused))!
  expect(other).not.toBe(focused)

  await page
    .locator(`[data-keynav="map"] [data-row="${other}"]`)
    .locator('xpath=ancestor::li[1]')
    .getByRole('button', { name: /Edit feature/ })
    .click()

  /*
   * The half of Paul's report that is readable.
   *
   * The other half — that the **arrow** follows the reading being edited rather
   * than the one being read — is drawn in the canvas, where no assertion
   * reaches. A version of this test written for it passed just as well before
   * the fix as after, which is a test of nothing; the decision lives in
   * `arrowsFor` instead, where it is one line and can be argued with.
   */
  const editor = page.locator('[data-keynav="faces"]').locator('xpath=../..')
  const pressed = page.locator(`[data-keynav="map"] [data-row="${other}"]`)
  const named = (await pressed.locator('xpath=ancestor::li[1]').innerText()).trim()
  const heading = (await editor.getByRole('heading', { level: 2 }).innerText()).trim()

  // The editor names the reading that was pressed, not the one being read.
  expect(named.toLowerCase()).toContain(heading.split('\n')[0]!.trim().toLowerCase())
})

test('orbiting the part does not end a keyboard walk', async ({ page }) => {
  /*
   * The lists beside the part are walked with the arrow keys from a focused
   * row. Pressing on a canvas moves focus to the document body, so one orbit
   * to look at what a row was pointing at ended the walk — and the arrows
   * quietly did nothing afterwards, which reads as the keyboard being broken
   * rather than as focus having moved.
   */
  await at(page, FACE)

  const rows = page.locator('[data-keynav="map"] [data-row]')
  await rows.first().focus()
  const before = await page.locator(':focus').getAttribute('data-row')
  expect(before).toBeTruthy()

  // Orbit: press on the part and drag.
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 6 })
  await page.mouse.up()

  // Still on the row, and the arrows still walk.
  await expect(page.locator(':focus')).toHaveAttribute('data-row', before!)
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(':focus')).toHaveAttribute('data-row', /.+/)
  await expect(page.locator(':focus')).not.toHaveAttribute('data-row', before!)
})
