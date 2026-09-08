import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitSystem } from '@toolpath/tool-support'
import {
  ColumnPicker,
  OverrideNotice,
  OverrideToggle,
  RangeFilter,
  TermFilter,
  boundFor,
  compareOf,
  optionsMatching,
  type Bound,
  type Kind,
} from './column-filter'

/**
 * The filter as a page holds it: the bound it writes is the bound it is shown.
 *
 * Rendered this way rather than with a fixed `bound` because the two defects
 * this file pins were both in the round trip — what the component wrote came
 * straight back as its own props, and that is where the box vanished and the
 * text was re-formatted under the cursor.
 */
const Harness = ({
  initial,
  unit = 'millimeters',
  kind = 'length',
  onBound = () => {},
}: {
  initial: Bound | undefined
  unit?: UnitSystem
  kind?: Kind
  onBound?: (bound: Bound | undefined) => void
}) => {
  const [bound, setBound] = useState<Bound | undefined>(initial)
  return (
    <RangeFilter
      label="Diameter"
      bound={bound}
      onBound={(next) => {
        setBound(next)
        onBound(next)
      }}
      unit={unit}
      kind={kind}
    />
  )
}

const operator = () => screen.getByRole('combobox', { name: 'How to compare Diameter' })
const choose = (compare: string) => {
  const labels: Record<string, string> = {
    any: 'Any',
    under: '≤ at most',
    over: '≥ at least',
    equals: '= exactly',
    range: 'between',
  }
  fireEvent.click(operator())
  fireEvent.click(screen.getByRole('option', { name: labels[compare] }))
}
const box = (name = 'value') => screen.getByRole('textbox', { name: `Diameter — ${name}` })
const type = (raw: string, name = 'value') =>
  fireEvent.change(box(name), { target: { value: raw } })

describe('asking about one number', () => {
  /**
   * The defect: the operator was derived from the bound, so ≤ with nothing
   * typed yet wrote `{ max: undefined }` — which is `{}`, which is "Any" — and
   * the box to type into never appeared. Choosing an operator has to be enough.
   */
  it('shows a box to type in as soon as an operator is chosen', () => {
    render(<Harness initial={undefined} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    choose('under')

    expect(box()).toBeInTheDocument()
  })

  it('writes the number in millimetres, whatever unit it was typed in', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} unit="inches" onBound={onBound} />)

    choose('under')
    type('1.25')

    expect(onBound).toHaveBeenLastCalledWith({ max: 31.75 })
    expect(screen.getByText('in')).toBeInTheDocument()
  })

  /**
   * The other defect: a controlled number box that re-formatted through
   * millimetres on every keystroke turned "1." into "1.000" under the cursor.
   */
  it('keeps what was typed, half-typed numbers included', () => {
    render(<Harness initial={undefined} unit="inches" />)
    choose('over')

    type('1.')
    expect(box()).toHaveValue('1.')

    type('1.2')
    expect(box()).toHaveValue('1.2')
  })

  it('takes two numbers for a range', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    choose('range')
    type('3', 'from')
    type('6', 'to')

    expect(onBound).toHaveBeenLastCalledWith({ min: 3, max: 6 })
  })

  it('writes one number as both ends for exactly', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    choose('equals')
    type('4')

    expect(onBound).toHaveBeenLastCalledWith({ min: 4, max: 4 })
  })

  /** A suggestion, a saved filter, Clear: the stored bound moves, and the boxes follow. */
  it('starts from a bound set elsewhere, and follows one that changes', () => {
    const shown = (bound: Bound | undefined) => (
      <RangeFilter
        label="Diameter"
        bound={bound}
        onBound={vi.fn()}
        unit="millimeters"
        kind="length"
      />
    )
    const { rerender } = render(shown({ max: 6 }))
    expect(box()).toHaveValue('6.00')

    rerender(shown({ min: 2, max: 6 }))
    expect(box('from')).toHaveValue('2.00')
    expect(box('to')).toHaveValue('6.00')

    rerender(shown(undefined))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('puts the number down on Any', () => {
    const onBound = vi.fn()
    render(<Harness initial={{ max: 6 }} onBound={onBound} />)

    choose('any')

    expect(onBound).toHaveBeenLastCalledWith(undefined)
  })

  /** Emptying the box is on the way to the next number, not a change of mind about the operator. */
  it('keeps the operator while the box is empty', () => {
    render(<Harness initial={{ max: 6 }} />)

    type('')

    expect(box()).toBeInTheDocument()
  })

  it('never converts a count, and gives it no unit', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} unit="inches" kind="count" onBound={onBound} />)

    choose('over')
    type('4')

    expect(onBound).toHaveBeenLastCalledWith({ min: 4 })
    expect(screen.queryByText('in')).not.toBeInTheDocument()
  })
})

describe('what an operator and its numbers add up to', () => {
  it('is nothing until there is a number', () => {
    expect(boundFor('under', undefined, undefined)).toBeUndefined()
    expect(boundFor('range', undefined, undefined)).toBeUndefined()
  })

  /** Every operator survives the round trip through the bound it writes. */
  it('reads back as the operator it was written from', () => {
    expect(compareOf(boundFor('under', 6, undefined))).toBe('under')
    expect(compareOf(boundFor('over', 6, undefined))).toBe('over')
    expect(compareOf(boundFor('equals', 6, undefined))).toBe('equals')
    expect(compareOf(boundFor('range', 3, 6))).toBe('range')
    expect(compareOf(boundFor('any', 6, 6))).toBe('any')
  })
})

describe('the column picker', () => {
  it('keeps the pencil at the table header touch target size', () => {
    render(
      <ColumnPicker
        columns={[{ code: 'DC', label: 'Diameter' }]}
        shown={['DC']}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Which columns to show' })).toHaveClass('size-6')
  })
})

/**
 * Narrowing on words: the search over the options, and the button beside it.
 *
 * A shop looking for HARVI has eleven families to tick out of hundreds, and
 * before this it ticked them one at a time down a scrolling list (Paul,
 * 2026-09-08). The two rules worth pinning are that searching is not choosing —
 * what the box hides stays chosen — and that the button acts on exactly what
 * the box is showing.
 */
const OPTIONS = [
  { value: 'kennametal', label: 'Kennametal', count: 12 },
  { value: 'harvi-i', label: 'HARVI I TE', count: 4 },
  { value: 'harvi-iii', label: 'HARVI III', count: 7 },
]

const TermHarness = ({
  initial = [],
  onChosen = () => {},
}: {
  initial?: ReadonlyArray<string>
  onChosen?: (values: ReadonlyArray<string>) => void
}) => {
  const [chosen, setChosen] = useState<ReadonlyArray<string>>(initial)
  return (
    <TermFilter
      label="Family"
      options={OPTIONS}
      chosen={chosen}
      onChosen={(next) => {
        setChosen(next)
        onChosen(next)
      }}
    />
  )
}

const search = (raw: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search family values' }), {
    target: { value: raw },
  })

describe('narrowing on a set of names', () => {
  it('shows only the options the typed word matches', () => {
    render(<TermHarness />)

    search('harvi')

    expect(screen.getByRole('checkbox', { name: 'HARVI I TE' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'HARVI III' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Kennametal' })).not.toBeInTheDocument()
  })

  it('ticks every option the search is showing, in one press', () => {
    const onChosen = vi.fn()
    render(<TermHarness onChosen={onChosen} />)

    search('harvi')
    fireEvent.click(screen.getByRole('button', { name: 'Select shown (2)' }))

    expect(onChosen).toHaveBeenLastCalledWith(['harvi-i', 'harvi-iii'])
  })

  /** Searching narrows the options, not the answer: a hidden tick is still a tick. */
  it('keeps a value chosen once the search stops showing it', () => {
    render(<TermHarness initial={['kennametal']} />)

    search('harvi')
    fireEvent.click(screen.getByRole('button', { name: 'Select shown (2)' }))
    search('')

    expect(screen.getByRole('checkbox', { name: 'Kennametal' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'HARVI III' })).toBeChecked()
  })

  /** The button says what it will do, and takes back exactly what it gave. */
  it('turns into Clear shown once everything shown is chosen', () => {
    const onChosen = vi.fn()
    render(<TermHarness initial={['kennametal']} onChosen={onChosen} />)

    search('harvi')
    fireEvent.click(screen.getByRole('button', { name: 'Select shown (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear shown' }))

    expect(onChosen).toHaveBeenLastCalledWith(['kennametal'])
  })

  it('says so when nothing matches, rather than showing an empty box', () => {
    render(<TermHarness />)

    search('sandvik')

    expect(screen.getByText('Nothing matches that.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select shown (0)' })).toBeDisabled()
  })
})

/**
 * **A column can only offer what the list is holding, and that is not always
 * the whole question** (Paul, 2026-09-08: "there is no way to show end mills if
 * I can't find a drill … I should always have a '...' row at the bottom of the
 * recommended filter options to expand any filter to show what it's hiding from
 * the list in any filter that is limited contextually").
 */
describe('what a contextual list is not showing', () => {
  const HIDDEN = [
    { value: 'Flat end mill', label: 'Flat end mill' },
    { value: 'Ball end mill', label: 'Ball end mill' },
  ]

  const show = (
    over: { chosen?: ReadonlyArray<string>; onChosen?: (v: ReadonlyArray<string>) => void } = {},
  ) =>
    render(
      <TermFilter
        label="Type"
        options={[{ value: 'Drill', label: 'Drill', count: 14 }]}
        chosen={over.chosen ?? []}
        onChosen={over.onChosen ?? (() => {})}
        hidden={HIDDEN}
      />,
    )

  it('offers the rest behind one row, and says how many', () => {
    show()

    expect(screen.queryByRole('checkbox', { name: /Flat end mill/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '… 2 more' }))
    expect(screen.getByRole('checkbox', { name: /Flat end mill/ })).toBeInTheDocument()
  })

  /** Pressing one is how the question widens, so it answers like any other value. */
  it('chooses a value the list is not showing', () => {
    const onChosen = vi.fn()
    show({ onChosen })

    fireEvent.click(screen.getByRole('button', { name: '… 2 more' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Flat end mill/ }))

    expect(onChosen).toHaveBeenLastCalledWith(['Flat end mill'])
  })

  /** Named as what it is, because a nought beside it would otherwise read as absent. */
  it('says a value is off the list rather than only greying it', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: '… 2 more' }))
    expect(
      screen.getByRole('checkbox', { name: 'Flat end mill — not on this list' }),
    ).toBeInTheDocument()
  })

  /** The search reaches them too, which is what makes a long axis usable. */
  it('searches what is behind the row as well as what is in front', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: '… 2 more' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search type values' }), {
      target: { value: 'ball' },
    })

    expect(screen.getByRole('checkbox', { name: /Ball end mill/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Drill' })).not.toBeInTheDocument()
    // And the button acts on exactly what is on screen, expanded or not.
    expect(screen.getByRole('button', { name: 'Select shown (1)' })).toBeEnabled()
  })

  it('goes back to what the list holds', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: '… 2 more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fewer — only what this list holds' }))

    expect(screen.queryByRole('checkbox', { name: /Flat end mill/ })).not.toBeInTheDocument()
  })

  /** Nothing behind it is no row: the `…` is an offer, not a heading. */
  it('draws no row where the list is the whole axis', () => {
    render(
      <TermFilter
        label="Type"
        options={[{ value: 'Drill', label: 'Drill', count: 14 }]}
        chosen={[]}
        onChosen={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: /more/ })).not.toBeInTheDocument()
  })
})

describe('which options a typed word leaves', () => {
  it('matches the words shown and the value behind them, either case', () => {
    expect(optionsMatching(OPTIONS, 'HARVI').map((each) => each.value)).toEqual([
      'harvi-i',
      'harvi-iii',
    ])
    expect(optionsMatching(OPTIONS, 'harvi-iii').map((each) => each.value)).toEqual(['harvi-iii'])
    expect(optionsMatching(OPTIONS, '  ')).toEqual(OPTIONS)
  })
})

/**
 * **The warning belongs on the filter that caused it, and it asks before it
 * acts** (Paul, 2026-09-08: "it should recognize if I enter something to
 * override the rules and warn me to confirm it … when I override a
 * geometry-set filter, it should warn me there").
 */
describe('changing a number the geometry set', () => {
  const offer = (over: Partial<Parameters<typeof OverrideNotice>[0]['override']> = {}) => ({
    suggested: { max: 8 } as Bound,
    available: 3,
    on: false,
    onOverride: vi.fn(),
    say: (bound: Bound) => `at most ${String(bound.max)} mm`,
    ...over,
  })

  it("says nothing while the number is still the geometry's", () => {
    render(<OverrideNotice label="Diameter" bound={{ max: 8 }} override={offer()} />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('says nothing where no bound is set at all', () => {
    render(<OverrideNotice label="Diameter" bound={undefined} override={offer()} />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  /**
   * A bound typed where the geometry suggested none is somebody's answer too —
   * gating on a suggestion left a column the sheet happens not to bound
   * unoverridable even while its rules held tools off the list.
   */
  it('speaks for a column the geometry never bounded', () => {
    render(
      <OverrideNotice
        label="Diameter"
        bound={{ max: 20 }}
        override={offer({ suggested: undefined })}
      />,
    )

    expect(screen.getByRole('note')).toHaveTextContent('The rules still judge the diameter')
  })

  it('names the number the geometry asked for, and what is off the list', () => {
    render(<OverrideNotice label="Diameter" bound={{ max: 20 }} override={offer()} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('at most 8 mm')
    expect(note).toHaveTextContent('3 tools only the diameter rules turn down are off this list')
  })

  /** Nothing to forgive is not the same as nothing to say. */
  it('says so where this column alone is holding nothing back', () => {
    render(
      <OverrideNotice label="Diameter" bound={{ max: 20 }} override={offer({ available: 0 })} />,
    )

    expect(screen.getByRole('note')).toHaveTextContent(
      'Nothing is being held back by the diameter rules alone',
    )
  })

  it('says the override is on, and what turning it off puts back', () => {
    render(<OverrideNotice label="Diameter" bound={{ max: 20 }} override={offer({ on: true })} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('is on: 3 the diameter rules turn down')
    // The number and the forgiveness are one decision — see `overrideFor` in
    // the part route.
    expect(note).toHaveTextContent('Turning it off puts the diameter back to at most 8 mm')
  })

  it('says a column the geometry never bounded goes back to no bound at all', () => {
    render(
      <OverrideNotice
        label="Diameter"
        bound={{ max: 20 }}
        override={offer({ on: true, suggested: undefined })}
      />,
    )

    expect(screen.getByRole('note')).toHaveTextContent('back to no bound at all')
  })

  /**
   * The press itself is one small control in the dialog's chrome — the number
   * above it is the dialog's own action, and this is a footnote to it.
   */
  it('confirms and un-confirms from the one press', () => {
    const onOverride = vi.fn()
    const { rerender } = render(
      <OverrideToggle label="Diameter" override={offer({ onOverride })} />,
    )

    const press = screen.getByRole('button', { name: 'Override the diameter rules' })
    expect(press).toHaveTextContent('Override rules')
    expect(press).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(press)
    expect(onOverride).toHaveBeenCalledWith(true)

    rerender(<OverrideToggle label="Diameter" override={offer({ on: true, onOverride })} />)
    expect(screen.getByRole('button', { name: 'Override the diameter rules' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Override the diameter rules' }))
    expect(onOverride).toHaveBeenCalledWith(false)
  })
})
