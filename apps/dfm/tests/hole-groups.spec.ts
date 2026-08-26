import { expect, test } from '@playwright/test'

import { SIDE, UP, faces, hole, openPart, report } from './part-fixture'

/**
 * Identical holes are one row, and the row opens.
 *
 * Sixteen holes of one diameter, one depth and one way up are one tool and one
 * operation, so the first thing a list offers is the decision somebody almost
 * always wants: all of them, in one press. And it opens, because "all but that
 * one" — a hole under a boss, one that has to be reamed — is a fair question
 * that a closed group answers by making somebody click every hole on the part.
 *
 * Driven through the uncut list, the one list reachable without a mesh: it
 * lists the faces nothing cuts, and a face opens onto the readings that could
 * take it — which is where a group of identical holes arrives as one row.
 */

test.beforeEach(async ({ page }) => {
  await openPart(
    page,
    report({
      // Four faces of 100 mm², so three holes cover three quarters of the part.
      regions: faces(4),
      candidateDirections: [UP, SIDE],
      // Same way up, same diameter, same depth — one tool, one operation.
      features: [hole('hole-1', UP, [1]), hole('hole-2', UP, [2]), hole('hole-3', UP, [3])],
    }),
  )
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Not cut yet/ }).click()

  // The first hole's face. Face 0 has no reading at all on this part, so it is
  // the row above — an honest row, and not the one this spec is about.
  await page.locator('[data-keynav="unmapped"] [data-row]').nth(1).click()
})

const list = '[data-owners]'

test('three identical holes arrive as one row, closed', async ({ page }) => {
  const rows = page.locator(`${list} [data-row]`)

  // The way up, then one row for the tool — not three rows read to discover
  // they are the same row.
  await expect(rows).toHaveCount(2)
  // Named as the several they are, with the count against the name — nothing
  // between them but the flex gap.
  await expect(page.locator(`${list} [data-holes]`)).toContainText(/Blind holes\s*×3/)
  await expect(page.getByRole('button', { name: 'Show these 3 holes' })).toBeVisible()
})

test('one press on the row maps every hole it stands for', async ({ page }) => {
  await page.locator(`${list} [data-holes]`).click()
  await page.locator(list).getByRole('button', { name: 'BOTH' }).first().click()

  await page.getByRole('tab', { name: 'Directions' }).click()
  // Three readings, and three of the four faces covered.
  await expect(page.locator('[data-setup="+Z"]')).toContainText('3 · 75%')
})

test('the keys act on what the row stands for, not on the first of them', async ({ page }) => {
  // R on a row standing for three holes has to mean three, and the handler at
  // the window only ever sees the DOM — so the row says what it means.
  await page.locator(`${list} [data-holes]`).focus()
  await page.keyboard.press('r')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('3 · 75%')
})

test('opens to its holes, and one of them can be treated differently', async ({ page }) => {
  await page.getByRole('button', { name: 'Show these 3 holes' }).click()

  const rows = page.locator(`${list} [data-row]`)
  await expect(rows).toHaveCount(5)

  // The second hole alone, which is the whole reason a group opens.
  const second = page.locator(`${list} [data-row="hole-2"]`)
  await expect(second).toContainText('hole-2')
  await second.focus()
  await page.keyboard.press('r')

  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('1 · 25%')
})

test('the datasheet says how many, and no longer lists which', async ({ page }) => {
  /*
   * It carried a table of the group's tags that could only be looked at. The
   * list lives in Map features now, where each hole is readable, lightable and
   * assignable on its own — and two copies of one list is one that goes stale.
   *
   * Driven here rather than as a component test: the datasheet renders
   * `@toolpath/ui`, which cannot be mounted under vitest — see F45.
   */
  await page.locator(`${list} [data-holes]`).click()

  await expect(page.getByRole('heading', { name: /Blind Holes/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Blind Holes/i })).toContainText('×3')
  await expect(page.getByText(/hole group/)).toHaveCount(0)

  // And its own presses act on the group it is describing. Scoped to the
  // datasheet's own Cut from block: the list above carries the same three.
  const cutFrom = page.getByText('Cut from').locator('..')
  await cutFrom.getByRole('button', { name: 'Both' }).click()
  await page.getByRole('tab', { name: 'Directions' }).click()
  await expect(page.locator('[data-setup="+Z"]')).toContainText('3 · 75%')
})

test('the keyboard opens a group and closes it again', async ({ page }) => {
  const rows = page.locator(`${list} [data-row]`)
  await page.locator(`${list} [data-holes]`).focus()

  await page.keyboard.press('ArrowRight')
  await expect(rows).toHaveCount(5)

  await page.keyboard.press('ArrowLeft')
  await expect(rows).toHaveCount(2)
})
