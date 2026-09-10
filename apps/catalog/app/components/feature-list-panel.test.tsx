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
    brand: 'WIDIA',
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
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onRename: vi.fn(),
    onRenameStart: vi.fn(),
    onRenameCancel: vi.fn(),
  }
  render(
    <FeatureListPanel
      items={LIST}
      selectedId={null}
      open={[]}
      nameOf={nameOf}
      directionOf={() => '+Z'}
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
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit group…' }))

    expect(onEdit).toHaveBeenCalledWith('group-1')
    expect(onRemove).not.toHaveBeenCalled()
  })

  /**
   * **The three ways to add are not in here** (Paul, 2026-09-08: they live over
   * the part now — `components/add-bar.tsx`, tested there). An empty list draws
   * nothing at all, because there is nothing on it yet.
   */
  it('draws no list at all until something is on it', () => {
    show({ items: [] })

    expect(screen.queryByRole('list', { name: /Features/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^\+ /u })).not.toBeInTheDocument()
  })

  /**
   * **A tool assembly the part needs and no feature asked for** (Paul,
   * 2026-09-08). It is a row like any other — it can be selected and removed —
   * and it says on the row that it answers no feature, because a stack against
   * a feature nobody can see any more looks exactly the same otherwise.
   */
  it('draws a part-level assembly as a row that says it has no feature', () => {
    const { onEdit } = show({
      items: [{ kind: 'assembly', id: 'assembly-2', tags: [] }],
    })

    expect(screen.getByRole('button', { name: 'Tool assembly 2' })).toBeInTheDocument()
    expect(screen.getByText('no feature')).toBeInTheDocument()

    // Nothing to edit: it holds no features for an editor to ask about.
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Tool assembly 2' }))
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /^Edit/ })).not.toBeInTheDocument()
    expect(onEdit).not.toHaveBeenCalled()
  })

  /**
   * **The one row kind with a name to give** (Paul, 2026-09-08: naming a tool
   * assembly when it is made, and from the right-click menu afterwards). A
   * feature is called what it is and a group what it holds; an assembly
   * answering no feature has only its number.
   */
  it('names a part-level assembly where its name is drawn', () => {
    const { onRename, onRenameCancel } = show({
      items: [{ kind: 'assembly', id: 'assembly-2', tags: [] }],
      renamingId: 'assembly-2',
    })

    const field = screen.getByRole('textbox', { name: 'Name for Tool assembly 2' })
    // The placeholder is what the row goes on being called, not a prompt.
    expect(field).toHaveAttribute('placeholder', 'Tool assembly 2')
    fireEvent.change(field, { target: { value: 'Facing stack' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the name for Tool assembly 2' }))

    expect(onRename).toHaveBeenCalledWith('assembly-2', 'Facing stack')
    expect(onRenameCancel).not.toHaveBeenCalled()
  })

  it('draws the name it was given, and offers a rename on a right-click', () => {
    const { onRenameStart } = show({
      items: [{ kind: 'assembly', id: 'assembly-2', tags: [], name: 'Facing stack' }],
    })

    expect(screen.getByRole('button', { name: 'Facing stack' })).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Facing stack' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }))

    expect(onRenameStart).toHaveBeenCalledWith('assembly-2')
  })

  /**
   * **The name is on the stack, and the line stands for the stack** (Paul,
   * 2026-09-08: "it still isn't showing the name in the order list in the parts
   * page"). A feature's row answers with tools; what the shop called the stack
   * one of them stands in is the most readable thing about it.
   */
  it('says what the shop called the stack a line stands for', () => {
    show({
      answers: ANSWERS,
      assemblyOf: (itemId, toolGuid) =>
        itemId === 'feature-1' && toolGuid === '5510VXD375' ? 'big stupid' : null,
    })

    expect(screen.getByText('big stupid')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'big stupid: WIDIA 5510VXD375, Drill, for Pocket' }),
    ).toBeInTheDocument()
  })

  /** Most stacks are never named, and a number over a catalog number is noise. */
  it('says nothing where the stack was never named', () => {
    show({ answers: ANSWERS })

    expect(
      screen.getByRole('button', { name: 'WIDIA 5510VXD375, Drill, for Pocket' }),
    ).toBeInTheDocument()
  })

  /** A feature and a group are named by what they hold, and by nothing else. */
  it('offers no rename on a feature or a group', () => {
    show()

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Pocket' }))

    expect(screen.queryByRole('menuitem', { name: 'Rename…' })).not.toBeInTheDocument()
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

  /**
   * **A catalog number on its own is unreadable** (Paul, 2026-09-09: "I'd like
   * to add the tool type and vendor into the order list … it should say 'Emuge
   * 2810.0250 - Flat End Mill'"). The words are the Vendor and Type columns',
   * so the line says what the table beside it says about the same tool.
   */
  it('says who makes the tool and what it is, beside its catalog number', () => {
    show({ answers: ANSWERS })

    expect(screen.getByText('WIDIA')).toBeInTheDocument()
    expect(screen.getByText('- Drill')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'WIDIA 5510VXD375, Drill, for Pocket' }))

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
    fireEvent.click(
      screen.getAllByRole('button', { name: 'WIDIA B976Z02500, Drill, for Through Hole' })[0]!,
    )

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

  /**
   * **A row can be flagged and unanswered** (Paul, 2026-09-10: "the feature or
   * group should be shown in the order list with an 'incomplete' icon and a
   * dashed border, indicating that it is a feature or group that I flagged to do
   * something with but haven't added a tool assembly to yet").
   */
  it('marks a row with nothing ordered against it', () => {
    show({ incompleteIds: ['feature-1'] })

    expect(screen.getByRole('img', { name: 'No tool assembly yet' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pocket' }).closest('li')?.querySelector('.border-dashed'),
    ).not.toBeNull()
  })

  it('leaves an answered row unmarked', () => {
    show({ incompleteIds: [] })

    expect(screen.queryByRole('img', { name: 'No tool assembly yet' })).not.toBeInTheDocument()
  })

  /**
   * **And a marked row is answered with nothing at all.** A dash where a tool
   * goes is the same fact said twice, in the one place a tool is supposed to
   * appear — and a recommendation there was the defect the mark replaces.
   */
  it('draws no line under a row with no tools and nothing to say', () => {
    show({
      items: [LIST[0]!],
      incompleteIds: ['feature-1'],
      answers: [
        {
          id: 'feature-1',
          itemId: 'feature-1',
          tag: null,
          label: 'Pocket',
          picks: [],
          chosen: true,
          note: null,
          children: [],
        },
      ],
    })

    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  /**
   * **Two identical stacks are two things to set up** (Paul, 2026-09-10:
   * "duplicates … should show 2 assemblies and a count of two of each
   * component"). The sheet keys a line by its tool, so a row holding one cutter
   * in two stacks holds one line with a two on it.
   */
  it('says how many of an assembly the row ordered, where it is more than one', () => {
    show({
      items: [LIST[0]!],
      answers: [
        {
          id: 'feature-1',
          itemId: 'feature-1',
          tag: null,
          label: 'Pocket',
          picks: [{ tool: tool('5510VXD375', 9.525), holder: null, collet: null, total: 2 }],
          chosen: true,
          note: null,
          children: [],
        },
      ],
    })

    expect(screen.getByText('×2')).toBeInTheDocument()
  })

  it('says nothing about a count of one', () => {
    show({ answers: ANSWERS })

    expect(screen.queryByText('×1')).not.toBeInTheDocument()
  })

  /** Identical holes are one decision, so the row says how many it stands for. */
  it('counts the features a row stands for', () => {
    show()

    expect(
      within(screen.getByRole('button', { name: '2 × Through Hole' })).getByText('×2'),
    ).toBeInTheDocument()
  })
})
