import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ComponentTally, type ComponentTallyRow } from './component-tally'

const holder = (over: Partial<ComponentTallyRow> = {}): ComponentTallyRow => ({
  key: 'holder:bt30',
  component: 'holder',
  kind: 'Holder',
  icon: null,
  brand: 'REGO-FIX',
  catalogNumber: 'BT30-ER16',
  detail: 'BT30 collet chuck',
  count: 3,
  productLink: null,
  uses: ['4 × Through Hole', 'Facing'],
  ...over,
})

const tool = (over: Partial<ComponentTallyRow> = {}): ComponentTallyRow =>
  holder({
    key: 'tool:em',
    component: 'tool',
    kind: 'Tool',
    brand: 'Emuge',
    catalogNumber: '2810.0250',
    detail: 'Flat end mill',
    count: 1,
    ...over,
  })

const draw = (
  rows: ReadonlyArray<ComponentTallyRow>,
  over: Partial<Parameters<typeof ComponentTally>[0]> = {},
) =>
  render(
    <ComponentTally
      rows={rows}
      empty="Nothing on the order list yet."
      sort="kind"
      descending={false}
      onSort={() => undefined}
      {...over}
    />,
  )

describe('the components view over the part', () => {
  it('leads each row with how many to order', () => {
    draw([holder()])

    expect(screen.getByText('×3')).toBeInTheDocument()
    expect(screen.getByText('BT30-ER16')).toBeInTheDocument()
  })

  /** The count is what this view is for; where it came from is the row's title. */
  it('says which assemblies a count came from', () => {
    draw([holder()])

    expect(screen.getByTitle(/in 4 × Through Hole, Facing$/)).toBeInTheDocument()
  })

  /**
   * **The vendor's page is on the number** (Paul, 2026-09-11), the way the
   * order-list page has put it there since 2026-09-01: this is the view a shop
   * buys from, so the thing it orders by is the thing that links out.
   */
  it("links the part number to the vendor's page, where there is one", () => {
    draw([holder({ productLink: 'https://example.com/BT30-ER16' })])

    expect(screen.getByRole('link', { name: /BT30-ER16/ })).toHaveAttribute(
      'href',
      'https://example.com/BT30-ER16',
    )
  })

  /** A vendor that published none leaves the number plain rather than dead. */
  it('leaves the number plain where the vendor published no page', () => {
    draw([holder()])

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('BT30-ER16')).toBeInTheDocument()
  })

  it("says so in the page's own words when nothing is ordered", () => {
    draw([])

    expect(screen.getByText('Nothing on the order list yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  /**
   * **The column is the sort** (Paul, 2026-09-09). Which way it is read is the
   * page's to hold, so the press reports and this only draws the answer.
   */
  it('reports the column that was pressed', () => {
    const onSort = vi.fn()
    draw([tool(), holder()], { onSort })

    fireEvent.click(screen.getByRole('button', { name: 'Sort by vendor' }))

    expect(onSort).toHaveBeenCalledWith('vendor')
  })

  it('draws the rows in the order the column asks for', () => {
    draw([tool(), holder()], { sort: 'count', descending: true })

    const numbers = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent ?? '')

    expect(numbers[0]).toContain('BT30-ER16')
    expect(numbers[1]).toContain('2810.0250')
  })

  it('says which way the column it is read by is going', () => {
    draw([tool()], { sort: 'part', descending: true })

    expect(screen.getByRole('columnheader', { name: /Part ID/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })
})
