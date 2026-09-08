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

const show = (onQuery = vi.fn()) => {
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

    expect(onQuery).toHaveBeenCalledWith({ terms: { taper: ['BT30'] }, bounds: {} })
  })

  it('bounds a length from the column that shows it', () => {
    show()

    expect(screen.getByRole('button', { name: 'Filter by Gauge length' })).toBeVisible()
  })

  /** Three of its columns said as one phrase; each of those asks for itself. */
  it('asks nothing of the type a holder reads as', () => {
    show()

    expect(screen.queryByRole('button', { name: 'Filter by Type' })).not.toBeInTheDocument()
  })
})
