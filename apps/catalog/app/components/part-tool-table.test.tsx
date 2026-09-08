import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { CatalogTool } from '@toolpath/catalog-data'
import {
  flexibleColumnWidth,
  PartToolTable,
  TOOL_COLUMNS,
  ToolTableToolbar,
  type ToolColumnFiltering,
} from './part-tool-table'
import { EMPTY_QUERY } from 'shared/filter'

const first: CatalogTool = {
  guid: 'first',
  familyId: 'mills',
  brand: 'Acme',
  vendor: 'Acme',
  catalogNumber: 'T-20',
  materialNumber: '20',
  toolType: 'endmill',
  productLine: null,
  threadMethod: null,
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 20, LCF: 40 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}

const second: CatalogTool = {
  ...first,
  guid: 'second',
  catalogNumber: 'T-10',
  materialNumber: '10',
  geometry: { DC: 10, LCF: 30 },
}

const show = (over: Partial<Parameters<typeof PartToolTable>[0]> = {}) => {
  const onChoose = vi.fn()
  render(
    <div className="h-96">
      <PartToolTable
        tools={[first, second]}
        unit="millimeters"
        chosen={null}
        onChoose={onChoose}
        hiddenColumns={[]}
        columnOrder={['DC', 'LCF']}
        inBom={() => false}
        keptElsewhere={() => false}
        virtualized={false}
        {...over}
      />
    </div>,
  )
  return onChoose
}

const tableRows = (): Array<HTMLElement> =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-row-index]'))

describe('PartToolTable', () => {
  it('uses the UI table to sort all matching rows', async () => {
    show()

    expect(tableRows()[0]).toHaveTextContent('T-20')
    fireEvent.click(screen.getByText('Diameter'))

    await waitFor(() => expect(tableRows()[0]).toHaveTextContent('T-10'))
  })

  it('bridges click and Arrow Down selection to the part tool', async () => {
    const onChoose = show()
    const grid = screen.getByRole('grid')
    fireEvent.mouseDown(grid)
    fireEvent.click(screen.getByText('T-20'))

    await waitFor(() => expect(onChoose).toHaveBeenLastCalledWith(first))
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    await waitFor(() => expect(onChoose).toHaveBeenLastCalledWith(second))
  })

  it('does not restore the previous tool after a row changes the part selection', async () => {
    const choices = vi.fn()
    const ControlledTable = () => {
      const [chosen, setChosen] = useState(first.guid)
      return (
        <div className="h-96">
          <PartToolTable
            tools={[first, second]}
            unit="millimeters"
            chosen={chosen}
            onChoose={(tool) => {
              choices(tool)
              setChosen(tool.guid)
            }}
            hiddenColumns={[]}
            columnOrder={['DC', 'LCF']}
            inBom={() => false}
            keptElsewhere={() => false}
            virtualized={false}
          />
        </div>
      )
    }
    render(<ControlledTable />)

    const grid = screen.getByRole('grid')
    fireEvent.mouseDown(grid)
    fireEvent.click(screen.getByText('T-10'))

    await waitFor(() => expect(choices).toHaveBeenLastCalledWith(second))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(choices).toHaveBeenCalledTimes(1)
  })

  it('does not select a row while changing its holder', async () => {
    const onChoose = show({
      holding: {
        holdersFor: () => [{ guid: 'holder', label: 'BT30', trouble: null, holder: {} as never }],
        colletsFor: () => [],
        chosen: () => ({ holderGuid: null, colletGuid: null }),
        requiredStickout: () => null,
        stickoutFor: () => null,
        onChoose: vi.fn(),
      },
    })

    fireEvent.click(screen.getAllByRole('combobox', { name: 'Holder for T-20' })[0]!)
    fireEvent.click(screen.getByRole('option', { name: 'BT30' }))

    expect(onChoose).not.toHaveBeenCalled()
  })

  /**
   * **The column is the stack's length, not the tool's own** (Paul,
   * 2026-09-08: "we can plainly see that more of the tool is beneath the
   * holder"). It printed `geometry.LBH`, which is the length a tool is set up
   * at with no holder and no feature, beside a panel drawing the same tool
   * three times further out — because the holder the column used to ask about
   * was a dropdown on the row, and the assembly tree took those out.
   */
  it('prints the length below the holder the open stack needs, not the tool’s own', () => {
    show({
      columns: TOOL_COLUMNS,
      hiddenColumns: [],
      columnOrder: ['LBH'],
      // The tool's own setup length, which is what the column used to print.
      tools: [{ ...first, geometry: { ...first.geometry, LBH: 44 } }],
      below: () => ({ length: 52, needs: 52, most: 60, overLimit: false }),
    })

    expect(tableRows()[0]).toHaveTextContent('52.00 mm')
    expect(screen.getAllByText('holder needs').length).toBeGreaterThan(0)
  })

  /** A tool too short to be set that far out says both lengths, so somebody can act on it. */
  it('says what the stack needs and what the tool holds when it cannot reach', () => {
    show({
      columns: TOOL_COLUMNS,
      hiddenColumns: [],
      columnOrder: ['LBH'],
      below: () => ({ length: 45, needs: 70, most: 45, overLimit: true }),
    })

    expect(tableRows()[0]).toHaveTextContent('needs 70.00 mm out, holds 45.00 mm')
  })

  /** With nothing holding it, the tool's own setup length is the honest answer. */
  it('falls back to the tool’s own length below holder with no stack', () => {
    show({
      columns: TOOL_COLUMNS,
      hiddenColumns: [],
      columnOrder: ['LBH'],
      tools: [{ ...first, geometry: { ...first.geometry, LBH: 60 } }],
    })

    expect(tableRows()[0]).toHaveTextContent('60.00 mm')
    expect(screen.queryByText('holder needs')).not.toBeInTheDocument()
  })

  it('keeps the table grid wider than its scroll container', () => {
    show({
      columns: TOOL_COLUMNS,
      hiddenColumns: [],
      columnOrder: TOOL_COLUMNS.map((column) => column.code),
    })

    expect(document.querySelector('[data-table-library_table]')).toHaveClass('min-w-max')
  })

  it('uses flexible tracks for initial column widths', () => {
    expect(flexibleColumnWidth('10rem')).toBe('minmax(10rem, 1fr)')
  })
})

/**
 * **The filters are not behind a button any more** (Paul, 2026-09-08: "I don't
 * love how the filters are hidden behind the button right now, especially with
 * so many also being column headers").
 */
describe('ToolTableToolbar', () => {
  it('shows the questions no column asks, without a press', () => {
    render(<ToolTableToolbar filters={<span>Catalog filters</span>} onClear={() => {}} set={0} />)

    expect(screen.getByText('Catalog filters')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Matching settings' })).not.toBeInTheDocument()
  })

  /**
   * A filter set in a column header somebody then hides has nothing on screen
   * pointing at it. The count is what says the list is narrowed, and the button
   * under it is the way back to the whole list.
   */
  it('counts every narrowing, the headers included, and clears them', () => {
    const onClear = vi.fn()
    render(<ToolTableToolbar filters={<span>Catalog filters</span>} onClear={onClear} set={3} />)

    const button = screen.getByRole('button', { name: 'Clear 3 filters' })
    fireEvent.click(button)

    expect(onClear).toHaveBeenCalledOnce()
  })

  it('says nothing about filters while none are set', () => {
    render(<ToolTableToolbar filters={<span>Catalog filters</span>} onClear={() => {}} set={0} />)

    expect(screen.queryByRole('button', { name: /Clear/ })).not.toBeInTheDocument()
  })
})

/**
 * **A column that names a value is where that value is narrowed.**
 *
 * Vendor, Type and every geometry code were a popover of controls saying the
 * same words as the headings under it. The heading asks now, and the funnel on
 * it is what says so before it is pressed.
 */
describe('the filters a heading asks', () => {
  const filtering = (
    over: Partial<NonNullable<ToolColumnFiltering['catalog']>> = {},
  ): ToolColumnFiltering => ({
    search: { value: '', onChange: vi.fn() },
    catalog: {
      query: EMPTY_QUERY,
      onTerm: vi.fn(),
      onRange: vi.fn(),
      options: () => [{ value: 'Acme', label: 'Acme', count: 2 }],
      ...over,
    },
  })

  it('narrows the vendor from the Vendor heading', async () => {
    const onTerm = vi.fn()
    show({ filtering: filtering({ onTerm }) })

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Vendor' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Acme' }))

    expect(onTerm).toHaveBeenCalledWith('brand', ['Acme'])
  })

  /**
   * The header is the sort, so a press inside the filter must not also re-sort
   * the column it is standing on.
   */
  it('does not sort the column the filter was opened from', async () => {
    show({ filtering: filtering() })

    expect(tableRows()[0]).toHaveTextContent('T-20')
    fireEvent.click(screen.getByRole('button', { name: 'Filter by Diameter' }))
    fireEvent.click(await screen.findByRole('group', { name: 'Diameter' }))

    expect(tableRows()[0]).toHaveTextContent('T-20')
  })

  /**
   * **What a contextual list is not showing is offered per axis** (Paul,
   * 2026-09-08: "I should always have a '...' row at the bottom of the
   * recommended filter options to expand any filter to show what it's hiding
   * from the list"). The Type column and the Vendor column ask the same shape of
   * question about different axes, so each gets its own answer.
   */
  it('offers what an axis is hiding behind the row on that column', () => {
    const hidden = (axis: string) =>
      axis === 'type' ? [{ value: 'Flat end mill', label: 'Flat end mill' }] : []
    show({ filtering: filtering({ hidden }) })

    /*
      The menu is a portal rendered on the press itself, so it is read back
      synchronously and scoped to the menu — a role query across a table of rows
      is slow enough to time this test out under a parallel run.
    */
    fireEvent.click(screen.getByRole('button', { name: 'Filter by Vendor' }))
    const vendor = screen.getByRole('group', { name: 'Vendor' })
    expect(within(vendor).queryByRole('button', { name: /more/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Type' }))
    const type = screen.getByRole('group', { name: 'Type' })
    fireEvent.click(within(type).getByRole('button', { name: '… 1 more' }))

    expect(within(type).getByRole('checkbox', { name: /Flat end mill/ })).toBeInTheDocument()
  })

  /** The two cells that set a choice rather than hold a value ask nothing. */
  it('leaves the holder and collet cells alone', () => {
    show({
      filtering: filtering(),
      hiddenColumns: [],
      columnOrder: ['DC', 'holder', 'collet'],
      columns: TOOL_COLUMNS,
    })

    expect(screen.queryByRole('button', { name: 'Filter by Holder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filter by Collet' })).not.toBeInTheDocument()
  })

  /**
   * A tap list is swept out of the catalog by its thread, so the tool filters
   * never reach it. It narrows on its catalog number, and its other headings
   * sort rather than offering a control that would change nothing.
   */
  it('offers only the search where the rows do not come from the query', () => {
    show({ filtering: { search: { value: '', onChange: vi.fn() } } })

    expect(screen.getByRole('button', { name: 'Filter by Catalog number' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Filter by Vendor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filter by Diameter' })).not.toBeInTheDocument()
  })

  it('asks nothing at all where the list is not being narrowed', () => {
    show()

    expect(screen.queryByRole('button', { name: /^Filter by/ })).not.toBeInTheDocument()
  })
})
