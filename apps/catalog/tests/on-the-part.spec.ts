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

/**
 * **The box is not drawn until there is something to put in it** (Paul,
 * 2026-09-02, moving the editor beside the list): what is being read is a card
 * of its own now, so "nothing read" is the card being absent rather than a
 * field saying so.
 */

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
    await expect(field(page)).toBeVisible()
  }).toPass({ timeout: 20_000 })
}

test.beforeEach(async ({ page }) => {
  await openCube(page)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(field(page)).toBeHidden()
})

test('a click on a face names its reading, and lists the tools that cut it', async ({ page }) => {
  await ready(page)

  await expect(field(page)).toBeVisible()
  await expect(page.getByText(/^Cuts the /)).toBeVisible()
})

/** The Engine reports a feature per way up, so one face has several. */
test('clicking the same face again walks its readings', async ({ page }) => {
  await ready(page)
  const first = (await field(page).textContent()) ?? ''

  await at(page, FACE)

  await expect(field(page)).toBeVisible()
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
      await expect(field(page)).toBeVisible()
      return
    }
  }
  throw new Error('no click ever wrote a filter')
})

test('Escape puts the reading down', async ({ page }) => {
  await ready(page)

  await page.keyboard.press('Escape')

  await expect(field(page)).toBeHidden()
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
  await expect(field(page)).toBeVisible()

  await at(page, NOTHING)
  await expect(field(page)).toBeHidden()
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

  await expect(field(page)).toBeVisible()
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
 * **A tool reaches the bill by being chosen for a feature** (Paul, 2026-09-02:
 * "Add to list button can go away — we are now adding tools to the BOM by
 * confirming the feature/tool mapping"). The panel used to keep it on its own,
 * which is a tool ordered for nothing in particular.
 *
 * Nothing covered the path end to end, so this is the one test that walks it:
 * read a face, read the tool in the panel, and confirm the feature with it.
 */
test('a tool is read in the panel and reaches the bill with its feature', async ({ page }) => {
  await page.getByRole('button', { name: 'Add feature' }).click()
  await ready(page)

  const row = page.getByRole('table').getByRole('row').nth(1)
  const number = ((await row.getByRole('rowheader').textContent()) ?? '').trim()
  expect(number).not.toBe('')
  await row.click()

  const panel = page.getByRole('img', { name: /drawn from its stated dimensions/ })
  await expect(panel).toBeVisible()

  // The panel adds the first tool, now that a feature can hold several.
  await expect(page.getByRole('button', { name: 'Add to list' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add tool' }).click()

  // Opened again from the row it now answers, the panel says what it is on the
  // list for and offers what can be done to it.
  const list = page.getByRole('list', { name: 'Features being asked about' })
  await list.getByRole('button', { name: new RegExp(`^${number} for `) }).click()

  await expect(page.getByText(/On the list for/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove tool' })).toBeVisible()

  /**
   * **A feature can hold more than one** (Paul, 2026-09-02: "a feature or group
   * can have multiple tools saved to it, not just one"). A tool that is not one
   * of them offers both: take their place, or stand beside them.
   */
  await page.getByRole('table').getByRole('row').nth(2).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Replace ${number}$`) })).toBeVisible()
  await page.getByRole('button', { name: 'Add this tool' }).click()

  // Two tools on the row now, and the second is the one the panel is showing.
  await expect(list.getByRole('button', { name: / for / })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Remove tool' })).toBeVisible()

  /**
   * **And it reaches the bill, under the number a shop orders by** (Paul,
   * 2026-09-01). The vendor's own page now hangs off that number rather than a
   * "Product" column of its own — the sample catalog publishes no links, so
   * what is checked here is the column that carried them being gone and the
   * number being the thing on the row.
   */
  await page.getByRole('link', { name: 'Order list' }).click()

  const bill = page.getByRole('table')
  await expect(bill.getByText(number.trim())).toBeVisible()
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

/**
 * The feature list: what a click adds, and what the list answers with.
 *
 * **The selection used to be invisible** (Paul, 2026-09-02). Clicking a face
 * put its hole group into the page's kept set and judged the tool list against
 * everything in it, with nothing saying what "everything" was. A click now
 * previews and asks; the list is only ever what somebody put there.
 */
test('a click previews and asks, and the list answers for itself', async ({ page }) => {
  await ready(page)

  // Previewed: the reading is on screen and the two ways in are offered, but
  // nothing has been added yet.
  const add = page.getByRole('button', { name: 'Add feature', exact: true })
  await expect(add).toBeVisible()
  await expect(page.getByRole('list', { name: 'Features being asked about' })).toBeHidden()

  await page.getByRole('table').getByRole('row').nth(1).click()
  await add.click()

  // On the list, with its own answer under it — and the panel below waits to
  // be asked rather than falling back to the catalog.
  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  // And the row it just made is the row it is working on, so the list below is
  // still that feature's (Paul, 2026-09-02, on adding a second tool to it).
  await expect(page.getByRole('searchbox', { name: 'Search by catalog number' })).toBeVisible()
  await expect(page.getByText(/^Cuts the /)).toBeVisible()
})

/**
 * **Two buttons, not one that asks** (Paul, 2026-09-02: "it should show buttons
 * for Add Feature or Add Group, not the weird combined one"). A feature is
 * added by pointing at one, so its button waits for a face.
 */
test('offers both ways in, and asks for a face rather than refusing', async ({ page }) => {
  await page.getByRole('button', { name: 'Add feature' }).click()
  await expect(page.getByText(/Click a face on the part, then press Add feature/)).toBeVisible()

  await page.getByRole('button', { name: 'Add group' }).click()

  await expect(page.getByText('New group')).toBeVisible()
  await expect(page.getByRole('radio', { name: /One tool for all of them/ })).toBeChecked()
  await expect(page.getByRole('button', { name: /^Create group and add tools?$/ })).toBeDisabled()
})

/**
 * **The list is the work, so it survives a reload** (Paul, 2026-09-02: "we need
 * to be showing the tool/feature list — it keeps disappearing", and "the
 * highlighting is sticking around, so it must be surviving the reload"). The
 * setup sheet has been kept per part since 2026-08-10 and the list was not, so
 * a refresh threw away everything somebody had picked out while the tools they
 * had chosen for it stayed on the bill and on the part.
 */
test('keeps the list across a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Add group' }).click()
  await page.getByRole('button', { name: /Add every Face/ }).click()
  await page.getByRole('radio', { name: /The best tool for each/ }).click()
  await page.getByRole('button', { name: /^Create group and add tools?$/ }).click()

  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list.getByRole('listitem')).toHaveCount(1)

  await page.reload()

  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list.getByText('4 × Face')).toBeVisible()
})

/**
 * **A feature is added on purpose** (Paul, 2026-09-02: "need an 'add to list'
 * button at the bottom right of add feature once I've got it selected to
 * confirm I actually want to add it"). The button that starts the add is at the
 * top of the box and the reading it would add is at the bottom of it.
 */
test('confirms a feature from under the reading it is adding', async ({ page }) => {
  await page.getByRole('button', { name: 'Add feature' }).click()
  await ready(page)

  // The table opens with its first row highlighted and the panel beside it
  // assembling that very tool, so the button takes it without a second click
  // (Paul, 2026-09-02).
  await page.getByRole('button', { name: 'Use this tool' }).click()

  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Use this tool' })).toBeHidden()
})

/**
 * **The list drives everything** (Paul, 2026-09-02: "the grey coloring is
 * showing up even after I've removed a feature or list, and the tool assemblies
 * from those features and groups are sticking around in the BOM"). The list and
 * the bill were kept side by side and only one of them was being edited.
 */
test('takes a removed row off the bill as well as off the list', async ({ page }) => {
  await page.getByRole('button', { name: 'Add feature' }).click()
  await ready(page)
  await page.getByRole('button', { name: 'Use this tool' }).click()

  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list.getByRole('listitem')).toHaveCount(1)

  await list.getByRole('button').first().click({ button: 'right' })
  await page.getByRole('button', { name: 'Remove', exact: true }).click()

  await expect(list).toBeHidden()
  // And nothing of it is left on the sheet the bill and the grey paint are
  // both read from.
  const kept = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((each) => each.startsWith('tool-catalog.setup.'))
    return key === undefined ? null : localStorage.getItem(key)
  })
  expect(kept).toContain('"choices":{}')
})

/**
 * A group is built by clicking the faces in it, and it answers the question its
 * result option asks — a group wanting one tool **each** answering in one row
 * that opens (Paul, 2026-09-02).
 */
test('a group is built on the part and answers per its result option', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Add group' }).click()

  await expect(page.getByText('New group')).toBeVisible()

  // The list below is already showing what fits the group as it stands, with
  // its first row highlighted, so the group takes that one (Paul, 2026-09-02).
  await expect(page.getByRole('button', { name: /^Create group and add tools?$/ })).toBeEnabled()

  // A group asked for one tool *each* shows no list at all: the question is one
  // per feature, and the answers arrive when the group does (Paul, same day).
  await page.getByRole('radio', { name: /The best tool for each/ }).click()
  await expect(page.getByText(/Tools will automatically be selected/)).toBeVisible()
  await page.getByRole('button', { name: /^Create group and add tools?$/ }).click()

  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list.getByText('one each')).toBeVisible()
})

/**
 * **The answer is the way through to the offer behind it** (Paul, 2026-09-02:
 * "clicking on the tool there would show the list of compatible tools for that
 * feature or folder, depending on the settings"). Until it is pressed the panel
 * below waits to be asked — it never falls back to the catalog.
 */
test('presses the tool under a row for everything that fits it', async ({ page }) => {
  await page.getByRole('button', { name: 'Add group' }).click()
  await page.getByRole('button', { name: /Add every Face/ }).click()
  await page.getByRole('table').getByRole('row').nth(1).click()
  await page.getByRole('button', { name: /^Create group and add tools?$/ }).click()

  // The group it just made is what it is working on, so the list below is
  // already the group's. Putting it down goes back to the catalog, and its own
  // answer is the way back in.
  await expect(page.getByText('Cuts every feature in the group')).toBeVisible()
  const list = page.getByRole('list', { name: 'Features being asked about' })
  await list.getByRole('button', { name: '4 × Face', exact: true }).click()
  await expect(page.getByText('Every tool in the catalog')).toBeVisible()

  await list.getByRole('button', { name: / for / }).click()

  await expect(page.getByText('Cuts every feature in the group')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search by catalog number' })).toBeVisible()
})

/**
 * **The part takes the pointer where the part is drawn.**
 *
 * The boxes over the top-left corner are laid out in columns, and a column is
 * not a box: on 2026-09-02 one of them became a transparent `h-full` sheet
 * carrying `pointer-events: auto`, which is a curtain over the canvas. Nothing
 * under it could be clicked and nothing under it could be dragged, so
 * click-drag-rotate on the part stopped working while the view cube in the far
 * corner went on rotating — the corner is the only place outside the curtain.
 *
 * **At a laptop width, on purpose.** The rest of this file runs at 1680, where
 * the centre of the part clears the curtain by a few dozen pixels; that is the
 * whole reason a bug this total shipped with the suite green. Narrower, `FACE`
 * is under it. Nothing else about these two tests is different, so the window
 * is the only thing they have to say.
 */
test.describe('at a laptop width', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  /**
   * The hit test, which says *what* is in the way when this breaks.
   *
   * Only `FACE` itself: the filter rail is a column of real controls and it
   * genuinely covers the left of the canvas, so a sweep would have to tell a
   * drawn box from an invisible one. The point every other test in this file
   * clicks is the point worth defending.
   */
  test('the canvas is what the pointer finds at the centre of the part', async ({ page }) => {
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
    let box = await canvas.boundingBox()
    await expect(async () => {
      box = await canvas.boundingBox()
      expect(box).not.toBeNull()
    }).toPass({ timeout: 10_000 })
    const seen = box!

    const over = await page.evaluate(
      (point) => document.elementFromPoint(point.x, point.y)?.tagName.toLowerCase() ?? 'none',
      { x: seen.x + seen.width * FACE.x, y: seen.y + seen.height * FACE.y },
    )
    expect(over).toBe('canvas')
  })

  /** And the behaviour it exists for: a click there still reaches the mesh. */
  test('a click on the part names its reading', async ({ page }) => {
    await ready(page)

    await expect(field(page)).toBeVisible()
  })
})
