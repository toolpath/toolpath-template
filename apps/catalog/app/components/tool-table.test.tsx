import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CatalogTool } from '@toolpath/catalog-data'
import { ToolTable } from './tool-table'

const tool: CatalogTool = {
  guid: 'aaaa-1111',
  familyId: 'vhm-endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: '6694846',
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 12.7, NOF: 4 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}

const show = (tools: ReadonlyArray<CatalogTool>, unit: 'in' | 'mm' = 'mm') =>
  render(
    <MemoryRouter>
      <ToolTable tools={tools} unit={unit} />
    </MemoryRouter>,
  )

describe('a column that the rail also asks about', () => {
  /**
   * One filter, one place to answer it: the header opens the rail's own
   * bubble rather than a second control for the same question (Paul,
   * 2026-09-01).
   */
  it('hands its filter to the rail instead of opening its own', () => {
    const onRailFilter = vi.fn()
    render(
      <MemoryRouter>
        <ToolTable
          tools={[tool]}
          unit="mm"
          onRange={() => {}}
          onRailFilter={onRailFilter}
          railKeys={{ DC: 'DC' }}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Diameter' }))

    expect(onRailFilter).toHaveBeenCalledWith('DC')
    // And no second control opened in the header.
    expect(screen.queryByRole('textbox', { name: /Diameter/ })).not.toBeInTheDocument()
  })

  it('keeps its own control for a column the rail does not ask about', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" onRange={() => {}} onRailFilter={() => {}} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Diameter' }))

    expect(screen.getByRole('combobox', { name: /How to compare Diameter/ })).toBeInTheDocument()
  })
})

describe('a list of near misses', () => {
  /**
   * Nothing in the crib fits, so the list is what came closest — and a row
   * nobody can use says so on the row (Paul, 2026-09-01).
   */
  it('marks every row when the list is the closest misses', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" nearest />
      </MemoryRouter>,
    )

    expect(screen.getByText('near miss')).toBeInTheDocument()
  })

  it('marks nothing when the list is tools that fit', () => {
    show([tool])

    expect(screen.queryByText('near miss')).not.toBeInTheDocument()
  })
})

describe('what a tool stands out', () => {
  const held: CatalogTool = { ...tool, geometry: { DC: 12.7, NOF: 4, LBH: 40, OAL: 60 } }

  /** On its own: the overall length less the shank the clamping rule holds. */
  it('shows the tool’s own length below the holder', () => {
    show([held])

    expect(screen.getByText('40.00 mm')).toBeInTheDocument()
  })

  /**
   * A holder chosen makes the part decide instead, and where that is a
   * different number the cell says it was the holder (Paul, 2026-09-01).
   */
  it('says when a holder changed it', () => {
    render(
      <MemoryRouter>
        <ToolTable
          tools={[held]}
          unit="mm"
          holding={{
            holdersFor: () => [],
            colletsFor: () => [],
            chosen: () => ({ holderGuid: 'h', colletGuid: null }),
            requiredStickout: () => 47,
            stickoutFor: () => 47,
            onChoose: () => {},
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('holder needs')).toBeInTheDocument()
    expect(screen.getByText('47.00 mm')).toBeInTheDocument()
  })
})

describe('ToolTable', () => {
  it('links a tool by the number a shop orders it with', () => {
    show([tool])

    expect(screen.getByRole('link', { name: 'TDMX0500' })).toHaveAttribute(
      'href',
      '/tools/aaaa-1111',
    )
  })

  it('shows every dimension in the unit being read in', () => {
    show([tool], 'in')

    expect(screen.getByText('0.500 in')).toBeInTheDocument()
  })

  /** A zero would read as a measured value of zero, which is a different claim. */
  it('marks a dimension the vendor does not state rather than showing a zero', () => {
    show([tool])

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells).toContain('—')
    expect(cells).not.toContain('0.00 mm')
  })

  it('says so when nothing matches, instead of rendering an empty table', () => {
    show([])

    expect(screen.getByText(/No tool in the catalog matches/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('where the page has somewhere to put a tool', () => {
  /**
   * Leaving the part to read a tool loses the selection that produced the list,
   * so the number chooses the tool instead of navigating to it.
   */
  it('chooses the tool rather than linking away', async () => {
    const chosen: Array<string> = []
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" onChoose={(each) => chosen.push(each.guid)} />
      </MemoryRouter>,
    )

    const number = screen.getByRole('button', { name: 'TDMX0500' })
    expect(screen.queryByRole('link', { name: 'TDMX0500' })).not.toBeInTheDocument()

    number.click()
    expect(chosen).toEqual(['aaaa-1111'])
  })

  /** One click is one choice, even though the row is clickable too. */
  it('does not choose twice when the number inside a clickable row is clicked', () => {
    const chosen: Array<string> = []
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" onChoose={(each) => chosen.push(each.guid)} />
      </MemoryRouter>,
    )

    screen.getByRole('button', { name: 'TDMX0500' }).click()

    expect(chosen).toHaveLength(1)
  })

  it('still links to the tool page where nothing else can show it', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'TDMX0500' })).toHaveAttribute(
      'href',
      '/tools/aaaa-1111',
    )
  })
})

describe('the L/D column', () => {
  /** The figure the dataset derived, shown by default: it is the first thing compared to a depth. */
  it('is shown by default, as the dataset’s own figure', () => {
    show([{ ...tool, geometry: { DC: 10, LCF: 26, LD: 2.6 } }])

    expect(screen.getByRole('columnheader', { name: 'L/D' })).toBeInTheDocument()
    expect(screen.getByText('2.6')).toBeInTheDocument()
  })

  it('can be hidden like any other column', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" hiddenColumns={['LD']} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('columnheader', { name: 'L/D' })).not.toBeInTheDocument()
  })
})

describe('the order of the columns', () => {
  /**
   * The order is the page's, dragged in the column picker, so the table takes
   * it as given rather than owning it (Paul, 2026-08-31).
   */
  it('draws them in the order it is given', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" columnOrder={['RE', 'DC', 'LCF']} />
      </MemoryRouter>,
    )
    const headers = screen.getAllByRole('columnheader').map((each) => each.textContent)

    expect(headers.indexOf('Corner radius')).toBeLessThan(headers.indexOf('Diameter'))
  })

  /** A column the order has never heard of is still drawn, on the end. */
  it('keeps a column the order does not mention', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" columnOrder={['RE']} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('columnheader', { name: 'Diameter' })).toBeInTheDocument()
  })
})

describe('the holder and collet columns', () => {
  const holding = {
    holdersFor: () => [{ guid: 'h1', label: 'BT30ER16060M', trouble: null, holder: {} as never }],
    colletsFor: (_tool: CatalogTool, holderGuid: string | null) =>
      holderGuid === null ? [] : [{ guid: 'c1', label: 'ER16-8' }],
    chosen: () => ({ holderGuid: null, colletGuid: null }),
    requiredStickout: () => null,
    stickoutFor: () => null,
    onChoose: vi.fn(),
  }

  /** Off unless asked for: they are a choice, and the list opens on geometry. */
  it('are hidden until they are ticked', () => {
    show([tool])

    expect(screen.queryByRole('columnheader', { name: 'Holder' })).not.toBeInTheDocument()
  })

  /**
   * Shown, each row asks the question rather than reporting an answer — and
   * what is picked here is what *Add to list* opens on.
   */
  it('are a dropdown per row when they are shown', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" hiddenColumns={[]} holding={holding} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('combobox', { name: 'Holder for TDMX0500' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'BT30ER16060M' })).toBeInTheDocument()
    // Nothing is chosen, so there is no holder to take a collet.
    expect(screen.getByRole('combobox', { name: 'Collet for TDMX0500' })).toBeDisabled()
  })
})

describe('the order list button', () => {
  const kept = () => ({ onBom: vi.fn(), onRemoveBom: vi.fn(), onAlsoBom: vi.fn() })

  it('adds a tool that is not on the bill at all', () => {
    const on = kept()
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" {...on} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Add TDMX0500/ }))

    expect(on.onBom).toHaveBeenCalled()
    expect(on.onAlsoBom).not.toHaveBeenCalled()
  })

  /** Kept for the feature in view, the same button takes it back off. */
  it('removes a tool kept for this feature', () => {
    const on = kept()
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" inBom={() => true} {...on} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Remove TDMX0500/ }))

    expect(on.onRemoveBom).toHaveBeenCalledWith(tool)
  })

  /**
   * Kept for **another** feature, it offers a plus instead: one cutter often
   * does more than one feature, and the holder it already has comes with it
   * rather than being chosen again (Paul, 2026-08-31).
   */
  it('offers a plus for a tool already kept elsewhere', () => {
    const on = kept()
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" keptElsewhere={() => true} {...on} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Also cut this feature/ }))

    expect(on.onAlsoBom).toHaveBeenCalledWith(tool)
    expect(on.onBom).not.toHaveBeenCalled()
  })
})
