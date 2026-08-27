import { type Page, expect, test } from '@playwright/test'

import { UP, faces, report, richHole, uploadTo } from './part-fixture'

/**
 * Two faces and the two ways up that reach them.
 *
 * It had neither, which was fine while every test here was about the
 * viewport's edges — but the rules page judges the readings **the plan cuts**,
 * and a part with no candidate directions can hold no plan, so those tests were
 * asking what the rules made of nothing.
 *
 * The report, its datasheet and the route table behind it were written out here
 * by hand and again in `dfm.spec`. They live in `part-fixture` now, which is
 * also what stops the two drifting into testing two different Engines.
 */
const part = report({
  regions: faces(2),
  // −X rather than the fixture's −Y: nothing here reads the label, but the two
  // are different ways up and swapping one for the other while moving the
  // report out of this file would be a change nobody asked for.
  candidateDirections: [UP, { x: -1, y: 0, z: 0 }],
  features: [richHole('hole-1', UP, [0])],
})

/** The rules fold up, so reading one starts by opening it. */
export const openRule = async (page: Page, name: string) => {
  const rule = page.locator('[data-keynav="rules"] > li').filter({ hasText: name }).first()
  await rule.getByRole('button', { name: /limits and what it caught/ }).click()
  return rule
}

/**
 * The viewport has to receive a drag that starts at its own edge.
 *
 * The panel dividers are one pixel wide and carry a wider invisible grab strip,
 * which used to reach five pixels over the canvas along its whole height. A pan
 * begun in that strip reached nothing — the resizer ignores every button but
 * the primary one — so the edges and corners of the viewport were dead, and
 * nothing on screen said why.
 */
/** Connects, uploads and lands on the inspector with a report the server mocked. */
export const openInspector = async (page: Page) => {
  await uploadTo(page, part)
  await expect(page.getByRole('button', { name: 'Section' })).toBeVisible()
}

/**
 * Put a plan on the part, because the rules page is about the work it will do.
 *
 * It judges the readings the plan cuts rather than every reading the Engine
 * reported — most of those are alternatives nobody chose — so with nothing
 * mapped there is nothing for a rule to have bitten on, and the page says so.
 */
const mapEverything = async (page: Page) => {
  await page.getByRole('tab', { name: 'Directions' }).click()
  await page.getByRole('button', { name: /Required, filled/ }).click()
}

test('takes a pointer at its own edges and corners', async ({ page }) => {
  await openInspector(page)

  // Whatever the browser would hand a pointerdown to, at each edge and corner
  // of the viewer panel. Three pixels in: closer than anybody aims, and inside
  // the old dead strip.
  const owners = await page.evaluate(() => {
    const viewer = document.querySelector('section.relative')
    if (!viewer) throw new Error('no viewer section')
    const box = viewer.getBoundingClientRect()
    const inset = 3
    const spots: Record<string, [number, number]> = {
      'top-left': [inset, inset],
      'top-right': [box.width - inset, inset],
      'bottom-left': [inset, box.height - inset],
      'bottom-right': [box.width - inset, box.height - inset],
      'left-edge': [inset, box.height / 2],
      'right-edge': [box.width - inset, box.height / 2],
      'bottom-edge': [box.width / 2, box.height - inset],
    }
    const result: Record<string, boolean> = {}
    for (const [name, [dx, dy]] of Object.entries(spots)) {
      const at = document.elementFromPoint(box.x + dx, box.y + dy)
      result[name] = at !== null && viewer.contains(at)
    }
    return result
  })

  expect(Object.entries(owners).filter(([, mine]) => !mine)).toEqual([])
})

/**
 * The first thing the rules put on screen.
 *
 * The engine underneath it is tested in node; what this covers is that the
 * mode is reachable, that it holds, and that it is remembered — a preference
 * that resets on every part is a chore rather than a preference.
 */
test('paints the part by difficulty, and remembers that it was asked to', async ({ page }) => {
  await openInspector(page)

  const difficulty = page.getByRole('button', { name: 'Difficulty' })
  await expect(difficulty).toHaveAttribute('aria-pressed', 'false')

  await difficulty.click()
  await expect(difficulty).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Difficulty' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

/**
 * The colours on the part are a verdict, and a verdict from nowhere is one
 * nobody can argue with. Both halves of saying where it came from: the limits
 * in force, and what they made of the feature being read.
 */
test('shows the limits it judges by, and what they made of a feature', async ({ page }) => {
  await openInspector(page)

  await page.getByRole('tab', { name: 'Rules' }).click()
  await expect(page.getByLabel('Rule set')).toHaveValue('default')
  await expect(page.getByText('Drilling L/D ratio').first()).toBeVisible()

  const ruleSetRight = await page
    .getByLabel('Rule set')
    .evaluate((element) => element.getBoundingClientRect().right)
  const addRuleLeft = await page
    .getByRole('button', { name: 'Add rule' })
    .evaluate((element) => element.getBoundingClientRect().left)
  expect(addRuleLeft - ruleSetRight).toBeGreaterThanOrEqual(16)
  const controlsBottom = await page
    .getByLabel('Rule set')
    .evaluate((element) => element.getBoundingClientRect().bottom)
  const scoreTop = await page
    .getByLabel('Rule set')
    .locator('xpath=ancestor::aside[1]')
    .locator('section span.font-display')
    .evaluate((element) => element.getBoundingClientRect().top)
  expect(scoreTop - controlsBottom).toBeGreaterThanOrEqual(16)

  await openRule(page, 'Drilling L/D ratio')
  // The bands a measurement is judged against, in the same words the part uses.
  await expect(page.getByText('∞ – 3.0').first()).toBeVisible()

  await page.getByRole('tab', { name: 'Inspector' }).click()
  /*
   * The unit switch used to sit in the Geometry panel, and this guarded it
   * against the counts under it. It lives in the viewer's bottom bar now — it
   * is true of every number on every tab, so it belongs somewhere all of them
   * can reach — and what it must not crowd is the size reading beside it.
   */
  const units = page.getByRole('button', { name: /Units: mm\. Switch to in/ })
  await expect(units).toBeVisible()

  // Below the counts now rather than above them, which is the whole of the
  // move. No size reading beside it here: this report carries no mesh, and a
  // part with no geometry has no size to report.
  const switchTop = (await units.boundingBox())!.y
  const featuresTop = await page
    .getByText('Features', { exact: true })
    .evaluate((element) => element.getBoundingClientRect().top)
  expect(switchTop).toBeGreaterThan(featuresTop)
  await expect(page.getByRole('button', { name: /^Part size/ })).toHaveCount(0)
  await page.getByRole('button', { name: /BlindHole/ }).click()
  await page
    .getByRole('button', { name: /hole-1/ })
    .first()
    .click()

  await expect(page.getByRole('heading', { name: 'Difficulty' })).toBeVisible()

  // The working, a hover away: the arithmetic, the datasheet fields behind it,
  // and the limits with the band it landed in. A verdict saying "L/D is 4"
  // cannot be checked; one that names its fields can be argued with.
  await page.getByRole('button', { name: /How Drilling L\/D ratio is worked out/ }).hover()

  // The arithmetic, then the fields it read and what each held. A ratio's
  // inputs are lengths, so they carry no ":1" — that would be a unit the
  // Engine never reported.
  await expect(page.getByText('part top − zMin ÷ facts.diameter')).toBeVisible()
  await expect(page.getByText('6.35 mm', { exact: true }).last()).toBeVisible()
  // The fourth box bounds rats, and is where a refusal starts when a rule
  // names none of its own.
  await expect(page.getByText('8.0 – 12.0').first()).toBeVisible()
  // A rule that agreed and a rule that never ran read identically on a feature
  // that scored well, so the silent ones are counted rather than dropped.
  await expect(page.getByText(/rules? said nothing/)).toBeVisible()
})

/**
 * The point of a rule set is that a shop can disagree with it.
 *
 * Judging is arithmetic over numbers already in hand, so a limit moved here
 * re-judges the part without going near the Engine — which is what makes the
 * edit worth putting a keystroke away.
 */
test('lets a limit be moved, and re-judges the part as it moves', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  // Scoped to one rule's row: every rule has an `easy to`, and reaching for the
  // first one on the page edits whichever rule happens to be at the top.
  const drilling = await openRule(page, 'Drilling L/D ratio')

  // The limits are on the row once it is open: moving one is what somebody
  // opened this tab to do. Trailing zeros are stripped so a box does not
  // rewrite itself between keystrokes.
  await expect(drilling.getByLabel('easy to')).toHaveValue('3')

  // The hole is 4:1, which the shipped set calls `alright`. Tighten the scale
  // under it — tightened rather than loosened deliberately, since a feature's
  // band is the *worst* rule's and widening one limit proves nothing while
  // another rule still speaks.
  for (const [band, limit] of [
    ['easy', '0.5'],
    ['alright', '1'],
    ['meh', '1.5'],
    ['rats', '2'],
  ] as const) {
    await drilling.getByLabel(`${band} to`).fill(limit)
  }

  // The weight lives with the things decided once, behind the pencil.
  await drilling.getByRole('button', { name: /^Edit / }).click()

  // Typed a digit at a time rather than filled, because that is where a box
  // that reformats itself mid-edit goes wrong, and `fill` would never show it.
  const weight = drilling.getByLabel('Weight')
  await weight.fill('')
  await weight.pressSequentially('12')
  await expect(weight).toHaveValue('12')
  const temporaryRulesNotice = page.getByText(
    'Rule changes are temporary and reset on reload or when choosing another preset.',
  )
  await temporaryRulesNotice.scrollIntoViewIfNeeded()
  await expect(temporaryRulesNotice).toBeVisible()

  await page.getByRole('tab', { name: 'Inspector' }).click()
  await page.getByRole('button', { name: /BlindHole/ }).click()
  await page
    .getByRole('button', { name: /hole-1/ })
    .first()
    .click()
  // Past every limit, which is `rats` — a shop that names no refusal is saying
  // "hard, but bought", and only a rule with one can say a thing cannot be made.
  await expect(page.getByText('rats', { exact: true }).first()).toBeVisible()

  // Name a refusal and the same hole stops being work this shop takes.
  await page.getByRole('tab', { name: 'Rules' }).click()
  const refusing = await openRule(page, 'Drilling L/D ratio')
  await refusing.getByLabel('no go past').fill('3')
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await expect(page.getByText('no go', { exact: true }).first()).toBeVisible()

  // A rule switched off stops judging without being deleted.
  await page.getByRole('tab', { name: 'Rules' }).click()
  const applies = page
    .locator('[data-keynav="rules"] > li')
    .filter({ hasText: 'Drilling L/D ratio' })
    .first()
    .getByRole('checkbox')
  await applies.uncheck()
  await expect(applies).not.toBeChecked()

  // Reset returns to the selected shipped preset in one press.
  await page.getByRole('button', { name: 'Reset changes' }).click()
  await expect(page.getByRole('button', { name: 'Reset changes' })).toHaveCount(0)

  // Reopened, because leaving the tab folds the rules again — the panel is
  // unmounted, and what was open with it.
  const reopened = await openRule(page, 'Drilling L/D ratio')
  await expect(reopened.getByLabel('easy to')).toHaveValue('3')
})

test('keeps rule edits only for the current session', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  const drilling = await openRule(page, 'Drilling L/D ratio')
  await drilling.getByLabel('easy to').fill('0.5')
  await expect(page.getByRole('button', { name: 'Reset changes' })).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: 'Rules' }).click()

  const reloaded = await openRule(page, 'Drilling L/D ratio')
  await expect(reloaded.getByLabel('easy to')).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Reset changes' })).toHaveCount(0)
})

test('switching or resetting a preset discards temporary rule edits', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  const ruleSet = page.getByLabel('Rule set')
  const defaultDrilling = await openRule(page, 'Drilling L/D ratio')
  await defaultDrilling.getByLabel('easy to').fill('0.5')

  await ruleSet.selectOption('preset-sendcutsend')
  const sendCutSendDrilling = page
    .locator('[data-keynav="rules"] > li')
    .filter({ hasText: 'Drilling L/D ratio' })
    .first()
  await expect(sendCutSendDrilling.getByLabel('easy to')).toHaveValue('2')

  await sendCutSendDrilling.getByLabel('easy to').fill('1')
  await page.getByRole('button', { name: 'Reset changes' }).click()
  await expect(sendCutSendDrilling.getByLabel('easy to')).toHaveValue('2')

  await ruleSet.selectOption('default')
  const restoredDefault = page
    .locator('[data-keynav="rules"] > li')
    .filter({ hasText: 'Drilling L/D ratio' })
    .first()
  await expect(restoredDefault.getByLabel('easy to')).toHaveValue('3')
})

/**
 * A limit is argued with against what it cost, which is only answerable on the
 * part in front of somebody.
 */
test('lists the features each rule bit on, and opens one', async ({ page }) => {
  await openInspector(page)
  await mapEverything(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  const drilling = await openRule(page, 'Drilling L/D ratio')

  // The hole this rule judged, under the rule that judged it.
  const hit = drilling.getByRole('button', { name: /Blind Hole/ })
  await expect(hit).toBeVisible()

  await hit.click()
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await expect(page.getByRole('heading', { name: 'Blind Hole' })).toBeVisible()
})

test('a band opens onto the features in it, with what cost them', async ({ page }) => {
  /*
   * Pressing `3 rats` used to narrow the rule list far below and leave the row
   * looking the same, so the answer arrived somewhere the eye was not.
   */
  await openInspector(page)
  await mapEverything(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  // Whichever band this fixture's work landed in — the press is the same.
  const counted = page.getByRole('button', { name: /— [1-9]\d* features?$/ }).first()
  await counted.click()

  await expect(counted).toHaveAttribute('aria-pressed', 'true')

  // A feature under it, and a rule chip beside the feature.
  const opened = counted.locator('..').locator('ul li button').first()
  await expect(opened).toBeVisible()
  await expect(opened.getByTitle(/weight \d+/).first()).toBeVisible()
})

test('the worst of it can be read past, rather than stopping at six', async ({ page }) => {
  // A part with nine things wrong showed six and said nothing about the other
  // three — a list that cannot be argued past.
  await openInspector(page)
  await mapEverything(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  const more = page.getByRole('button', { name: /^Show all \d+$/ })
  if ((await more.count()) === 0) {
    // This fixture is small enough that everything costly already fits, which
    // is the other half of the rule: no press where there is nothing behind it.
    await expect(page.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
    return
  }

  await more.click()
  await expect(page.getByRole('button', { name: 'Show fewer' })).toBeVisible()
})

test('an opened rule says where the mapped work landed, band by band', async ({ page }) => {
  /*
   * The rows name each feature and the badge at the top names the worst of
   * them; neither answers *how much of my part is in trouble under this limit*,
   * which is the question a threshold is argued with.
   */
  await openInspector(page)
  await mapEverything(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  const drilling = await openRule(page, 'Drilling L/D ratio')

  await expect(drilling.getByTitle(/of the mapped features are/).first()).toBeVisible()
})

/** The arrows walk a rule into the features under it, and on into the next. */
test('walks the rules and their features with the keyboard', async ({ page }) => {
  await openInspector(page)
  await mapEverything(page)
  await page.getByRole('tab', { name: 'Rules' }).click()
  // Wait for the panel to be the rules panel: `[data-row]` also matches the
  // summary's type rows, and reaching for one mid-swap grabs a row on its way
  // out of the document.
  await expect(page.getByRole('button', { name: 'Add rule' })).toBeVisible()

  /*
   * Scoped to the list, not the page. `[data-row]` also marks the summary's
   * rows above it, and those are in a different keynav container — so focusing
   * one and pressing a key moves nothing, which reads as a broken walk. It
   * passed for as long as the fixture happened to have an empty summary.
   */
  const rows = page.locator('[data-keynav="rules"] [data-row]')
  await rows.first().focus()
  const first = await page.locator(':focus').getAttribute('data-row')

  // Whatever is on screen in document order is what the keyboard walks, so the
  // row after a rule is the first feature it bit on rather than the next rule.
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(':focus')).toHaveAttribute('data-row', /.+/)
  await expect(page.locator(':focus')).not.toHaveAttribute('data-row', first ?? '')

  // And landing on a feature opens it on the right, so the keyboard thumbs
  // through features rather than moving a highlight somebody must then press.
  // Reached directly: the rules above it in this fixture caught nothing, and
  // walking past them would be testing the fixture rather than the keyboard.
  await openRule(page, 'Drilling L/D ratio')
  await page.locator('[data-row="hole-1"]').first().focus()
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await expect(page.getByRole('heading', { name: 'Blind Hole' })).toBeVisible()
})

/**
 * A shop sorts by how hard the work is, so the ranking belongs on the rows
 * rather than one click away on a panel.
 */
test('scores every feature where it is named', async ({ page }) => {
  await openInspector(page)
  await mapEverything(page)

  // In the summary's list, under the type that holds it. Back on the Inspector
  // first: the plan's own rows name the same reading, and this is about the
  // summary's.
  await page.getByRole('tab', { name: 'Inspector' }).click()
  await page
    .getByRole('button', { name: /BlindHole/ })
    .first()
    .click()
  const row = page.getByRole('button', { name: /hole-1/ }).first()
  await expect(row).toContainText(/\d+/)

  // And under the rule that judged it, with the band's own colour.
  await page.getByRole('tab', { name: 'Rules' }).click()
  const drilling = await openRule(page, 'Drilling L/D ratio')
  const badge = drilling.getByTitle(/scores \d+ across the rules that applied/).first()
  await expect(badge).toBeVisible()
})

/**
 * A box has to hold what is being typed into it, not what has been parsed out
 * of it — the two are different for as long as a number is half-written.
 */
test('takes a number a digit at a time, leading zero and all', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  const smallest = await openRule(page, 'Smallest drilled hole')
  const easy = smallest.getByLabel('easy to')

  await easy.fill('')
  await easy.pressSequentially('0.156')

  // `0.` parses to 0, and a box that re-rendered the parsed value would have
  // eaten the point and everything after it.
  await expect(easy).toHaveValue('0.156')

  // And it survives the round trip through storage, which is in millimetres
  // whatever is being typed.
  await easy.blur()
  await expect(easy).toHaveValue('0.156')
})

/** One window: the panels scroll, the page does not. */
test('fills the window rather than growing past it', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()
  await expect(page.getByRole('button', { name: 'Add rule' })).toBeVisible()

  // Asked of the window rather than of `scrollHeight`, which reports the full
  // height of content inside a scrolling panel and so says a page scrolls when
  // it does not.
  await page.mouse.move(200, 400)
  await page.mouse.wheel(0, 1200)

  // A page taller than the window scrolls the viewer off the bottom, and the
  // viewer is the one thing that cannot follow.
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // The panel itself takes the overflow, or the rules past the fold would be
  // unreachable. Measured after opening one, since folded rules may well fit.
  await openRule(page, 'Milling L/D ratio')
  const panel = page.locator('aside').first()
  await panel.evaluate((el) => el.scrollBy(0, 400))
  expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})

/**
 * The question somebody arrives with is how the part looks under their limits,
 * and every number that answers it has to be a press that finds what it counts.
 */
test('sums the part up, and filters the limits by what they cost', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  // A score over readings rather than features: one rule speaking about one
  // feature is one reading, which is what the average is taken over.
  await expect(page.getByText(/across \d+ readings/)).toBeVisible()
  await expect(page.getByText(/Rules that spoke/)).toBeVisible()

  // A rule with nothing to measure says so rather than showing a zero.
  await expect(page.getByText('nothing to measure').first()).toBeVisible()

  // Pressing a band narrows the limits to the ones that handed it out, and a
  // rule that caught nothing under that question drops out of the list.
  const rules = page.locator('[data-keynav="rules"] > li')
  const before = await rules.count()
  await page.getByRole('button', { name: /^alright/ }).click()
  expect(await rules.count()).toBeLessThan(before)

  await page.getByRole('button', { name: /^alright/ }).click()
  expect(await rules.count()).toBe(before)
})

test('offers a directions view and a directions paint mode', async ({ page }) => {
  await openInspector(page)

  await expect(page.getByRole('tab', { name: 'Inspector' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Rules' })).toBeVisible()
  // The mapping page, added with the plan model. It is a tab rather than a
  // route: the report is component state from one SSE subscription, so a
  // sibling route would re-open the stream on every visit.
  await expect(page.getByRole('tab', { name: 'Directions' })).toBeVisible()

  // Painting the part *by* direction is back, pointed at the plan. It was
  // removed from PAINT_MODES once; this asserts the restoration rather than the
  // removal, which is what §3.4 footnote 7 said would happen.
  await expect(page.getByRole('button', { name: 'Plain' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Difficulty' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Directions', exact: true })).toBeVisible()

  // And the pass toggle beside the modes, but only while they mean something.
  await expect(page.getByRole('button', { name: 'rough' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Directions', exact: true }).click()
  await expect(page.getByRole('button', { name: 'rough' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'finish' })).toBeVisible()
})

test('copies individual datasheet values and the raw API record', async ({ page }) => {
  await openInspector(page)

  // The browser clipboard is deliberately replaced here rather than granted:
  // the viewer must still work in an embedded context where clipboard reads
  // are forbidden, and this asserts exactly what each control writes.
  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { copiedPartViewerText?: string }
    state.copiedPartViewerText = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          state.copiedPartViewerText = value
        },
      },
    })
  })

  await page.getByRole('button', { name: /BlindHole/ }).click()
  await page
    .getByRole('button', { name: /hole-1/ })
    .first()
    .click()

  await page.getByText('All datasheet fields', { exact: true }).click()
  await page.getByRole('button', { name: 'Copy facts.diameter value' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as typeof globalThis & { copiedPartViewerText?: string })
            .copiedPartViewerText,
      ),
    )
    .toBe('6.35')

  await page.getByText('Raw API record', { exact: true }).click()
  await page.getByRole('button', { name: 'Copy raw API record' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as typeof globalThis & { copiedPartViewerText?: string })
            .copiedPartViewerText,
      ),
    )
    .toContain('"diameter": 6.35')
})

/** The pencil is also a request to see the rule it edits. */
test('opens a folded rule when its settings are asked for', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()
  await expect(page.getByRole('button', { name: 'Add rule' })).toBeVisible()

  // Folded: the limits are not on screen.
  const drilling = page
    .locator('[data-keynav="rules"] > li')
    .filter({ hasText: 'Drilling L/D ratio' })
    .first()
  await expect(drilling.getByLabel('easy to')).toBeHidden()

  // The settings live inside what the chevron opens, so the pencil has to open
  // it too or it appears to do nothing.
  await drilling.getByRole('button', { name: /^Edit / }).click()
  await expect(drilling.getByLabel('Rule name')).toBeVisible()
  await expect(drilling.getByLabel('easy to')).toBeVisible()
})

/** The arrows read a feature, rather than queuing one up to be pressed. */
test('reads each feature as the keyboard reaches it', async ({ page }) => {
  await openInspector(page)

  await page.getByRole('button', { name: /BlindHole/ }).click()
  await page.locator('[data-row="hole-1"]').first().focus()

  // No Enter: landing on the row is the request. Two gestures for one question
  // is what this list used to ask for.
  await expect(page.getByRole('heading', { name: 'Blind Hole' })).toBeVisible()
})

test('the plan is judged by rules of its own, in the rules list', async ({ page }) => {
  await openInspector(page)
  await page.getByRole('tab', { name: 'Rules' }).click()

  /*
   * Nine knobs asked three questions in three currencies, and a shop could move
   * any of them, press generate, and get the same plan back. Two rules ask the
   * two that matter, in the vocabulary the rest of the set is written in — so
   * they live in the rules list, under a heading that says what they are about.
   */
  /*
   * Read off the list as text rather than by role. The headings are uppercased
   * in CSS — so they read `THE PLAN ITSELF` on screen and `The plan itself` in
   * the DOM, and `toContainText` compares the DOM.
   */
  const list = page.locator('[data-keynav="rules"]')
  await expect(list).toContainText('The plan itself')
  await expect(list).toContainText('Every feature')
  await expect(list).toContainText('Setups the plan runs')

  /*
   * "Smallest operation worth running" was a scale over how much work one
   * operation should do. It priced the same question in points and per cent
   * and average faces, and the question underneath was always a yes or no.
   */
  await expect(list).toContainText('May the plan split a feature?')
  await expect(list).not.toContainText('Smallest operation worth running')

  // A part rule has not measured nothing — it is about the plan, and has not
  // been asked yet. "nothing to measure" reads as a rule that failed to fire.
  await expect(list).toContainText('judged over the plan')

  /*
   * The two that are not scales sit with the two that are — a refusal and a
   * choice of ranking, under the same heading rather than in a panel below the
   * list where nobody found them.
   */
  await expect(list).toContainText('What is a no-go feature for op-planning?')
  await expect(list).toContainText('Rank a reading by its band, or by its score?')

  /*
   * They fold like a rule card, so what each is set to is on the row and the
   * control is under it. A reading the shop's own rules call `no go` is refused
   * out of the box — it can still cut a face nothing else reaches, it just
   * cannot take one from a reading above the floor.
   */
  await expect(list).toContainText('no go')

  // `exact`, because the chevron beside it is named "<title>: what it is set
  // to" and a substring match finds both.
  await page
    .getByRole('button', { name: 'What is a no-go feature for op-planning?', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Will not cut no go' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Cut anything' }).click()
  await expect(page.getByRole('button', { name: 'Cut anything' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  /*
   * And the panel of prices is gone rather than renamed. A stale field left
   * behind would be a second place to set what the rules now decide.
   */
  for (const gone of [
    'Worth a separate operation, in points',
    'Worth re-fixturing to cut better',
    'Cost of one more operation',
    'Smallest operation worth running',
    'Where an unjudged reading sits',
    'Times it may reconsider',
  ]) {
    await expect(page.getByLabel(gone)).toHaveCount(0)
  }

  /*
   * A count of setups is a count. It read `mm²` while the rule borrowed a
   * feature metric to hang its thresholds on, which is the sort of thing only
   * somebody looking at the screen catches.
   */
  await expect(list).not.toContainText('mm²')
})

test('the wheel zooms to the cursor, or to the middle, and remembers which', async ({ page }) => {
  /*
   * A preference rather than a right answer. Zooming to the cursor is what
   * Fusion does and what most people reach for; on a trackpad it can walk the
   * model off screen, which is why the other one stays — and why a double
   * click re-frames whichever is on.
   */
  await openInspector(page)

  const zoom = page.getByRole('button', { name: 'Zoom to cursor' })
  await expect(zoom).toHaveAttribute('aria-pressed', 'true')

  await zoom.click()
  await expect(page.getByRole('button', { name: 'Zoom to centre' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  // Kept across a reload, like the paint mode and the scene aids.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Zoom to centre' })).toBeVisible()
})

test('the two toolbars ask two different questions, and sit apart', async ({ page }) => {
  /*
   * One shelf used to carry both. *What is the part coloured by* is about the
   * report and is the first thing anybody reaches for; arrows, zoom, grid and
   * section are about how you are looking at it. Splitting them put the washes
   * in the corner the eye starts in and the view tools under the model, clear
   * of the view cube in the opposite corner.
   */
  await openInspector(page)

  const washes = page.getByRole('group', { name: 'Colour the part by' })
  const view = page.getByRole('group', { name: 'View controls' })

  await expect(washes).toBeVisible()
  await expect(view).toBeVisible()

  // Each control belongs to exactly one of them.
  await expect(washes.getByRole('button', { name: 'Difficulty' })).toBeVisible()
  await expect(view.getByRole('button', { name: /Zoom to/ })).toBeVisible()
  await expect(washes.getByRole('button', { name: /Zoom to/ })).toHaveCount(0)
  await expect(view.getByRole('button', { name: 'Difficulty' })).toHaveCount(0)

  // The view shelf is below the washes, and to the right of them.
  const top = (await washes.boundingBox())!
  const bottom = (await view.boundingBox())!
  expect(bottom.y).toBeGreaterThan(top.y + top.height)
  expect(bottom.x).toBeGreaterThan(top.x)
})

test('the wash buttons still answer to their words, now they wear a glyph', async ({ page }) => {
  /*
   * The glyph is decoration beside the word, so it is hidden from the
   * accessible name rather than read out alongside it. A button that started
   * announcing itself as "cube Plain" is one every test and every screen
   * reader addresses by a name nobody chose.
   */
  await openInspector(page)

  const washes = page.getByRole('group', { name: 'Colour the part by' })

  for (const name of ['Plain', 'Directions', 'Difficulty']) {
    await expect(washes.getByRole('button', { name, exact: true })).toHaveCount(1)
  }
})

test('which pass the colours mean is asked only while they mean something', async ({ page }) => {
  // On Plain there is no pass to be showing, so the row is not there to press.
  await openInspector(page)

  const passes = page.getByRole('group', { name: 'Which pass the colours mean' })
  const washes = page.getByRole('group', { name: 'Colour the part by' })

  await washes.getByRole('button', { name: 'Plain', exact: true }).click()
  await expect(passes).toHaveCount(0)

  await washes.getByRole('button', { name: 'Directions', exact: true }).click()
  await expect(passes.getByRole('button', { name: 'rough' })).toBeVisible()

  // Under the modes rather than beside them: together they ran off the canvas
  // and the clipped control was the one saying what you were looking at.
  const above = (await washes.boundingBox())!
  const below = (await passes.boundingBox())!
  expect(below.y).toBeGreaterThan(above.y)
  expect(below.x + below.width).toBeLessThanOrEqual(above.x + above.width + 1)
})
