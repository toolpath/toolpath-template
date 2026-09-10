// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from 'shared/rule-presets'
import type { Rule } from 'shared/rules'
import { RuleCard } from './rule-editor'

// Vitest is not configured with globals, so Testing Library's automatic
// cleanup never registers and renders pile up across tests.
afterEach(cleanup)

const preset = (id: string): Rule => {
  const rule = DEFAULT_RULES.find((each) => each.id === id)
  if (!rule) {
    throw new Error(`no preset ${id}`)
  }
  return rule
}

const drillSizes = preset('standard-drill-sizes')
const millingRatio = preset('milling-ld')

/**
 * The card wired to state, as the panel wires it. A rule editor that is not
 * driven by its own `onChange` cannot show these bugs at all: a box only loses
 * what is being typed into it once the edit has gone round the loop and come
 * back as a new `rule`.
 */
const EditableCard = ({ rule: initial, editing = true }: { rule: Rule; editing?: boolean }) => {
  const [rule, setRule] = useState(initial)

  return (
    <ul>
      <RuleCard
        editing={editing}
        focusedTag={null}
        hits={[]}
        onChange={setRule}
        onChoose={() => {}}
        onEdit={() => {}}
        onHover={() => {}}
        onOpen={() => {}}
        onRemove={() => {}}
        open
        rule={rule}
        scores={new Map()}
        types={[]}
        unit="millimeters"
      />
    </ul>
  )
}

const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const type = (label: string, value: string) => fireEvent.change(box(label), { target: { value } })

describe('typing a number into a rule', () => {
  /**
   * The sizes were keyed by their own value, so typing a digit changed the key
   * of the box being typed into and React replaced it — taking the half-typed
   * text and the focus with it.
   */
  it('keeps a half-typed number, and the focus, in the box being typed into', () => {
    render(<EditableCard rule={drillSizes} />)

    const first = box('Size 1')
    first.focus()

    type('Size 1', '')
    type('Size 1', '0.')

    expect(box('Size 1').value).toBe('0.')
    // The same element, not a replacement that happens to look like it.
    expect(box('Size 1')).toBe(first)
    expect(document.activeElement).toBe(first)
  })

  it('types a decimal through from an emptied box', () => {
    render(<EditableCard rule={drillSizes} />)

    for (const step of ['', '0', '0.', '0.3', '0.37', '0.375']) {
      type('Size 1', step)
    }
    fireEvent.blur(box('Size 1'))

    expect(box('Size 1').value).toBe('0.375')
  })

  /** The bug as reported: clearing a box left a 0 sitting in it. */
  it('restores the number when a required box is emptied and left', () => {
    render(<EditableCard rule={millingRatio} />)

    const before = box('alright to').value

    type('alright to', '')
    expect(box('alright to').value).toBe('')

    fireEvent.blur(box('alright to'))
    expect(box('alright to').value).toBe(before)
    expect(box('alright to').value).not.toBe('0')
  })

  /** The one limit a rule can go without, where empty is the answer itself. */
  it('lets the optional no-go limit be emptied for good', () => {
    render(<EditableCard rule={millingRatio} />)

    type('no go past', '')
    fireEvent.blur(box('no go past'))

    expect(box('no go past').value).toBe('')
  })

  /** `5.` is 5 to everybody but a parser. */
  it('takes a number left with a trailing point', () => {
    render(<EditableCard rule={millingRatio} />)

    type('easy to', '5.')
    fireEvent.blur(box('easy to'))

    expect(box('easy to').value).toBe('5')
  })

  it('rounds a weight rather than storing a decimal it will not show', () => {
    render(<EditableCard rule={millingRatio} />)

    type('Weight', '2.6')
    fireEvent.blur(box('Weight'))

    expect(box('Weight').value).toBe('3')
  })

  it('holds the separators while a list of sizes is typed', () => {
    render(<EditableCard editing={false} rule={drillSizes} />)

    for (const step of ['', '3', '3,', '3, ', '3, 6', '3, 6.', '3, 6.35']) {
      type('Sizes held', step)
    }

    expect(box('Sizes held').value).toBe('3, 6.35')

    fireEvent.blur(box('Sizes held'))
    expect(box('Sizes held').value).toBe('3, 6.35')
  })
})
