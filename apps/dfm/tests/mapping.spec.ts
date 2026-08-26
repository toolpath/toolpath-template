import { expect, test, type Page } from '@playwright/test'

import { SIDE, UP, faces, feature, openFeature, openPart, report } from './part-fixture'

/**
 * Mapping a feature to the way up it is cut from.
 *
 * Driven the way a person reaches it without a mesh: open a feature type in the
 * summary, choose a feature, and press a pass on the one being read.
 */

/**
 * Put the faces nothing cuts up in the mapping panel.
 *
 * Pressed from the coverage bars rather than from the panel's own toggle: the
 * two bars say how much is done and this is the same measure from the other
 * end, so it belongs beside them. The mapping panel is a column of its own, so
 * the list appears there without leaving the tab.
 */
/**
 * Press `Fill all`, which lives inside the generate fold.
 *
 * The fold closes the moment a way up is held — and that is the moment `Fill
 * all` becomes useful, so reaching it means opening the fold again. A
 * `<summary>` rather than a button, so it is addressed as the element it is.
 */
const fillAll = async (page: Page) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  const summary = page.locator('summary', { hasText: 'Generate directions' })
  if (!(await page.getByRole('button', { name: 'Fill all' }).isVisible())) await summary.click()
  await page.getByRole('button', { name: 'Fill all' }).click()
}

const showUncut = async (page: Page) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Not cut yet/ }).click()
}

/**
 * The readings of the first uncut face — a list of readings, without a mesh.
 *
 * The uncut list is faces, and a face opens onto what could cut it. That makes
 * it the way into a reading list for a fixture that cannot click the part, the
 * job the old flat list of readings was doing for most of this spec.
 */
const openUncut = async (page: Page) => {
  await showUncut(page)
  await page.locator('[data-keynav="unmapped"] [data-row]').first().click()
}

/**
 * What `Not cut yet` says it is holding.
 *
 * The button wears the figure and keeps the sentence in its tooltip: under a
 * pair of coverage bars answering the same question, a button is the wrong
 * place for a paragraph. Both are checked, because the figure on screen and the
 * sentence on hover are two readings of one number.
 */
const uncutSays = async (page: Page, count: number, of: number) => {
  const button = page.getByRole('button', { name: /Not cut yet/ })
  await expect(button).toContainText(`(${String(count)})`)
  await expect(button).toHaveAttribute(
    'title',
    new RegExp(`${String(count)} of ${String(of)} faces have no way up`),
  )
}

test.beforeEach(async ({ page }) => {
  await openPart(
    page,
    report({
      // Four faces of 100 mm²: a direction holding one of them has mapped 25%.
      regions: faces(4),
      candidateDirections: [UP, SIDE],
      features: [
        feature('pocket-1', 'Pocket', UP, [0]),
        feature('profile-1', 'Profile', SIDE, [0, 1]),
      ],
    }),
  )
})

test('maps a feature to its own direction, and the direction list fills', async ({ page }) => {
  // Before anything is mapped, each way up says what it could reach.
  await expect(page.locator('[data-direction="+Z"]')).toContainText('reaches')

  await openFeature(page, /Pocket/, /cket-1/)

  await page.getByRole('button', { name: 'R', exact: true }).click()

  // The pocket covers one of four faces, so +Z has now been given a quarter of
  // the part — and says so where it previously said what it could reach.
  await expect(page.locator('[data-direction="+Z"]')).toContainText('25% mapped')
})

test('pressing the pass a feature already holds takes it off again', async ({ page }) => {
  await openFeature(page, /Pocket/, /cket-1/)

  const rough = page.getByRole('button', { name: 'R', exact: true })
  await rough.click()
  await expect(rough).toHaveAttribute('aria-pressed', 'true')

  await rough.click()
  await expect(rough).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-direction="+Z"]')).toContainText('reaches')
})

test('both passes land from one press', async ({ page }) => {
  await openFeature(page, /Pocket/, /cket-1/)

  await page.getByRole('button', { name: 'Both', exact: true }).click()

  await expect(page.getByRole('button', { name: 'R', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'F', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('the directions tab lists what is held, and lets a way up be dropped', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()

  // Nothing is decided yet, so there are no confirmed directions — only the
  // invitation. Candidates are what the part offers; setups are what has been
  // chosen, and showing the two as one list would claim decisions nobody made.
  await expect(page.getByText('Nothing is held yet')).toBeVisible()
  await uncutSays(page, 4, 4)

  await page.getByRole('tab', { name: 'Inspector' }).click()
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()

  // One way up now holds one reading, covering a quarter of the part.
  const held = page.locator('[data-setup="+Z"]')
  await expect(held).toContainText('Direction 1, +Z')
  await expect(held).toContainText('1 · 25%')
  // The pocket covers one of four faces, so three are still uncut — two of
  // which no reading reaches from any way up, said separately below.
  await uncutSays(page, 3, 4)
  await expect(page.getByRole('button', { name: /Not cut yet/ })).toHaveAttribute(
    'title',
    /2 of those have no reading from any way up/,
  )

  // Dropping the way up gives its readings back rather than leaving them
  // pointing at a setup that no longer exists.
  await held.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('Nothing is held yet')).toBeVisible()
  await uncutSays(page, 4, 4)
})

test('rough and finish are counted separately', async ({ page }) => {
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()
  await page.getByRole('tab', { name: 'Directions' }).click()

  // A face roughed from above and not yet finished is a real state to be in
  // halfway through planning, and it shows as one.
  const rough = page.locator('div', { hasText: /^Rough/ }).last()
  await expect(rough).toContainText('25%')
})

test('an arrangement arrives from one press, and clears again', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.getByText('Nothing is held yet')).toBeVisible()

  await page.getByRole('button', { name: /Required, filled/ }).click()

  /*
   * One way up, not two — and the reading left over is the point.
   *
   * −Y is forced, because face 1 has no other reading. Taking it there claims
   * face 0 as well, since a profile is one operation over the faces it covers.
   * The pocket is another reading of face 0, so it is now *not cut* rather than
   * cut a second time: an arrangement that took both would machine that face
   * twice and the estimate would pay for both.
   */
  await expect(page.getByText('Nothing is held yet')).toHaveCount(0)
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')
  await uncutSays(page, 2, 4)

  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByText('Nothing is held yet')).toBeVisible()
})

test('required only takes what the part forces and leaves the rest open', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Required only/ }).click()

  // profile-1 is the only reading of face 1, so −Y is forced. The pocket's face
  // is reachable both ways, so who cuts it is a decision this offer will not
  // make.
  await expect(page.locator('[data-setup="−Y"]')).toBeVisible()
  await expect(page.locator('[data-setup="+Z"]')).toHaveCount(0)
})

test('a confirmed direction folds away once it has been read', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Required, filled/ }).click()

  const held = page.locator('[data-setup="−Y"]')
  const fold = held.getByRole('button', { expanded: true })

  // Open by default: a direction with nothing under it reads as empty.
  await expect(held.locator('[data-row]')).toHaveCount(1)

  await fold.click()
  await expect(held.locator('[data-row]')).toBeHidden()

  await held.getByRole('button', { expanded: false }).click()
  await expect(held.locator('[data-row]').first()).toBeVisible()
})

test('a confirmed reading carries the same score badge the other lists do', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Required, filled/ }).click()

  /*
   * What it is, how many faces, and how hard — the shape the Inspector's
   * candidate list uses, so a reading reads the same everywhere. The whole row,
   * not just its button: the face count is a control and sits beside it,
   * because a button inside a button is invalid.
   *
   * **Not** which way up, and that is the one difference between the two lists:
   * these are grouped under a header that already names it.
   */
  const row = page.locator('[data-setup="−Y"] [data-row]').first().locator('..')
  // Sentence case, matching the Inspector's own type list: a type is a noun
  // phrase, not a title.
  await expect(row).toContainText('Profile')
  await expect(row).not.toContainText('Through Hole')
  await expect(row.getByRole('button', { name: /Edit feature, 2 regions/ })).toBeVisible()
  await expect(row).not.toContainText('−Y')
})

test('the toggle says what a click will mean, before the click', async ({ page }) => {
  // Always visible, and By feature first: it is where the page opens, and a toggle
  // whose pressed button is not the leftmost reads as though the page started
  // somewhere else and was moved.
  const byDirection = page.getByRole('button', { name: 'By direction' })
  const byFace = page.getByRole('button', { name: 'By feature' })

  await expect(byDirection).toBeVisible()
  await expect(byFace).toBeVisible()
  await expect(page.getByRole('group', { name: 'What this list shows' })).toContainText(
    /By feature\s*By direction\s*Create/,
  )
  // By feature to begin with: by direction is worked by pressing an arrow, so
  // opening there would need a gesture nobody has been offered yet.
  await expect(byFace).toHaveAttribute('aria-pressed', 'true')

  /*
   * The guide names all of them, whichever one is being read: with nothing
   * picked the instruction people need is *which of these am I meant to be in*,
   * and a hint about the current mode cannot answer that.
   */
  await expect(page.getByText('Click a face on the part to see every feature')).toBeVisible()
  await expect(page.getByText('Click a candidate direction arrow')).toBeVisible()

  await byDirection.click()
  await expect(byDirection).toHaveAttribute('aria-pressed', 'true')
  // Nothing paints until a way up is held — without one there is no question
  // for a painted set to answer.
  await expect(page.getByText('Click a candidate direction arrow')).toBeVisible()
})

test('leaving By direction puts the arrows away rather than restoring them', async ({ page }) => {
  const arrows = page.getByRole('button', { name: /Direction arrows/ })
  await expect(arrows).toContainText('Off')

  // Entering draws them: the mode's only gesture is pressing one, and a mode
  // whose gesture is invisible is a mode nobody can start.
  await page.getByRole('button', { name: 'By direction' }).click()
  await expect(arrows).toContainText('All')

  /*
   * Leaving puts them away. A way up held in By direction is a filter **on By
   * direction**, so carrying it into By feature leaves an arrow lit over a list
   * it is not filtering — and restoring what the arrows were before is not the
   * same thing, because choosing one inside the mode used to end the loan and
   * leave them up for good.
   */
  await page.getByRole('button', { name: 'By feature' }).click()
  await expect(arrows).toContainText('Off')
})

test('delete leaves a confirmed direction alone', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Required, filled/ }).click()

  const held = page.locator('[data-setup="−Y"]')
  await expect(held).toContainText('1 · 50%')

  /*
   * Delete prunes an offer, and only an offer.
   *
   * A reading a direction is cutting is a decision somebody made, and a key
   * that quietly unmakes one is a plan that changes when a hand brushes the
   * keyboard. Taking work off a direction has a button.
   */
  await held.locator('[data-row]').first().focus()
  await page.keyboard.press('Delete')

  await expect(held).toContainText('1 · 50%')
})

test('R, F and B act on the row under the keyboard', async ({ page }) => {
  await openFeature(page, /Pocket/, /cket-1/)

  // Row 38: pressing the pass something already has takes it off again.
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'R', exact: true }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'R', exact: true }).first()).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  // Row 32: A and B both mean both passes.
  await page.keyboard.press('b')
  await expect(page.getByRole('button', { name: 'F', exact: true }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a shortcut never fires while something is being typed', async ({ page }) => {
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await openFeature(page, /Pocket/, /cket-1/)

  // A plan rewritten by somebody spelling a word.
  const search = page.getByPlaceholder(/Search type/)
  await search.fill('r')
  await search.press('f')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.getByText('Nothing is held yet')).toBeVisible()
})

test('from the rules cuts each face the way the limits like best', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.getByText('Nothing is held yet')).toBeVisible()

  await page.getByRole('button', { name: /From the rules/ }).click()
  // It asks which ways up to hold before it decides anything — see the chooser
  // tests below. Confirming what it suggests is the old one-press behaviour.
  await page.getByRole('button', { name: 'Map features' }).click()

  /*
   * −Y, with the profile — and the pocket left uncut.
   *
   * Both readings cover face 0, and a face is cut once. The profile settles
   * twice the ground, so it wins and the pocket is not a saving but the same
   * face machined twice. Faces 2 and 3 have no reading from any way up, so half
   * the part is all there is to reach.
   */
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')
  await expect(page.locator('[data-setup="+Z"]')).toHaveCount(0)
  await uncutSays(page, 2, 4)
})

test('fill from current works the ways up already held, and buys none', async ({ page }) => {
  // Map the pocket by hand. +Z is now the only way up being held.
  await openFeature(page, /Pocket/, /cket-1/)
  await page.keyboard.press('b')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')

  await fillAll(page)

  /*
   * +Z keeps its work and −Y is never bought.
   *
   * The profile would cut more of the part, but it needs a way up nobody is
   * holding — and the fixturing is already decided. Leaving that ground uncut
   * is the answer rather than a shortfall; the remedy is to hold −Y, which is
   * somebody's decision to make rather than an offer's to make for them.
   */
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')
  await expect(page.locator('[data-setup="−Y"]')).toHaveCount(0)
})

test('fill all is off until there is something to fill', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.getByText('Nothing is held yet')).toBeVisible()

  /*
   * It works the ways up you hold, so with none held its honest answer is to
   * do nothing — and a button that does nothing reads as one that failed.
   */
  const fill = page.getByRole('button', { name: 'Fill all' })
  await expect(fill).toBeDisabled()
  await expect(fill).toHaveAttribute('title', /Hold a way up first/)

  // And it comes back the moment one is held. The fold shuts at that same
  // moment, so getting back to it is one press on the summary.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.locator('summary', { hasText: 'Generate directions' }).click()
  await expect(fill).toBeEnabled()
})

test('what is not cut yet is asked from the bars that measure it, not from the toggle', async ({
  page,
}) => {
  /*
   * It was a fourth button in the toggle, and it never belonged there: the
   * other three answer *how do I want to read the part* and stay answered,
   * while this is a question about the plan — what is still missing — asked
   * from the coverage bars and put down again.
   */
  const byFace = page.getByRole('button', { name: 'By feature' })
  await expect(byFace).toHaveAttribute('aria-pressed', 'true')

  await showUncut(page)

  // Every mode goes out while the list has the panel, rather than one of them
  // staying lit beside a list it is not showing.
  await expect(byFace).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-keynav="unmapped"]')).toBeVisible()

  await byFace.click()
  await expect(byFace).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-keynav="unmapped"]')).toHaveCount(0)
})

test('everything nothing cuts is one press away, and mappable from there', async ({ page }) => {
  await showUncut(page)

  /*
   * **Faces, not readings.** A reading is one of several alternatives for the
   * same ground, so most are unassigned on a finished part — and one can be
   * unassigned while every face it covers is already cut by somebody else.
   * Neither is a gap. A face is either cut or it is not.
   *
   * The row opens onto the readings that could take it, with the pass buttons
   * every other list gives them: a list that only says what is missing makes
   * somebody go and find it again.
   */
  const rows = page.locator('[data-keynav="unmapped"] [data-row]')
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await page
    .locator('[data-keynav="unmapped"]')
    .getByRole('button', { name: 'BOTH' })
    .first()
    .click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.getByText('Nothing is held yet')).toHaveCount(0)
})

test('the arrows narrow from every way up, to the plan, to none', async ({ page }) => {
  const arrows = page.getByRole('button', { name: /Direction arrows/ })

  // Off to begin with: an arrow per way up is most of a small part, answering a
  // question nobody has asked yet.
  await expect(arrows).toContainText('Off')

  await arrows.click()
  await expect(arrows).toContainText('All')
  await expect(arrows).toHaveAccessibleName(/every candidate way up/)

  await arrows.click()
  await expect(arrows).toContainText('Confirmed')
  await expect(arrows).toHaveAccessibleName(/only the ways up the plan holds/)

  await arrows.click()
  await expect(arrows).toContainText('Off')
})

test('confirming a way up is what gives the middle state something to draw', async ({ page }) => {
  const arrows = page.getByRole('button', { name: /Direction arrows/ })
  await arrows.click()
  await arrows.click()

  // Nothing is confirmed yet, so Confirmed draws nothing — the honest answer,
  // and the reason the button says which state it is in rather than only
  // looking pressed.
  await expect(arrows).toContainText('Confirmed')
  await expect(page.locator('[data-setup="+Z"]')).toHaveCount(0)

  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')
  await expect(arrows).toContainText('Confirmed')
})

test('what is left narrows to one way up, and back to all of them', async ({ page }) => {
  await showUncut(page)

  // Every face to begin with: four of them, and nothing cuts any of them yet.
  const rows = page.locator('[data-keynav="unmapped"] [data-row]')
  await expect(rows).toHaveCount(4)

  /*
   * Holding a way up. On the part that is a click on its arrow; here it is the
   * same state reached from the summary's direction row, which is the only one
   * a fixture without a mesh can press — and the summary is the Inspector's.
   * The list stays up through the tab change: it has a column of its own.
   */
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await page.locator('[data-direction="+Z"]').click()

  /*
   * Face 0 alone. It is the only one +Z can reach — the pocket reads it from
   * up, while faces 1, 2 and 3 are the profile's or nobody's.
   *
   * Faces, not readings, which is why this is one row rather than two: a face
   * two ways up can reach is still one gap, and counting the readings of it
   * made a part with a handful of holes left look like forty.
   */
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toHaveAccessibleName(/^Face 0,/)

  // The flag lives on the part, with its own Clear: a filter switched on from
  // the part has to be clearable from there. The panel does not carry a second.
  const flag = page.getByText(/Only \+Z · everything else is hidden/)
  await expect(flag).toBeVisible()
  await page.getByRole('button', { name: 'Clear' }).click()

  await expect(flag).toHaveCount(0)
  await expect(rows).toHaveCount(4)
})

test('a way up with nothing left says so rather than emptying the list', async ({ page }) => {
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await showUncut(page)
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await page.locator('[data-direction="+Z"]').click()

  // An empty list under a flag reads as a bug in the filter.
  await expect(page.getByText('+Z has nothing left uncut')).toBeVisible()
})

test('claiming a face leaves the rest of the reading it came from where it was', async ({
  page,
}) => {
  /*
   * The profile covers two faces from −Y; the pocket covers one of them from +Z.
   * Claiming that face for the pocket used to unassign the profile outright —
   * both its faces left the plan to move one.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')

  await page.getByRole('tab', { name: 'Inspector' }).click()
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()

  // Both ways up are still held, and between them they still cut both faces.
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 25%')
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')

  // And the profile says what it gave up rather than looking whole.
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 of 2')
})

test('a reading that loses its last face leaves the plan', async ({ page }) => {
  // A reading cutting no faces is not a decision anybody made.
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')

  await page.getByRole('tab', { name: 'Inspector' }).click()
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()

  // The profile covers the pocket's only face, so +Z is holding nothing and goes.
  await expect(page.locator('[data-setup="+Z"]')).toHaveCount(0)
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')
})

test('pressing the pass again takes back what the reading gave up', async ({ page }) => {
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 of 2')

  // Pressing the pass on the reading you want stays the whole gesture.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')
  await expect(page.locator('[data-setup="−Y"]')).not.toContainText('of 2')
  await expect(page.locator('[data-setup="+Z"]')).toHaveCount(0)
})

test('a face count opens the faces, in place of the datasheet', async ({ page }) => {
  /*
   * A face is what a plan is made of — cut once, counted by coverage, taken by
   * a claim — and until this opened, the only way to argue with one was to find
   * it on the part and click it.
   */
  await openUncut(page)

  // Named by its regions: every reading offers this button, so "the first one"
  // is whichever way up the part happens to list first.
  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()

  // In place of the datasheet, not beside it.
  await expect(page.getByRole('heading', { name: /Profile/ })).toContainText('2 faces')
  await expect(page.getByText(/Every face this reading covers/)).toBeVisible()
  await expect(page.getByText('Face 0')).toBeVisible()
  await expect(page.getByText('Face 1')).toBeVisible()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Every face this reading covers/)).toHaveCount(0)
})

test('a face opens onto everything else that could cut it', async ({ page }) => {
  await openUncut(page)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()

  // Face 0 is covered by the profile from −Y and the pocket from +Z; face 1 by
  // the profile alone.
  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()

  const owners = page.locator('[data-keynav="faces"] [data-row="pocket-1"]')
  await expect(owners).toBeVisible()

  // And it maps from there, without going back to find the pocket.
  await owners.locator('..').getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')
})

test('one of a face readings walks to that reading own faces', async ({ page }) => {
  // The rows are alternatives for one face, so pressing one asks what *that*
  // reading covers — and the answer is its own face list.
  await openUncut(page)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()

  /*
   * Out of the first editor before opening the second.
   *
   * The mapping list is frozen while a feature is being edited, so the row for
   * another reading cannot be pressed from inside one — every row up there
   * writes to the plan the editor is about to put back, and a press mid-edit
   * lost the work or half of it. This spec used to walk straight across.
   */
  await page.getByRole('button', { name: 'Cancel' }).click()

  // Scoped to the row's own readings: the same reading is offered by the plan
  // panel beside it, and "the pocket" there is a different press.
  await page
    .locator('[data-owners]')
    .getByRole('button', { name: /Edit feature, 1 regions/ })
    .click()

  await expect(page.getByRole('heading', { name: /Pocket/ })).toContainText('1 faces')
  await expect(page.getByText('Face 0')).toBeVisible()
  await expect(page.getByText('Face 1')).toHaveCount(0)
})

test('a reading is built up face by face, and taken back down the same way', async ({ page }) => {
  await openUncut(page)
  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()

  const faces = page.locator('[data-keynav="faces"] input[type="checkbox"]')
  await expect(faces).toHaveCount(2)
  await expect(faces.first()).not.toBeChecked()

  // Claiming one face is how a reading is built up rather than taken whole.
  await faces.first().check()
  await expect(page.getByRole('heading', { name: /Profile/ })).toContainText('1 of 2 faces')

  await faces.nth(1).check()
  await expect(page.getByRole('heading', { name: /Profile/ })).toContainText('2 faces')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')

  // And back down. A reading cutting no faces is not a decision anybody made,
  // so the way up holding it goes too.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await faces.first().uncheck()
  await faces.nth(1).uncheck()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toHaveCount(0)
})

test('the faces are reachable from the datasheet and the directions list too', async ({ page }) => {
  // One doorway, in every place a reading is listed.
  await openFeature(page, /Profile/, /file-1/)
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()
  await expect(page.getByText(/Every face this reading covers/)).toBeVisible()

  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await page
    .locator('[data-setup="−Y"]')
    .getByRole('button', { name: /Edit feature/ })
    .click()

  await expect(page.getByText(/Every face this reading covers/)).toBeVisible()
})

test('Both puts finishing on without taking roughing off', async ({ page }) => {
  /*
   * Judged per pass, Both on a reading already roughed read "rough is already
   * there" and took roughing off while putting finishing on.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()
  await page.getByRole('button', { name: 'Both', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()

  // Both passes reach half the part; neither was traded for the other.
  await expect(page.getByText(/^Rough/).locator('..')).toContainText('50%')
  await expect(page.getByText(/^Finish/).locator('..')).toContainText('50%')
})

test('a part-cut claim dashes its own pass and leaves Both alone', async ({ page }) => {
  /*
   * The screenshot state: a reading roughed on some of its faces and finished
   * nowhere. R says "held, not all of it"; F says nothing is finished; and Both
   * stays off, because one pass held is not a kind of "both".
   */
  /*
   * Roughed whole, then one face taken off roughing — through that face's own R,
   * not its tick. The tick is about both passes: on a reading held in one of
   * them it reads mixed, and pressing a mixed control **takes the rest back**,
   * the same rule R, F and Both follow. The row's R is the gesture that means
   * one pass on one face.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()
  await page
    .locator('[data-keynav="faces"] [data-row="profile-1"]')
    .locator('..')
    .getByRole('button', { name: 'R', exact: true })
    .click()

  // Read back where an assigned reading is listed: the confirmed directions.
  // By feature needs a click on the part, which a fixture with no mesh cannot do.
  await page.getByRole('tab', { name: 'Directions' }).click()

  const row = page.locator('[data-setup="−Y"] [data-row="profile-1"]').locator('..')
  await expect(row.getByRole('button', { name: 'R', exact: true })).toHaveAttribute(
    'aria-pressed',
    'mixed',
  )
  await expect(row.getByRole('button', { name: 'F', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(row.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'false')

  // And pressing Both finishes the job on both passes rather than undoing it.
  await row.getByRole('button', { name: 'Both' }).click()
  await expect(row.getByRole('button', { name: 'R', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(row.getByRole('button', { name: 'F', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('Both then untick leaves the rest roughed and finished', async ({ page }) => {
  /*
   * Press Both on a reading, then take one face off it. The remaining faces
   * stay cut in both passes and the face taken off is machined by nothing —
   * where the tick used to follow the viewport's pass, so it came off roughing
   * and left finishing cutting everything.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'Both', exact: true }).click()

  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()

  /*
   * By the face, not by position. Unticking moves the row into another group —
   * that is what grouping means — and `.first()` is re-resolved on retry, so a
   * positional locator unticks one face and then the next one to take its
   * place.
   */
  /*
   * Asked of the list. The same four names sit beside the Cut switch too, on
   * purpose — the headings say what this reading *has*, the key says what the
   * colours *mean*, and only one of them is a claim about the reading.
   */
  await expect(
    page.getByRole('list', { name: 'Faces' }).getByText('Roughed and finished', { exact: true }),
  ).toBeVisible()
  await page.getByRole('checkbox', { name: /face 0 /i }).uncheck()

  await page.getByRole('tab', { name: 'Directions' }).click()
  const row = page.locator('[data-setup="−Y"] [data-row="profile-1"]').locator('..')

  // Both passes hold it, and both hold the same one face of its two.
  await expect(row).toContainText('1 of 2')
  await expect(row.getByRole('button', { name: 'R', exact: true })).toHaveAttribute(
    'aria-pressed',
    'mixed',
  )
  await expect(row.getByRole('button', { name: 'F', exact: true })).toHaveAttribute(
    'aria-pressed',
    'mixed',
  )
  await expect(row.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'mixed')
})

test('a face reading is read in place, without leaving the editor', async ({ page }) => {
  /*
   * The offer list's rule: pressing a row reads it and changes nothing else.
   * The face stays lit and the part draws that reading's way up — "which of
   * these cuts it" answered without leaving the list that asked.
   */
  await openUncut(page)
  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()
  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()

  const owner = page.locator('[data-keynav="faces"] [data-row="pocket-1"]')
  await owner.click()

  // Still in the editor, and the row it read says so.
  await expect(page.getByText(/Every face this reading covers/)).toBeVisible()
  await expect(owner).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Face 1')).toBeVisible()
})

test('the face being worked on is marked apart from the rest', async ({ page }) => {
  /*
   * Two things to say about a face and two ways to say them: the fill is
   * whether this reading cuts it, the rail on the left is whether it is the one
   * being worked on. "Cut" and "current" are not the same question.
   */
  await openUncut(page)
  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()

  // By region index, not position: expanding a face inserts its readings, and
  // those rows carry a `data-row` of their own.
  const first = page.locator('[data-keynav="faces"] [data-row="0"]').locator('..')
  const second = page.locator('[data-keynav="faces"] [data-row="1"]').locator('..')

  await expect(first).toHaveClass(/border-transparent/)

  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()
  await expect(first).toHaveClass(/border-info/)
  await expect(second).toHaveClass(/border-transparent/)

  // Opening another moves it; closing the one being worked on puts it down.
  await page.getByRole('button', { name: /Show what else covers face 1/ }).click()
  await expect(second).toHaveClass(/border-info/)
  await expect(first).toHaveClass(/border-transparent/)

  await page.getByRole('button', { name: /Hide what else covers face 1/ }).click()
  await expect(second).toHaveClass(/border-transparent/)
})

test('a press under a face moves that face, and leaves the rest of the plan alone', async ({
  page,
}) => {
  /*
   * The pocket holds face 0 from +Z; the profile covers faces 0 and 1 from −Y.
   * Roughing the profile from under face 1 must move face 1 and nothing else —
   * the pocket keeps face 0, because the press had nothing to do with it.
   */
  await openFeature(page, /Pocket/, /cket-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  await openUncut(page)
  await page
    .locator('[data-owners]')
    .getByRole('button', { name: /Edit feature, 2 regions/ })
    .click()
  await page.getByRole('button', { name: /Show what else covers face 1/ }).click()

  const under = page.locator('[data-keynav="faces"] [data-row="profile-1"]').locator('..')
  await under.getByRole('button', { name: 'R', exact: true }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()

  // One face each, and neither took the other's.
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 of 2')
})

test('the editor opens on Plain, and gives the wash back on the way out', async ({ page }) => {
  // The editor paints its own faces green and red; a direction or difficulty
  // wash underneath is a second opinion about the same surfaces. The mode is a
  // preference somebody set, so it is borrowed rather than taken.
  await page.getByRole('button', { name: 'Directions', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Directions', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await openUncut(page)
  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()

  await expect(page.getByRole('button', { name: 'Plain', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Directions', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a reading can be drawn when the Engine reported none', async ({ page }) => {
  /*
   * Four questions in the order somebody answers them: which way up, what is
   * it, which faces, and is that right. The way up comes first because
   * everything after it is judged from there.
   *
   * The faces are chosen by clicking the part, which a fixture with no mesh
   * cannot do (F51) — so this drives the three steps it can and stops at the
   * gate, which is itself the thing worth pinning: Create is disabled until all
   * three are answered.
   */
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // The way up is named by pressing an arrow, so entering puts them on screen.
  await expect(page.getByRole('button', { name: /Direction arrows/ })).toContainText('All')

  const create = page.getByRole('button', { name: 'Create feature' })
  await expect(create).toBeDisabled()

  await page.getByRole('button', { name: '+Z', exact: true }).click()
  await expect(create).toBeDisabled()

  // Faces come before the type, because the type is the one the app can guess
  // and it cannot guess before there are faces to look at.
  await expect(page.getByText(/Click faces on the part to add them/)).toBeVisible()
  await expect(page.getByText('No faces yet.')).toBeVisible()

  await page.getByLabel('Feature type').selectOption('Pocket')
  // Still no faces, so still not a reading.
  await expect(create).toBeDisabled()
})

test('drawing replaces the lists rather than sitting beside them', async ({ page }) => {
  // Every other thing this toggle shows is a way of reading the part; this is a
  // way of adding to it. Both at once would be two questions in one panel.
  await showUncut(page)
  await expect(page.locator('[data-keynav="unmapped"]')).toBeVisible()

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.locator('[data-keynav="unmapped"]')).toHaveCount(0)
  await expect(page.getByText('Which way up')).toBeVisible()

  // And the same press puts it down again.
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Which way up')).toHaveCount(0)
})

test('the three modes are one exclusive choice, and the uncut list leaves all of them', async ({
  page,
}) => {
  // Naming any of them is how you leave the one you are in — a mode you can
  // only leave by pressing the button you pressed to enter it is a mode people
  // get stuck in.
  const create = page.getByRole('button', { name: 'Create', exact: true })
  const byFace = page.getByRole('button', { name: 'By feature' })

  await create.click()
  await expect(create).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Which way up')).toBeVisible()

  // Asked from the coverage bars rather than from this toggle, and it still
  // puts down whatever the toggle was doing: it takes the panel.
  await showUncut(page)
  await expect(create).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('Which way up')).toHaveCount(0)

  await byFace.click()
  await expect(byFace).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-keynav="unmapped"]')).toHaveCount(0)
})

test('drawing offers chaining, the perimeter, and the passes up front', async ({ page }) => {
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '+Z', exact: true }).click()

  // Scoped to the step: the part's own feature types are listed on the left,
  // and one of them is called Profile too.
  const faces = page.getByText('Which faces').locator('..')

  // Chaining is off to begin with: on it a stray click adds a run rather than a
  // face, which is a bigger mistake to notice and to undo.
  const chain = faces.getByRole('button', { name: 'Chain' })
  await expect(chain).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/Click faces on the part to add them/)).toBeVisible()

  await chain.click()
  await expect(chain).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/Click a face, then another/)).toBeVisible()

  // Nothing chosen and no contour from +Z, so Profile has nothing to follow —
  // and it says so rather than leaving a grey button nobody can explain.
  await expect(faces.getByRole('button', { name: 'Profile' })).toBeDisabled()
  await expect(page.getByText(/follows the surface a chosen face sits in/)).toBeVisible()

  // −Y has a contour of its own, so it offers that, with the count.
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await expect(faces.getByRole('button', { name: /Profile \(2\)/ })).toBeEnabled()

  // And the passes are said while drawing, not asked for afterwards.
  const passes = page.getByText('Cut it').locator('..')
  await passes.getByRole('button', { name: 'R', exact: true }).click()
  await expect(passes.getByRole('button', { name: 'R', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a reading already covering these faces says which way up it is cut from', async ({
  page,
}) => {
  // A reading covering the same faces from the other side of the part is not
  // the same operation, and offering it as one is bad advice.
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()

  // Nothing is chosen yet, so there is nothing to compare against.
  await expect(page.getByText(/already cover/)).toHaveCount(0)
})

test('a reading made with passes is cut from its own way up', async ({ page }) => {
  /*
   * The whole flow, without a mesh: Profile fills the faces from the Engine's
   * own contour, so the one step that needs a click on the part can be skipped.
   */
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()

  const faces = page.getByText('Which faces').locator('..')
  await faces.getByRole('button', { name: /Profile \(2\)/ }).click()

  const passes = page.getByText('Cut it').locator('..')
  await passes.getByRole('button', { name: 'Both' }).click()

  const create = page.getByRole('button', { name: 'Create feature' })
  await expect(create).toBeEnabled()
  await create.click()

  // Made, and cut where it was said it would be.
  await expect(page.getByText(/It is a reading like any other now/)).toBeVisible()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')
})

test('a made reading can be taken back off the part', async ({ page }) => {
  // A thing that can be made and not unmade is a trap, and the moment after
  // making one is when somebody is most likely to want it gone.
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await page
    .getByText('Which faces')
    .locator('..')
    .getByRole('button', { name: /Profile/ })
    .click()
  await page.getByText('Cut it').locator('..').getByRole('button', { name: 'Both' }).click()
  await page.getByRole('button', { name: 'Create feature' }).click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 · 50%')

  await page.getByRole('tab', { name: 'Inspector' }).click()
  // The one on the just-made panel. The datasheet beside it carries its own
  // now, which is a second way to do the same thing rather than an ambiguity.
  await page
    .getByText(/It is a reading like any other now/)
    .locator('../..')
    .getByRole('button', { name: 'Delete' })
    .click()

  // Off the part, and out of the plan with it — a way up holding work nothing
  // describes is worse than no way up at all.
  await expect(page.getByText(/It is a reading like any other now/)).toHaveCount(0)
  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toHaveCount(0)
})

test('faces chosen before a way up survive choosing one', async ({ page }) => {
  /*
   * Looking at the part before thinking about the setup is the natural order,
   * and choosing the way up used to silently undo the faces. What a set *reads
   * as* does depend on the way up, which is why the guess re-runs — the faces
   * themselves do not.
   */
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await page
    .getByText('Which faces')
    .locator('..')
    .getByRole('button', { name: /Profile/ })
    .click()
  await expect(page.getByText('Face 0')).toBeVisible()

  // Another way up: the faces stay, and only the guess moves.
  await page.getByRole('button', { name: '+Z', exact: true }).click()
  await expect(page.getByText('Face 0')).toBeVisible()
  await expect(page.getByText('Face 1')).toBeVisible()
})

test('one face at a time is open in the editor', async ({ page }) => {
  // Opening a face is saying "this one", and saying it twice about two faces is
  // not a thing anybody means.
  await openUncut(page)
  await page.getByRole('button', { name: /Edit feature, 2 regions/ }).click()

  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()
  await expect(page.getByRole('button', { name: /Hide what else covers face 0/ })).toBeVisible()

  await page.getByRole('button', { name: /Show what else covers face 1/ }).click()
  await expect(page.getByRole('button', { name: /Hide what else covers face 1/ })).toBeVisible()
  // The first folded itself up.
  await expect(page.getByRole('button', { name: /Show what else covers face 0/ })).toBeVisible()
})

test('a made reading opens its datasheet, with the way to its faces on it', async ({ page }) => {
  /*
   * It used to jump straight to its faces, on the grounds that there was
   * nothing in a datasheet for one. That stopped being true when readings could
   * be merged: a merged one carries the worst of its sources' numbers and the
   * names of the sources, which is what a datasheet is for.
   */
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await page
    .getByText('Which faces')
    .locator('..')
    .getByRole('button', { name: /Profile/ })
    .click()
  await page.getByRole('button', { name: 'Create feature' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  // By its tag: the part's own feature types are listed on the left, and one
  // of them is called Profile too.
  await openUncut(page)
  await page.locator('[data-keynav="unmapped"] [data-row^="made-"]').click()

  // The three controls a made reading needs, all on the datasheet.
  const edit = page.getByRole('button', { name: /Edit feature/ })
  await expect(edit.first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()

  // And Edit Feature is the way to its faces.
  await edit.first().click()
  await expect(page.getByText(/Every face this reading covers/)).toBeVisible()
})

test('a made reading can be deleted from its datasheet', async ({ page }) => {
  // A thing that can be made and not unmade is a trap.
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await page
    .getByText('Which faces')
    .locator('..')
    .getByRole('button', { name: /Profile/ })
    .click()
  await page.getByRole('button', { name: 'Create feature' }).click()
  await page.getByRole('button', { name: 'Done' }).click()

  await openUncut(page)
  await page.locator('[data-keynav="unmapped"] [data-row^="made-"]').click()
  await page.getByRole('button', { name: 'Delete' }).click()

  await expect(page.locator('[data-row^="made-"]')).toHaveCount(0)
})

test('the keyboard walks through a direction row rather than stopping at it', async ({ page }) => {
  await openUncut(page)

  // A way up is a row like any other: the walk runs header, its readings, next
  // header. Without that the keyboard dead-ended at the first group.
  const rows = page.locator('[data-keynav="unmapped"] [data-row]')
  await rows.first().focus()
  await expect(rows.first()).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toBeFocused()
})

test('a made reading can be cut from a different way up, and is re-read there', async ({
  page,
}) => {
  /*
   * Drawing one is two decisions — which faces, and from where — and the second
   * is the one somebody changes their mind about: the faces are a fact about
   * the part, the way up is a choice about the setup.
   */
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await page
    .getByText('Which faces')
    .locator('..')
    .getByRole('button', { name: /Profile/ })
    .click()
  await page.getByText('Cut it').locator('..').getByRole('button', { name: 'Both' }).click()
  await page.getByRole('button', { name: 'Create feature' }).click()

  const madeFrom = page.getByText('Cut from').locator('..')
  await expect(madeFrom.getByRole('button', { name: '−Y', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await madeFrom.getByRole('button', { name: '+Z', exact: true }).click()

  // The passes go with it. Changing where a thing is cut is not a decision to
  // stop cutting it, and a way up left holding work that moved is a lie.
  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toHaveCount(0)
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 50%')
})

test('the count agrees with itself in every list that shows it', async ({ page }) => {
  /*
   * Paul's screenshot: `0 of 12 regions` in the confirmed directions beside
   * `2 of 12 regions` in the datasheet, for one reading. Three lists showed
   * this number and had drifted into three formulas, and none of them counted
   * a face handed to the reading in the total.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'R', exact: true }).click()

  // Half a claim, which is the state the three formulas disagreed about.
  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()
  await page
    .locator('[data-keynav="faces"] [data-row="profile-1"]')
    .locator('..')
    .getByRole('button', { name: 'R', exact: true })
    .click()

  // The editor's own header, then the button that opened it — the editor
  // stands in place of the datasheet, so they are read one after the other.
  await expect(page.getByText('1 of 2 faces')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: /Edit feature/ }).first()).toContainText('1 of 2')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toContainText('1 of 2')
})

test('Escape runs all the way out, arrows first and then back to By feature', async ({ page }) => {
  /*
   * Pressing Escape until nothing happens should always land somewhere known.
   * The ladder used to stop one rung short of the two things a mode leaves
   * behind — the arrows it drew and the mode itself — so leaving Create meant
   * finding the toolbar.
   */
  const arrows = page.getByRole('button', { name: /^Direction arrows:/ })

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(arrows).toHaveAccessibleName('Direction arrows: every candidate way up')

  await page.keyboard.press('Escape')
  await expect(arrows).toHaveAccessibleName('Direction arrows: no arrows')

  // Still in Create, with the arrows away: one more press leaves.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'By feature', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('leaving Create without choosing a way up takes its arrows with it', async ({ page }) => {
  // A mode borrows the arrows; it does not keep them. The part stood covered in
  // arrows that nothing on screen explained, in a mode with no use for them.
  const arrows = page.getByRole('button', { name: /^Direction arrows:/ })

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(arrows).toHaveAccessibleName('Direction arrows: every candidate way up')

  await page.getByRole('button', { name: 'By feature', exact: true }).click()
  await expect(arrows).toHaveAccessibleName('Direction arrows: no arrows')
})

test('drawing over a face something already cuts says so before it is drawn', async ({ page }) => {
  /*
   * "Nothing covers all of these, this is new" answers a question about the
   * shape — whether the Engine already describes it. It says nothing about the
   * plan, and a face already cut from somewhere is one this reading is about to
   * take: cut once means mapping this takes it off whatever holds it now.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'Both', exact: true }).click()

  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.getByRole('button', { name: '−Y', exact: true }).click()
  await page
    .getByText('Which faces')
    .locator('..')
    .getByRole('button', { name: /Profile/ })
    .click()

  await expect(page.getByText(/already machined/)).toBeVisible()
  await expect(page.getByText(/takes them off whatever cuts them now/)).toBeVisible()
})

test('Both on a reading that already holds both lets go of both', async ({ page }) => {
  // Pressing the pass a thing already holds is how somebody unsays it, and Both
  // is no exception.
  await openFeature(page, /Profile/, /file-1/)
  const both = page.getByRole('button', { name: 'Both', exact: true })

  await both.click()
  await expect(both).toHaveAttribute('aria-pressed', 'true')

  await both.click()
  await expect(both).toHaveAttribute('aria-pressed', 'false')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="−Y"]')).toHaveCount(0)
})

test('Both on a face that already holds both lets go of both', async ({ page }) => {
  /*
   * The same rule one level down. It did nothing at all: the press sends an
   * empty pass list, the fold ran over it and returned the plan untouched, so
   * the button reported the state correctly and had no effect.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'Both', exact: true }).click()

  await page
    .getByRole('button', { name: /Edit feature/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Show what else covers face 0/ }).click()

  const row = page.locator('[data-keynav="faces"] [data-row="profile-1"]').locator('..')
  const both = row.getByRole('button', { name: 'Both' })
  await expect(both).toHaveAttribute('aria-pressed', 'true')

  await both.click()
  await expect(both).toHaveAttribute('aria-pressed', 'false')

  // And the face is cut by nothing, in either pass.
  await expect(page.getByText('1 of 2 faces')).toBeVisible()
})

test('a reading in the directions list expands to its faces', async ({ page }) => {
  /*
   * The level below a reading, read rather than edited: which faces it covers,
   * what each one is, and which passes hold it. Editing them is Edit Feature's
   * job, one press away on the same row.
   */
  await openFeature(page, /Profile/, /file-1/)
  await page.getByRole('button', { name: 'Both', exact: true }).click()
  await page.getByRole('tab', { name: 'Directions' }).click()

  const row = page.locator('[data-setup="−Y"] [data-row="profile-1"]').locator('../..')
  await row.getByRole('button', { name: /Show the faces of/ }).click()

  await expect(row.getByText('Face 0')).toBeVisible()
  await expect(row.getByText('Face 1')).toBeVisible()

  // And each says which passes hold it, like the editor's rows.
  await expect(row.getByTitle('Roughed here').first()).toBeVisible()
})

test('From the rules asks which ways up to hold, rather than guessing', async ({ page }) => {
  /*
   * It used to buy directions one at a time on an estimate of what each
   * unlocks, and the panel's own notes record the cost: on a part that forces
   * three ways up it reached 95% across five, while choosing those three by
   * hand and letting the same allocator fill them reached 100%.
   */
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()

  await expect(page.getByText('Which ways up will you hold?')).toBeVisible()

  // Each candidate, in the terms somebody decides in.
  const rows = page.getByRole('button', { name: /% of part/ })
  expect(await rows.count()).toBeGreaterThan(1)
  await expect(rows.first()).toContainText(/\d+ reading/)

  // The ones the geometry leaves no choice about are named and pre-chosen.
  await expect(rows.first()).toContainText('required')

  // Nothing has been mapped by asking.
  await expect(page.locator('[data-setup]')).toHaveCount(0)
})

test('choosing a way up and confirming maps features to it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()

  /*
   * The required ones start ticked — the geometry forces them, so starting them
   * off would make the common case a chore. Confirming takes exactly those.
   */
  const chosen = page.getByRole('button', { name: /% of part/, pressed: true })
  await expect(chosen).toHaveCount(1)

  await page.getByRole('button', { name: 'Map features' }).click()

  await expect(page.locator('[data-setup="−Y"]')).toBeVisible()
  // And only the way up that was chosen.
  await expect(page.locator('[data-setup]')).toHaveCount(1)
})

test('the chooser says what the choice would leave uncut, while it is still a choice', async ({
  page,
}) => {
  // Finding it out from a coverage bar afterwards means undoing the decision to
  // change it.
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()

  await expect(
    page.getByText(/is not reachable from these|reach everything the Engine/),
  ).toBeVisible()
})

test('fill from current improves a plan a generator made', async ({ page }) => {
  /*
   * It treats an existing plan as somebody's decision — every claimed face is
   * "not ours to improve on" — which is right for a plan built by hand and
   * wrong for one the same file wrote a moment ago. Unseeded, it had nothing it
   * was allowed to touch after `from the rules` filled the part, and appeared
   * to do nothing at all.
   */
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()
  await page.getByRole('button', { name: 'Map features' }).click()

  const before = await page.locator('[data-setup]').count()
  expect(before).toBeGreaterThan(0)

  // It runs, keeps the fixturing, and does not throw the plan away.
  await fillAll(page)
  await expect(page.locator('[data-setup]')).toHaveCount(before)
})

test('the rules can still be asked to choose the ways up themselves', async ({ page }) => {
  /*
   * On a part somebody does not know yet, "show me what you would do" is the
   * first question, and being made to answer a harder one before seeing
   * anything is worse than a plan that spends a setup too many.
   */
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()

  await page.getByRole('button', { name: /use whatever ways up the rules recommend/ }).click()

  await expect(page.getByText('Which ways up will you hold?')).toHaveCount(0)
  await expect(page.locator('[data-setup]').first()).toBeVisible()
})

test('the chooser paints what the choice would cut, and repaints as it changes', async ({
  page,
}) => {
  /*
   * A preview rather than a description. The question is *what would these ways
   * up cut*, and the honest answer is the arrangement they would produce — so
   * the same allocator Confirm will run paints the part while the dialog
   * stands. Ticking recolours it, which is the only place the choice can be
   * seen.
   */
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()

  // Any of these is a question about which way up cuts what, so the part starts
  // answering it rather than staying on whatever wash happened to be up.
  await expect(page.getByRole('button', { name: 'Directions', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  /*
   * −Y is ticked to begin with — it is the only thing that reaches one of the
   * faces, and a forced way up is a fact rather than a recommendation. Adding
   * +Z makes it two, and the order is the order they were said in.
   */
  await expect(page.getByText(/^1 way up$/)).toBeVisible()

  await page.getByRole('button', { name: /\+Z/ }).first().click()
  await expect(page.getByText(/^2 ways up, in the order shown$/)).toBeVisible()
})

test('the chooser draws the ticked ways up on the part', async ({ page }) => {
  /*
   * The arrows are the only place a set of directions can be seen, so a column
   * of ticks against an unchanged part is a decision made blind — and the
   * question being asked is precisely which of these to hold.
   */
  await page.getByRole('tab', { name: 'Directions' }).click()
  const arrows = page.getByRole('button', { name: /^Direction arrows:/ })

  await page.getByRole('button', { name: /From the rules/ }).click()
  await expect(arrows).toHaveAccessibleName(/every candidate way up/)

  // Leaving gives back whatever was set, like every other mode that borrows them.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(arrows).toHaveAccessibleName(/no arrows/)
})

test('a direction row says when it has nothing left to pick up', async ({ page }) => {
  /*
   * `Fill` asks one question about one way up — it was a single button under
   * the whole list, which is where nobody found it. On this part the pocket is
   * the only thing +Z reads, so once it is mapped there is nothing left.
   *
   * A button that does nothing is worse than no button: it reads as a thing
   * that failed rather than a thing with nothing to do.
   */
  await openFeature(page, /Pocket/, /cket-1/)
  await page.keyboard.press('b')
  await page.getByRole('tab', { name: 'Directions' }).click()

  const fill = page.locator('[data-setup="+Z"]').getByRole('button', { name: 'Fill' })
  await expect(fill).toBeDisabled()
  await expect(fill).toHaveAttribute('title', /Nothing left/)
})

test('a settled way up is left alone by an offer', async ({ page }) => {
  /*
   * The one place the app's own rule broke down. **Generate composes, the two
   * modes correct** — except a generator wrote a whole arrangement over the top
   * of ten minutes of correcting, with no warning.
   */
  await openFeature(page, /Pocket/, /cket-1/)
  await page.keyboard.press('b')
  await page.getByRole('tab', { name: 'Directions' }).click()

  const row = page.locator('[data-setup="+Z"]')
  await expect(row).toContainText('1 · 25%')

  const lock = row.getByRole('button', { name: /Settle \+Z/ })
  await lock.click()

  // Locked, and `Remove` will not take it either — a settled way up is a
  // decision, and undoing one takes saying so.
  await expect(row.getByRole('button', { name: /is settled/ })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Remove' })).toBeDisabled()

  /*
   * An offer over the top leaves what it holds exactly as it was.
   *
   * The offers fold once a way up is held — that question has been answered —
   * so the summary is pressed to get at them, which is the way back to them by
   * design.
   */
  // A `<summary>` rather than a button, so it is addressed as the element it is.
  await page.locator('summary', { hasText: 'Generate directions' }).click()
  await page.getByRole('button', { name: /From the rules/ }).click()
  await expect(row).toContainText('1 · 25%')
})
