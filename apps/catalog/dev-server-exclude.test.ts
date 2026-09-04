import { describe, expect, it } from 'vitest'
import { leftToVite } from './dev-server-exclude'

/**
 * The URLs that blacked the tab on 2026-08-30 — a hot update of a `?raw`
 * sheet, and the bare sheet — must be Vite's; a document must still be the
 * app's. The adapter's own list is copied into ours, so this also pins that
 * nothing it used to exclude is lost.
 */
describe('what the dev server leaves to Vite', () => {
  it('leaves every hot update and imported asset to Vite', () => {
    for (const url of [
      '/app/shared/rules.csv?raw&t=1756500000000',
      '/app/shared/knobs.csv?import&raw&t=2',
      '/app/shared/rules.csv?raw',
      '/app/shared/rules.csv',
      '/app/routes/part.tsx',
      '/app/styles.css?t=3',
      '/@vite/client',
      '/@fs/Users/x/packages/catalog-data/dist/index.js',
      '/node_modules/.vite/deps/react.js?v=abc',
      '/assets/app-123.js',
    ]) {
      expect(leftToVite(url), url).toBe(true)
    }
  })

  it('leaves a document to the app', () => {
    for (const url of ['/', '/parts', '/parts/part-1?job=job-1', '/api/session']) {
      expect(leftToVite(url), url).toBe(false)
    }
  })
})
