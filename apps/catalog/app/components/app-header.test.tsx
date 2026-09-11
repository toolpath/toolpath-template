import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicInspectionReport } from '@toolpath/part-contracts'
import { forgetPart, rememberPart } from 'shared/part-session'

const navigate = vi.hoisted(() => vi.fn())
const route = vi.hoisted(() => ({
  partId: undefined as string | undefined,
  job: null as string | null,
}))

vi.mock('react-router', () => ({
  NavLink: ({ children, to }: { children: unknown; to: string }) => (
    <a href={to}>{children as never}</a>
  ),
  useNavigate: () => navigate,
  useParams: () => ({ partId: route.partId }),
  useSearchParams: () => [new URLSearchParams(route.job === null ? '' : `job=${route.job}`)],
}))

const { AppHeader } = await import('./app-header')

afterEach(() => {
  forgetPart()
  navigate.mockReset()
  route.partId = undefined
  route.job = null
})

describe('the upload control', () => {
  it('returns to the remembered viewer with its uploader open', () => {
    rememberPart({
      partId: 'part-1',
      jobId: 'job-1',
      report: {} as PublicInspectionReport,
    })
    render(<AppHeader unit="millimeters" onUnit={vi.fn()} toolCount={42} />)

    fireEvent.click(screen.getByRole('button', { name: 'Upload part' }))

    expect(navigate).toHaveBeenCalledWith('/parts/part-1?job=job-1&upload=1')
  })

  it('keeps the theme control at the header touch target size', () => {
    render(<AppHeader unit="millimeters" onUnit={vi.fn()} toolCount={42} />)

    expect(screen.getByRole('button', { name: /Switch to/ })).toHaveClass(
      '!size-7',
      '[&_svg]:!size-4',
    )
  })
})

/**
 * **The way back to the part is the part** (Paul, 2026-09-09: "when I go from
 * the order list to the parts page, it prompts me to upload a new part. It
 * should just go back to the part I was working on").
 *
 * The session holding the report is memory-only, so a reload on the order list
 * emptied it and both tabs fell back to `/parts` — the upload form — while the
 * URL still said which part the list was for.
 */
describe('the tabs', () => {
  it('link to the part in the URL with no session behind them', () => {
    route.partId = 'part-1'
    route.job = 'job-1'
    render(<AppHeader unit="millimeters" onUnit={vi.fn()} toolCount={42} />)

    expect(screen.getByRole('link', { name: 'Part' })).toHaveAttribute(
      'href',
      '/parts/part-1?job=job-1',
    )
    expect(screen.getByRole('link', { name: 'Order list' })).toHaveAttribute(
      'href',
      '/parts/part-1/order-list?job=job-1',
    )
  })

  it('offer the upload where no part is open at all', () => {
    render(<AppHeader unit="millimeters" onUnit={vi.fn()} toolCount={42} />)

    expect(screen.getByRole('link', { name: 'Parts' })).toHaveAttribute('href', '/parts')
  })
})

/**
 * **One setting with two states, so the kit's `Toggle`** (Paul, 2026-09-11:
 * "the mm/in toggle should use the toggle component from @toolpath/ui"). It was
 * two `Chip`s side by side, which is two buttons that happen to be drawn next
 * to each other — the kit's control slides an indicator between the two and
 * takes the keyboard with it.
 *
 * The group around it is load-bearing: the kit makes a two-item toggle a
 * `role="switch"` and takes no name of its own, so without it the header offers
 * a switch that says only "mm".
 */
describe('the unit control', () => {
  it('is the kit toggle, named, with the current unit selected', () => {
    render(<AppHeader unit="millimeters" onUnit={vi.fn()} toolCount={42} />)

    const units = screen.getByRole('group', { name: 'Units' })
    expect(within(units).getByRole('switch')).toBeVisible()
    expect(within(units).getByRole('button', { name: 'mm' })).toHaveAttribute('data-selected')
    expect(within(units).getByRole('button', { name: 'in' })).toHaveAttribute('data-unselected')
  })

  it('asks for the other unit when the other one is pressed', () => {
    const onUnit = vi.fn()
    render(<AppHeader unit="millimeters" onUnit={onUnit} toolCount={42} />)

    fireEvent.click(screen.getByRole('button', { name: 'in' }))

    expect(onUnit).toHaveBeenCalledWith('inches')
  })
})
