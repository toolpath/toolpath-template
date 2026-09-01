import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { HolePlanRow } from 'shared/hole-plan'
import { HoleTable } from './hole-table'

const hole = (tag: string): PartFeature =>
  ({
    featureTag: tag,
    featureType: 'BlindHole',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: { zMin: -20, zMax: 0, facts: { kind: 'Hole', diameter: 5 } },
  }) as unknown as PartFeature

const drill: CatalogTool = {
  guid: 'drill-1',
  familyId: 'kendrill',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'B041A05000',
  materialNumber: null,
  toolType: 'drill',
  form: 'drill',
  unitSystem: 'metric',
  geometry: { DC: 5, LCF: 30, OAL: 62, SFDM: 6, SIG: 140 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}

const row = (key: string, tags: ReadonlyArray<string>, diameter = 5): HolePlanRow => ({
  group: {
    key,
    diameter,
    depth: 20,
    features: tags.map(hole),
    through: false,
    reach: 20,
    other: null,
  },
  mode: 'plain',
  thread: null,
  drills: [
    {
      tool: drill,
      removed: [],
      warned: [],
      demoted: [],
      key: [0],
      readings: ['⌀5.00 mm on the hole'],
    },
  ],
  endMills: [],
  interpolated: false,
  makers: [],
})

const show = (props: Partial<Parameters<typeof HoleTable>[0]> = {}) => {
  const onSelect = vi.fn()
  render(
    <HoleTable
      rows={[row('a', ['h1', 'h2']), row('b', ['h3'])]}
      unit="mm"
      onChoice={() => {}}
      chosen={{}}
      onChoose={() => {}}
      chosenMaker={{}}
      onChooseMaker={() => {}}
      inBom={() => false}
      onBom={() => {}}
      onRemoveBom={() => {}}
      onSelect={onSelect}
      {...props}
    />,
  )
  return onSelect
}

describe('what a row says about a size of hole', () => {
  /** Count, diameter and depth are what a row is scanned by, so each gets a column. */
  /** Count, diameter and depth are what a row is scanned by, so each is its own sortable column. */
  it('gives the count, the diameter and the depth their own columns', () => {
    show()
    const columns = screen
      .getAllByRole('button', { name: /^Sort by / })
      .map((each) => each.getAttribute('aria-label'))

    expect(columns).toEqual([
      'Sort by count',
      'Sort by diameter',
      'Sort by depth',
      'Sort by thread',
      'Sort by drill',
      'Sort by tap',
    ])
  })

  /**
   * The reasons were an eight-pixel icon; they are sentences in the cell they
   * are about now (Paul, 2026-09-01).
   */
  it('writes out what the rules read off the drill', () => {
    show()

    expect(screen.getAllByText('⌀5.00 mm on the hole')[0]).toBeInTheDocument()
  })

  /** The numbers a drill is chosen on, not just the number it is ordered by. */
  it('shows the drill’s own geometry beside its catalog number', () => {
    show()

    expect(screen.getAllByRole('option', { name: /B041A05000/ })[0]?.textContent).toContain(
      '⌀5.00 mm · flute 30.00 mm · OAL 62.00 mm',
    )
  })

  /** A plain hole takes no tap, and the cell says which of the two it is. */
  it('says "no thread" in the tap cell rather than a dash', () => {
    show()

    expect(screen.getAllByText('no thread')[0]).toBeInTheDocument()
  })

  /**
   * One question — "these are M6 cut taps" — rather than "tapped" and then
   * "M6", with the threads the hole reads as at the top (Paul, 2026-09-01).
   */
  /**
   * The matches are the point of the menu, and they are called what they are
   * — in amber, over the threads themselves (Paul, 2026-09-01).
   */
  it('heads the threads the hole reads as with a prompt of their own', () => {
    show()

    fireEvent.click(screen.getAllByRole('button', { name: /Thread for the/ })[0]!)

    expect(screen.getByText('Potential thread matches')).toBeInTheDocument()
    // ⌀5 is M6×1's tap drill, so it leads — with both ways to make it.
    expect(screen.getByRole('button', { name: /M6×1 cut tap/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /M6×1 form tap/ })).toBeInTheDocument()
  })

  it('sets the thread and the way it is made together', () => {
    const onChoice = vi.fn()
    show({ onChoice })

    fireEvent.click(screen.getAllByRole('button', { name: /Thread for the/ })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /M6×1 form tap/ }))

    expect(onChoice).toHaveBeenCalledWith('a', {
      mode: 'form tap',
      spec: expect.objectContaining({ name: 'M6×1' }),
    })
  })
})

describe('keeping what a row chose', () => {
  /** The drill alone, from the button beside it. */
  it('keeps one tool from the cell it is in', () => {
    const onBom = vi.fn()
    show({ onBom })

    fireEvent.click(screen.getAllByRole('button', { name: /Add B041A05000/ })[0]!)

    expect(onBom).toHaveBeenCalledWith([drill], ['h1', 'h2'])
  })

  /** Or everything the row chose, from the same *Add to list* every table has. */
  it('keeps everything the row chose from Add to list', () => {
    const onBom = vi.fn()
    show({ onBom })

    const add = screen.getAllByRole('button', { name: /Add the tools for the ⌀5/ })[0]!
    expect(add).toHaveTextContent('Add to list')
    fireEvent.click(add)

    expect(onBom).toHaveBeenCalledWith([drill], ['h1', 'h2'])
  })
})

describe('zooming to a size of hole', () => {
  /** The viewer frames one feature, so a group of two is walked through. */
  it('asks the part to frame the size the button belongs to', () => {
    const onZoom = vi.fn()
    show({ onZoom, zoomAt: { a: 2 } })

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to ⌀5.00 mm hole 2 of 2' }))

    expect(onZoom).toHaveBeenCalledWith('a')
  })

  /** One hole is not "1 of 1" — there is nothing to walk through. */
  it('says it plainly when the size is one hole', () => {
    show({ onZoom: () => {} })

    expect(screen.getByRole('button', { name: 'Zoom to the ⌀5.00 mm hole' })).toBeInTheDocument()
  })

  it('offers no zoom where the page cannot do one', () => {
    show()

    expect(screen.queryByRole('button', { name: /Zoom to/ })).not.toBeInTheDocument()
  })
})

describe('reading a size of hole on the part', () => {
  /**
   * A row is a size, and where that size *is* is a question about the part —
   * so clicking the row lights those holes in the viewer (Paul, 2026-09-01).
   */
  it('names the group a click is asking about', () => {
    const onSelect = show()

    fireEvent.click(screen.getAllByRole('row')[1]!)

    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('marks the row being read', () => {
    show({ selected: 'b' })
    const rows = screen.getAllByRole('row')

    expect(rows[2]).toHaveAttribute('aria-selected', 'true')
    expect(rows[1]).toHaveAttribute('aria-selected', 'false')
  })

  /**
   * The controls in the row are not the row: choosing a drill would otherwise
   * move the part underneath as a side effect of choosing a tool.
   */
  it('leaves the part alone when the click was for a control in the row', () => {
    const onSelect = show()

    fireEvent.click(screen.getAllByRole('combobox')[0]!)

    expect(onSelect).not.toHaveBeenCalled()
  })
})
