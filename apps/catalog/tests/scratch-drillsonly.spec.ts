import { test } from '@playwright/test'
import { openCube } from './cube-fixture'

test.use({ viewport: { width: 1680, height: 1000 } })

test('drills only', async ({ page }) => {
  await openCube(page)
  await page.waitForTimeout(2200)
  const box = (await page.locator('canvas').boundingBox())!
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.waitForTimeout(250)
    if (await page.getByText(/^Cuts the /).count()) {
      break
    }
  }
  console.log('READING', await page.getByText(/^Cuts the /).textContent())
  console.log('MODES', await page.getByRole('button', { name: 'Cut tap' }).count())
  console.log('URL BEFORE', new URL(page.url()).searchParams.getAll('form').join(','))
})
