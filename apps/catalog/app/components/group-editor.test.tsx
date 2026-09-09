import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GroupEditor } from './group-editor'
import type { GroupReading } from 'shared/group-geometry'

const nameOf = (tag: string): string => (tag.startsWith('hole') ? 'Through Hole' : 'Pocket')

const show = (props: Partial<Parameters<typeof GroupEditor>[0]> = {}) => {
  const handlers = {
    onDrop: vi.fn(),
    onCancel: vi.fn(),
  }
  render(
    <GroupEditor
      tags={['hole-1', 'pocket-1']}
      results="all"
      nameOf={nameOf}
      unit="millimeters"
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

  /**
   * **The box confirms nothing, and cancels nothing** (Paul, 2026-09-09: "I no
   * longer need these cancel or create group and add tool buttons — the group
   * is created and added when a tool assembly is created and added to the order
   * list"). The press under the stack makes the row and writes the assembly in
   * one go, and the X in the corner of the box is the way out; a second confirm
   * here is the two-ways-to-do-it defect `docs/FEATURE-LIST.md` exists to stop.
   */
  it('offers no confirm and no cancel of its own', () => {
    show()

    expect(screen.queryByRole('button', { name: /^Create group and add tools?$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save group' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  /** A group of nothing is not a group, and the box says which it is. */
  it('says an empty group is empty', () => {
    show({ tags: [] })

    expect(screen.getByText('Nothing in this group yet.')).toBeInTheDocument()
  })

  /**
   * **Picking a tool is what finishes it** (Paul, 2026-09-02: "I must select a
   * tool from the list when creating a feature, and that is what adds it to the
   * BOM"). The list under the part is already showing what fits the group as it
   * stands, and the press that orders it is under the stack.
   */
  it('says a tool has still to be picked from the list', () => {
    show({ picked: false })

    expect(
      screen.getByText('Pick a tool from the list below, then add the assembly to the order list.'),
    ).toBeInTheDocument()
  })

  it('says while one-each recommendations are still being found', () => {
    show({ results: 'each', matching: 'pending' })

    expect(screen.getByText('Finding compatible tools...')).toBeInTheDocument()
    expect(screen.getByRole('status').firstElementChild).toHaveClass('animate-spin')
  })

  it('says where a one-each group has a feature nothing fits', () => {
    show({ results: 'each', matching: 'nothing-fits', picked: false })

    expect(
      screen.getByText('Nothing in the catalog fits at least one feature.'),
    ).toBeInTheDocument()
  })

  /**
   * **Escape backs out of the box, the same as Cancel** (Paul, 2026-09-08).
   * The draft had no answer of its own, so the press fell through to the page
   * underneath, which dropped the reading and left the group open — the only
   * way out of it was the mouse.
   */
  it('backs out on Escape', () => {
    const { onCancel } = show()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  /** An edit says it is one in the heading; the press that saves it is the route's. */
  it('says whether it is making a group or changing one', () => {
    show({ editing: true })

    expect(screen.getByText('Edit group')).toBeInTheDocument()
  })
})

/**
 * **A group is one tool for all of them**, so the box says what that tool is up
 * against: the hardest of the group's readings, and the feature that set it
 * (Paul, 2026-09-08). The fold is `shared/group-geometry`, tested there; what
 * this pins is that the panel says both halves of it.
 */
describe('what the group measures', () => {
  const reading = (over: Partial<GroupReading>): GroupReading => ({
    name: 'depth below top',
    unit: 'mm',
    icon: 'depthBelowTop',
    bound: 'floor',
    value: 40,
    featureTag: 'hole-1',
    per: [
      { featureTag: 'hole-1', value: 40 },
      { featureTag: 'pocket-1', value: 20 },
    ],
    ...over,
  })

  it('shows the worst case of the group', () => {
    show({ readings: [reading({})] })

    expect(screen.getByText('Worst case in the group')).toBeInTheDocument()
    expect(screen.getByText('40.00 mm')).toBeInTheDocument()
    expect(screen.getByText('depth below top')).toBeInTheDocument()
  })

  /**
   * **The feature it came from is not on screen** (Paul, 2026-09-08). The chips
   * above already say what is in the group, so naming one beside every number
   * said it again; the tooltip below still traces it.
   */
  it('does not name the feature beside the number', () => {
    show({ readings: [reading({})] })

    // The chips above still name it; what came off is the name beside the
    // number, so the label is the field and nothing else.
    const label = screen.getByText('depth below top')
    expect(label.tagName).toBe('DT')
    expect(label.querySelector('span')).toBeNull()
    expect(screen.getByText('40.00 mm').closest('div')).toHaveAttribute(
      'title',
      'Through Hole 40.00 mm · Pocket 20.00 mm',
    )
  })

  /**
   * A field with no hard end to it — two holes of different diameters — has no
   * worst case, so the box says they differ rather than showing one of them.
   */
  it('says a field differs rather than showing one side of it', () => {
    show({
      readings: [
        reading({
          name: 'hole diameter',
          icon: 'diameter',
          bound: 'match',
          value: null,
          featureTag: null,
          per: [
            { featureTag: 'hole-1', value: 6 },
            { featureTag: 'pocket-1', value: 8 },
          ],
        }),
      ],
    })

    expect(screen.getByText('differs')).toBeInTheDocument()
    expect(screen.getByText('hole diameter').closest('div')).toHaveAttribute(
      'title',
      'Through Hole 6.00 mm · Pocket 8.00 mm',
    )
  })

  /** Nothing measured is no section: an empty strip reads as a failed measurement. */
  it('shows no section while the group has nothing to measure', () => {
    show()

    expect(screen.queryByText('Worst case in the group')).toBeNull()
  })
})

/**
 * **A group of holes is threaded as a group** (Paul, 2026-09-09: "I should be
 * able to apply threads to the full group in the Group dialog if desired").
 * The thread is named on the reading panel and this box stands in its place
 * while a group is being built, so without it a bolt circle picked out here had
 * to be taken apart again to say it was tapped.
 */
describe('threading the whole group', () => {
  it('offers the thread where every hole in the group is one bore', () => {
    show({
      tags: ['hole-1', 'hole-2'],
      thread: { holeDiameter: 5, mode: 'plain', spec: null, onChange: vi.fn() },
    })

    expect(screen.getByRole('button', { name: 'Thread' })).toBeInTheDocument()
  })

  /**
   * A tap has one nominal size, so a group of a ⌀5 and a ⌀6 is two threads —
   * and a control that quietly disappeared when the second hole joined would
   * read as a bug rather than as a fact about the group.
   */
  it('says why it cannot, where the holes are different sizes', () => {
    show({ tags: ['hole-1', 'hole-2'], mixed: true })

    expect(screen.getByText(/different sizes, so they cannot share one thread/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thread' })).not.toBeInTheDocument()
  })

  /** And a group holding no holes at all is asked nothing about threads. */
  it('says nothing about threads for a group that is not holes', () => {
    show()

    expect(screen.queryByText(/cannot share one thread/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thread' })).not.toBeInTheDocument()
  })
})
