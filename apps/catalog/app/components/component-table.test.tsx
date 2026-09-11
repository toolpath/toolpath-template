import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Holder } from '@toolpath/catalog-data'
import { NO_QUERY } from 'shared/component-query'
import { HOLDER_COLUMNS } from 'shared/component-columns'
import { ComponentTable } from './component-table'

const holder: Holder = {
  guid: 'one',
  familyId: 'bt30_er_collet_adapters_metric',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'BT30ER11060M',
  materialNumber: '6694846',
  taper: 'BT30',
  contact: 'taper',
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'ER11',
  boreDiameter: null,
  noseDiameter: null,
  noseLength: null,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
}

const show = (
  onQuery = vi.fn(),
  gap?: (guid: string) => string | null,
  records: Array<Holder> = [holder],
) => {
  render(
    <div className="h-96">
      <ComponentTable
        kind="holder"
        records={records}
        unit="millimeters"
        columns={HOLDER_COLUMNS}
        hiddenColumns={[]}
        columnOrder={HOLDER_COLUMNS.map((column) => column.code)}
        chosen={null}
        onChoose={() => {}}
        gap={gap}
        virtualized={false}
        filtering={{
          query: NO_QUERY,
          onQuery,
          options: () => [{ value: 'BT30', count: 4 }],
        }}
      />
    </div>,
  )
  return onQuery
}

/**
 * **A rack had its filters in a popover saying the same words as its headings**
 * (Paul, 2026-09-08). Every question about a holder is a question about one of
 * its columns, so the headings ask them and the popover is gone.
 */
describe('the filters a holder heading asks', () => {
  it('narrows the taper from the Taper heading', async () => {
    const onQuery = show()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Taper' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'BT30' }))

    expect(onQuery).toHaveBeenCalledWith({ text: '', terms: { taper: ['BT30'] }, bounds: {} })
  })

  /**
   * **A rack is a list somebody arrives at already knowing the answer to**
   * (Paul, 2026-09-08: "catalog number needs a text search in holders and
   * collets as well"). The same search the tool table carries, on the same
   * column, matching the number and the vendor together.
   */
  it('searches the catalog number from the column that shows it', () => {
    const onQuery = show()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Catalog number' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by catalog number' }), {
      target: { value: 'BT30ER' },
    })

    expect(onQuery).toHaveBeenCalledWith({ text: 'BT30ER', terms: {}, bounds: {} })
  })

  it('bounds a length from the column that shows it', () => {
    show()

    expect(screen.getByRole('button', { name: 'Filter by Gauge length' })).toBeVisible()
  })

  /**
   * **The filter opens on somewhere to type, and stays open while it is typed
   * in** (Paul, 2026-09-11). It used to open on an operator list reading "Any",
   * which drew no box at all, and the press that chose an operator landed in a
   * portal outside the menu's own box and read as a press on the page — so the
   * filter shut before the box to type in had been drawn. Both ends are now on
   * screen from the start and there is no popover in the way of them.
   */
  it('opens on both ends of the number, and stays open while one is typed', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Gauge length' }))
    const box = screen.getByRole('textbox', { name: 'Gauge length — min' })
    expect(screen.getByRole('textbox', { name: 'Gauge length — max' })).toBeInTheDocument()

    fireEvent.change(box, { target: { value: '60' } })

    expect(screen.getByRole('group', { name: 'Gauge length' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Gauge length — min' })).toHaveValue('60')
  })

  /**
   * **A holder's type is how it grips** (Paul, 2026-09-11: the Type field was
   * incorrect and came off, and Clamping is what Type means now). It used to be
   * a phrase glued out of three other columns — `BT30 ER11 collet chuck` —
   * which repeated Taper and Collet series and could disagree with them; the
   * heading writes the `clamping` axis now, and Taper still asks for itself.
   */
  it('narrows how a holder grips from the Type heading', () => {
    const onQuery = show()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Type' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'BT30' }))

    expect(onQuery).toHaveBeenCalledWith({ text: '', terms: { clamping: ['BT30'] }, bounds: {} })
  })

  /** One Type heading, not two: the glued phrase is off the rack entirely. */
  it('shows the type once, as how it grips', () => {
    show()

    expect(screen.getAllByRole('button', { name: 'Filter by Type' })).toHaveLength(1)
    expect(screen.getByText('collet chuck')).toBeVisible()
    expect(screen.queryByText('BT30 ER11 collet chuck')).toBeNull()
  })
})

/**
 * **The rack is wider than the collet drawer** (Paul, 2026-09-09: "we should
 * show any holder, even if there is not a collet in the library that works").
 * A chuck offered on those terms and a chuck the crib closes on are the same
 * row without this, which is the one thing the widening must not cost.
 */
describe('a holder the crib has no collet for', () => {
  it('says so on the row, with the reason', () => {
    show(vi.fn(), () => 'the crib stocks no ER11 collet')

    expect(screen.getByText('no collet')).toHaveAttribute(
      'title',
      'This holder is offered anyway — the crib stocks no ER11 collet.',
    )
  })

  it('says nothing on a row the crib can close on', () => {
    show(vi.fn(), () => null)

    expect(screen.queryByText('no collet')).toBeNull()
  })
})

/**
 * **The vendor's page is on the number** (Paul, 2026-09-11: move the vendor
 * links from the vendor cells to the catalog number cells). The order list has
 * read that way since 2026-09-01, and a link a cell away from the number it
 * opens is the thing a shop reaches for by the number.
 */
describe('where a holder row carries the vendor link', () => {
  const linked: Holder = { ...holder, productLink: 'https://example.com/BT30ER11060M' }

  it('hangs it off the catalog number', () => {
    show(vi.fn(), undefined, [linked])

    const link = screen.getByRole('link', { name: 'Open BT30ER11060M at the vendor' })
    expect(link).toHaveAttribute('href', 'https://example.com/BT30ER11060M')
    expect(screen.getByText('BT30ER11060M').parentElement).toContainElement(link)
  })

  it('leaves the vendor cell with nothing but the vendor', () => {
    show(vi.fn(), undefined, [linked])

    const brand = screen.getByTitle('Kennametal')
    expect(brand.parentElement?.querySelector('a')).toBeNull()
  })

  it('draws no link where the vendor published none', () => {
    show()

    expect(screen.queryByRole('link', { name: /at the vendor/ })).toBeNull()
  })
})
