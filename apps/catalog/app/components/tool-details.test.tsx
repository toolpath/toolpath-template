import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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
  unitSystem: 'millimeters',
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
    render(<ToolDetails tool={tool} unit="millimeters" />)

    const derived = screen.getAllByLabelText('derived')
    expect(derived.length).toBeGreaterThan(0)
    for (const mark of derived) {
      expect(mark.textContent).toBe('*')
    }
    expect(screen.queryByText('°')).not.toBeInTheDocument()
  })

  /** And says nothing at all about the vendor's own figures. */
  it('leaves a vendor-stated figure unmarked', () => {
    render(<ToolDetails tool={tool} unit="millimeters" />)

    expect(screen.getByText('Diameter').closest('div')?.textContent).toBe('DiameterDC1.00 mm')
  })

  /**
   * **The name and the code the drawing letters it with** (Paul, 2026-09-01:
   * "show the abbreviation for each dimension shown in the 2d tool
   * visualization alongside the name in the table"), and an icon on each row.
   */
  it('letters each row with the code the drawing uses, and draws what it measures', () => {
    const { container } = render(<ToolDetails tool={tool} unit="millimeters" />)

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
/**
 * **Which line is which is answered by pointing** (`@toolpath/tool-drawing`
 * 0.2.0). The drawing letters nothing any more — six two-line figures were
 * fighting for the margin of a panel that already had the same six numbers in
 * the table under it — so the table is what names a line, and pointing is what
 * connects the two.
 *
 * The drawing has to be measured for there to be a line to light, which is
 * what the observer below is for: `<ToolDrawing>` draws no `<svg>` until
 * something has told it how big its panel is.
 */
describe('pointing at a number', () => {
  class StubResizeObserver {
    static all: Array<StubResizeObserver> = []
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
      StubResizeObserver.all.push(this)
    }
    observe() {}
    unobserve() {}
    disconnect() {}
    static measure() {
      act(() => {
        for (const each of StubResizeObserver.all) {
          each.callback(
            [{ contentRect: { width: 1450, height: 297 } } as ResizeObserverEntry],
            each as unknown as ResizeObserver,
          )
        }
      })
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    StubResizeObserver.all = []
  })

  const panel = () => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver)
    const drawn = render(<ToolDetails tool={tool} unit="millimeters" />)
    StubResizeObserver.measure()
    return drawn
  }

  it('lights the line on the drawing for the number under the pointer', () => {
    const { container } = panel()
    const card = screen.getByText('Flute length').closest('div')!

    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(0)

    fireEvent.mouseEnter(card)
    expect(container.querySelector('[data-dimension="LCF"]')?.getAttribute('data-lit')).toBe('true')
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(1)

    fireEvent.mouseLeave(card)
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(0)
  })

  /**
   * A number the drawing has no line for is not an error. `RE` is a real
   * measurement drawn on the corner and `L/D` is a ratio, and neither is a
   * dimension — so pointing at one lights the card and nothing else.
   */
  it('lights nothing on the drawing for a number it has no line for', () => {
    const { container } = panel()

    fireEvent.mouseEnter(screen.getByText('L/D').closest('div')!)
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(0)
  })
})

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
    render(<ToolDetails tool={tool} unit="millimeters" holding={holding().holding} />)

    const collet = screen.getByLabelText('Collet')
    expect(collet).toBeEnabled()
    expect(screen.getByRole('option', { name: 'ER16-4 · ER16' })).toBeInTheDocument()
  })

  /**
   * **The number in the table is the number on the sheet** (2026-09-03).
   *
   * The panel printed the tool's own `LBH` beside a drawing of the stack, and
   * the two were different quantities: `LBH` was the most the tool could stand
   * out and the drawing was drawn at the setup, so the sheet dimensioned a
   * length the table beside it contradicted — the report's symptom, a
   * dimension line running up into the holder body. They are one number now,
   * and this is the lockstep that keeps them one. AGENTS.md § Testing: a
   * duplicate across a boundary gets a test, not a comment.
   */
  it('prints the stickout the stack is drawn at, not the tool’s own', () => {
    const { holding: held } = holding({
      chosen: () => ({ holderGuid: 'h-er16', colletGuid: null }),
      stickoutFor: () => 19,
    })
    render(<ToolDetails tool={tool} unit="millimeters" holding={held} />)

    // Not the 46 mm the tool carries on its own.
    expect(screen.getByText('Below holder').closest('div')?.textContent).toBe(
      'Below holderLBH19.00 mm*',
    )

    // And with the sheet switched back to the bare tool, its own figure again.
    fireEvent.click(screen.getByRole('button', { name: 'Tool' }))
    expect(screen.getByText('Below holder').closest('div')?.textContent).toBe(
      'Below holderLBH46.00 mm*',
    )
  })

  it('keeps a collet the new holder can take, and drops one it cannot', () => {
    const { onChoose, holding: takes } = holding({
      chosen: () => ({ holderGuid: null, colletGuid: 'c-er16' }),
    })
    render(<ToolDetails tool={tool} unit="millimeters" holding={takes} />)

    fireEvent.change(screen.getByLabelText('Holder'), { target: { value: 'h-er16' } })
    expect(onChoose).toHaveBeenLastCalledWith(tool, {
      holderGuid: 'h-er16',
      colletGuid: 'c-er16',
    })

    fireEvent.change(screen.getByLabelText('Holder'), { target: { value: 'h-pg6' } })
    expect(onChoose).toHaveBeenLastCalledWith(tool, { holderGuid: 'h-pg6', colletGuid: null })
  })
})
