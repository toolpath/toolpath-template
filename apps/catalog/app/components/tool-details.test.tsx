import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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

    const diameter = screen.getByText('Diameter').closest('div')
    expect(diameter?.textContent).toBe('Diameter1.00 mm')
  })
})
