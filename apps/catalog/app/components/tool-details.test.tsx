import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { CatalogTool } from '@toolpath/catalog-data'
import { ToolDetails } from './tool-details'

const tool = {
  guid: 'tool-1',
  familyId: 'kendrill',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'B041A01000CPG',
  materialNumber: null,
  toolType: 'drill',
  form: 'drill',
  unitSystem: 'metric',
  geometry: { DC: 1, LCF: 7, OAL: 58, SFDM: 4, LBH: 46, LD: 46 },
  materialGroups: ['P'],
  productLink: null,
  // What this catalog works out rather than what Kennametal published.
  provenance: { LBH: 'derived', LD: 'derived' },
} as unknown as CatalogTool

/**
 * **A footnote mark, not a unit** (Paul, 2026-09-01: "L/D ratio in tool details
 * shows a degree sign instead of a X"). The mark that says "this figure is
 * ours, not the vendor's" was a degree sign, and it sat on the two figures this
 * catalog derives — the L/D and the length below the holder — where it read as
 * degrees.
 */
describe('what the panel says about where a number came from', () => {
  it('marks a derived figure with a footnote rather than a degree sign', () => {
    render(<ToolDetails tool={tool} unit="mm" />)

    const derived = screen.getAllByLabelText('derived')
    expect(derived.length).toBeGreaterThan(0)
    for (const mark of derived) {
      expect(mark.textContent).toBe('*')
    }
    expect(screen.queryByText('°')).not.toBeInTheDocument()
  })

  /** And says nothing at all about the vendor's own figures. */
  it('leaves a vendor-stated figure unmarked', () => {
    render(<ToolDetails tool={tool} unit="mm" />)

    expect(screen.getByText('Diameter').closest('div')?.textContent).toBe('DiameterDC1.00 mm')
  })

  /**
   * **The name and the code the drawing letters it with** (Paul, 2026-09-01:
   * "show the abbreviation for each dimension shown in the 2d tool
   * visualization alongside the name in the table"), and an icon on each row.
   */
  it('letters each row with the code the drawing uses, and draws what it measures', () => {
    const { container } = render(<ToolDetails tool={tool} unit="mm" />)

    for (const [name, code] of [
      ['Diameter', 'DC'],
      ['Flute length', 'LCF'],
      ['Shank', 'SFDM'],
      ['Overall length', 'OAL'],
      ['Below holder', 'LBH'],
    ] as const) {
      expect(screen.getByText(name).closest('dt')?.textContent).toContain(code)
    }

    // A ratio and a count have no code on the drawing, so none in the table.
    expect(screen.getByText('L/D').closest('dt')?.textContent).toBe('L/D')
    expect(container.querySelectorAll('dt svg').length).toBeGreaterThan(5)
  })
})

/**
 * **A collet can be chosen before a holder** (Paul, 2026-09-01: "I should be
 * able to select a collet without selecting a holder. Right now the drop down
 * just does nothing… every collet that grips the tool's shank, which yes, then
 * all holders are shown but we show the ones that work with that collet at the
 * top"). The list used to be empty until a holder was picked, which read as a
 * broken control.
 */
describe('choosing a holder and a collet', () => {
  const holding = (over: Partial<Parameters<typeof ToolDetails>[0]['holding'] & object> = {}) => {
    const onChoose = vi.fn()
    return {
      onChoose,
      holding: {
        holdersFor: () => [
          { guid: 'h-er16', label: 'ER16 chuck · takes this collet', trouble: null, holder: {} },
          { guid: 'h-pg6', label: 'PG6 chuck', trouble: null, holder: {} },
        ],
        colletsFor: (_tool: unknown, holderGuid: string | null) =>
          holderGuid === null
            ? [{ guid: 'c-er16', label: 'ER16-4 · ER16' }]
            : holderGuid === 'h-er16'
              ? [{ guid: 'c-er16', label: 'ER16-4' }]
              : [],
        chosen: () => ({ holderGuid: null, colletGuid: null }),
        requiredStickout: () => null,
        stickoutFor: () => null,
        reachNote: () => null,
        onChoose,
        ...over,
      } as unknown as Parameters<typeof ToolDetails>[0]['holding'],
    }
  }

  it('offers the collets that grip the shank with no holder chosen', () => {
    render(<ToolDetails tool={tool} unit="mm" holding={holding().holding} />)

    const collet = screen.getByLabelText('Collet')
    expect(collet).toBeEnabled()
    expect(screen.getByRole('option', { name: 'ER16-4 · ER16' })).toBeInTheDocument()
  })

  it('keeps a collet the new holder can take, and drops one it cannot', () => {
    const { onChoose, holding: takes } = holding({
      chosen: () => ({ holderGuid: null, colletGuid: 'c-er16' }),
    })
    render(<ToolDetails tool={tool} unit="mm" holding={takes} />)

    fireEvent.change(screen.getByLabelText('Holder'), { target: { value: 'h-er16' } })
    expect(onChoose).toHaveBeenLastCalledWith(tool, {
      holderGuid: 'h-er16',
      colletGuid: 'c-er16',
    })

    fireEvent.change(screen.getByLabelText('Holder'), { target: { value: 'h-pg6' } })
    expect(onChoose).toHaveBeenLastCalledWith(tool, { holderGuid: 'h-pg6', colletGuid: null })
  })
})
