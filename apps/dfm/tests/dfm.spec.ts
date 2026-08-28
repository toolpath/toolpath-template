import { expect, test } from '@playwright/test'
import { SIDE, UP, faces, feature, report, richHole, uploadTo } from './part-fixture'

/**
 * The way in, end to end — and the two things that must never reach the page.
 *
 * The report and the whole route table used to be written out here by hand,
 * alongside a second copy in `viewport-reach`. Both are in `part-fixture` now:
 * this spec is about the *path*, and a sixty-line datasheet in front of it was
 * sixty lines nobody read.
 */
const part = report({
  regions: faces(2),
  candidateDirections: [UP, SIDE],
  features: [richHole('hole-1', UP, [0]), feature('wall-1', 'Wall', SIDE, [1])],
})

test('connects, uploads, opens a redacted inspector, and focuses a feature', async ({ page }) => {
  // The key is asserted absent below, so it is worth it being recognisable.
  await uploadTo(page, part, { key: 'tp_key_must_not_render' })

  // The key was typed into this page and must not survive into it: the session
  // is a sealed cookie, and the browser is never given the key back.
  await expect(page.locator('body')).not.toContainText('tp_key_must_not_render')

  // The summary counts the types; opening one lists its features, and choosing
  // one reads it on the right. Nothing is read until somebody asks for it —
  // the panel opens on an invitation rather than on a guess.
  // The datasheet's own invitation, not the mapping panel's — both say "click a
  // face" now, and this test is about the one below.
  await expect(page.getByText('Click a face on the part, or a feature in the list')).toBeVisible()
  await page.getByRole('button', { name: /BlindHole/ }).click()
  await page
    .getByRole('button', { name: /wall-1|hole-1/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Blind Hole' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('signature=')
  await page.getByRole('link', { name: 'Upload another part' }).click()
  await expect(page.getByLabel('CAD file')).toBeVisible()
})
