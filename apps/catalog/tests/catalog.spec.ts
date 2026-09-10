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

/**
 * **The bundle goes out compressed** (Paul, 2026-09-09, on the part page
 * loading slowly).
 *
 * The tool data is bundled at build time, so the chunk holding it is ~25 MB of
 * JSON, and the matcher worker imports the same module — ~50 MB crossing the
 * wire on a first visit, uncompressed. Gzipped it is about a twelfth of that.
 *
 * Asserted on the biggest script the shell asks for rather than on a named
 * file, because the chunk's name is a build hash and which chunk holds the
 * dataset is Rollup's business.
 */
test('serves its scripts compressed', async ({ page }) => {
  const scripts: Array<{ size: number; encoding: string | null }> = []
  page.on('response', (response) => {
    const type = response.headers()['content-type'] ?? ''
    if (type.includes('javascript')) {
      scripts.push({
        size: Number(response.headers()['content-length'] ?? '0'),
        encoding: response.headers()['content-encoding'] ?? null,
      })
    }
  })

  await page.goto('/parts')
  await expect(page.getByLabel('Toolpath API key')).toBeVisible()

  expect(scripts.length).toBeGreaterThan(0)
  // Every one of them: the threshold in the middleware is a kilobyte, and a
  // script smaller than that is not what this is guarding.
  expect(scripts.filter((each) => each.encoding === null && each.size > 1024)).toEqual([])
})
