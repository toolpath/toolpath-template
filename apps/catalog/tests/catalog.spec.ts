import { expect, test } from '@playwright/test'

test('browses, filters, and keeps the selection in the URL', async ({ page }) => {
  await page.goto('/')

  const status = page.getByRole('status')
  await expect(status).toContainText('tools')

  await page.getByRole('textbox', { name: 'Search tools' }).fill('TDMX')
  await expect(page).toHaveURL(/q=TDMX/)

  const rows = page.getByRole('table').getByRole('row')
  await expect(rows).not.toHaveCount(0)
})

test('opens a tool and explains the vendor’s codes', async ({ page }) => {
  await page.goto('/')

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
  await page.goto('/')
  await page.getByRole('table').getByRole('link').first().click()
  await expect(page).toHaveURL(/\/tools\//)
  const url = page.url()

  await page.goto(url)

  await expect(page.getByRole('table')).toContainText('Cutting diameter')
})

test('switches every dimension between millimetres and inches', async ({ page }) => {
  await page.goto('/')

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
  await page.goto('/')
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
