import { type Page, expect, test } from '@playwright/test'
import { analysisEvent, openStream } from './part-fixture'

/**
 * What the part page says while it is not a part yet.
 *
 * Every other spec here opens on a `ready` report, because that is where the
 * app is. The three states before it — waiting, refused, and asked for without
 * a job — had no coverage at any level: `server/app.test.ts` proves the server
 * *maps* a queued or failed Engine job onto the wire, and then nothing asserted
 * that the browser draws anything at all when it receives one.
 *
 * They are the states a user meets on a bad day, which is exactly when a blank
 * screen costs the most.
 */
/**
 * A stream that stays open, which a routed response cannot be.
 *
 * `pending` is the one status the app does *not* close the stream on — it is
 * still waiting — so fulfilling the request with a body ends the response and
 * the hook rightly reports a dropped connection instead. That behaviour is
 * pinned below; reaching the waiting card itself needs a stream that does not
 * end, so these two tests script `EventSource` and leave it open.
 *
 * The parse, the state machine and the card are all still the app's. Only the
 * transport is stood in for, and the four tests after these drive the real one.
 */
const waitingOn = async (page: Page, data: unknown) => {
  await page.addInitScript((event) => {
    class ScriptedEventSource extends EventTarget {
      close() {}
      constructor() {
        super()
        queueMicrotask(() => {
          this.dispatchEvent(Object.assign(new Event('analysis'), { data: JSON.stringify(event) }))
        })
      }
    }
    Object.defineProperty(window, 'EventSource', { value: ScriptedEventSource, writable: true })
  }, data)

  await page.route('**/api/session', (route) => route.fulfill({ json: { connected: true } }))
  await page.goto('/parts/part-1?job=job-1')
}

test('says how far along an analysis is while it runs', async ({ page }) => {
  await waitingOn(page, { status: 'pending', progress: 0.42, message: 'Recognizing features' })

  await expect(page.getByRole('heading', { name: 'Recognizing features' })).toBeVisible()
  // Rounded, because a percentage with decimals is a number nobody reads and a
  // width nobody budgeted for.
  await expect(page.getByText('42%')).toBeVisible()
})

test('waits without a number when the Engine has not said how far along it is', async ({
  page,
}) => {
  // `progress` is nullable on the wire and a null must not render as `0%`,
  // which reads as "stuck at the start" rather than "no estimate yet".
  await waitingOn(page, { status: 'pending', progress: null, message: 'Queued behind other work' })

  await expect(page.getByRole('heading', { name: 'Queued behind other work' })).toBeVisible()
  await expect(page.getByText(/^\d+%$/)).toHaveCount(0)
})

test('reports a stream that ends mid-analysis rather than waiting on it', async ({ page }) => {
  /*
   * The real transport, cut off after a `pending` event — a proxy timing the
   * connection out, which is what the routed response above does naturally.
   * The app is still waiting at that point, so nothing has closed the stream
   * and `EventSource` would otherwise retry it silently for ever.
   */
  await openStream(
    page,
    analysisEvent({ status: 'pending', progress: 0.1, message: 'Recognizing features' }),
  )

  await expect(page.getByRole('heading', { name: 'This part could not be opened' })).toBeVisible()
  await expect(page.getByText(/connection was interrupted/)).toBeVisible()
})

test('says why a part could not be opened, and offers the way back', async ({ page }) => {
  await openStream(
    page,
    analysisEvent({ status: 'failed', message: 'The CAD source could not be read.' }),
  )

  await expect(page.getByRole('heading', { name: 'This part could not be opened' })).toBeVisible()
  // The Engine's own words rather than a generic apology: "could not be read"
  // is something a person can act on by re-exporting.
  await expect(page.getByText('The CAD source could not be read.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Upload another part' })).toHaveAttribute('href', '/')
})

test('refuses a part asked for without a job, rather than waiting for a stream', async ({
  page,
}) => {
  /*
   * A bookmarked or hand-edited `/parts/:id` with no `?job=`. There is nothing
   * to subscribe to, so the alternative to saying so is a spinner that never
   * resolves.
   */
  await page.route('**/api/session', (route) => route.fulfill({ json: { connected: true } }))
  await page.goto('/parts/part-1')

  await expect(page.getByRole('heading', { name: 'This part could not be opened' })).toBeVisible()
  await expect(page.getByText('No analysis job was supplied for this part.')).toBeVisible()
})

test('treats an update it cannot read as a failure, not as silence', async ({ page }) => {
  // The parse is the app's boundary against its own server. A malformed event
  // that only closed the stream would leave the page waiting for ever.
  await openStream(page, 'event: analysis\ndata: {"status":"who knows"}\n\n')

  await expect(page.getByRole('heading', { name: 'This part could not be opened' })).toBeVisible()
  await expect(page.getByText(/returned an invalid update/)).toBeVisible()
})

test('says the session expired when the stream will not open', async ({ page }) => {
  /*
   * The one failure that never arrives as an `analysis` event: the connection
   * cookie is gone, so the request is refused before the stream begins.
   * `EventSource` retries a failed connection for ever by default, which is
   * what makes closing it and saying so the behaviour worth pinning.
   */
  await openStream(page, null)

  await expect(page.getByRole('heading', { name: 'This part could not be opened' })).toBeVisible()
  await expect(page.getByText(/session expired or the connection was interrupted/)).toBeVisible()
})
