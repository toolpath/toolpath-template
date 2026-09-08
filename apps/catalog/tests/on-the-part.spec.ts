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
 * Whether the tool drawing is standing up, asked the way the drawing decides it.
 *
 * `orientationFor` in `@toolpath/tool-drawing` is
 * `width >= height ? 'horizontal' : 'vertical'` — **the measured box and
 * nothing else** — so a box taller than it is wide *is* a vertical drawing.
 *
 * The sheet's own `viewBox` looks like the obvious thing to assert and is not:
 * it is the content's extent, so it moves with whichever tool the table sorted
 * first, and the table's first row is not stable between runs. Two runs of the
 * same probe read 178×144 and 60×104 for that reason. The box is the input to
 * the rule and the only half this repository controls.
 */
/**
 * A tool and a holder that actually go together, chosen the way the tree lets
 * you: the **holder first**, then a tool from the list its choice narrows to.
 *
 * Picking the first row of the tool table and hoping a holder grips it is what
 * these tests used to do, and it broke the moment `LBH` started respecting the
 * shop's floor — the rules reorder on `L/D`, so "the first tool" became one the
 * fixture's three holders cannot hold, and the holder table came back empty.
 * Choosing in the order the narrowing supports cannot produce a pair that does
 * not fit.
 */
const buildStack = async (page: Page) => {
  const tree = page.locator('[data-assembly-tree]')
  await tree.getByRole('button', { name: /^HOLDER for / }).click()
  const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
  await expect(holders.getByRole('row').first()).toBeVisible()
  await holders.getByRole('row').first().click()

  await tree.getByRole('button', { name: /^TOOL for / }).click()
  const tools = page.getByRole('grid').first()
  await expect(tools.getByRole('row').first()).toBeVisible()
  await tools.getByRole('row').first().click()
  return tree
}

const upright = async (page: Page): Promise<void> => {
  const sheet = page.getByRole('img', { name: /drawn from its stated dimensions/ })
  await expect(sheet).toBeVisible()
  /*
    Polled rather than sampled once. The sheet takes the room the details column
    leaves, and that column changes size as a component is read — so a single
    reading can catch the box mid-settle and call a drawing horizontal that is
    about to be upright. What is being pinned is where it comes to rest.
  */
  await expect
    .poll(
      async () => {
        const box = await sheet.boundingBox()
        // A box of nothing is a sheet that has not been laid out yet, not a
        // horizontal one: under a loaded runner the first readings are zeros.
        return box === null || box.width === 0 ? false : box.height > box.width
      },
      { timeout: 15_000 },
    )
    .toBe(true)
}

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
 * **Nothing is behind a Filters button any more** (Paul, 2026-09-08). What a
 * column shows is narrowed on that column's own heading, and the part's
 * material — the one question that is about the part rather than the list — is
 * the button beside them. The holder, the collet, the clamping length and the
 * floor allowance came off the page the same day, with every rule behind them
 * still running.
 */
test('the filter toolbar exposes the catalog filter controls', async ({ page }) => {
  await openCube(page)

  await expect(page.getByRole('button', { name: 'Filters' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Part material' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filter by Type', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filter by Family', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filter by Flutes', exact: true })).toBeVisible()

  for (const gone of ['Holder', 'Collet', 'Shank', 'Product line', 'Floor radius', 'Clamping']) {
    await expect(page.getByRole('button', { name: gone, exact: true })).toHaveCount(0)
  }
})

/**
 * **Escape backs out of what is open, and out of that only.**
 *
 * The filters had no answer to Escape at all — the only way out was the button
 * that opened them — while the page answered every press by putting the
 * reading down. Now the layers are a stack (`shared/use-escape.ts`): the
 * newest thing on the screen takes the press, and the reading behind it stays.
 */
test('Escape closes the filters and leaves the reading alone', async ({ page }) => {
  await ready(page)

  await page.getByRole('button', { name: 'Filter by Vendor', exact: true }).click()
  const filters = page.getByRole('group', { name: 'Vendor' })
  await expect(filters).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(filters).toBeHidden()
  await expect(field(page)).toBeVisible()
})

test('part material narrows the tool table', async ({ page }) => {
  const before = await page.locator('[data-row-index]').count()
  await page.getByRole('button', { name: 'Part material' }).click()
  const materials = page.getByRole('group', { name: 'Part material' })
  await materials.getByRole('button', { name: /M · Stainless/ }).click()

  await expect(async () => {
    expect(await page.locator('[data-row-index]').count()).toBeLessThan(before)
  }).toPass()
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

  const row = page.getByRole('grid').getByRole('row').first()
  const number = ((await row.getByRole('gridcell').nth(1).textContent()) ?? '').trim()
  expect(number).not.toBe('')
  await row.click({ force: true })

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
  await page.getByRole('grid').getByRole('row').nth(2).click()
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
  await expect(bill.getByText(number.trim()).first()).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Product' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Model' })).toHaveCount(0)
  // One grouping: the assembly (Paul, 2026-09-01: "we can remove by feature").
  await expect(page.getByRole('button', { name: 'By feature' })).toHaveCount(0)
})

/**
 * **The part is drawn beside the tool it is being read for** (2026-09-03).
 *
 * The panel drew the cutter against nothing from 2026-08-31, while this page
 * had the feature's reach curve in hand the whole time and spent it entirely
 * on the holder list — so the one place a shop reads a tool showed no reason
 * for the stickout the list beside it had settled on. Nothing downstream was
 * missing; the panel simply had no prop to be fed through.
 *
 * It goes here because it begins with a click on the part: the curve is read
 * off a *reading*, and `cube-fixture.ts` is the only fixture that mounts
 * geometry. `components/tool-details.test.tsx` pins the same wiring cheaply;
 * this is the one that proves a real report reaches it.
 */
test('draws the material around the feature beside the tool being read', async ({ page }) => {
  await page.getByRole('button', { name: 'Add feature' }).click()
  await ready(page)

  await page.getByRole('grid').getByRole('row').first().click({ force: true })
  await expect(page.getByRole('img', { name: /drawn from its stated dimensions/ })).toBeVisible()

  // The section through the part, and the gaps called out against it.
  await expect(page.locator('[data-part="material"]')).toHaveCount(1)
  await expect(page.locator('[data-clearance]')).toHaveCount(1)

  // And with the reading put down there is no feature to clear, so the sheet
  // is the tool on its own rather than a stale wall from the last one. The
  // reading is put down from outside the table, because a focused tool table
  // owns Escape and Arrow Up/Down for its own rows.
  await page.getByRole('link', { name: 'Order list' }).focus()
  await page.keyboard.press('Escape')
  await expect(field(page)).toBeHidden()
  await expect(page.locator('[data-part="material"]')).toHaveCount(0)
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
  await page.getByRole('button', { name: 'Filter by Vendor', exact: true }).click()
  const picker = page.getByRole('group', { name: 'Vendor' })
  await expect(picker).toBeVisible()
  /*
    **The menu is drawn over the page, not inside the table.** The kit's table
    is a scroll container on both axes, so a menu positioned inside a header
    cell is clipped at the header's own edge; it is placed against the button
    that opened it and kept inside the window instead.
  */
  const menuBox = await picker.boundingBox()
  expect(menuBox).not.toBeNull()
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expect(picker.getByRole('checkbox', { name: 'Kennametal' })).toBeVisible()
  await expect(page.getByText('Not in this catalog yet')).toHaveCount(0)
})

test('filters open inline from the tool table, below the viewer', async ({ page }) => {
  const viewer = page.locator('canvas')
  const toolbar = page.locator('[data-part-tool-table-toolbar]')

  await expect(toolbar).toBeVisible()
  await expect(async () => {
    const viewerBox = await viewer.boundingBox()
    const toolbarBox = await toolbar.boundingBox()
    expect(viewerBox).not.toBeNull()
    expect(toolbarBox).not.toBeNull()
    expect(toolbarBox!.y).toBeGreaterThan(viewerBox!.y + viewerBox!.height)
  }).toPass()

  const tableScroll = page.locator('[data-part-tool-table] .hide-scrollbar').first()
  await expect(tableScroll).toBeVisible()
  expect(await tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true,
  )

  // What no column shows is on the toolbar, answerable without a press first.
  await expect(toolbar.getByRole('button', { name: 'Part material' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Matching settings' })).toHaveCount(0)

  /*
    What a column *does* show is asked on that column, and offered over what
    the list holds: a heading narrows the rows under it, where the panel used
    to offer every form the library names whether this catalog had one or not.

    **The shank is part of the phrase**, not a filter beside it (Paul,
    2026-09-08): the sample's ⌀9.525 tap on a ⌀7.938 shank is a reduced shank
    tap, and reads as one wherever it is named.
  */
  await page.getByRole('button', { name: 'Filter by Type', exact: true }).click()
  const types = page.getByRole('group', { name: 'Type' })
  await expect(types).toBeVisible()
  await expect(types.getByRole('checkbox', { name: 'Drill' })).toBeVisible()
  await expect(types.getByRole('checkbox', { name: 'Reduced shank tap right hand' })).toBeVisible()
  await expect(types.getByRole('checkbox', { name: 'Circle segment taper' })).toHaveCount(0)
})

/**
 * **One grouping, one column** (Paul, 2026-09-08: "product line and family are
 * the same and need to be rolled into one Family field. This should be a
 * column in tools"). The vendor's line where it names one, the family under it
 * where it does not.
 */
test('the family is a column, and the column is the filter', async ({ page }) => {
  await openCube(page)

  await expect(page.getByRole('columnheader', { name: /Family/ })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: 'Sample HP Series' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Filter by Family', exact: true }).click()
  const families = page.getByRole('group', { name: 'Family' })
  await expect(families.getByRole('checkbox', { name: 'Sample HP Series' })).toBeVisible()
  // The taps name no line, so they answer under the family's own title.
  await expect(
    families.getByRole('checkbox', { name: 'Sample inch spiral-flute taps' }),
  ).toBeVisible()
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

  await page.getByRole('grid').getByRole('row').nth(1).click({ force: true })
  await add.click()

  // On the list, with its own answer under it — and the panel below waits to
  // be asked rather than falling back to the catalog.
  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(1)
  // The number search is the Catalog number column's own filter, not a box in
  // a second toolbar row above the table.
  await page.getByRole('button', { name: 'Filter by Catalog number', exact: true }).click()
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
  // **The only question a group asks is stated, not offered** (Paul,
  // 2026-09-08): *one tool for all of them* is what every group means, so the
  // note says it and neither it nor the quick buttons are controls any more.
  await expect(page.getByText(/find tools compatible with all features in the group/)).toBeVisible()
  await expect(page.getByRole('button', { name: /One tool for all of them/ })).toBeHidden()
  await expect(page.getByRole('button', { name: /The best tool for each/ })).toBeHidden()
  await expect(page.getByRole('button', { name: /^Add every/ })).toBeHidden()
  await expect(page.getByRole('button', { name: /^Create group and add tools?$/ })).toBeDisabled()
})

/**
 * The one feature a group built by clicking has in it, by the name the page
 * gives it.
 *
 * **The quick buttons are gone** (Paul, 2026-09-08), so a group here is built
 * the way the editor now says it is: the face clicked on the part. Which
 * reading that face resolves to is the kernel's business — the cube's centre
 * reads as a profile as readily as a face — so the name is read off the chip
 * rather than assumed, and every later assertion uses what the page said.
 */
const inTheGroup = async (page: Page): Promise<string> => {
  const chip = page.getByRole('button', { name: /^Take .+ out of the group$/ })
  await expect(chip).toBeVisible()
  const label = (await chip.getAttribute('aria-label')) ?? ''
  return label.replace(/^Take /, '').replace(/ out of the group$/, '')
}

/**
 * **The list is the work, so it survives a reload** (Paul, 2026-09-02: "we need
 * to be showing the tool/feature list — it keeps disappearing", and "the
 * highlighting is sticking around, so it must be surviving the reload"). The
 * setup sheet has been kept per part since 2026-08-10 and the list was not, so
 * a refresh threw away everything somebody had picked out while the tools they
 * had chosen for it stayed on the bill and on the part.
 */
test('keeps the list across a reload', async ({ page }) => {
  // **The features are picked on the part** now that the quick buttons are off
  // the editor (Paul, 2026-09-08): the face already clicked seeds the draft,
  // which is the mechanism the box now says is the only one.
  await ready(page)
  await page.getByRole('button', { name: 'Add group' }).click()
  const named = await inTheGroup(page)
  // One tool for all of them is what every group asks (Paul, 2026-09-08), so
  // the group is finished by picking a tool out of the list below it.
  await page
    .getByRole('grid')
    .getByRole('row')
    .nth(1)
    .evaluate((element) => element.click())
  await page.getByRole('button', { name: /^Create group and add tools?$/ }).click()

  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list.getByRole('listitem')).toHaveCount(1)

  await page.reload()

  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list.getByText(named)).toBeVisible()
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
 *
 * **Skipped while _the best tool for each_ is parked** (Paul, 2026-09-07). The
 * option is off the group editor, so nothing on screen can ask for it; the
 * model behind it is untouched, and putting the entry back in `CHOICES` in
 * `components/group-editor.tsx` is what makes this test runnable again.
 */
test.skip('a group answers per its result option', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Add group' }).click()

  await expect(page.getByText('New group')).toBeVisible()
  // The committed sample catalog has matching tools for its planar faces, and
  // the face is picked on the part (Paul, 2026-09-08, taking the quick buttons
  // off): `ready` above is what put it in.

  // A group asked for one tool *each* shows no list at all: the question is one
  // per feature, and the answers arrive when the group does (Paul, same day).
  await page.getByRole('radio', { name: /The best tool for each/ }).click()
  await expect(page.getByText(/Tools will automatically be selected/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Create group and add tools?$/ })).toBeEnabled()
  await page.getByRole('button', { name: /^Create group and add tools?$/ }).click()

  const list = page.getByRole('list', { name: 'Features being asked about' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list.getByText('one each')).toBeVisible()
  await list.getByRole('button', { name: /^Open / }).click()
  await expect(list.getByRole('button', { name: / for Face/ }).first()).toBeVisible()
})

/**
 * **The answer is the way through to the offer behind it** (Paul, 2026-09-02:
 * "clicking on the tool there would show the list of compatible tools for that
 * feature or folder, depending on the settings"). Until it is pressed the panel
 * below waits to be asked — it never falls back to the catalog.
 */
test('presses the tool under a row for everything that fits it', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Add group' }).click()
  const named = await inTheGroup(page)
  await page
    .getByRole('grid')
    .getByRole('row')
    .nth(1)
    .evaluate((element) => element.click())
  await page.getByRole('button', { name: /^Create group and add tools?$/ }).click()

  // The group it just made is what it is working on, so the list below is
  // already the group's. Putting it down goes back to the catalog, and its own
  // answer is the way back in.
  await expect(page.getByText('Cuts every feature in the group')).toBeVisible()
  const list = page.getByRole('list', { name: 'Features being asked about' })
  await list.getByRole('button', { name: named, exact: true }).click()
  await expect(page.getByText('Every tool in the catalog')).toBeVisible()

  await list.getByRole('button', { name: / for / }).click()

  await expect(page.getByText('Cuts every feature in the group')).toBeVisible()
  await page.getByRole('button', { name: 'Filter by Catalog number', exact: true }).click()
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

/**
 * The tool assembly tree — the shape behind `assemblyTree`, on by default and
 * switched off in the header (Paul, 2026-09-07).
 *
 * Every other test in this file opens the cube with the flag **off**, because
 * they are about the panel it replaces. These open it on. What a tree holds,
 * what a slot means and what narrows what are all pinned in
 * `shared/assembly-tree.test.ts`, `shared/assembly-narrowing.test.ts` and
 * `shared/assembly-actions.test.ts`, where they cost three assertions; this
 * pins that a click on the part reaches a tree at all, and that clicking its
 * rows swaps the table under it.
 */
test.describe('the tool assembly tree', () => {
  test.beforeEach(async ({ page }) => {
    await openCube(page, '', { assemblyTree: true })
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('a feature added to the list gets a tree of TOOL, HOLDER and COLLET', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const tree = page.locator('[data-assembly-tree]')
    await expect(tree).toBeVisible()
    await expect(tree.getByRole('button', { name: /^TOOL for / })).toBeVisible()
    await expect(tree.getByRole('button', { name: /^HOLDER for / })).toBeVisible()
    await expect(tree.getByRole('button', { name: /^COLLET for / })).toBeVisible()
  })

  /**
   * **In the feature panel, beside the list** (Paul, 2026-09-07: "moving the
   * tool tree to the feature panel"). It stood in the tool table's own scroll
   * area, which put the stack being built at the bottom of the page and the
   * feature it answers at the top of it. Pinned by where it is rather than by
   * which element holds it, because the box it sits in is a layout detail and
   * "to the right of the list, above the table" is the rule.
   */
  test('draws the tree beside the feature list, above the table', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const tree = page.locator('[data-assembly-tree]')
    await expect(tree).toBeVisible()

    const treeBox = await tree.boundingBox()
    const listBox = await page
      .getByRole('list', { name: 'Features being asked about' })
      .boundingBox()
    const tableBox = await page.locator('[data-list-chrome]').boundingBox()
    if (treeBox === null || listBox === null || tableBox === null) {
      throw new Error('the tree, the list and the table are all on screen')
    }

    expect(treeBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width)
    expect(treeBox.y + treeBox.height).toBeLessThanOrEqual(tableBox.y)
  })

  /**
   * **The row you pick stays the row you are picking** (Paul, 2026-09-07: "it is
   * still automatically moving me to holders when I select a tool as a row … I
   * shouldn't be moved to the next component automatically — I should click on
   * its row to see the table for it"). The open slot is derived — whatever was
   * clicked, or else the first unanswered slot — so filling the tool made the
   * holder the first unanswered one and the list under the mouse changed to
   * holders mid-click.
   */
  test('stays on the slot a row was picked into', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const tree = page.locator('[data-assembly-tree]')
    await tree.getByRole('button', { name: /^TOOL for / }).click()
    const tools = page.getByRole('grid').first()
    await expect(tools.getByRole('row').first()).toBeVisible()
    await tools.getByRole('row').first().click()

    // Still the tools, and the tree still says so.
    await expect(page.locator('[data-component-table="holder"]')).toHaveCount(0)
    await expect(tree.getByRole('button', { name: /^TOOL for / })).toHaveAttribute(
      'aria-current',
      'true',
    )

    // The holders are a press away, in the tree, when they are wanted.
    await tree.getByRole('button', { name: /^HOLDER for / }).click()
    await expect(page.locator('[data-component-table="holder"]')).toBeVisible()
  })

  /**
   * **Three buttons in the table's chrome, and the open one is lit** (Paul,
   * 2026-09-07: "I want the table tabs for tools, holders, and collets back,
   * just as buttons like the filters button. The one that is active should be
   * highlighted"). They are the tree's slots rather than a control beside it, so
   * the buttons and the tree cannot disagree about what the rows below are for.
   */
  test('switches the list with the three buttons in the chrome', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const chrome = page.locator('[data-list-chrome]')
    // Named with their counts now, so matched on the word they lead with.
    await expect(chrome.getByRole('button', { name: /^Tools/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await chrome.getByRole('button', { name: /^Holders/ }).click()

    await expect(page.locator('[data-component-table="holder"]')).toBeVisible()
    await expect(chrome.getByRole('button', { name: /^Holders/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // And the tree opened that slot, rather than the two saying different things.
    await expect(
      page.locator('[data-assembly-tree]').getByRole('button', { name: /^HOLDER for / }),
    ).toHaveAttribute('aria-current', 'true')
  })

  /**
   * **The three buttons work with nothing selected too** (Paul, 2026-09-07:
   * "the buttons need to be shown and usable when not editing a feature as
   * well. With no selections, I should still see the tool, holder, and collet
   * buttons in the table"). A crib is three catalogs, and asking which BT30
   * chucks a shop owns used to need a feature invented to hang the question off.
   */
  test('reads the holder and collet racks with no feature started', async ({ page }) => {
    // Nothing clicked on the part: the catalog is what is on show.
    await expect(page.getByText('Every tool in the catalog')).toBeVisible()

    const chrome = page.locator('[data-list-chrome]')
    await chrome.getByRole('button', { name: /^Holders/ }).click()
    await expect(page.getByText('Every holder in the crib')).toBeVisible()

    // A row is a look-up rather than a slot being filled — there is no stack for
    // it to go into — and it reads out on the right.
    const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
    await holders.getByRole('row').first().click()
    await expect(page.getByText('Choose a tool to draw the assembly.')).toBeVisible()

    await chrome.getByRole('button', { name: /^Collets/ }).click()
    await expect(page.getByText('Every collet in the crib')).toBeVisible()
  })

  /**
   * **Each button counts its own list, and the counts move** (Paul, 2026-09-07:
   * "the count is always showing the tool count. This should be unique to the
   * component … it needs to live update when a feature is selected, or as tool
   * assembly components are selected"). One number beside the heading counted
   * tools whichever of the three was on screen.
   */
  test('counts each list on its own button, and keeps them current', async ({ page }) => {
    const chrome = page.locator('[data-list-chrome]')
    const count = async (name: RegExp) =>
      ((await chrome.getByRole('button', { name }).innerText()) ?? '').replace(/\D/g, '')

    // With nothing selected the three numbers are three different lists.
    await chrome.getByRole('button', { name: /^Holders/ }).click()
    const rack = page.locator('[data-component-table="holder"]').getByRole('grid')
    await expect(rack.getByRole('row').first()).toBeVisible()
    expect(await count(/^Holders/)).toBe(String(await rack.getByRole('row').count()))

    // Put a holder in a feature's stack: the collets left are the ones that
    // close on it, and the button says so.
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = page.locator('[data-assembly-tree]')
    await tree.getByRole('button', { name: /^HOLDER for / }).click()
    const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
    await expect(holders.getByRole('row').first()).toBeVisible()
    await holders.getByRole('row').first().click()

    await tree.getByRole('button', { name: /^COLLET for / }).click()
    const collets = page.locator('[data-component-table="collet"]').getByRole('grid')
    await expect(collets.getByRole('row').first()).toBeVisible()
    expect(await count(/^Collets/)).toBe(String(await collets.getByRole('row').count()))
  })

  /**
   * **Before the row exists, not after it.** The tools for a draft were already
   * listed at the bottom of the page while the column beside them stayed empty
   * until the feature was confirmed — which read as broken rather than as
   * not-yet (Paul, 2026-09-07).
   */
  test('shows the tree for a feature still being created', async ({ page }) => {
    await ready(page)

    // A face is being read and nothing has been added yet: the draft is open.
    await expect(page.locator('[data-assembly-tree]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add feature' })).toBeVisible()
  })

  /**
   * **Nothing asked, nothing to assemble.**
   *
   * `activeItem` matched whichever row was first when the tags being asked
   * about were empty — `[].every(...)` is true of everything — so the tree drew
   * one feature's stacks under a table showing the whole catalog (Paul,
   * 2026-09-07: "when no feature is selected, the tool table should not show
   * any assemblies").
   */
  test('shows no tree while nothing is selected', async ({ page }) => {
    // A feature exists, so there is a row for the old bug to have picked up.
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    await expect(page.locator('[data-assembly-tree]')).toBeVisible()

    // Put it all down: no row selected, no face read, the catalog on show.
    await at(page, NOTHING)
    await page.keyboard.press('Escape')

    await expect(page.getByText('Every tool in the catalog')).toBeVisible()
    await expect(page.locator('[data-assembly-tree]')).toHaveCount(0)
  })

  /**
   * **Nothing is chosen for a feature until the stack's own button is pressed**
   * (Paul, 2026-09-07: "I should just have an 'add to order list' button (or
   * update, context aware), at the top level of each tool assembly" — and "it
   * should also no longer autoselect the tool component row that I click on").
   * A row in the table puts a component into the stack on screen and nowhere
   * else; the button under the stack is the decision, and where there is no row
   * yet that one press makes it.
   */
  test('the stack button adds the feature and its assembly in one press', async ({ page }) => {
    await ready(page)
    const list = page.getByRole('list', { name: 'Features being asked about' })
    await expect(list).toBeHidden()

    const tree = page.locator('[data-assembly-tree]')
    await expect(tree.getByText(/not on the list yet/)).toBeVisible()
    // Nothing built: nothing to order, so no button at all.
    await expect(tree.getByRole('button', { name: /order list/ })).toHaveCount(0)

    // Pick a tool into the stack. That alone must not add anything to the list.
    await tree.getByRole('button', { name: /^TOOL for / }).click()
    await page.getByRole('grid').first().getByRole('row').first().click()
    await expect(tree.getByRole('button', { name: /^TOOL for / })).not.toContainText('—')
    await expect(list).toBeHidden()

    // The button under the stack is where it becomes a feature, and it says
    // that is what it will do.
    const add = tree.getByRole('button', { name: 'Add to order list' })
    await expect(tree.getByText(/Adds the feature to the feature list/)).toBeVisible()
    await add.click()

    await expect(list).toBeVisible()
    await expect(tree.getByText(/not on the list yet/)).toBeHidden()
    // On the list now, so the press that is left is the way back off it.
    await expect(tree.getByRole('button', { name: 'Remove from order list' })).toBeVisible()
  })

  /**
   * **Every assembly carries its own press**, which is what the panel on the
   * right could never do: it spoke for whichever slot happened to be selected.
   * One press for the whole of it — a threaded hole's tap and the drill under
   * it are one thing to order (Paul, 2026-09-08).
   */
  test('gives every assembly in the tree its own button', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = await buildStack(page)

    await tree.getByRole('button', { name: 'Add to order list' }).click()

    await expect(tree.getByRole('button', { name: 'Remove from order list' })).toBeVisible()
    await expect(tree.getByRole('button', { name: 'Add to order list' })).toHaveCount(0)
  })

  /**
   * **Nothing is chosen that nobody chose** (Paul, 2026-09-07: "it should no
   * longer autoselect the first tool as well"). Confirming used to fall through
   * to the head of the tool table, so a feature added with an empty stack came
   * with the first row's tool against it.
   */
  test('adds a feature with no tool when nothing was put in the stack', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const list = page.getByRole('list', { name: 'Features being asked about' })
    await expect(list).toBeVisible()
    // A row, and no tool line under it: nothing was picked, so nothing is on it.
    await expect(list.getByRole('button', { name: / for / })).toHaveCount(0)
  })

  /**
   * A stack built while reading one face does not follow the mouse to another:
   * the scratch tree is keyed by what is being asked (`draftKeyFor`).
   */
  test('does not carry a stack from one unconfirmed feature to another', async ({ page }) => {
    await ready(page)
    const tree = page.locator('[data-assembly-tree]')
    await tree.getByRole('button', { name: /^HOLDER for / }).click()
    const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
    await expect(holders.getByRole('row').first()).toBeVisible()
    await holders.getByRole('row').first().click()
    await expect(tree.getByRole('button', { name: /^HOLDER for / })).not.toContainText('—')

    // Walk to a different reading of the face: a different question.
    await page.keyboard.press('Escape')
    await at(page, NOTHING)
    await expect(tree).toHaveCount(0)
  })

  /** And what was chosen on the draft is still there once it is a row. */
  test('keeps what was built on the draft when the feature is added', async ({ page }) => {
    await ready(page)

    const tree = page.locator('[data-assembly-tree]')
    await tree.getByRole('button', { name: /^HOLDER for / }).click()
    const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
    await expect(holders.getByRole('row').first()).toBeVisible()
    const number = (
      (await holders.getByRole('row').first().getByRole('gridcell').nth(1).textContent()) ?? ''
    ).trim()
    await holders.getByRole('row').first().click()
    await expect(tree.getByRole('button', { name: /^HOLDER for / })).toContainText(number)

    await page.getByRole('button', { name: 'Add feature' }).click()

    await expect(tree.getByRole('button', { name: /^HOLDER for / })).toContainText(number)
  })

  test('the holder row opens a table of holders with their own columns', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    await page
      .locator('[data-assembly-tree]')
      .getByRole('button', { name: /^HOLDER for / })
      .click()

    await expect(page.getByText('Holders for this assembly')).toBeVisible()
    const table = page.locator('[data-component-table="holder"]')
    await expect(table).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Taper' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Gauge length' })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: 'Family' })).toBeVisible()
  })

  /**
   * The whole point of the tree: a holder chosen first narrows everything else.
   * The cube fixture's rack is three holders and its drawer five collets, so
   * this is a small claim about a small crib — and it is the claim.
   */
  test('a holder picked in the table lands in the tree and narrows the collets', async ({
    page,
  }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const tree = page.locator('[data-assembly-tree]')
    await tree.getByRole('button', { name: /^HOLDER for / }).click()

    // The same shape the tool table's rows are read in: the grid inside the
    // panel, its first data row, and the catalog number in its second cell —
    // the first is the selection column the kit's table puts there.
    const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
    const first = holders.getByRole('row').first()
    await expect(first).toBeVisible()
    const number = ((await first.getByRole('gridcell').nth(1).textContent()) ?? '').trim()
    expect(number).not.toBe('')
    await first.click()

    await expect(tree.getByRole('button', { name: /^HOLDER for / })).toContainText(number)

    await tree.getByRole('button', { name: /^COLLET for / }).click()
    await expect(page.getByText('Collets for this assembly')).toBeVisible()
  })

  /**
   * **A swapped cutter replaces the line, it does not add a second one** (Paul,
   * 2026-09-07: "when editing an already active assembly, a tool not in the
   * order list should say 'replace' in the active assembly. Right now it is
   * adding a new assembly to the feature"). The sheet keys a line by its tool,
   * so the stack has to remember what it was ordered as.
   */
  test('replaces the tool on an assembly already on the order list', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = await buildStack(page)
    await tree.getByRole('button', { name: 'Add to order list' }).click()

    // Read off the sheet rather than off the list beside it: the list shows a
    // row's *answers*, and what this is about is how many lines the feature has.
    const lines = async () =>
      await page.evaluate(() => {
        const key = Object.keys(localStorage).find((each) => each.startsWith('tool-catalog.setup.'))
        const kept = key === undefined ? null : localStorage.getItem(key)
        return kept === null ? 0 : (kept.match(/"toolGuid"/g) ?? []).length
      })
    expect(await lines()).toBe(1)

    // A different cutter into the same stack.
    const tool = tree.getByRole('button', { name: /^TOOL for / })
    const number = ((await tool.textContent()) ?? '').replace(/^TOOL/, '').trim()
    expect(number).not.toBe('')
    await tool.click()
    const tools = page.getByRole('grid').first()
    await expect(tools.getByRole('row').first()).toBeVisible()
    await tools.getByRole('row').nth(1).click()

    // The row itself says what moved, before anything is pressed.
    await expect(tree.getByRole('button', { name: /^TOOL for / })).toContainText(number)

    // The press names the swap rather than offering a second assembly.
    const replace = tree.getByRole('button', { name: /^Replace / })
    await expect(replace).toBeVisible()
    await expect(tree.getByRole('button', { name: 'Add to order list' })).toHaveCount(0)
    await replace.click()

    // One line still — the stack's line, with the new cutter on it — and the
    // press that is left is the way back off the order list.
    await expect(tree.getByRole('button', { name: 'Remove from order list' })).toBeVisible()
    expect(await lines()).toBe(1)
  })

  /**
   * **The button says what pressing it changes** (Paul, 2026-09-07: "I need to
   * see the context aware changes I'm making" and "it should say 'change holder
   * from x to y'"). The stack is drawn once and the button sits under it, so the
   * one thing left for it to say is what is different about it — and "Update
   * assembly" says nothing at all.
   *
   * Pinned on taking the holder off rather than swapping it: the change is the
   * same sentence either way, and this one needs no second holder to exist in
   * whichever dataset the machine bundled.
   */
  test('names on the button what confirming the stack would change', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = await buildStack(page)

    const holder = tree.getByRole('button', { name: /^HOLDER for / })
    const number = ((await holder.textContent()) ?? '').replace(/^HOLDER/, '').trim()
    expect(number).not.toBe('')

    // On the order list: the stack as built.
    await tree.getByRole('button', { name: 'Add to order list' }).click()
    await expect(tree.getByRole('button', { name: 'Remove from order list' })).toBeVisible()

    // Take the holder out of the tree. The button now says exactly what has
    // changed about the stack, naming the holder it would drop.
    await tree.getByRole('button', { name: 'Clear the holder' }).click()
    await expect(tree.getByRole('button', { name: `Take holder ${number} off` })).toBeVisible()
  })

  /**
   * **What the feature already orders is the first row** (Paul, 2026-09-07: "can
   * we float confirmed tool assembly components to the top of the table lists?").
   * The tool list has had that rule since 2026-08-31; the two racks did not, so
   * the holder a feature is ordered with sat wherever the crib's order put it,
   * wearing a badge nobody scrolled to.
   */
  test('floats what the feature already orders to the top of the rack', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    // The *second* holder in the rack, so floating it is a move rather than a
    // list that was already in that order.
    const tree = page.locator('[data-assembly-tree]')
    await tree.getByRole('button', { name: /^HOLDER for / }).click()
    const holders = page.locator('[data-component-table="holder"]').getByRole('grid')
    await expect(holders.getByRole('row').nth(1)).toBeVisible()
    const wanted = ((await holders.getByRole('row').nth(1).textContent()) ?? '').trim()
    await expect(holders.getByRole('row').first()).not.toContainText(wanted.slice(0, 12))
    await holders.getByRole('row').nth(1).click()

    await tree.getByRole('button', { name: /^TOOL for / }).click()
    const tools = page.getByRole('grid').first()
    await expect(tools.getByRole('row').first()).toBeVisible()
    await tools.getByRole('row').first().click()
    await tree.getByRole('button', { name: 'Add to order list' }).click()

    // Back to the rack: the holder the feature is ordered with leads it now.
    await tree.getByRole('button', { name: /^HOLDER for / }).click()
    await expect(holders.getByRole('row').first()).toContainText(wanted.slice(0, 12))
    await expect(holders.getByRole('row').first().getByText('on the feature')).toBeVisible()
  })

  /**
   * **A rack says what is already being bought, and for what** (Paul,
   * 2026-09-07: "holders and collets should show if they are already in use the
   * same way that tools do (float to the top and badge) … it should note which
   * feature and assembly they are used in in the badge"). The tool list said
   * only *on list*, and a rack said only whether a component stood in another
   * stack of the same feature.
   */
  test('names the feature and assembly a component is already used on', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = page.locator('[data-assembly-tree]')
    await buildStack(page)

    const holder = tree.getByRole('button', { name: /^HOLDER for / })
    const number = ((await holder.textContent()) ?? '').replace(/^HOLDER/, '').trim()
    await tree.getByRole('button', { name: 'Add to order list' }).click()

    // A second feature, and its holder rack: the first feature's holder is
    // named there, with the feature and the stack it is on.
    await at(page, NOTHING)
    await page.keyboard.press('Escape')
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    await tree.getByRole('button', { name: /^HOLDER for / }).click()

    const rack = page.locator('[data-component-table="holder"]').getByRole('grid')
    const marked = rack.getByRole('row').filter({ hasText: number }).first()
    await expect(marked).toBeVisible()
    await expect(marked.getByText(/^on .+ · Assembly 1/)).toBeVisible()
    // And it leads the rack, the way a kept tool leads the tool list.
    await expect(rack.getByRole('row').first()).toContainText(number)
  })

  /**
   * **An unsaved swap is visible in the list and can be backed out of** (Paul,
   * 2026-09-07: "I need to see the holder that was previously selected for the
   * feature in the list and have a way to back out"). Picking a different holder
   * changes the tree and nothing else; until now the list gave no sign which one
   * the feature actually has, and the only way back was to remember it.
   */
  test('marks the holder the feature already has, and offers the way back', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = await buildStack(page)

    const holder = tree.getByRole('button', { name: /^HOLDER for / })
    const number = ((await holder.textContent()) ?? '').replace(/^HOLDER/, '').trim()
    await tree.getByRole('button', { name: 'Add to order list' }).click()

    // Back to the holder table, and take the confirmed holder out of the stack.
    await holder.click()
    const table = page.locator('[data-component-table="holder"]')
    await expect(table.getByRole('grid').getByRole('row').first()).toBeVisible()
    await tree.getByRole('button', { name: 'Clear the holder' }).click()

    // The list says which one the feature has, even though the stack no longer
    // holds it — that row is what backing out returns to.
    const marked = table.getByRole('row').filter({ hasText: number })
    await expect(marked.getByText('on the feature')).toBeVisible()

    // And the way back is one press, naming what it keeps.
    await tree.getByRole('button', { name: `Cancel — keep ${number}` }).click()
    await expect(tree.getByRole('button', { name: /^HOLDER for / })).toContainText(number)
    // Nothing left to confirm: the stack is what the feature already has.
    await expect(tree.getByRole('button', { name: 'Remove from order list' })).toBeVisible()
    await expect(tree.getByRole('button', { name: /^Cancel/ })).toHaveCount(0)
  })

  test('another assembly is one press away', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()

    const tree = page.locator('[data-assembly-tree]')
    await expect(tree.getByRole('button', { name: /^TOOL for / })).toHaveCount(1)
    await tree.getByRole('button', { name: 'Add assembly' }).click()
    await expect(tree.getByRole('button', { name: /^TOOL for / })).toHaveCount(2)
  })

  /**
   * **The cutter is drawn standing up.**
   *
   * `orientationFor` in `@toolpath/tool-drawing` reads the box the sheet ends
   * up in, and `<ToolDetails>` is `h-full min-h-0` — so a panel that does not
   * state its own height collapses that box and the tool is drawn lying on its
   * side. That is not a styling slip: it is the one thing about this panel a
   * reader notices immediately, and it broke the first time the assembly panel
   * wrapped `<ToolDetails>` in a plain div (Paul, 2026-09-07: "why is the tool
   * view horizontal now?").
   *
   * Pinned on the sheet's own `viewBox` rather than on a class, because the
   * class is the cause and the shape of the sheet is the claim.
   */
  test('draws the tool standing up, not lying on its side', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    await buildStack(page)

    await upright(page)
  })

  /**
   * **One sheet, whichever component is open.** Selecting a holder used to swap
   * the panel for a second drawing in a box of its own — which came out lying on
   * its side, and took the Tool / Tool + holder switch away with it (Paul,
   * 2026-09-07). Only the column under the drawing changes now.
   */
  test('keeps one drawing, standing up, when a holder is selected', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    const tree = await buildStack(page)
    // Read the holder: the sheet above must be the same one, still upright.
    await tree.getByRole('button', { name: /^HOLDER for / }).click()

    // One sheet, still upright — not a second drawing in a box of its own.
    await expect(page.getByRole('img', { name: /drawn from its stated dimensions/ })).toHaveCount(1)
    await upright(page)

    // The switch that chooses what the sheet shows survives reading a holder.
    await expect(page.getByRole('button', { name: 'Tool + holder' })).toBeVisible()
    // And the column under it is the holder's, not the cutter's numbers.
    // Scoped to the definition list: the table's column header says this too.
    await expect(page.locator('dt').filter({ hasText: 'Collet series' })).toBeVisible()
    await expect(page.locator('dt').filter({ hasText: 'Corner radius' })).toHaveCount(0)
  })

  /**
   * **The sheet stands up at any panel width.**
   *
   * `orientationFor` is `width >= height ? 'horizontal' : 'vertical'` — pure
   * aspect ratio, with no override — so the drawing lies down the moment the
   * box it is given is wider than it is tall. At 1680 the right-hand panel is
   * narrow and the earlier test passed; on a wide screen it is not, and the
   * holder came out on its side (Paul, 2026-09-07, with a screenshot). The
   * width is the whole point of this block.
   */
  test.describe('on a wide screen', () => {
    // Paul's own window, off the screenshot: wide **and short**, which is what
    // tips the box. A tall 2560 window still comes out vertical, so a test that
    // only widened the viewport proved nothing.
    test.use({ viewport: { width: 2000, height: 1030 } })

    test('still draws the stack standing up', async ({ page }) => {
      await ready(page)
      await page.getByRole('button', { name: 'Add feature' }).click()
      await buildStack(page)

      await upright(page)
    })
  })

  /** And the way back off it, which is the reason the flag exists. */
  test('the header switch puts the old tool panel back', async ({ page }) => {
    await ready(page)
    await page.getByRole('button', { name: 'Add feature' }).click()
    await expect(page.locator('[data-assembly-tree]')).toBeVisible()

    await page.getByRole('button', { name: 'Tool tree' }).click()

    await expect(page.locator('[data-assembly-tree]')).toHaveCount(0)
  })
})
