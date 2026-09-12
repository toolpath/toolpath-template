import { expect, test, type Page } from '@playwright/test'
import { onThePart, openCubeWithHole } from './cube-fixture'

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
/** Off the part, and clear of everything over it — the same corner that file uses. */
const NOTHING = { x: 0.86, y: 0.86 }

const at = async (page: Page, spot: { x: number; y: number }): Promise<void> => {
  const box = await page.locator('canvas').boundingBox()
  if (box === null) {
    throw new Error('the viewer never drew a canvas')
  }
  // A fraction of the space the questions leave — `onThePart` says why.
  const { x, y } = await onThePart(page, box, spot)
  await page.mouse.click(x, y)
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
 * **A count says whether ticking a box is worth it, so it cannot be nought
 * while the answer is not** (Paul, 2026-09-10: "it is showing zero compatible
 * end mills currently, but checking any of the boxes shows there are end mills
 * that do work").
 *
 * The matcher judges what the filters admit, and a threaded hole's `form` axis
 * holds the drill and the taps — so no end mill had ever been put to this
 * hole's rules and every one of them read nought. The feature's own type table
 * turns them away besides: `ThreadedBlindHole` considers `tap right hand;
 * drill`. The pool the counts are measured over is widened past both.
 *
 * Taking the type off the filter is what makes it visible here — the fixture's
 * predrill has no drill that makes it, so the page turns the mills on by itself
 * — and it is the same state either way: a type the list is not holding, over a
 * feature it works on. The number must not move.
 */
test('says how many end mills work while the filter is holding none', async ({ page }) => {
  await open(page, 'DRILL')
  await page.getByRole('button', { name: 'Filter by Type', exact: true }).click()
  const types = page.getByRole('group', { name: 'Type' })
  const flat = types.locator('[data-term-option="Flat end mill"]')
  await expect(flat.locator('[data-term-count]')).toHaveText('1')

  await types.getByRole('checkbox', { name: 'Flat end mill' }).click()

  await expect
    .poll(async () => new URL(page.url()).searchParams.getAll('form'))
    .not.toContain('flat end mill')
  /*
    **The row that says how many are behind the list must not move.** Two of
    the sample's types work on no hole at all and are behind it either way;
    taking the mill off the filter used to put it there too, which is the
    defect — and asserting the row rather than the count is what makes this a
    sensor rather than a race, because the counts land a task after the rows
    (`countLater`) and the panel shows what it last offered until they do.
  */
  await expect(types.getByRole('button', { name: '… 2 more' })).toBeVisible()
  // Off the list, and still the answer to "what would ticking this bring".
  await expect(flat.locator('[data-term-count]')).toHaveText('1')
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

/**
 * **A group of identical holes is corrected one hole at a time** (Paul,
 * 2026-09-11: "when I create a group of all holes with the same diameter and
 * depth, removing one of the holes removes all of them from the list. In this
 * mode, I should be able to add or remove individual holes, even if they are
 * identical").
 *
 * The group opens on every hole like the one being read — that is what the
 * offer beside it promises — and from there it is editable: the X beside a hole
 * takes that hole out, and a press on a hole already in the group takes that
 * hole out. Both used to take the whole set, so the first correction to a
 * thirty-nine-hole group emptied it, and a group of all-but-one could not be
 * asked for at all.
 *
 * Here rather than in `on-the-part.spec.ts` for the usual reason: the plain
 * cube has no two identical holes, so the offer this begins with never appears.
 */
test('takes one hole out of a group of identical holes at a time', async ({ page }) => {
  const offer = page.getByRole('button', { name: /^Add all \d+ as a group$/ })
  await expect(offer).toBeVisible()
  const all = Number(/\d+/.exec((await offer.innerText()) ?? '')?.[0] ?? '0')
  expect(all).toBeGreaterThan(2)

  await offer.click()
  // Pre-selected: every hole identical to the one being read (Paul, 2026-09-11).
  const chips = page.getByRole('button', { name: /^Take .+ out of the group$/ })
  await expect(chips).toHaveCount(all)

  /*
    A press on the hole already selected takes it out — and only it. The click
    lands on the face the group was opened from, which is the one hole here
    that is certain to still be in the group.
  */
  await at(page, FACE)
  await expect(chips).toHaveCount(all - 1)

  // And so does the X beside one, which is the same rule from the other side.
  await chips.first().click()
  await expect(chips).toHaveCount(all - 2)
})

/**
 * **A group asks about identical holes too** (Paul, 2026-09-11: "the group
 * dialog should ask if I want to add identical holes if I select one, just like
 * the feature dialog").
 *
 * Clicking a hole while a group is open used to take every identical hole with
 * it. That expansion came out on 2026-09-11 so a group could be corrected a
 * hole at a time — and with it went the only way to pick up a bolt circle
 * without one click per hole. The offer is the way back to one press;
 * `offerSiblings` in `routes/part.tsx` is the rule, and it is a different press
 * from the reading panel's, which *opens* a group rather than growing one.
 *
 * Here rather than in `on-the-part.spec.ts` for the usual reason: the plain
 * cube has no two identical holes, so the offer never appears there.
 */
test('offers the identical holes inside the group being built', async ({ page }) => {
  // How many there are, read off the reading panel's own offer before the
  // group is opened — the same set, counted the same way.
  const named = page.getByRole('button', { name: /^Add all \d+ as a group$/ })
  await expect(named).toBeVisible()
  const all = Number(/\d+/.exec((await named.innerText()) ?? '')?.[0] ?? '0')
  expect(all).toBeGreaterThan(2)

  /*
    The reading is put down first. `+ Group` over a held hole opens the group on
    every hole like it — the reading panel's offer, taken through the press —
    and what is under test here is the group that starts empty.
  */
  await at(page, NOTHING)
  await page.getByRole('button', { name: '+ Group', exact: true }).click()
  await at(page, FACE)
  const chips = page.getByRole('button', { name: /^Take .+ out of the group$/ })
  await expect(chips).toHaveCount(1)

  const offer = page.getByRole('button', { name: `Add all ${String(all)} to the group` })
  await expect(offer).toBeVisible()
  await offer.click()

  await expect(chips).toHaveCount(all)
  // Nothing left to add, so nothing left to offer.
  await expect(offer).toHaveCount(0)
})

/** And the other answer stands the group down without adding anything. */
test('leaves the group at one hole when the offer is turned down', async ({ page }) => {
  await at(page, NOTHING)
  await page.getByRole('button', { name: '+ Group', exact: true }).click()
  await at(page, FACE)
  const chips = page.getByRole('button', { name: /^Take .+ out of the group$/ })
  await expect(chips).toHaveCount(1)

  await page.getByRole('button', { name: 'Just this hole' }).click()

  await expect(chips).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Add all \d+ to the group$/ })).toHaveCount(0)
})

/**
 * **A tap list narrows on its vendor and its family like every other list**
 * (Paul, 2026-09-11: "I don't see the filter option for vendor when I am
 * selecting a tap for a tool assembly. Why is that? I should, and if vendors
 * don't have taps, it should simply show zero. Same thing for family").
 *
 * The taps are swept out of the catalog by the thread rather than narrowed by
 * the tool query, and both headings carried no funnel at all because of it —
 * a rule about where the rows come from, answering a question about what a row
 * says. The pool is a list of tools, so the page narrows it on the two term
 * axes itself; a vendor with no tap for this thread is a nought behind the `…`
 * row rather than a question the header refuses to ask.
 */
test('narrows the taps by vendor, and offers the vendors with none at nought', async ({ page }) => {
  await open(page, 'TAP')
  await expect(table(page).getByText('VTSFT0250')).toBeVisible()

  await page.getByRole('button', { name: 'Filter by Vendor', exact: true }).click()
  const picker = page.getByRole('group', { name: 'Vendor' })

  // The one vendor holding a tap for this thread, counted.
  await expect(picker.locator('[data-term-option="WIDIA"] [data-term-count]')).toHaveText('1')

  // And the vendor that holds none, behind the `…` row at nought — the catalog
  // has it, this list does not, and pressing it is how the question widens.
  await picker.locator('[data-expand-filter]').click()
  await expect(picker.locator('[data-term-option="Kennametal"] [data-term-count]')).toHaveText('0')

  // The tick is the truth in both directions: the vendor with no tap empties
  // the list, and the one with a tap brings it back.
  await picker.getByRole('checkbox', { name: /^Kennametal/ }).click()
  await expect(table(page).getByText('VTSFT0250')).toBeHidden()
  await picker.getByRole('checkbox', { name: /^Kennametal/ }).click()
  await expect(table(page).getByText('VTSFT0250')).toBeVisible()
})

/**
 * **And on its family, which is the same question about the other column**
 * (Paul, 2026-09-11: "Same thing for family"). Separate because the family is
 * read out under the vendor's own title rather than as the stored id, so a
 * funnel that offered the id would be a filter nobody could match to a row.
 */
test('narrows the taps by family, under the name the column shows', async ({ page }) => {
  await open(page, 'TAP')
  await expect(table(page).getByText('VTSFT0250')).toBeVisible()

  await page.getByRole('button', { name: 'Filter by Family', exact: true }).click()
  const picker = page.getByRole('group', { name: 'Family' })
  /*
    The family's **title**, not the `sample-inch-taps` id the row stores — a
    funnel offering the id would be a filter nobody could match to a column.
  */
  const family = 'Sample inch spiral-flute taps'
  await expect(picker.locator('[data-term-option="sample-inch-taps"]')).toContainText(family)

  await picker.getByRole('checkbox', { name: family, exact: true }).click()
  await expect(table(page).getByText('VTSFT0250')).toBeVisible()
  // The press that clears says which filters it is clearing, this one included.
  await expect(page.getByRole('button', { name: /^Clear \d+ filters?$/ })).toHaveAttribute(
    'title',
    /Family/,
  )
})
