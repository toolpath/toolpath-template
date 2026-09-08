import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GroupEditor } from './group-editor'

const nameOf = (tag: string): string => (tag.startsWith('hole') ? 'Through Hole' : 'Pocket')

const show = (props: Partial<Parameters<typeof GroupEditor>[0]> = {}) => {
  const handlers = {
    onDrop: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }
  render(
    <GroupEditor
      tags={['hole-1', 'pocket-1']}
      results="all"
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

    expect(
      screen.getByText(/Select a feature on the part to add it to the group/),
    ).toBeInTheDocument()
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
   * **A group asks one question, so the box no longer offers one** (Paul,
   * 2026-09-08). Every group is *one tool for all of them*, and the note says
   * so where the radio pair used to be. What is parked is only the offer: the
   * model still has `each`, a group already saved as one still answers, and
   * the confirm still reads its words off `results`.
   */
  it('says what a group answers instead of offering the only choice there is', () => {
    show()

    expect(
      screen.getByText(
        'Select a feature on the part to add it to the group. The Tool Catalog will find tools compatible with all features in the group.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /One tool for all of them/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /The best tool for each/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Add every/ })).toBeNull()
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
