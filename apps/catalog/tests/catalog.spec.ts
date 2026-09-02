import { expect, test } from '@playwright/test'

/**
 * The catalog browser is hidden — nothing in the header links to it — but it
 * still answers on `/catalog`, and these are the checks that it does (Paul,
 * 2026-09-01).
 */

test('browses, filters, and keeps the selection in the URL', async ({ page }) => {
  await page.goto('/catalog')

  const status = page.getByRole('status')
  await expect(status).toContainText('tools')

  await page.getByRole('textbox', { name: 'Search tools' }).fill('TDMX')
  await expect(page).toHaveURL(/q=TDMX/)

  const rows = page.getByRole('table').getByRole('row')
  await expect(rows).not.toHaveCount(0)
})

/**
 * The two questions above the tool list, and the reason both exist.
 *
 * A family is one page in a vendor's catalogue; a product line spans several
 * of them. Before the scraper recorded either name, the family chip read
 * `sample-vhm-endmills` — a scrape's own key — and there was no line to ask
 * about at all.
 */
test('narrows by the vendor’s product line, and names a family by the vendor’s name', async ({
  page,
}) => {
  await page.goto('/')

  // The chip's label is the family's name; its value is still the id, which is
  // what the URL carries and what a shared link has to keep working.
  const families = page.getByRole('group', { name: 'Family' })
  await expect(
    families.getByRole('button', { name: 'Sample solid carbide end mills' }),
  ).toBeVisible()

  const lines = page.getByRole('group', { name: 'Product line' })
  await lines.getByRole('button', { name: 'Sample HP Series' }).click()

  await expect(page).toHaveURL(/productLine=Sample\+HP\+Series/)
  // The four end mills carry that line; the drills and taps do not.
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5)
})

test('opens a tool and explains the vendor’s codes', async ({ page }) => {
  await page.goto('/catalog')

  await page.getByRole('table').getByRole('link').first().click()

  await expect(page).toHaveURL(/\/tools\//)
  await expect(page.getByRole('table')).toContainText('Cutting diameter')
})

/**
 * Clean paths on a static host only work if unknown paths fall back to
 * `index.html`. This is the check that a deploy which forgets that rewrite
 * fails here rather than in front of a user.
 */
test('survives a reload on a deep link', async ({ page }) => {
  await page.goto('/catalog')
  await page.getByRole('table').getByRole('link').first().click()
  await expect(page).toHaveURL(/\/tools\//)
  const url = page.url()

  await page.goto(url)

  await expect(page.getByRole('table')).toContainText('Cutting diameter')
})

test('switches every dimension between millimetres and inches', async ({ page }) => {
  await page.goto('/catalog')

  await page.getByRole('group', { name: 'Units' }).getByRole('button', { name: 'in' }).click()

  await expect(page.getByRole('table')).toContainText(' in')
})

/**
 * The tool half of this application is public and bundled. The part half is
 * not: it needs the shop's own API key, and the key is only ever handed to this
 * application's server.
 */
test('asks for a connection before a part can be uploaded', async ({ page }) => {
  await page.goto('/parts')

  await expect(page.getByLabel('Toolpath API key')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()
  await expect(page.getByLabel('CAD file')).toHaveCount(0)
})

test('builds an assembly — holder, then collet — and keeps it', async ({ page }) => {
  await page.goto('/catalog')
  await page.getByRole('table').getByRole('link').first().click()

  const holders = page.getByRole('region', { name: 'Holders' })
  const collets = page.getByRole('region', { name: 'Collets' })

  // The first holder is the recommendation, and says so. On the sample it is
  // the shrink-fit chuck, which clamps the shank itself — so the collet pane
  // says no collet is needed rather than showing an empty list.
  await holders.getByRole('button', { name: /recommended/ }).click()
  await expect(collets.getByText(/No collet needed/)).toBeVisible()
  await expect(page).toHaveURL(/holder=/)
  await expect(page.getByRole('img', { name: /drawn from its stated dimensions/ })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'stickout' })).toBeVisible()

  // A collet chuck wants a collet; the closest to on-size is first.
  await holders.getByRole('button', { name: /ER16/ }).click()
  await expect(collets.getByText(/Choose a holder|No collet needed/)).toHaveCount(0)
  await collets.getByRole('button').first().click()
  await expect(page).toHaveURL(/collet=/)

  await page.getByRole('button', { name: 'Save assembly' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  // A kept assembly is the person's, and it survives the page it was kept on.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()
})

/**
 * **The way in is a part** (Paul, 2026-09-01): the application opens on the
 * upload, in the space the viewer will fill, and the pages that browse the
 * whole catalog on their own are not linked from anywhere.
 */
test('opens on the part upload, with no catalog tabs', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Toolpath API key')).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Catalog' })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Families' })).toHaveCount(0)
})
