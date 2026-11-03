import { expect, test } from '@playwright/test'
import { fileBody, openCube, serveCube, serveUpload } from './cube-fixture'

/**
 * Every upload goes through a file, and a file holding several solid bodies is
 * not a dead end: its inspection lists them on the uploader's stage, and the
 * part is made of the one chosen, by its index, without the file being sent
 * again (`components/body-picker.tsx`).
 */

test.use({ viewport: { width: 1680, height: 1000 } })

const cad = { name: 'bodies.step', mimeType: 'model/step', buffer: Buffer.from('STEP fixture') }
const twoBodies = { status: 'ready', bodies: [fileBody(0), fileBody(1, 'Bracket')] }

test('offers the bodies of an uploaded file, and makes a part of the one chosen', async ({
  page,
}) => {
  await serveCube(page)
  const made = await serveUpload(page, twoBodies)

  await page.goto('/')
  await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)

  await expect(page.getByRole('heading', { name: /holds 2 solid bodies/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Body 1/ })).toBeVisible()
  expect(made).toEqual([])
  await page.getByRole('button', { name: /Bracket/ }).click()

  await expect(page).toHaveURL(/\/parts\/part-1\?job=job-1/)
  expect(made).toEqual([{ bodyIndex: 1 }])
})

test('opens the part of a one-body file without asking which', async ({ page }) => {
  await serveCube(page)
  const made = await serveUpload(page, { status: 'ready', bodies: [fileBody(0)] })

  await page.goto('/')
  await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)

  await expect(page).toHaveURL(/\/parts\/part-1\?job=job-1/)
  expect(made).toEqual([{ bodyIndex: 0 }])
})

test('goes back from the bodies to choosing a different file', async ({ page }) => {
  await serveCube(page)
  await serveUpload(page, twoBodies)

  await page.goto('/')
  await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)
  await page.getByRole('button', { name: 'Choose a different file' }).click()

  await expect(page.getByLabel('Choose or drop a CAD file')).toBeAttached()
  await expect(page.getByRole('heading', { name: /solid bodies/ })).toHaveCount(0)
})

/**
 * A failed inspection, streamed as the server streams it — `pending` first —
 * and read where a person reads it: on screen, in the viewport, at the size a
 * headless browser opens at. `toHaveText` alone passed on text nobody could see.
 */
const failedInspection = [
  { status: 'pending', progress: null, message: 'Inspection is queued…' },
  {
    status: 'failed',
    message: 'Could not follow the inspection of this file. Upload it again.',
  },
]

test.describe('at the default window size', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('says why a file could not be read, and makes no part', async ({ page }) => {
    await serveCube(page)
    const made = await serveUpload(page, failedInspection)

    await page.goto('/')
    await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)

    const alert = page.getByRole('alert')
    await expect(alert).toHaveText('Could not follow the inspection of this file. Upload it again.')
    await expect(alert).toBeInViewport()
    // The chooser is back for another try, and the reason stays beside it.
    await expect(page.getByText('Choose or drop a CAD file')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(alert).toBeInViewport()
    expect(made).toEqual([])
  })

  test('says why a replacement file could not be read, over the part', async ({ page }) => {
    await openCube(page, '&upload=1')
    const made = await serveUpload(page, failedInspection, 'part-2')

    await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)

    const alert = page.getByRole('alert')
    await expect(alert).toHaveText('Could not follow the inspection of this file. Upload it again.')
    await expect(alert).toBeInViewport()
    await expect(page).toHaveURL(/\/parts\/part-1\?job=job-1/)
    expect(made).toEqual([])
  })
})

test('offers the bodies when replacing the part, and opens the one chosen', async ({ page }) => {
  await openCube(page, '&upload=1')
  const made = await serveUpload(page, twoBodies, 'part-2')

  await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)
  await expect(page.getByRole('heading', { name: /holds 2 solid bodies/ })).toBeVisible()
  await page.getByRole('button', { name: /Bracket/ }).click()

  await expect(page).toHaveURL(/\/parts\/part-2\?job=job-2/)
  expect(made).toEqual([{ bodyIndex: 1 }])
})
