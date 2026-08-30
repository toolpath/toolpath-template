import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
