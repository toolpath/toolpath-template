import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicInspectionReport } from '@toolpath/part-contracts'
import { forgetPart, rememberPart } from 'shared/part-session'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('react-router', () => ({
  NavLink: ({ children }: { children: unknown }) => <a>{children as never}</a>,
  useNavigate: () => navigate,
}))

const { AppHeader } = await import('./app-header')

afterEach(() => {
  forgetPart()
  navigate.mockReset()
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
