import { test } from '@playwright/test'
import { openCube } from './cube-fixture'

const OUT =
  '/private/tmp/claude-501/-Users-paulclauss-dev-tool-catalog/3d10a82c-4f8f-47a4-82c8-ffed39069870/scratchpad'
test.use({ viewport: { width: 1680, height: 800 } })

test('sections scroll', async ({ page }) => {
  await openCube(page)
  await page.waitForTimeout(2500)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('div')]
      .filter((each) => each.querySelector('table') !== null)
      .map(
        (each) => `${getComputedStyle(each).overflowY}:${each.scrollHeight}/${each.clientHeight}`,
      )
      .filter((each) => each.startsWith('auto') || each.startsWith('hidden')),
  )
  console.log('BOXES', boxes.join(' '))
  console.log('ROWS', await page.locator('tbody tr').count())
  await page.screenshot({ path: `${OUT}/scrollable.png` })
})
