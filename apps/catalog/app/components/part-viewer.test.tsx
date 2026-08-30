import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PublicInspectionReport } from '@toolpath/part-contracts'

/**
 * What the viewer hands the viewer package, pinned.
 *
 * The 3D scene cannot be rendered here, so the package's components are
 * replaced with spies and the assertions are about **the props that reach
 * them**. That is exactly the seam that failed on 2026-08-28: `DirectionArrows`
 * was drawn without `onPickDirection`, so the arrows were scenery — a click on
 * one fell through to the mesh behind it, and three rounds of fixes downstream
 * could not make a control work that was never wired. A prop that is not
 * passed is not a behaviour anybody can test by clicking.
 */
const seen = vi.hoisted(() => ({
  arrows: vi.fn(),
  part: vi.fn(),
}))

vi.mock('@toolpath/viewer', () => ({
  Viewer: ({ children }: { children: unknown }) => (
    <div data-testid="viewer">{children as never}</div>
  ),
  DirectionArrows: (props: unknown) => {
    seen.arrows(props)
    return null
  },
  Axes: () => null,
  Grid: () => null,
  ViewCube: () => null,
  sectionFromPick: (plane: unknown) => plane,
}))

vi.mock('@toolpath/viewer/engine', () => ({
  EnginePart: (props: { onPick: (pick: unknown) => void }) => {
    seen.part(props)
    return (
      <button type="button" onClick={() => props.onPick(null)}>
        the mesh
      </button>
    )
  },
}))

const { PartViewer } = await import('./part-viewer')

const DOWN = { x: 0, y: 0, z: 1 }
const SIDE = { x: 1, y: 0, z: 0 }

const report = {
  partId: 'part-1',
  reportId: 'report-1',
  jobId: 'job-1',
  units: { length: 'mm', angle: 'deg' },
  hasMeshGlb: true,
  hasMeshStl: false,
  hasThumbnail: false,
  candidateDirections: [DOWN, SIDE],
  features: [],
  regions: [],
} as unknown as PublicInspectionReport

const show = (over: Partial<Parameters<typeof PartViewer>[0]> = {}) => {
  const onPickDirection = vi.fn()
  const onPickFace = vi.fn()
  const onClear = vi.fn()
  render(
    <PartViewer
      report={report}
      jobId="job-1"
      selected={new Set()}
      heldRegions={[]}
      hovered={null}
      arrows={{ visible: true, shown: 1, active: 1 }}
      onPickDirection={onPickDirection}
      directionColor={null}
      onPickFace={onPickFace}
      onClear={onClear}
      {...over}
    />,
  )
  return { onPickDirection, onPickFace, onClear }
}

describe('what reaches the viewer package', () => {
  it('wires the arrows to the handler, so pressing one is a press', () => {
    const { onPickDirection } = show()

    const props = seen.arrows.mock.lastCall?.[0] as Record<string, unknown>
    expect(props.onPickDirection).toBe(onPickDirection)
    expect(props.directions).toBe(report.candidateDirections)
  })

  /**
   * `activeDirection` is what takes the other arrows away, so it carries the
   * *scope* — an arrow somebody pressed — and never the way up a reading merely
   * happens to be cut from, which is `shownDirection`'s job.
   */
  it('scopes the arrows by what was pressed, and points by what is read', () => {
    show({ arrows: { visible: true, shown: 0, active: null } })

    const props = seen.arrows.mock.lastCall?.[0] as Record<string, unknown>
    expect(props.activeDirection).toBeNull()
    expect(props.shownDirection).toBe(0)
    expect(props.visible).toBe(true)
  })

  /** A miss on the mesh is the part's to report; it is not a clear. */
  it('hands a miss on the mesh to the face handler, not to clear', () => {
    const { onPickFace, onClear } = show()

    fireEvent.click(screen.getByRole('button', { name: 'the mesh' }))

    expect(onPickFace).toHaveBeenCalledWith(null)
    expect(onClear).not.toHaveBeenCalled()
  })

  it('draws no scene for a report with no mesh, and says so', () => {
    seen.arrows.mockClear()
    show({ report: { ...report, hasMeshGlb: false } as PublicInspectionReport })

    expect(screen.getByText(/no viewable mesh/)).toBeInTheDocument()
    expect(seen.arrows).not.toHaveBeenCalled()
  })
})
