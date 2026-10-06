import { expect, test, type Page } from '@playwright/test'
import { OTHER_ACCOUNT_KEY, OWNER_KEY, openCube, openCubeSignedOut } from './cube-fixture'

/**
 * A part opened by its link — from another Toolpath application, a bookmark, a
 * link somebody sent — by somebody this application has no connection for yet.
 *
 * Its analysis is read with the connection's key, so before 2026-10-06 the page
 * opened the analysis stream regardless, was refused, and said only "Your
 * session expired" over a link back to the upload: no way to give a key and see
 * the part. The page now asks for the key itself and opens the part once it
 * connects (`routes/part.tsx`, `OpenedByLink`).
 */

test.use({ viewport: { width: 1680, height: 1000 } })

const keyField = (page: Page) => page.getByLabel('Toolpath API key')

const connectWith = async (page: Page, key: string) => {
  await keyField(page).fill(key)
  await page.getByRole('button', { name: 'Connect' }).click()
}

test('asks for a key on the part page, and opens the part once it connects', async ({ page }) => {
  const connection = await openCubeSignedOut(page)

  await expect(page.getByRole('heading', { name: 'Connect to open this part' })).toBeVisible()
  await expect(keyField(page)).toBeVisible()
  // Nothing is asked of the part server for the part until there is a key to read it with.
  expect(connection.requests).not.toContain('GET /api/parts/part-1/events')

  await connectWith(page, OWNER_KEY)

  await expect(page.locator('canvas')).toBeVisible()
  await expect(keyField(page)).toHaveCount(0)
  expect(connection.requests).toContain('POST /api/session')
  expect(connection.requests.indexOf('GET /api/parts/part-1/events')).toBeGreaterThan(
    connection.requests.indexOf('POST /api/session'),
  )
})

/**
 * The start page tries a shared demo key before it asks; this page must not. A
 * demo session is a throwaway account of its own, which can never see a part
 * another key uploaded — it would only turn "connect" into "fails to open".
 */
test('never tries a demo key for a part opened by its link', async ({ page }) => {
  const connection = await openCubeSignedOut(page)

  await expect(keyField(page)).toBeVisible()
  await connectWith(page, OWNER_KEY)
  await expect(page.locator('canvas')).toBeVisible()

  expect(connection.requests).not.toContain('POST /api/session/demo')
})

test('keeps the form, with the reason, when the key is refused', async ({ page }) => {
  const connection = await openCubeSignedOut(page)

  await connectWith(page, 'not-a-key')

  await expect(page.getByRole('alert')).toHaveText(
    'This API key is not valid. Check it and try again.',
  )
  await expect(keyField(page)).toBeVisible()
  expect(connection.requests).not.toContain('GET /api/parts/part-1/events')

  await connectWith(page, OWNER_KEY)
  await expect(page.locator('canvas')).toBeVisible()
})

/**
 * A key from another account connects — the part server only checks that a
 * key is valid — and then cannot see the part, which the Engine answers with
 * a 404. The page cannot tell that from any other failed analysis, so it says
 * what to do about the likely one and offers the way to do it.
 */
test('offers a different key when the connected one cannot see the part', async ({ page }) => {
  const connection = await openCubeSignedOut(page)

  await connectWith(page, OTHER_ACCOUNT_KEY)

  await expect(page.getByRole('alert')).toHaveText('Toolpath Engine request failed (HTTP 404).')
  await page.getByRole('button', { name: 'Use a different key' }).click()

  await expect(keyField(page)).toBeVisible()
  expect(connection.requests).toContain('DELETE /api/session')

  await connectWith(page, OWNER_KEY)
  await expect(page.locator('canvas')).toBeVisible()
})

test('opens at once, with no form, when the connection is already there', async ({ page }) => {
  await openCube(page)

  await expect(page.locator('canvas')).toBeVisible()
  await expect(keyField(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Connect to open this part' })).toHaveCount(0)
})
