import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { applyTheme } from 'shared/use-theme'
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

describe('tool actions', () => {
  it('uses standard Toolpath action surfaces without custom color overrides', () => {
    const add = vi.fn()
    const remove = vi.fn()
    render(
      <ToolDetails
        tool={tool}
        unit="millimeters"
        actions={[
          { key: 'add', label: 'Add tool', onClick: add },
          { key: 'remove', label: 'Remove tool', onClick: remove, danger: true },
        ]}
      />,
    )

    const addButton = screen.getByRole('button', { name: 'Add tool' })
    const removeButton = screen.getByRole('button', { name: 'Remove tool' })
    expect(addButton.firstElementChild).toHaveClass('bg-success', 'py-1')
    expect(removeButton.firstElementChild).toHaveClass('bg-danger', 'py-1')
    expect(addButton.className).not.toContain('emerald')
    expect(removeButton.className).not.toContain('border-danger')
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
/**
 * A `ResizeObserver` that reports to every observer at once.
 *
 * `<ToolDrawing>` draws no `<svg>` until something has told it how big its
 * panel is, and the overlay layer beside it watches the same element — so one
 * measurement has to reach both, exactly as the browser's would.
 */
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

const measured = (element: ReactElement) => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver)
  const drawn = render(element)
  StubResizeObserver.measure()
  return drawn
}

afterEach(() => {
  vi.unstubAllGlobals()
  StubResizeObserver.all = []
})

describe('pointing at a number', () => {
  const panel = () => measured(<ToolDetails tool={tool} unit="millimeters" />)

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

/**
 * **The panel reads a tool; it does not assemble one** (2026-09-11).
 *
 * It carried a Holder dropdown and a Collet dropdown from 2026-08-31. The tool
 * assembly tree took that job on 2026-09-08 and covered every state but one —
 * a tool read with no feature selected — so the pair survived there, and the
 * page had two ways to fill one slot with no rule saying which won. What used
 * to be checked here was the dropdowns' own behaviour; what is checked here
 * now is that they are not offered at all.
 */
describe('what the panel offers for a holder', () => {
  it('offers no holder or collet control of its own', () => {
    render(<ToolDetails tool={tool} unit="millimeters" />)

    expect(screen.queryByRole('combobox', { name: 'Holder' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Collet' })).toBeNull()
  })
})
/**
 * **The part is drawn beside the tool** (2026-09-03).
 *
 * The panel drew the cutter against nothing from 2026-08-31 to 2026-09-03,
 * while the page had the feature's reach curve in hand and spent it entirely
 * on the holder list — so the one place a shop reads a tool showed no reason
 * for the stickout the list beside it had settled on. Everything downstream
 * was intact the whole time; the panel simply had no `curve` prop to be fed
 * through. This is the sensor for the feed, not for the drawing:
 * `catalog-drawing.test.tsx` owns what the overlay looks like.
 */
describe('the material around the feature', () => {
  /** A wall 2 mm out from the axis, running 12 mm up and then away. */
  const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }

  const holder: Holder = {
    guid: 'h-er16',
    familyId: 'bt30',
    brand: 'REGO-FIX',
    vendor: 'REGO-FIX',
    catalogNumber: 'BT 30 / ER 16 x 060',
    materialNumber: null,
    taper: 'BT30',
    contact: null,
    clamping: 'collet',
    gaugeLength: 60,
    colletSeries: 'ER16',
    boreDiameter: null,
    noseDiameter: 28,
    noseLength: 8,
    bodyDiameter: 42,
    bodyLength: 3,
    projection: 11.6,
    flangeDiameter: 46,
    colletProtrusion: 2,
    productLink: null,
    cadModelUrl: null,
    provenance: {},
  }

  /**
   * The stack the tree hands in. **The only way a holder reaches this panel**
   * (Paul, 2026-09-10): the two dropdowns that used to offer one of its own
   * came off, so a stack on this sheet is a stack somebody assembled in the
   * tree.
   */
  const held = { holder, collet: null }

  /**
   * **The number in the table is the number on the sheet** (2026-09-03).
   *
   * The panel printed the tool's own `LBH` beside a drawing of the stack, and
   * the two were different quantities: `LBH` is the most the tool could stand
   * out and the drawing is drawn at the setup, so the sheet dimensioned a
   * length the table beside it contradicted — the report's symptom, a
   * dimension line running up into the holder body. They are one number now,
   * and this is the lockstep that keeps them one. AGENTS.md § Testing: a
   * duplicate across a boundary gets a test, not a comment.
   *
   * The figure is `shared/drawn-assembly`'s, worked out from this holder and
   * this tool. It used to be whatever the panel's own `stickoutFor` said,
   * which was a dropdown's answer; with the dropdowns gone the stack is the
   * only thing that can answer it.
   */
  it('prints the stickout the stack is drawn at, not the tool\u2019s own', () => {
    measured(<ToolDetails tool={tool} unit="millimeters" stack={held} />)

    // `drawnAssembly`'s figure for this tool in this chuck, not the 46 mm the
    // tool carries on its own.
    expect(screen.getByText('Below holder').closest('div')?.textContent).toBe(
      'Below holderLBH12.70 mm*',
    )

    // And it stays that figure under the zoom, which is the 2026-09-11 half of
    // the same rule: the press over the sheet moves the frame, not the stack.
    // The switch it replaced drew a bare tool, and the number went back to the
    // tool's own 46 mm with it; there is no bare tool to go back to now.
    fireEvent.click(screen.getByRole('button', { name: 'Zoom to tool' }))
    expect(screen.getByText('Below holder').closest('div')?.textContent).toBe(
      'Below holderLBH12.70 mm*',
    )
  })

  it('draws the part wall and the gaps beside the stack when there is a feature', () => {
    const { container } = measured(
      <ToolDetails tool={tool} unit="millimeters" stack={held} curve={curve} />,
    )

    expect(container.querySelector('[data-part="material"]')).not.toBeNull()
    expect(container.querySelector('[data-clearance]')).not.toBeNull()
  })

  /** No feature to clear is the tool on its own, with no clearance claimed. */
  it('draws the tool alone when the panel is given no feature', () => {
    const { container } = measured(<ToolDetails tool={tool} unit="millimeters" stack={held} />)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[data-part="material"]')).toBeNull()
    expect(container.querySelector('[data-clearance]')).toBeNull()
  })

  /**
   * The material is the feature's, not the frame's, so it stays on the sheet
   * with the drawing zoomed to the working end — which is the half of the
   * stack the gaps are tightest against anyway.
   */
  it('keeps the material on the sheet with the drawing zoomed to the tool', () => {
    const { container } = measured(
      <ToolDetails tool={tool} unit="millimeters" stack={held} curve={curve} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to tool' }))

    expect(container.querySelector('[data-part="material"]')).not.toBeNull()
  })
})

/**
 * **The press over the sheet moves the frame, not the subject** (2026-09-11).
 *
 * It used to be a Tool / Tool + holder switch, which let the one picture on the
 * page disagree with the tree about what was on the tool: the tree had a holder
 * in its slot and the sheet drew a bare cutter. What a reader wanted from the
 * *Tool* half was the working end drawn bigger, and `@toolpath/tool-drawing`
 * frames that itself — so the holder stays on the sheet either way and the
 * press chooses how much of it the sheet is cut to.
 *
 * Read off `data-zoom`, which the package sets only where the zoom actually
 * took: a tool with no length to frame to is drawn whole, and a test pinned to
 * the button's own label would pass on a sheet that never moved.
 */
describe('how much of the stack the sheet is framed to', () => {
  const holder: Holder = {
    guid: 'h-er16',
    familyId: 'bt30',
    brand: 'REGO-FIX',
    vendor: 'REGO-FIX',
    catalogNumber: 'BT 30 / ER 16 x 060',
    materialNumber: null,
    taper: 'BT30',
    contact: null,
    clamping: 'collet',
    gaugeLength: 60,
    colletSeries: 'ER16',
    boreDiameter: null,
    noseDiameter: 28,
    noseLength: 8,
    bodyDiameter: 42,
    bodyLength: 3,
    projection: 11.6,
    flangeDiameter: 46,
    colletProtrusion: 2,
    productLink: null,
    cadModelUrl: null,
    provenance: {},
  }
  const held = { holder, collet: null }

  /** The drawing, not the tool-type icon above it — both are `<svg>`. */
  const sheet = (container: HTMLElement) => container.querySelector('figure svg')!

  it('frames the whole stack until the press asks for the working end', () => {
    const { container } = measured(<ToolDetails tool={tool} unit="millimeters" stack={held} />)

    expect(sheet(container).getAttribute('data-zoom')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to tool' }))
    expect(sheet(container).getAttribute('data-zoom')).toBe('tool')

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(sheet(container).getAttribute('data-zoom')).toBeNull()
  })

  /**
   * Zoomed or fitted, the holder the tree chose is on the sheet — the nose is
   * the part the zoom deliberately keeps above the cut. This is the guard on
   * the thing that came out: the panel could draw a bare cutter while the tree
   * held a full stack.
   */
  it('keeps the holder on the sheet at either frame', () => {
    const { container } = measured(<ToolDetails tool={tool} unit="millimeters" stack={held} />)

    expect(container.querySelector('[data-part="nose"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to tool' }))
    expect(container.querySelector('[data-part="nose"]')).not.toBeNull()
  })

  /** Nothing holding the cutter is nothing to cut the sheet against. */
  it('offers no press where the tree has chosen no holder', () => {
    measured(<ToolDetails tool={tool} unit="millimeters" />)

    expect(screen.queryByRole('button', { name: 'Zoom to tool' })).toBeNull()
  })
})

/**
 * **The drawing is a sheet, not a white rectangle inset in a card** (Paul,
 * 2026-09-11). The panel was a grey wash and the sheet is capped at 16 rem, so
 * the wash filled whatever the panel had either side of the drawing and the
 * figure read as a box rather than as paper.
 *
 * Read off the DOM in both directions rather than pinned to a colour: the two
 * grounds are `@toolpath/tool-drawing`'s to state, and a hex written here would
 * be a second copy of them that nothing keeps in step. What this holds is that
 * they are the *same* colour — which a hard-coded white would satisfy in light
 * and break in dark, where the package's ground is a step above the card
 * rather than white.
 */
describe('the ground the panel is painted in', () => {
  const ground = (container: HTMLElement) => ({
    panel: (container.firstElementChild as HTMLElement).style.background,
    sheet: container.querySelector('figure')!.style.background,
  })

  afterEach(() => {
    applyTheme(document.documentElement, 'dark')
  })

  for (const theme of ['dark', 'light'] as const) {
    it(`matches the sheet the tool is drawn on in ${theme}`, () => {
      applyTheme(document.documentElement, theme)

      const { panel, sheet } = ground(
        measured(<ToolDetails tool={tool} unit="millimeters" />).container,
      )

      expect(sheet).not.toBe('')
      expect(panel).toBe(sheet)
    })
  }

  /** And the two grounds are different colours, so neither test passes by accident. */
  it('turns over with the theme rather than stating one colour', () => {
    applyTheme(document.documentElement, 'dark')
    const dark = ground(measured(<ToolDetails tool={tool} unit="millimeters" />).container).panel

    cleanup()
    applyTheme(document.documentElement, 'light')
    const light = ground(measured(<ToolDetails tool={tool} unit="millimeters" />).container).panel

    expect(dark).not.toBe(light)
  })
})
