// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COMPLETE, NumberBox } from './number-box'

/**
 * Typing a number, tested where the number is typed.
 *
 * This behaviour was pinned through `RuleCard` while it lived inside the rule
 * editor, and lifting it out left those tests describing the wrapper. What is
 * in here is not styling: it is what makes a decimal point reachable at all,
 * and the second caller — the plan limits — got it without a single test
 * following it across.
 *
 * Driven through state, the way a panel drives it. A box that is not fed its
 * own `onChange` back cannot show these bugs at all: it only loses what is
 * being typed once the edit has gone round the loop and returned as a new
 * `value`.
 */
afterEach(cleanup)

const LABEL = 'Smallest hole'

const Box = ({
  start,
  unit = 'mm',
  raw = false,
  clearable = false,
  metric = 'holeDiameter',
  onChange,
  onClear,
}: {
  start?: number | undefined
  unit?: 'in' | 'mm'
  raw?: boolean
  clearable?: boolean
  metric?: 'holeDiameter' | 'millingLD'
  onChange?: (value: number) => void
  onClear?: () => void
}) => {
  const [value, setValue] = useState<number | undefined>(start)

  return (
    <NumberBox
      id="limit"
      label={LABEL}
      value={value}
      metric={metric as never}
      unit={unit}
      raw={raw}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      onClear={
        clearable
          ? () => {
              setValue(undefined)
              onClear?.()
            }
          : undefined
      }
    />
  )
}

const box = () => screen.getByLabelText(LABEL) as HTMLInputElement
const type = (value: string) => fireEvent.change(box(), { target: { value } })

/**
 * What counts as a number somebody has finished typing.
 *
 * The whole draft mechanism hangs off this one regex: it decides which
 * keystrokes reach the rule and which are only on their way somewhere. `Number`
 * is not usable here — it reads `0.` as 0 and `''` as 0 — so this is the thing
 * that has to be right.
 */
describe('a number somebody has finished typing', () => {
  it('takes the shapes a person actually types', () => {
    for (const typed of ['5', '5.', '.5', '-5', '-5.5', '0.156', '12.3400', '0']) {
      expect(COMPLETE.test(typed), typed).toBe(true)
    }
  })

  it('refuses the ones that parse to a number nobody meant', () => {
    // `.` and `-` are mid-keystroke; `''` is an emptied box; `1e3` and `Infinity`
    // parse fine and are not what anybody typed into a limit.
    for (const typed of ['', '.', '-', '-.', '..', '5.5.5', 'abc', '1e3', 'Infinity', '5px']) {
      expect(COMPLETE.test(typed), typed).toBe(false)
    }
  })
})

describe('holding a number that is still being typed', () => {
  /*
   * The bug the draft exists for. A controlled box that re-renders the parsed
   * value cannot hold `0.` — it parses to 0 and comes back as "0", taking the
   * point with it, so `0.156` is unreachable: the box eats the keystroke that
   * would have got there.
   */
  it('keeps the point that has no digits after it yet', () => {
    render(<Box start={6.35} />)

    type('0.')

    expect(box().value).toBe('0.')
  })

  it('lets a decimal be reached a digit at a time', () => {
    const onChange = vi.fn()
    render(<Box start={6.35} onChange={onChange} />)

    for (const step of ['0', '0.', '0.1', '0.15', '0.156']) {
      type(step)
    }

    expect(box().value).toBe('0.156')
    /*
     * Every value that left is a prefix somebody actually typed — no rounding
     * to 0.2 between one digit and the next, which is the other half of the bug
     * the draft exists for. `0.` leaves as 0 rather than being held back:
     * {@link COMPLETE} counts a trailing point as finished, so the value goes
     * momentarily to 0 and is corrected by the next keystroke.
     */
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([0, 0, 0.1, 0.15, 0.156])
  })

  it('shows the stored number again once the box is left', () => {
    render(<Box start={6.35} />)

    type('0.156')
    fireEvent.blur(box())

    // The draft is dropped and the stored value comes back formatted, which is
    // where rounding belongs.
    expect(box().value).toBe('0.156')
  })

  it('takes a number left with a trailing point', () => {
    // `5.` is 5 to everybody except a parser, so it is taken rather than the
    // old number being silently restored — while typing, and again on the way
    // out, where the draft is dropped and the stored number is re-formatted.
    const onChange = vi.fn()
    render(<Box start={6.35} onChange={onChange} />)

    type('5.')
    expect(onChange).toHaveBeenLastCalledWith(5)
    expect(box().value).toBe('5.')

    fireEvent.blur(box())
    expect(box().value).toBe('5')
  })
})

describe('an emptied box', () => {
  it('is not a zero, where empty is not an answer', () => {
    const onChange = vi.fn()
    render(<Box start={6.35} onChange={onChange} />)

    type('')

    // Clearing a box is how retyping it starts. Writing 0 here recolours the
    // whole part against a limit nobody set.
    expect(onChange).not.toHaveBeenCalled()
  })

  it('gives the stored number back when it is left still empty', () => {
    render(<Box start={6.35} />)

    type('')
    fireEvent.blur(box())

    expect(box().value).toBe('6.35')
  })

  it('is an answer where the box was given one', () => {
    const onClear = vi.fn()
    const onChange = vi.fn()
    render(<Box start={6.35} clearable onChange={onChange} onClear={onClear} />)

    type('')

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(box().value).toBe('')
  })
})

describe('the unit the number is typed in', () => {
  /*
   * Rules are stored in millimetres whatever the shop that wrote them was
   * thinking, so a box reading inches has to convert on the way in. Getting
   * this backwards is how an inch shop's 0.125 quietly becomes 0.125 mm — a
   * limit twenty-five times tighter than the one they set.
   */
  it('stores millimetres however it was typed', () => {
    const onChange = vi.fn()
    render(<Box start={6.35} unit="in" onChange={onChange} />)

    type('0.125')

    expect(onChange).toHaveBeenCalledWith(3.175)
  })

  it('shows the stored millimetres in the unit being read', () => {
    render(<Box start={6.35} unit="in" />)

    expect(box().value).toBe('0.25')
  })

  it('leaves a ratio alone, because 5:1 is 5:1 in any shop', () => {
    const onChange = vi.fn()
    render(<Box start={4} unit="in" metric="millingLD" onChange={onChange} />)

    type('5')

    expect(onChange).toHaveBeenCalledWith(5)
  })

  /*
   * The same limit in the other unit, under the box. A shop reads in one unit
   * and buys tooling in the other, and a limit is exactly the number where that
   * matters: 0.125 in and 3.175 mm are the same stock cutter.
   */
  it('reads the other unit off what is being typed, not off what is stored', () => {
    render(<Box start={6.35} />)

    expect(screen.getByText(/0\.2500 in/)).toBeInTheDocument()

    type('12.7')

    expect(screen.getByText(/0\.5000 in/)).toBeInTheDocument()
  })

  it('says nothing while there is no number to convert', () => {
    render(<Box start={6.35} />)

    // A lone point is the one state that is genuinely not a number yet — a
    // trailing point is not, so `0.` still converts, as 0.
    type('.')

    expect(screen.queryByText(/ in$/)).not.toBeInTheDocument()
  })

  it('says nothing for a bare number, which no conversion touches', () => {
    render(<Box start={4} raw />)

    expect(screen.queryByText(/ in$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ mm$/)).not.toBeInTheDocument()
  })
})

describe('a bare number, which is a weight or a count', () => {
  it('rounds on the way in, so nothing is stored that the box cannot show', () => {
    // Storing 2.5 under a box reading "3" is a number nobody typed and nobody
    // can see.
    const onChange = vi.fn()
    render(<Box start={2} raw onChange={onChange} />)

    type('2.5')

    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('carries no unit after it', () => {
    render(<Box start={2} raw />)

    expect(screen.queryByText('mm')).not.toBeInTheDocument()
  })
})
