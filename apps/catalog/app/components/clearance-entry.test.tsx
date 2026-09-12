import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ClearanceBoxes } from 'shared/clearance-entry'
import { ClearanceEntry } from './clearance-entry'

/**
 * The one line the row has to say, and the defect it was written for.
 *
 * A stickout typed too short read **"under the 0.02 in wanted"** — the sheet's
 * own figure, read back off a box nobody had touched, to somebody who had just
 * been told the stack fouls the part (Paul, 2026-09-11). What the length box
 * knows is the length that clears, so that is what it says.
 */
const boxesWith = (
  below: Partial<ClearanceBoxes['below']>,
  room: { readonly axial: number; readonly radial: number },
): ClearanceBoxes => ({
  below: { entered: null, value: 20, clamped: false, overLimit: false, ...below },
  axial: {
    entered: null,
    value: room.axial,
    asked: 0.508,
    short: room.axial < 0.508,
    held: null,
  },
  radial: {
    entered: null,
    value: room.radial,
    asked: 0.508,
    short: room.radial < 0.508,
    held: null,
  },
})

/** The three boxes are folded away until somebody opens them. */
const open = () => fireEvent.click(screen.getByRole('button', { name: /Clearance/ }))

describe('the line under the three boxes', () => {
  it('names the length to set instead of the clearance that came up short', () => {
    render(
      <ClearanceEntry
        boxes={boxesWith({ entered: 12, value: 12 }, { axial: 0.1, radial: 0.9 })}
        unit="inches"
        edit={{ field: 'below', value: 12 }}
        clearsAt={24.003}
        onEdit={() => {}}
      />,
    )
    open()

    expect(screen.getByText('collision at this stickout. Increase to 0.945 in')).toBeInTheDocument()
    expect(screen.queryByText(/under the/)).not.toBeInTheDocument()
  })

  /** Telling somebody to increase to a length that still fouls would be worse. */
  it('says so plainly where no length this tool takes clears', () => {
    render(
      <ClearanceEntry
        boxes={boxesWith({ entered: 12, value: 12 }, { axial: 0.1, radial: 0.9 })}
        unit="inches"
        edit={{ field: 'below', value: 12 }}
        clearsAt={null}
        onEdit={() => {}}
      />,
    )
    open()

    expect(
      screen.getByText('collision at this stickout, and no length this tool can be set to clears'),
    ).toBeInTheDocument()
  })

  /**
   * A stated clearance is a different question — it drives the length, and the
   * box that came up short is the *other* axis, which the length cannot answer.
   */
  it('leaves a short axis to say so where the length was not the entry', () => {
    render(
      <ClearanceEntry
        boxes={boxesWith({}, { axial: 2, radial: 0.1 })}
        unit="inches"
        edit={{ field: 'axial', value: 2 }}
        clearsAt={null}
        onEdit={() => {}}
      />,
    )
    open()

    expect(screen.getByText('under the 0.020 in wanted')).toBeInTheDocument()
  })
})
