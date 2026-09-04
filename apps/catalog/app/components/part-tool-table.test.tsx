import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CatalogTool } from '@toolpath/catalog-data'
import {
  flexibleColumnWidth,
  PartToolTable,
  TOOL_COLUMNS,
  ToolTableToolbar,
} from './part-tool-table'

const first: CatalogTool = {
  guid: 'first',
  familyId: 'mills',
  brand: 'Acme',
  vendor: 'Acme',
  catalogNumber: 'T-20',
  materialNumber: '20',
  toolType: 'endmill',
  productLine: null,
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

describe('ToolTableToolbar', () => {
  it('opens the filters inline without adding a second settings panel', () => {
    render(<ToolTableToolbar filters={<span>Catalog filters</span>} onClear={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByText('Catalog filters')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Matching settings' })).not.toBeInTheDocument()
  })

  it('clears filters from the Filters button context menu', () => {
    const onClear = vi.fn()
    render(<ToolTableToolbar filters={<span>Catalog filters</span>} onClear={onClear} />)

    const button = screen.getByRole('button', { name: 'Filters' })
    expect(button).toHaveAttribute('title', 'Open filters. Right-click to clear all filters.')
    fireEvent.contextMenu(button)

    expect(onClear).toHaveBeenCalledOnce()
  })
})
