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

const choices = (limits: Parameters<typeof PlanChoices>[0]['limits'] = {}) => {
  const onChange = vi.fn()
  render(<PlanChoices limits={limits} onChange={onChange} revision={0} unit="mm" />)
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

    expect(screen.getByText('What is a no-go feature for op-planning?')).toBeInTheDocument()
    // No floor set, so the answer is that anything may be cut.
    expect(screen.getByText('anything')).toBeInTheDocument()
    expect(screen.getByText('by score')).toBeInTheDocument()
  })

  it('asks the refusal in the words a machinist would use', () => {
    choices()
    open('What is a no-go feature for op-planning?')

    expect(screen.getByRole('group', { name: 'Worst band' })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'By score' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'By band' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bandFirst: true }))
  })

  it('says what the floor did on this part, when there is a plan to say it about', () => {
    const onChange = vi.fn()
    render(<PlanChoices revision={0} unit="mm" limits={{}} refused={3} onChange={onChange} />)
    open('What is a no-go feature for op-planning?')

    expect(screen.getByText(/3 faces were kept from a refused reading/)).toBeInTheDocument()
  })

  /*
   * A scale over "how much work should one operation do" used to sit in the
   * rules. It priced the same question in points and per cent and average
   * faces, and the question underneath was always this one.
   */
  it('asks whether a feature may come apart, as a yes or no', () => {
    const { onChange } = choices()

    expect(screen.getByText('May the plan split a feature?')).toBeInTheDocument()
    // Splitting is the shipped answer, so the row reads yes before anything is
    // pressed.
    expect(screen.getByText('yes')).toBeInTheDocument()

    open('May the plan split a feature?')
    fireEvent.click(screen.getByRole('button', { name: 'Whole or not at all' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ splitFeatures: false }))
  })
})

describe('the part sizes a shop takes', () => {
  /*
   * Not a rule. A part outside the sizes is not a feature problem — nothing
   * about a pocket is wrong when the part itself is one nobody here would hold
   * — so banding it once per feature said the same thing about every pocket on
   * the part. It is a shop's answer, sitting with the other two that are not
   * scales.
   */
  const SIZES = 'What part sizes do you take?'
  const box = (label: string) => screen.getByRole('textbox', { name: label })

  const type = (label: string, value: string) => {
    fireEvent.change(box(label), { target: { value } })
    fireEvent.blur(box(label))
  }

  const fill = (end: 'Smallest' | 'Largest', x: string, y: string, z: string) => {
    type(`${end}, X`, x)
    type(`${end}, Y`, y)
    type(`${end}, Z`, z)
  }

  it('takes any size until somebody says otherwise', () => {
    choices()

    expect(screen.getByText('any size')).toBeInTheDocument()
  })

  it('says nothing to the plan until all three of an end are in', () => {
    /*
     * A machine is three numbers, and the sides are matched largest against
     * largest — so two of the three is not a smaller answer, it is no answer.
     * Writing it down would have the rule half-judging on a number nobody had
     * finished giving.
     */
    const { onChange } = choices()
    open(SIZES)

    type('Largest, X', '30')
    type('Largest, Y', '16')

    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ machine: expect.anything() }),
    )
  })

  it('takes a maximum on its own', () => {
    const { onChange } = choices()
    open(SIZES)

    fill('Largest', '30', '16', '20')

    expect(onChange).toHaveBeenLastCalledWith({ machine: { max: { x: 30, y: 16, z: 20 } } })
  })

  it('takes a minimum on its own', () => {
    // A shop that only cares about the small end says so, and the big end
    // judges nothing rather than judging against zero.
    const { onChange } = choices()
    open(SIZES)

    fill('Smallest', '10', '8', '4')

    expect(onChange).toHaveBeenLastCalledWith({ machine: { min: { x: 10, y: 8, z: 4 } } })
  })

  it('takes both ends together', () => {
    const { onChange } = choices({ machine: { min: { x: 10, y: 8, z: 4 } } })
    open(SIZES)

    fill('Largest', '30', '16', '20')

    expect(onChange).toHaveBeenLastCalledWith({
      machine: { min: { x: 10, y: 8, z: 4 }, max: { x: 30, y: 16, z: 20 } },
    })
  })

  it('says which ends have been given, without opening the card', () => {
    cleanup()
    choices({ machine: { max: { x: 30, y: 16, z: 20 } } })
    expect(screen.getByText('largest only')).toBeInTheDocument()

    cleanup()
    choices({ machine: { min: { x: 10, y: 8, z: 4 } } })
    expect(screen.getByText('smallest only')).toBeInTheDocument()

    cleanup()
    choices({ machine: { min: { x: 10, y: 8, z: 4 }, max: { x: 30, y: 16, z: 20 } } })
    expect(screen.getByText('both ends')).toBeInTheDocument()
  })

  it('puts an end back to unsaid when one of its three is emptied', () => {
    // Clearing is how somebody takes a limit off, and two thirds of a limit is
    // not one — so the end goes, rather than judging on what is left.
    const { onChange } = choices({ machine: { max: { x: 30, y: 16, z: 20 } } })
    open(SIZES)

    type('Largest, Y', '')

    expect(onChange).toHaveBeenLastCalledWith({ machine: undefined })
  })
})
