// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PlanChoices } from './plan-choices'

/**
 * The two decisions about a plan that are **not scales**.
 *
 * They sit under *The plan itself* with the two that are, because they are the
 * same kind of thing — a shop saying how it wants its work arranged. A separate
 * panel of them below the list was where nobody found them.
 */
afterEach(cleanup)

const choices = () => {
  const onChange = vi.fn()
  render(<PlanChoices limits={{}} onChange={onChange} />)
  return { onChange }
}

/*
 * Both fold, the way a rule card does — so a test has to open one before its
 * controls are in the document at all.
 */
const open = (title: string) => fireEvent.click(screen.getByRole('button', { name: title }))

describe('what a shop will not cut, and how readings are ranked', () => {
  // They sit in a list of rules and they *are* rules, so they wear the same
  // row: a chevron, a name, and what it is set to on the right.
  it('reads as a rule card, with its answer on the row', () => {
    choices()

    expect(screen.getByText('What is a no-go feature for op-planning?')).toBeTruthy()
    // No floor set, so the answer is that anything may be cut.
    expect(screen.getByText('anything')).toBeTruthy()
    expect(screen.getByText('by score')).toBeTruthy()
  })

  it('asks the refusal in the words a machinist would use', () => {
    choices()
    open('What is a no-go feature for op-planning?')

    expect(screen.getByRole('group', { name: 'Worst band' })).toBeTruthy()
  })

  it('hands the floor back as a band', () => {
    const { onChange } = choices()
    open('What is a no-go feature for op-planning?')

    fireEvent.click(screen.getByRole('button', { name: 'Will not cut no go' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ worstBand: 'no go' }))
  })

  // "Anything" is the absence of a floor, which is not the same as a floor at
  // the worst band — one cuts everything, the other refuses the worst readings.
  it('offers no floor at all as its own answer', () => {
    const { onChange } = choices()
    open('What is a no-go feature for op-planning?')

    fireEvent.click(screen.getByRole('button', { name: 'Cut anything' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ worstBand: undefined }))
  })

  it('offers the ranking as two named answers rather than a checkbox', () => {
    const { onChange } = choices()
    open('Rank a reading by its band, or by its score?')

    // Score first is the default, so it reads as chosen rather than as absent.
    expect(screen.getByRole('button', { name: 'By score' }).getAttribute('aria-pressed')).toBe(
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'By band' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bandFirst: true }))
  })

  it('says what the floor did on this part, when there is a plan to say it about', () => {
    const onChange = vi.fn()
    render(<PlanChoices limits={{}} refused={3} onChange={onChange} />)
    open('What is a no-go feature for op-planning?')

    expect(screen.getByText(/3 faces were kept from a refused reading/)).toBeTruthy()
  })

  /*
   * A scale over "how much work should one operation do" used to sit in the
   * rules. It priced the same question in points and per cent and average
   * faces, and the question underneath was always this one.
   */
  it('asks whether a feature may come apart, as a yes or no', () => {
    const { onChange } = choices()

    expect(screen.getByText('May the plan split a feature?')).toBeTruthy()
    // Splitting is the shipped answer, so the row reads yes before anything is
    // pressed.
    expect(screen.getByText('yes')).toBeTruthy()

    open('May the plan split a feature?')
    fireEvent.click(screen.getByRole('button', { name: 'Whole or not at all' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ splitFeatures: false }))
  })
})
