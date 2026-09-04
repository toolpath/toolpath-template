import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GroupEditor } from './group-editor'

const nameOf = (tag: string): string => (tag.startsWith('hole') ? 'Through Hole' : 'Pocket')

const show = (props: Partial<Parameters<typeof GroupEditor>[0]> = {}) => {
  const handlers = {
    onResults: vi.fn(),
    onDrop: vi.fn(),
    onAddAll: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }
  render(
    <GroupEditor
      tags={['hole-1', 'pocket-1']}
      results="all"
      types={[
        { name: 'Through Hole', tags: ['hole-1', 'hole-2', 'hole-3'] },
        { name: 'Pocket', tags: ['pocket-1'] },
      ]}
      nameOf={nameOf}
      picked
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('building a group', () => {
  /** The features are picked on the part; what this box adds is what a click cannot say. */
  it('says how features get in, and shows what is in already', () => {
    show()

    expect(screen.getByText(/Click the features on the part/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Take Through Hole out of the group' }),
    ).toBeInTheDocument()
  })

  it('takes one out again', () => {
    const { onDrop } = show()

    fireEvent.click(screen.getByRole('button', { name: 'Take Pocket out of the group' }))

    expect(onDrop).toHaveBeenCalledWith('pocket-1')
  })

  /**
   * **Every hole on the part, in one press** (Paul, 2026-09-02: "quick buttons
   * to select all of a type of features"). Twelve clicked one at a time is
   * twelve chances to miss one.
   */
  it('adds every feature of a kind in one press, and says how many that is', () => {
    const { onAddAll } = show()

    fireEvent.click(screen.getByRole('button', { name: 'Add every Through Hole — 3 of them' }))

    expect(onAddAll).toHaveBeenCalledWith(['hole-1', 'hole-2', 'hole-3'])
  })

  /**
   * The result option is the whole reason a group is a thing rather than a
   * multiple selection: one tool that cuts all of them, or the best for each.
   */
  it('offers the two questions a group can ask, and reports the change', () => {
    const { onResults } = show()

    const each = screen.getByRole('button', { name: /The best tool for each/ })
    const all = screen.getByRole('button', { name: /One tool for all of them/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveClass('w-full')
    expect(each).toHaveClass('w-full')
    expect(all.firstElementChild).toHaveClass('w-full', 'justify-start', 'text-left')
    expect(each.firstElementChild).toHaveClass('w-full', 'justify-start', 'text-left')
    fireEvent.click(each)

    expect(onResults).toHaveBeenCalledWith('each')
  })

  /** A group of nothing is not a group, so the way out of an empty draft is Cancel. */
  it('will not confirm an empty group', () => {
    show({ tags: [] })

    expect(screen.getByText('Nothing in this group yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create group and add tool' })).toBeDisabled()
  })

  /**
   * **Picking a tool is what finishes it** (Paul, 2026-09-02: "I must select a
   * tool from the list when creating a feature, and that is what adds it to the
   * BOM"). The list under the part is already showing what fits the group as it
   * stands.
   */
  it('waits for a tool to be picked from the list', () => {
    show({ picked: false })

    expect(screen.getByRole('button', { name: 'Create group and add tool' })).toBeDisabled()
    expect(screen.getByText('Pick a tool from the list below.')).toBeInTheDocument()
  })

  it('waits for one-each recommendations before confirming', () => {
    show({ results: 'each', matching: 'pending' })

    expect(screen.getByRole('button', { name: 'Create group and add tools' })).toBeDisabled()
    expect(screen.getByText('Finding compatible tools...')).toBeInTheDocument()
    expect(screen.getByRole('status').firstElementChild).toHaveClass('animate-spin')
  })

  it('will not confirm a one-each group where a feature has no fitting tool', () => {
    show({ results: 'each', matching: 'nothing-fits', picked: false })

    expect(screen.getByRole('button', { name: 'Create group and add tools' })).toBeDisabled()
    expect(
      screen.getByText('Nothing in the catalog fits at least one feature.'),
    ).toBeInTheDocument()
  })

  /** An edit says it is one, in the heading and on the button. */
  it('says whether it is making a group or changing one', () => {
    show({ editing: true })

    expect(screen.getByText('Edit group')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save group' })).toBeInTheDocument()
  })
})
