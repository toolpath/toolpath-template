import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { CatalogTool } from '@toolpath/catalog-data'
import { FeatureListPanel } from './feature-list-panel'
import type { ListItem } from 'shared/feature-list'
import type { RecommendationRow } from 'shared/recommendations'

const tool = (catalogNumber: string, DC: number): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    form: 'drill',
    geometry: { DC },
  }) as unknown as CatalogTool

const ANSWERS: Array<RecommendationRow> = [
  {
    id: 'feature-1',
    itemId: 'feature-1',
    tag: null,
    label: 'Pocket',
    picks: [{ tool: tool('5510VXD375', 9.525), holder: null, collet: null }],
    chosen: false,
    note: null,
    children: [],
  },
  {
    id: 'group-1',
    itemId: 'group-1',
    tag: null,
    label: '2 × Through Hole',
    picks: [],
    chosen: false,
    note: '2 tools, one per feature',
    children: [
      {
        id: 'group-1:hole-1',
        itemId: 'group-1',
        tag: 'hole-1',
        label: 'Through Hole',
        picks: [{ tool: tool('B976Z02500', 2.5), holder: null, collet: null }],
        chosen: false,
        note: null,
        children: [],
      },
      {
        id: 'group-1:hole-2',
        itemId: 'group-1',
        tag: 'hole-2',
        label: 'Through Hole',
        picks: [],
        chosen: false,
        note: 'nothing fits',
        children: [],
      },
    ],
  },
]

const LIST: Array<ListItem> = [
  { kind: 'feature', id: 'feature-1', tags: ['pocket-1'] },
  { kind: 'group', id: 'group-1', tags: ['hole-1', 'hole-2'], results: 'all' },
]

const nameOf = (tag: string): string => (tag.startsWith('hole') ? 'Through Hole' : 'Pocket')

const show = (props: Partial<Parameters<typeof FeatureListPanel>[0]> = {}) => {
  const handlers = {
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onAddFeature: vi.fn(),
    onAddGroup: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
  }
  render(
    <FeatureListPanel
      items={LIST}
      selectedId={null}
      open={[]}
      nameOf={nameOf}
      directionOf={() => '+Z'}
      addingFeature={false}
      unit="millimeters"
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('the list of what has been asked about', () => {
  /**
   * **The selection used to be invisible** (Paul, 2026-09-02): the tool list
   * was judged against everything clicked, with nothing on screen saying what
   * "everything" was.
   */
  it('names every row, a group by what is in it', () => {
    show()

    expect(screen.getByRole('button', { name: 'Pocket' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 × Through Hole' })).toBeInTheDocument()
  })

  /**
   * What a group was asked for is on its row: it changes the answer
   * underneath, and a shop should not have to open a dialog to see which
   * question was put.
   */
  it('says on the row what a group wants back', () => {
    show({ items: [{ kind: 'group', id: 'group-1', tags: ['hole-1'], results: 'each' }] })

    expect(screen.getByText('one each')).toBeInTheDocument()
  })

  it('selects a row, and puts the selected one down again', () => {
    const { onSelect } = show({ selectedId: 'feature-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Pocket' }))

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  /** Only a group opens; a feature has nothing inside it to show. */
  it('opens a group to what is in it, and offers no caret on a feature', () => {
    show({ open: ['group-1'] })

    const contents = screen.getByRole('button', { name: 'Close 2 × Through Hole' })
    expect(contents).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Open Pocket/ })).not.toBeInTheDocument()
    expect(screen.getAllByText('Through Hole')).toHaveLength(2)
  })

  /** Right-click is the way to an edit (Paul, 2026-09-02). */
  it('offers edit and remove on a right-click', () => {
    const { onEdit, onRemove } = show()

    fireEvent.contextMenu(screen.getByRole('button', { name: '2 × Through Hole' }))
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit group…' }))

    expect(onEdit).toHaveBeenCalledWith('group-1')
    expect(onRemove).not.toHaveBeenCalled()
  })

  /**
   * **Two buttons, not one that asks** (Paul, 2026-09-02: "it should show
   * buttons for Add Feature or Add Group, not the weird combined one"). A `+`
   * that opened a menu of two hid both of them until it was pressed.
   */
  it('offers both on show, without a menu in between', () => {
    const { onAddGroup } = show()

    fireEvent.click(screen.getByRole('button', { name: 'Add group' }))

    expect(screen.getByRole('button', { name: 'Add feature' })).toBeInTheDocument()
    expect(onAddGroup).toHaveBeenCalled()
  })

  /**
   * **Pressable, then asking** (Paul, 2026-09-02: "Add feature is greyed out by
   * default, which makes it confusing — it should be clickable, then just
   * prompt you to click on the part"). Disabled, it read as broken rather than
   * as waiting for the one thing it needs.
   */
  it('asks for a face rather than refusing to be pressed', () => {
    const { onAddFeature } = show()

    const add = screen.getByRole('button', { name: 'Add feature' })
    expect(add).toBeEnabled()
    fireEvent.click(add)

    expect(onAddFeature).toHaveBeenCalled()
  })

  it('says what it is waiting for once it has been pressed', () => {
    show({ addingFeature: true })

    expect(screen.getByText(/Click a face on the part, then press Add feature/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add feature' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /** An empty list is the two buttons and nothing else: there is nothing to draw yet. */
  it('draws no list at all until something is on it', () => {
    show({ items: [] })

    expect(screen.queryByRole('list', { name: /Features/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add group' })).toBeInTheDocument()
  })

  /**
   * **The answer sits under the question** (Paul, 2026-09-02: "just show the
   * tool for the group or selected features in the feature list, under the
   * folder or feature"). The recommendations were a table of their own under
   * the part, which is a second place to read the same list.
   */
  it('shows the tool it recommends under the row it is for', () => {
    show({ answers: ANSWERS })

    expect(screen.getByText('5510VXD375')).toBeInTheDocument()
    expect(screen.getByText('9.53 mm')).toBeInTheDocument()
  })

  it('distinguishes a pending recommendation from nothing fitting', () => {
    show({
      answers: [
        {
          ...ANSWERS[0]!,
          picks: [],
          note: 'Finding a compatible tool...',
        },
      ],
    })

    expect(screen.getByText('Finding a compatible tool...')).toBeInTheDocument()
    expect(screen.getByRole('status').firstElementChild).toHaveClass('animate-spin')
    expect(screen.queryByText('nothing fits')).not.toBeInTheDocument()
  })

  /** And pressing it asks that row's question in full. */
  it('asks for everything that fits when its tool is pressed', () => {
    const { onSelect } = show({ answers: ANSWERS })

    fireEvent.click(screen.getByRole('button', { name: '5510VXD375 for Pocket' }))

    expect(onSelect).toHaveBeenCalledWith('feature-1', null, '5510VXD375')
  })

  /**
   * A group asked for one tool each has no single answer, so what sits under it
   * is its features — each with its own, and each a way through to the tools
   * that fit that one feature.
   */
  it('answers a one-each group per feature, once it is open', () => {
    const { onSelect } = show({ answers: ANSWERS, open: ['group-1'] })

    expect(screen.getByText('nothing fits')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'B976Z02500 for Through Hole' })[0]!)

    expect(onSelect).toHaveBeenCalledWith('group-1', 'hole-1', 'B976Z02500')
  })

  /** Closed, it says how many answers it is standing in front of. */
  it('counts a closed one-each group’s answers rather than hiding them', () => {
    show({ answers: ANSWERS })

    expect(screen.getByText('2 tools, one per feature')).toBeInTheDocument()
  })

  /** A row with no answer says so in grey rather than offering a press that opens nothing. */
  it('offers no press where there is no tool to press', () => {
    show({ answers: ANSWERS })

    expect(
      screen.queryByRole('button', { name: /2 tools, one per feature/ }),
    ).not.toBeInTheDocument()
  })

  /** Identical holes are one decision, so the row says how many it stands for. */
  it('counts the features a row stands for', () => {
    show()

    expect(
      within(screen.getByRole('button', { name: '2 × Through Hole' })).getByText('×2'),
    ).toBeInTheDocument()
  })
})
