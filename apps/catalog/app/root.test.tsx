import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'
import App, { BOOT_WATCHDOG, ErrorBoundary, HydrateFallback } from './root'

/**
 * A single-page application whose server sends an empty page has exactly one
 * chance to say what went wrong, and on 2026-08-29 it did not take it: Vite
 * served outdated optimised dependencies and every page was black. These pin
 * that a failure is words on the screen.
 */
describe('when the application cannot start', () => {
  it('says what a thrown response was, and what to try', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => null,
        ErrorBoundary,
        loader: () => {
          throw new Response('Error: No route matches URL "/nowhere"', {
            status: 404,
            statusText: 'Not Found',
          })
        },
      },
    ])
    render(<Stub initialEntries={['/']} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('404 Not Found')
    expect(alert).toHaveTextContent('No route matches URL "/nowhere"')
    expect(alert).toHaveTextContent('Reload the page')
  })

  it('says what a thrown error was', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        Component: () => null,
        ErrorBoundary,
        loader: () => {
          throw new Error('Failed to fetch dynamically imported module')
        },
      },
    ])
    render(<Stub initialEntries={['/']} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(alert).toHaveTextContent('Failed to fetch dynamically imported module')
  })

  it('shows that it is loading rather than nothing', () => {
    render(<HydrateFallback />)

    expect(screen.getByText(/Loading the catalog/)).toBeInTheDocument()
  })

  /**
   * The watchdog runs before React does, as plain script in the document, so
   * it must find the fallback by id, look for the mark the application sets,
   * and say what to do — none of which can depend on a module loading.
   */
  it('has a watchdog that needs no module: it names the fallback, the mark, and the fix', () => {
    expect(BOOT_WATCHDOG).toContain("getElementById('boot-status')")
    expect(BOOT_WATCHDOG).toContain("getAttribute('data-hydrated')")
    expect(BOOT_WATCHDOG).toContain('Reload the page')
    expect(BOOT_WATCHDOG).toContain('pnpm dev:catalog')
    expect(BOOT_WATCHDOG).not.toContain('import')
    const { container } = render(<HydrateFallback />)
    expect(container.querySelector('#boot-status')).not.toBeNull()
  })

  it('marks the body once the application is mounted, which is what the watchdog looks for', () => {
    const Stub = createRoutesStub([{ path: '/', Component: App }])
    render(<Stub initialEntries={['/']} />)

    expect(document.body.getAttribute('data-hydrated')).toBe('true')
  })
})
