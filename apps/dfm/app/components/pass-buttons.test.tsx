// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PassButtons } from './pass-buttons'
import type { Pass } from '../shared/setups'

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

    expect(screen.getByRole('button', { name: 'R' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'F' }).getAttribute('aria-pressed')).toBe('false')
    // Off, because Both reports the two passes and nothing else. Roughed and
    // not finished is not a kind of "both".
    expect(screen.getByRole('button', { name: 'Both' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('reads a part-cut claim as neither on nor off', () => {
    /*
     * A reading can be cut here on some of its faces, having given the rest to
     * another way up. A button reading fully pressed then claims more than the
     * plan says — and the next press has to take the rest back, not let go.
     */
    const onSetPass = setup('some', false)

    expect(screen.getByRole('button', { name: 'R' }).getAttribute('aria-pressed')).toBe('mixed')
    // And Both stays off: one pass held is not a kind of "both", part-cut or not.
    expect(screen.getByRole('button', { name: 'Both' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    expect(onSetPass).toHaveBeenCalledWith(['rough', 'finish'])
  })

  it('is dashed only when both passes are held and one is part-cut', () => {
    setup('some', true)

    expect(screen.getByRole('button', { name: 'Both' }).getAttribute('aria-pressed')).toBe('mixed')
  })

  it('lets go only from a whole claim on both', () => {
    const onSetPass = setup('some', true)

    // Dashed means "finish the job", not "undo it" — the same shape as R and F.
    fireEvent.click(screen.getByRole('button', { name: 'Both' }))
    expect(onSetPass).toHaveBeenCalledWith(['rough', 'finish'])
  })

  it('names the way up it would assign to', () => {
    setup(false, false)

    expect(screen.getByRole('button', { name: 'R' }).getAttribute('title')).toBe(
      'Rough this reading from +Z',
    )
  })
})
