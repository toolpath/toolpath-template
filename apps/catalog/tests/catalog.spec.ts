import { expect, test } from '@playwright/test'

/**
 * Clean paths on a static host only work if unknown paths fall back to
 * `index.html`. This is the check that a deploy which forgets that rewrite
 * fails here rather than in front of a user.
 */
test('survives a reload on a deep link', async ({ page }) => {
  const url = '/parts/part-1'

  await page.goto(url)

  await expect(page.getByRole('alert')).toContainText('No analysis job was supplied')
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

test('opens on the part upload, with no catalog tabs', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Toolpath API key')).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Catalog' })).toHaveCount(0)
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Families' })).toHaveCount(0)
})
