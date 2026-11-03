import { expect, test, type Page } from '@playwright/test'
import { serveAnalysis } from './cube-fixture'

/**
 * A file holding several solid bodies is not a dead end: the Engine lists them,
 * and the part is made again of the one chosen, by sending the file again with
 * that body's index (`components/body-picker.tsx`).
 */

test.use({ viewport: { width: 1680, height: 1000 } })

const box = { lower: { x: 0, y: 0, z: 0 }, upper: { x: 40, y: 15, z: 8 } }
const choice = {
  status: 'failed',
  message: 'This file holds 2 solid bodies. Choose the one to machine.',
  bodies: [
    { index: 0, name: null, faceCount: 6, boundingBox: box },
    { index: 1, name: 'Bracket', faceCount: 24, boundingBox: box },
  ],
}

const cad = { name: 'bodies.step', mimeType: 'model/step', buffer: Buffer.from('STEP fixture') }

/** Part creation and the direct upload, making the parts named in turn; returns each request's body. */
const servePartCreation = async (page: Page, partIds: Array<string>): Promise<Array<unknown>> => {
  const created: Array<unknown> = []
  await page.route('**/api/parts**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/parts' && request.method() === 'POST') {
      created.push(request.postDataJSON())
      return route.fulfill({
        status: 201,
        json: { partId: partIds[created.length - 1], uploadUrl: 'https://upload.test/source' },
      })
    }
    const started = /^\/api\/parts\/(part-\d+)$/.exec(url.pathname)
    if (started && request.method() === 'PATCH') {
      const partId = started[1]!
      return route.fulfill({ status: 202, json: { partId, jobId: partId.replace('part', 'job') } })
    }
    return route.fallback()
  })
  await page.route('https://upload.test/source', (route) => route.fulfill({ status: 200 }))
  return created
}

test('offers the bodies of an uploaded file, and uploads it again for the one chosen', async ({
  page,
}) => {
  await serveAnalysis(page, choice)
  const created = await servePartCreation(page, ['part-1', 'part-2'])

  await page.goto('/')
  await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)
  await expect(page).toHaveURL(/\/parts\/part-1\?job=job-1/)

  await expect(page.getByRole('heading', { name: /holds 2 solid bodies/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Body 1/ })).toBeVisible()
  await page.getByRole('button', { name: /Bracket/ }).click()

  // The file this tab uploaded is sent again; nothing asks for it a second time.
  await expect(page).toHaveURL(/\/parts\/part-2\?job=job-2/)
  expect(created).toEqual([{ filename: 'bodies.step' }, { filename: 'bodies.step', bodyIndex: 1 }])
})

test('asks for the file again for a part opened by its link', async ({ page }) => {
  await serveAnalysis(page, choice)
  const created = await servePartCreation(page, ['part-2'])

  await page.goto('/parts/part-1?job=job-1')
  await page.getByRole('button', { name: /Bracket/ }).click()

  await expect(page.getByText('Choose the file again to open Bracket.')).toBeVisible()
  expect(created).toEqual([])
  await page.getByLabel('Choose or drop a CAD file').setInputFiles(cad)

  await expect(page).toHaveURL(/\/parts\/part-2\?job=job-2/)
  expect(created).toEqual([{ filename: 'bodies.step', bodyIndex: 1 }])
})
