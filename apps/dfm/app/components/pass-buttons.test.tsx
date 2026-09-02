// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PassButtons } from './pass-buttons'
import type { Pass } from 'shared/setups'

/**
 * The three presses a mapping is made of. §3.7 of the parity plan is the spec:
 * R and F are separate claims, pressing what is already held unsays it, and
 * Both is one update rather than two.
 */
afterEach(cleanup)

const setup = (rough: boolean | 'some', finish: boolean | 'some') => {
  const onSetPass = vi.fn<(passes: ReadonlyArray<Pass>) => void>()
  render(<PassButtons label="+Z" rough={rough} finish={finish} onSetPass={onSetPass} />)
  return onSetPass
}

describe('assigning a reading', () => {
  it('asks for one pass at a time', () => {
    const onSetPass = setup(false, false)

    fireEvent.click(screen.getByRole('button', { name: 'R' }))
    expect(onSetPass).toHaveBeenCalledWith(['rough'])

    fireEvent.click(screen.getByRole('button', { name: 'F' }))
    expect(onSetPass).toHaveBeenCalledWith(['finish'])
  })

  it('asks for both in one call, never two', () => {
    // Two calls from one snapshot lose the first — the picker shipped that bug
    // and §8 lists it. One list, one update.
    const onSetPass = setup(false, false)

    fireEvent.click(screen.getByRole('button', { name: 'Both' }))

    expect(onSetPass).toHaveBeenCalledTimes(1)
    expect(onSetPass).toHaveBeenCalledWith(['rough', 'finish'])
  })

  it('unsays both when both are already held', () => {
    const onSetPass = setup(true, true)

    fireEvent.click(screen.getByRole('button', { name: 'Both' }))

    expect(onSetPass).toHaveBeenCalledWith([])
  })

  it('says which of the two passes is held, not just that something is', () => {
    // A face roughed from above and finished from the side is one plan, so the
    // two have to read independently.
    setup(true, false)

    expect(screen.getByRole('button', { name: 'R' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'F' })).toHaveAttribute('aria-pressed', 'false')
    // Off, because Both reports the two passes and nothing else. Roughed and
    // not finished is not a kind of "both".
    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reads a part-cut claim as neither on nor off', () => {
    /*
     * A reading can be cut here on some of its faces, having given the rest to
     * another way up. A button reading fully pressed then claims more than the
     * plan says — and the next press has to take the rest back, not let go.
     */
    const onSetPass = setup('some', false)

    expect(screen.getByRole('button', { name: 'R' })).toHaveAttribute('aria-pressed', 'mixed')
    // And Both stays off: one pass held is not a kind of "both", part-cut or not.
    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    expect(onSetPass).toHaveBeenCalledWith(['rough', 'finish'])
  })

  it('is dashed only when both passes are held and one is part-cut', () => {
    setup('some', true)

    expect(screen.getByRole('button', { name: 'Both' })).toHaveAttribute('aria-pressed', 'mixed')
  })

  it('lets go only from a whole claim on both', () => {
    const onSetPass = setup('some', true)

    // Dashed means "finish the job", not "undo it" — the same shape as R and F.
    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    expect(onSetPass).toHaveBeenCalledWith(['rough', 'finish'])
  })

  it('names the way up it would assign to', () => {
    setup(false, false)

    expect(screen.getByRole('button', { name: 'R' })).toHaveAttribute(
      'title',
      'Rough this reading from +Z',
    )
  })
})

describe('a reading a settled setup holds', () => {
  /*
   * Paul, mapping: a reading held by a locked setup moved anyway. The buttons
   * have to refuse before the press, not silently swallow it — a control that
   * looks pressable and does nothing is worse than the move it prevents.
   */
  const settled = (rough: boolean | 'some' = true) => {
    const onSetPass = vi.fn<(passes: ReadonlyArray<Pass>) => void>()
    render(
      <PassButtons
        label="+Z"
        rough={rough}
        finish={false}
        onSetPass={onSetPass}
        blockedBy={() => 'Op 1'}
      />,
    )
    return onSetPass
  }

  it('offers no press at all', () => {
    settled()

    for (const name of ['R', 'F', 'Both']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('does not move the work when pressed anyway', () => {
    const onSetPass = settled()

    fireEvent.click(screen.getByRole('button', { name: 'R' }))
    fireEvent.click(screen.getByRole('button', { name: 'Both' }))

    expect(onSetPass).not.toHaveBeenCalled()
  })

  it('names the setup to unlock rather than only refusing', () => {
    settled()

    expect(screen.getByRole('button', { name: 'R' })).toHaveAttribute(
      'title',
      'Settled in Op 1. Unlock it to change what it cuts.',
    )
  })

  it('still says which passes the settled setup holds', () => {
    // Greying it to nothing would hide the thing somebody opened the row to
    // find out.
    settled(true)

    expect(screen.getByRole('button', { name: 'R' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'F' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('a lock that holds only one of the two passes', () => {
  /*
   * Paul, on a real part: every reading of a settled face had its buttons lit,
   * because the row asked whether *it* was settled rather than whether the
   * press would be refused. Widening that has a trap of its own — a setup
   * settled on rough has not settled the finish, and shutting the whole row
   * would be the lock claiming ground it never took.
   *
   * So the question is asked per button, with the passes that button sends.
   */
  const roughOnly = () => {
    const onSetPass = vi.fn<(passes: ReadonlyArray<Pass>) => void>()
    render(
      <PassButtons
        label="+Z"
        rough={false}
        finish={false}
        onSetPass={onSetPass}
        blockedBy={(passes) => (passes.includes('rough') ? 'Op 1' : null)}
      />,
    )
    return onSetPass
  }

  const button = (name: string) => screen.getByRole('button', { name })

  it('shuts the pass it holds and leaves the other alone', () => {
    roughOnly()

    expect(button('R')).toBeDisabled()
    expect(button('F')).toBeEnabled()
  })

  it('shuts Both, which would claim the settled pass along with the free one', () => {
    roughOnly()

    expect(button('Both')).toBeDisabled()
  })

  it('still lets the free pass through', () => {
    const onSetPass = roughOnly()

    fireEvent.click(button('F'))

    expect(onSetPass).toHaveBeenCalledWith(['finish'])
  })

  it('names the lock on the button it shut, and not on the one it did not', () => {
    roughOnly()

    expect(button('R')).toHaveAttribute(
      'title',
      'Settled in Op 1. Unlock it to change what it cuts.',
    )
    expect(button('F')).toHaveAttribute('title', 'Finish this reading from +Z')
  })
})

describe('a settled reading still says what it holds', () => {
  /*
   * Paul, on a real part: once every refused button greyed the same way, the
   * one reading that *was* mapped and settled looked as empty as the four
   * refused on its behalf — and which passes the lock is holding is the thing
   * somebody opened the row to find out.
   *
   * So the state decides the colour and the block decides only whether it can
   * be pressed. Greyed means holding nothing, not merely refused.
   */
  const settledHoldingRough = () => {
    render(
      <PassButtons label="+Z" rough finish={false} onSetPass={vi.fn()} blockedBy={() => 'Op 1'} />,
    )
  }

  const button = (name: string) => screen.getByRole('button', { name })

  it('keeps the colour on the pass it holds', () => {
    settledHoldingRough()

    expect(button('R').className).toContain('text-info')
    expect(button('R')).toBeDisabled()
  })

  it('greys only the pass it is not holding', () => {
    settledHoldingRough()

    expect(button('F').className).toContain('text-ink-faint')
    expect(button('F').className).not.toContain('text-info')
  })

  it('reports what is held to a screen reader either way', () => {
    // The colour is the sighted half of this; `aria-pressed` is the rest, and
    // a disabled button still has a state worth reporting.
    settledHoldingRough()

    expect(button('R')).toHaveAttribute('aria-pressed', 'true')
    expect(button('F')).toHaveAttribute('aria-pressed', 'false')
  })
})
