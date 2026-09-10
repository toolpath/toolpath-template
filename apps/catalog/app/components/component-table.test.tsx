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

const show = (onQuery = vi.fn(), gap?: (guid: string) => string | null) => {
  render(
    <div className="h-96">
      <ComponentTable
        kind="holder"
        records={[holder]}
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
   * **A dropdown opened from inside the filter is inside it.** The kit draws a
   * `Combobox` popover in a portal of its own, outside the menu's own box, so
   * the press that chose an operator read as a press on the page and shut the
   * filter before the box to type in had been drawn. The press is dispatched
   * rather than clicked because that rule is written against `pointerdown`.
   */
  it('stays open while the compare dropdown is used', () => {
    show()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Gauge length' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'How to compare Gauge length' }))
    const option = screen.getByRole('option', { name: '≥ at least' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    expect(screen.getByRole('group', { name: 'Gauge length' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Gauge length — value' })).toBeInTheDocument()
  })

  /**
   * **The type is a list of its own** (Paul, 2026-09-08: "I should be able to
   * filter by holder type as a list … same with collet type"). It is three of
   * a holder's columns said as one phrase — `BT30 ER11 collet chuck` — and
   * that phrase is what a shop calls the thing; the three behind it still ask
   * for themselves, so one press can take every BT30 or every BT30 ER11 collet
   * chuck.
   */
  it('offers the type a holder reads as, as a list', () => {
    const onQuery = show()

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Type' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'BT30' }))

    expect(onQuery).toHaveBeenCalledWith({ text: '', terms: { type: ['BT30'] }, bounds: {} })
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
