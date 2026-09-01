import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { ThreadSpec } from 'shared/threads'
import { TapTable } from './tap-table'

/**
 * The two defects this section shipped with, pinned.
 *
 * Both were reported by Paul on 2026-08-31 and both are about a column saying
 * something it does not mean: a tap's `LBH` under the drill table's "Stickout
 * needed" heading, and a corner radius and tip angle column filled in for a
 * tool that has neither.
 */
const tap: CatalogTool = {
  guid: 'tap-1',
  familyId: 'khsst-spiral-point-plug-inch',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'KTAP440',
  materialNumber: '1234567',
  toolType: 'tap',
  form: 'tap right hand',
  unitSystem: 'inch',
  geometry: { DC: 2.845, LCF: 12, LBH: 15.5, NOF: 3 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}

const spec: ThreadSpec = {
  name: '#4-40 UNC',
  family: 'unified',
  major: 2.845,
  pitch: 0.635,
  tapDrill: 2.26,
}

/** The drill table's own columns, which this one mirrors. */
const COLUMNS = [
  { code: 'DC', label: 'Diameter' },
  { code: 'LCF', label: 'Flute length' },
  { code: 'LBH', label: 'Stickout needed' },
  { code: 'RE', label: 'Corner radius' },
  { code: 'SIG', label: 'Tip angle' },
]

const show = (props: Partial<Parameters<typeof TapTable>[0]> = {}) =>
  render(
    <MemoryRouter>
      <TapTable
        makers={[tap]}
        mode="cut tap"
        spec={spec}
        unit="mm"
        chosen={null}
        onChoose={() => {}}
        inBom={() => false}
        onBom={() => {}}
        onRemoveBom={() => {}}
        columns={COLUMNS}
        {...props}
      />
    </MemoryRouter>,
  )

describe('TapTable', () => {
  /**
   * Nothing picks a holder in this section, so the number under `LBH` is the
   * tap's own length below the holder — not the stickout a chosen stack needs.
   */
  it('heads the tap’s own length below the holder as what it is', () => {
    show()

    expect(screen.getByText('Below holder')).toBeInTheDocument()
    expect(screen.queryByText('Stickout needed')).not.toBeInTheDocument()
  })

  /** A tap has no corner radius, and its point angle is a chamfer lead nothing states. */
  it('dashes the columns a tap has nothing to put in, heading and cells', () => {
    show()

    expect(screen.queryByText('Corner radius')).not.toBeInTheDocument()
    expect(screen.queryByText('Tip angle')).not.toBeInTheDocument()
    // One dash in each of the two headings, and one in each of the two cells.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  /** The number that keeps one off the list is painted on the column it is about. */
  it('paints the length that fell short, and says by how much', () => {
    show({ short: true, shortfall: () => ({ code: 'LCF', by: 3.5 }) })

    expect(screen.getByText(/3\.5/)).toBeInTheDocument()
  })
})
