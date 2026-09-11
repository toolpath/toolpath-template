import { useEffect, useRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitSystem } from '@toolpath/tool-support'
import { columnFilterOpen } from 'shared/use-escape'
import {
  ColumnPicker,
  FilterMenu,
  OverrideNotice,
  RangeFilter,
  TermFilter,
  compareOf,
  menuRoom,
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

const box = (side: 'min' | 'max' = 'min') =>
  screen.getByRole('textbox', { name: `Diameter — ${side}` })
const type = (raw: string, side: 'min' | 'max' = 'min') =>
  fireEvent.change(box(side), { target: { value: raw } })
/** Finishing with a box, which is when shorthand is written back out in longhand. */
const leave = (side: 'min' | 'max' = 'min') => {
  fireEvent.blur(box(side))
  fireEvent.focusOut(box(side))
}

describe('asking about one number', () => {
  /**
   * The defect this control replaced: the menu opened on an operator list set
   * to "Any", "Any" drew no box, and narrowing a column cost four presses
   * before the first keystroke (Paul, 2026-09-11).
   */
  it('shows both ends from the start, with nothing to choose first', () => {
    render(<Harness initial={undefined} />)

    expect(box('min')).toBeInTheDocument()
    expect(box('max')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('writes the number in millimetres, whatever unit it was typed in', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} unit="inches" onBound={onBound} />)

    type('1.25', 'max')

    expect(onBound).toHaveBeenLastCalledWith({ max: 31.75 })
    expect(screen.getByText('in')).toBeInTheDocument()
  })

  /**
   * The other defect the boxes were built around: a controlled number box that
   * re-formatted through millimetres on every keystroke turned "1." into
   * "1.000" under the cursor.
   */
  it('keeps what was typed, half-typed numbers included', () => {
    render(<Harness initial={undefined} unit="inches" />)

    type('1.')
    expect(box()).toHaveValue('1.')

    type('1.2')
    expect(box()).toHaveValue('1.2')
  })

  it('takes one end from each box', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    type('3', 'min')
    type('6', 'max')

    expect(onBound).toHaveBeenLastCalledWith({ min: 3, max: 6 })
  })

  /** The shorthand, and the box it settles into: `6-12` is a range wherever it is typed. */
  it('splits a range typed into one box across both of them', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    type('6-12')
    expect(onBound).toHaveBeenLastCalledWith({ min: 6, max: 12 })

    leave()
    expect(box('min')).toHaveValue('6.00')
    expect(box('max')).toHaveValue('12.00')
  })

  it('moves an end typed into the wrong box over to the right one', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    type('<12')
    expect(onBound).toHaveBeenLastCalledWith({ max: 12 })

    leave()
    expect(box('min')).toHaveValue('')
    expect(box('max')).toHaveValue('12.00')
  })

  it('writes one number into both ends for =', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    type('=4')

    expect(onBound).toHaveBeenLastCalledWith({ min: 4, max: 4 })
  })

  /**
   * Settling is the leaving box's own business. Rewriting the far box while
   * the caret is arriving in it is the "1." to "1.000" defect wearing a hat.
   */
  it('leaves the text in the other box alone when one is finished with', () => {
    render(<Harness initial={{ min: 2, max: 6 }} />)

    type('3.', 'max')
    leave('min')

    expect(box('min')).toHaveValue('2.00')
    expect(box('max')).toHaveValue('3.')
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
    expect(box('min')).toHaveValue('')
    expect(box('max')).toHaveValue('6.00')

    rerender(shown({ min: 2, max: 6 }))
    expect(box('min')).toHaveValue('2.00')
    expect(box('max')).toHaveValue('6.00')

    rerender(shown(undefined))
    expect(box('min')).toHaveValue('')
    expect(box('max')).toHaveValue('')
  })

  it('puts the number down once both boxes are empty', () => {
    const onBound = vi.fn()
    render(<Harness initial={{ max: 6 }} onBound={onBound} />)

    type('', 'max')

    expect(onBound).toHaveBeenLastCalledWith(undefined)
  })

  it('never converts a count, and gives it no unit', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} unit="inches" kind="count" onBound={onBound} />)

    type('4', 'min')

    expect(onBound).toHaveBeenLastCalledWith({ min: 4 })
    expect(screen.queryByText('in')).not.toBeInTheDocument()
  })

  /** Opened *by* a press, so the caret is already where the number goes. */
  it('takes the caret into the lower box when it is the dialog somebody opened', async () => {
    render(
      <RangeFilter
        label="Diameter"
        bound={undefined}
        onBound={vi.fn()}
        unit="millimeters"
        kind="length"
        opened
      />,
    )

    // On the next frame: the press that opened it takes the focus first.
    await waitFor(() => expect(box('min')).toHaveFocus())
  })
})

describe('the shape a stored bound has', () => {
  /** Not what any control is set to any more — what the column is asking. */
  it('reads back the question the two ends add up to', () => {
    expect(compareOf(undefined)).toBe('any')
    expect(compareOf({})).toBe('any')
    expect(compareOf({ min: 6 })).toBe('over')
    expect(compareOf({ max: 6 })).toBe('under')
    expect(compareOf({ min: 6, max: 6 })).toBe('equals')
    expect(compareOf({ min: 3, max: 6 })).toBe('range')
  })
})

/**
 * How tall a box opened off a button is, and which way it opens.
 *
 * One rule for the filter menus and the column picker both: the picker ran off
 * the bottom of the screen with its last columns unreachable (Paul,
 * 2026-09-10), which is the defect the Type filter had a day earlier.
 */
describe('the room a menu opens into', () => {
  it('takes the room under the button and opens downwards', () => {
    expect(menuRoom({ top: 100, bottom: 130 }, 900)).toEqual({ upwards: false, height: 758 })
  })

  it('opens upwards where what is left under the button is a strip', () => {
    expect(menuRoom({ top: 700, bottom: 730 }, 900)).toEqual({ upwards: true, height: 688 })
  })

  /** A strip above and a strip below still opens downwards, and overhangs. */
  it('never squeezes itself below the least height worth reading', () => {
    expect(menuRoom({ top: 40, bottom: 70 }, 200)).toEqual({ upwards: false, height: 220 })
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

  /**
   * The list scrolls inside the room the screen leaves it rather than running
   * off the bottom of the page with its last columns out of reach.
   */
  it('scrolls inside a height the screen bounds', () => {
    render(
      <ColumnPicker
        columns={[{ code: 'DC', label: 'Diameter' }]}
        shown={['DC']}
        onToggle={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Which columns to show' }))

    const list = screen.getByRole('group', { name: 'Columns' })
    expect(list).toHaveClass('overflow-y-auto')
    expect(list.style.maxHeight).not.toBe('')
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

  it('says nothing where no bound is set and the geometry asked for none', () => {
    render(
      <OverrideNotice
        label="Diameter"
        bound={undefined}
        override={offer({ suggested: undefined })}
      />,
    )

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  /**
   * **An empty box is an answer too, where the geometry put a number there**
   * (Paul, 2026-09-11: "when I remove a value for min or max, it is not showing
   * tools down to the smallest or largest tool in the library"). Clearing is
   * the loosest thing a column can say, so `part.tsx` § `released` sets its
   * rules aside on the spot — and this is the sentence saying so. Gated on the
   * bound alone, the dialog said nothing at all in the one state where the list
   * had just widened underneath it.
   */
  it('speaks for a number the geometry set and somebody took away', () => {
    render(<OverrideNotice label="Diameter" bound={undefined} override={offer({ on: true })} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('The diameter rules are set aside: 3 tools they turn down')
    expect(note).toHaveTextContent('Putting the diameter back to at most 8 mm takes them off again')
    // And not the sentence that contradicts it.
    expect(note).not.toHaveTextContent('does not change the rules')
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

  it('names the number the geometry asked for, what is off the list, and the tick', () => {
    render(<OverrideNotice label="Diameter" bound={{ max: 20 }} override={offer()} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('at most 8 mm')
    expect(note).toHaveTextContent('3 tools only the diameter rules turn down are off this list')
    // The warning is the warning and the tick is the answer to it: there is no
    // second press in the chrome any more.
    expect(note).toHaveTextContent('Keep this number and list them — the ✓ above')
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

  it('says the rules are set aside, and what puts them back', () => {
    render(<OverrideNotice label="Diameter" bound={{ max: 20 }} override={offer({ on: true })} />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('The diameter rules are set aside: 3 tools they turn down')
    // The number and the forgiveness are one decision — see `overrideFor` in
    // the part route — so the way back is the number, not a press.
    expect(note).toHaveTextContent('Putting the diameter back to at most 8 mm takes them off again')
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
   * The press this warning used to stand under is gone — `column-heading.test`
   * § "confirming an override" is the tick that replaced it.
   */
  it('leaves the acting to the tick, with no press of its own', () => {
    render(<OverrideNotice label="Diameter" bound={{ max: 20 }} override={offer()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

/**
 * **A funnel missing for one frame is not a column that has gone**
 * (Paul, 2026-09-09: "it is taking me out of the filter once I've entered a
 * certain number of characters").
 *
 * The menu measures itself against the funnel that opened it, from a listener
 * that catches every scroll on the page and from a layout effect that re-runs
 * on every render of the list under it. That list throws its header away and
 * builds it again — `FilterMenu` says why — so one lookup landing on the wrong
 * side of a rebuild used to close the menu with nothing pressed. The column
 * picker taking a column off is the case the close is *for*, and that column is
 * still gone a frame later.
 */
describe('a filter menu standing over its funnel', () => {
  const Standing = ({ onClose }: { readonly onClose: () => void }) => {
    const anchors = useRef<HTMLDivElement>(null)
    return (
      <div ref={anchors}>
        <span data-column-funnel="DC" />
        <FilterMenu label="Diameter" code="DC" anchors={anchors} align="left" onClose={onClose}>
          <p>the filter</p>
        </FilterMenu>
      </div>
    )
  }

  /** One turn of the animation frame the second look is scheduled on. */
  const frame = async () => {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
  }

  /**
   * Standing, with its first look already taken.
   *
   * The menu is drawn *inside* the element it measures against — the list owns
   * both — so React has not attached that ref yet when the menu's own layout
   * effect runs. The first look therefore always misses and the second one
   * finds it, which is the behaviour under test working on the very first
   * frame; every test below starts after it.
   */
  const standing = async (onClose: () => void) => {
    const drawn = render(<Standing onClose={onClose} />)
    await frame()
    expect(onClose).not.toHaveBeenCalled()
    return drawn
  }

  /**
   * The header thrown away, without a re-render to announce it: this is what
   * the list does under the menu, and the menu has to survive reading the DOM
   * on the wrong side of it.
   */
  const funnel = () => document.querySelector('[data-column-funnel="DC"]')
  const dropFunnel = () => {
    const found = funnel()
    found?.remove()
    return found
  }

  it('stays where the funnel is there', async () => {
    const onClose = vi.fn()
    await standing(onClose)

    fireEvent.scroll(window)
    await frame()

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays through a header that is rebuilt under it', async () => {
    const onClose = vi.fn()
    const { container } = await standing(onClose)
    const anchors = container.firstElementChild

    // Gone when the scroll is answered, back before the second look is.
    const taken = dropFunnel()
    fireEvent.scroll(window)
    anchors?.prepend(taken as Element)
    await frame()

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes over a column that is really gone', async () => {
    const onClose = vi.fn()
    await standing(onClose)

    dropFunnel()
    fireEvent.scroll(window)
    await frame()

    expect(onClose).toHaveBeenCalled()
  })

  /**
   * A narrow box scrolls itself as soon as what is typed outgrows it, which is
   * the whole of "a certain number of characters". The menu has no business
   * measuring the header again because somebody typed — and measuring it is
   * what closed the menu.
   */
  it('ignores a scroll inside itself', async () => {
    const onClose = vi.fn()
    await standing(onClose)

    dropFunnel()
    fireEvent.scroll(screen.getByText('the filter'))
    await frame()
    expect(onClose).not.toHaveBeenCalled()

    // The same missing funnel, answered from a scroll that is not this menu's.
    fireEvent.scroll(window)
    await frame()
    expect(onClose).toHaveBeenCalled()
  })
})

/**
 * **A filter open inside an assembly box takes Enter, and the page stands
 * down** (Paul, 2026-09-10: "when a filter dialog is active underneath a
 * feature/group/tool assembly, hitting enter should confirm the filter and
 * close the filter dialog before it closes the feature/group/tool assembly").
 *
 * The menu is opened from a column header, so the focus is on the funnel or
 * still on the press that opened the box — never inside the menu. A React
 * keydown on the menu therefore never fired, and the page's own Enter ordered
 * the whole assembly and unmounted the filter under it unread. `useKeyLayer` in
 * `shared/use-escape.ts` is the rule: the newest layer takes the press, and it
 * names itself so the page can recognise it.
 *
 * `order` here is what `routes/part.tsx` does on Enter, gate and all — a real
 * document listener, added *before* the menu's, because that is the order the
 * page and a menu opened over it register in and the reason the page cannot
 * simply wait to be pre-empted. It defers to a filter being *open* rather than
 * to a filter being the newest layer: what closed the box was that question
 * being answered by the order things mounted in.
 */
describe('Enter over a filter menu inside a box', () => {
  const Standing = ({
    onClose,
    onConfirm,
  }: {
    readonly onClose: () => void
    readonly onConfirm?: () => void
  }) => {
    const anchors = useRef<HTMLDivElement>(null)
    return (
      <div ref={anchors}>
        <span data-column-funnel="DC" />
        <button type="button">the press that opened the box</button>
        <FilterMenu
          label="Diameter"
          code="DC"
          anchors={anchors}
          align="left"
          onClose={onClose}
          confirm={
            onConfirm === undefined
              ? undefined
              : { label: 'Use this diameter', title: 'Use this diameter', onConfirm }
          }
        >
          <button type="button">clear</button>
        </FilterMenu>
      </div>
    )
  }

  /** The page's Enter, as `routes/part.tsx` holds it. */
  const pageOrdering = (order: () => void) => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || columnFilterOpen()) {
        return
      }
      order()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }

  it('confirms and closes the filter, and orders nothing', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    const order = vi.fn()
    const stop = pageOrdering(order)
    render(<Standing onClose={onClose} onConfirm={onConfirm} />)

    // Where the press lands when the menu was opened from a header: outside it.
    fireEvent.keyDown(screen.getByRole('button', { name: 'the press that opened the box' }), {
      key: 'Enter',
      bubbles: true,
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(order).not.toHaveBeenCalled()
    stop()
  })

  /**
   * The page has the press back the moment the menu is gone — the second Enter
   * is the one that orders, and it is the whole point of taking only the first.
   */
  it('gives the press back to the page once the menu is gone', () => {
    const order = vi.fn()
    const stop = pageOrdering(order)
    const { unmount } = render(<Standing onClose={() => {}} />)

    unmount()
    fireEvent.keyDown(document.body, { key: 'Enter', bubbles: true })

    expect(order).toHaveBeenCalledTimes(1)
    stop()
  })

  /**
   * **Enter is the dialog's, never a control's** (Paul, 2026-09-10: "the
   * keyboard focus is staying on the checkbox I used most recently in the drop
   * down filters — enter should never check or uncheck, it only works at the
   * dialog level"). The kit's `Checkbox` is a `<button role="checkbox">`, so
   * the focus sits on the last value clicked and Enter fired that button's own
   * default action rather than finishing the filter. The real `TermFilter` is
   * rendered because the button is the kit's, not this file's.
   */
  it('finishes the filter rather than ticking the focused value', () => {
    const onClose = vi.fn()
    const onChosen = vi.fn()
    const anchors = { current: document.body }
    render(
      <div>
        <span data-column-funnel="DC" />
        <FilterMenu label="Vendor" code="DC" anchors={anchors} align="left" onClose={onClose}>
          <TermFilter
            label="Vendor"
            options={[{ value: 'harvi', label: 'Harvey', count: 3 }]}
            chosen={['harvi']}
            onChosen={onChosen}
          />
        </FilterMenu>
      </div>,
    )

    const tick = screen.getByRole('checkbox', { name: 'Harvey' })
    tick.focus()
    fireEvent.keyDown(tick, { key: 'Enter', bubbles: true })

    expect(onChosen).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  /**
   * The one press left alone is one inside a popover the kit drew: choosing
   * "\u2265 at least" from the operator list is that list's Enter, and the popover
   * is a portal of its own rather than anything inside this box.
   */
  it('leaves a press inside a popover the kit drew to the kit', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<Standing onClose={onClose} onConfirm={onConfirm} />)

    const portal = document.createElement('div')
    portal.setAttribute('data-base-ui-portal', '')
    const option = document.createElement('button')
    portal.append(option)
    document.body.append(portal)

    fireEvent.keyDown(option, { key: 'Enter', bubbles: true })

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    portal.remove()
  })
})

/**
 * **A menu is as tall as the screen leaves it** (Paul, 2026-09-10: "the filter
 * dialog for type also needs to be scrollable — right now it just runs off the
 * screen"). Type lists every phrase the trade has for a tool, and the menu was
 * drawn at whatever height that came to, under a header that can sit anywhere
 * down the page: everything past the bottom edge was unreachable, because a
 * `fixed` box is not on anything that scrolls.
 *
 * jsdom measures every box at zero, so the funnel is given the rect it would
 * have on screen — the input to the rule, and the only half worth pinning.
 */
describe('a filter menu against the bottom of the screen', () => {
  const Standing = ({ at }: { readonly at: number }) => {
    const anchors = useRef<HTMLDivElement>(null)
    const funnel = useRef<HTMLSpanElement>(null)
    useEffect(() => {
      const found = funnel.current
      if (found !== null) {
        found.getBoundingClientRect = () =>
          ({ top: at, bottom: at + 20, left: 40, right: 140, width: 100, height: 20 }) as DOMRect
      }
    }, [at])
    return (
      <div ref={anchors}>
        <span ref={funnel} data-column-funnel="DC" />
        <FilterMenu label="Type" code="DC" anchors={anchors} align="left" onClose={() => {}}>
          <p>the filter</p>
        </FilterMenu>
      </div>
    )
  }

  /** Two frames: the first look misses the ref, the second finds it. */
  const standing = async (at: number) => {
    render(<Standing at={at} />)
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    const menu = document.querySelector<HTMLElement>('[data-column-filter-menu]')
    expect(menu).not.toBeNull()
    return menu as HTMLElement
  }

  it('takes the room under the header and scrolls inside it', async () => {
    const menu = await standing(100)

    // 768 tall in jsdom, less the header at 120 and the margin at the edge.
    expect(menu.style.maxHeight).toBe('636px')
    expect(menu.style.top).toBe('124px')
    expect(menu.style.bottom).toBe('')
    expect(menu.querySelector('.overflow-y-auto')).not.toBeNull()
  })

  /**
   * The tool table's header can end up a strip above the bottom edge, and a
   * menu squeezed into it is one nobody can read. It opens upwards instead,
   * anchored by its bottom — a height it has not been measured at yet cannot
   * place its top without a frame of it in the wrong place.
   */
  it('opens upwards where what is under the header is a strip', async () => {
    const menu = await standing(700)

    expect(menu.style.top).toBe('')
    expect(menu.style.bottom).toBe('72px')
    expect(menu.style.maxHeight).toBe('688px')
  })
})
