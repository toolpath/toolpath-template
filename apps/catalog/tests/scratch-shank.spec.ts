import { test } from '@playwright/test'
import { openCube } from './cube-fixture'

test.use({ viewport: { width: 1680, height: 1000 } })

test('shank filter', async ({ page }) => {
  await openCube(page)
  await page.waitForTimeout(2200)
  const before = await page.locator('tbody tr').count()
  await page
    .getByRole('button', { name: /^Shank/ })
    .first()
    .click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Reduced', exact: true }).click()
  await page.waitForTimeout(600)
  console.log('URL', new URL(page.url()).searchParams.getAll('shank').join(','))
  console.log(
    'PRESSED',
    await page.getByRole('button', { name: 'Reduced', exact: true }).getAttribute('aria-pressed'),
  )
  console.log('ROWS', before, '->', await page.locator('tbody tr').count())
  console.log(
    'BUBBLES',
    JSON.stringify(await page.locator('[data-rail-item] > button').allInnerTexts()),
  )
})
