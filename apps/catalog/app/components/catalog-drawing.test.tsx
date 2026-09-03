import type { ReactElement } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Assembly, CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { assemblyOutline } from '@toolpath/tool-drawing/geometry'
import { toViewerAssembly } from 'shared/tool-drawing-input'
import { CatalogDrawing, MATERIAL_ROOM } from './catalog-drawing'

const tool: CatalogTool = {
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0300',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 3, LCF: 8, OAL: 50, RE: 0, NOF: 4, SFDM: 6 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
}

const holder: Holder = {
  guid: 'h',
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'BT 30 / PG 10 x 060',
  materialNumber: null,
  taper: 'BT30',
  contact: null,
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'PG10',
  boreDiameter: null,
  noseDiameter: 34,
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

const collet: Collet = {
  guid: 'c',
  familyId: 'pg10',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'PG 10 / 6',
  materialNumber: null,
  series: 'PG10',
  clampMin: 6,
  clampMax: 6,
  clampLength: null,
  productLink: null,
  provenance: {},
}

const assembly: Assembly = { tool, holder, collet, stickout: 25, maxStickout: null }

/** A holder the committed sample profiles document measures — `BT30ER16060M`. */
const MEASURED_GUID = '44444444-4444-5444-8444-444444444401'
const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }

/**
 * A `ResizeObserver` that reports to every observer at once.
 *
 * Both the package's component and the overlay layer beside it watch the same
 * `<svg>`, and the point of most of these tests is that they agree about it —
 * so one measurement has to reach both, exactly as the browser's would.
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
  static measure(width: number, height: number) {
    act(() => {
      for (const each of StubResizeObserver.all) {
        each.callback(
          [{ contentRect: { width, height } } as ResizeObserverEntry],
          each as unknown as ResizeObserver,
        )
      }
    })
  }
}

const PANEL = { width: 1450, height: 297 }

const drawn = (element: ReactElement) => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver)
  const { container } = render(element)
  StubResizeObserver.measure(PANEL.width, PANEL.height)
  return container
}

afterEach(() => {
  vi.unstubAllGlobals()
  StubResizeObserver.all = []
})

describe('the catalog drawing', () => {
  it('captions a bare tool with what a shop orders, and an assembly with the stack', () => {
    const alone = drawn(<CatalogDrawing tool={tool} unit="millimeters" />)
    expect(alone.querySelector('figcaption')?.textContent).toContain('TDMX0300')

    StubResizeObserver.all = []
    const stacked = drawn(<CatalogDrawing tool={tool} assembly={assembly} unit="millimeters" />)
    expect(stacked.querySelector('figcaption')?.textContent).toContain(
      'BT 30 / PG 10 x 060 + PG 10 / 6 + TDMX0300',
    )
  })

  /**
   * The drawing stopped writing its own figures in `@toolpath/tool-drawing`
   * 0.2.0 — it draws the lines and the panel's table carries the numbers — so
   * the unit no longer reaches it through a dimension. It still reaches the
   * sentences the package prints and does not compose: the clearance gaps,
   * which is why this asks for a stack and a feature rather than a bare tool.
   */
  it('writes the clearance in the unit the page is set to, because the package owns no unit', () => {
    const container = drawn(
      <CatalogDrawing tool={tool} assembly={assembly} unit="inches" curve={curve} dimensions />,
    )

    expect(container.textContent).toMatch(/0\.276 in/)
    expect(container.textContent).not.toMatch(/\bmm\b/)
  })

  /**
   * **Which line is which is answered by pointing.** The drawing letters
   * nothing, so the code the panel hands down is the whole of what says a line
   * is the flute length; `tool-details.test.tsx` pins the hover that produces
   * it. A code this tool has no line for lights nothing rather than throwing,
   * which is what `RE` and the two derived figures do.
   */
  it('lights the line the panel is pointing at, and nothing for a code it does not draw', () => {
    const lit = drawn(<CatalogDrawing tool={tool} unit="millimeters" dimensions highlight="LCF" />)
    expect(lit.querySelector('[data-dimension="LCF"]')?.getAttribute('data-lit')).toBe('true')
    expect(lit.querySelectorAll('[data-lit="true"]')).toHaveLength(1)

    const none = drawn(<CatalogDrawing tool={tool} unit="millimeters" dimensions highlight="RE" />)
    expect(none.querySelector('[data-dimensions]')).not.toBeNull()
    expect(none.querySelectorAll('[data-lit="true"]')).toHaveLength(0)
  })

  it('draws the material and the verdict this application reached, not one of its own', () => {
    const container = drawn(
      <CatalogDrawing
        tool={tool}
        assembly={assembly}
        unit="millimeters"
        curve={curve}
        dimensions
      />,
    )

    expect(container.querySelector('[data-clearance]')).not.toBeNull()
    expect(container.querySelector('[data-part="material"]')).not.toBeNull()
    expect(container.querySelector('[data-verdict]')).not.toBeNull()
  })

  it('says an undrawable form in words rather than drawing a plausible cylinder', () => {
    const container = drawn(
      <CatalogDrawing tool={{ ...tool, form: 'thread mill' }} unit="millimeters" dimensions />,
    )

    expect(container.querySelector('[data-undrawable]')?.getAttribute('data-undrawable')).toBe(
      'thread mill',
    )
    expect(container.querySelector('svg')).toBeNull()
  })
})

/**
 * **The overlay lands in the drawing's own frame.**
 *
 * It used to be this application's job to work that frame out a second time,
 * because `<ToolDrawing>` measured its panel and handed its children nothing;
 * `shared/drawing-frame.ts` did it, and three tests here held the copy in
 * lockstep with the real component. The package now publishes the frame to its
 * subtree, so the copy and its sensor are both gone.
 *
 * What is left worth checking is the wiring: that the overlay this application
 * passes as a child is drawn, in the same `<svg>` as the tool. If the handoff
 * ever breaks, the package throws rather than drawing in an invented frame, so
 * this goes red rather than sliding an overlay quietly off a tool.
 */
/** How many vertices the holder is drawn with, across every segment of it. */
const holderVertices = (container: Element): number =>
  Array.from(
    container.querySelectorAll('[data-part="body"], [data-part="flange"], [data-part="nose"]'),
  )
    .map((each) => (each.getAttribute('points') ?? '').trim().split(/\s+/).length)
    .reduce((total, each) => total + each, 0)

describe('the overlay this application draws', () => {
  it('is drawn inside the tool drawing, in its frame', () => {
    const container = drawn(
      <CatalogDrawing
        tool={tool}
        assembly={assembly}
        unit="millimeters"
        curve={curve}
        dimensions
      />,
    )
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    expect(svg?.querySelector('[data-clearance]')).not.toBeNull()
    expect(svg?.querySelector('[data-wall="cut"]')).not.toBeNull()
  })

  it('draws the tool alone when there is no feature to clear', () => {
    const container = drawn(
      <CatalogDrawing tool={tool} assembly={assembly} unit="millimeters" dimensions />,
    )

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[data-clearance]')).toBeNull()
  })

  /**
   * That a measured silhouette actually reaches the package.
   *
   * The holder fixtures above carry guids nothing has measured, so every test
   * before this one draws the parametric holder — which is right, and leaves
   * the measured path uncovered. This one uses a guid the committed sample
   * profiles document does measure and pins the difference: a measured holder
   * is drawn with every vertex the model has, where the published one is a
   * nose, a body and a flange.
   */
  it('draws the measured silhouette where the holder has been measured', () => {
    const measuredHolder: Holder = { ...holder, guid: MEASURED_GUID }
    const stack: Assembly = { ...assembly, holder: measuredHolder }

    const measured = drawn(<CatalogDrawing tool={tool} assembly={stack} unit="millimeters" />)
    const measuredVertices = holderVertices(measured)

    StubResizeObserver.all = []
    const parametric = drawn(
      <CatalogDrawing tool={tool} assembly={stack} unit="millimeters" measured={false} />,
    )

    expect(measuredVertices).toBeGreaterThan(holderVertices(parametric))
  })

  /**
   * **The spindle end is cut off, not scaled into the frame.**
   *
   * A measured model carries the 7:24 taper and the retention knob above the
   * gage line, and drawing them shrinks the tool to fit a shape nobody is
   * asking this picture about. `belowGageLine` cuts there, so the measured
   * holder has no flange segment at all — where the published one, which stops
   * at its gauge length by construction, still draws its V-flange.
   */
  it('draws nothing above the gage line of a measured holder', () => {
    const measuredHolder: Holder = { ...holder, guid: MEASURED_GUID }
    const stack: Assembly = { ...assembly, holder: measuredHolder }

    const measured = drawn(<CatalogDrawing tool={tool} assembly={stack} unit="millimeters" />)

    expect(measured.querySelector('[data-part="flange"]')).toBeNull()

    StubResizeObserver.all = []
    const parametric = drawn(
      <CatalogDrawing tool={tool} assembly={stack} unit="millimeters" measured={false} />,
    )

    expect(parametric.querySelector('[data-part="flange"]')).not.toBeNull()
  })

  it('falls back to the parametric holder for one nothing has measured', () => {
    const unmeasured = drawn(<CatalogDrawing tool={tool} assembly={assembly} unit="millimeters" />)
    const forced = (() => {
      StubResizeObserver.all = []
      return drawn(
        <CatalogDrawing tool={tool} assembly={assembly} unit="millimeters" measured={false} />,
      )
    })()

    expect(unmeasured.querySelector('svg')?.getAttribute('viewBox')).toBe(
      forced.querySelector('svg')?.getAttribute('viewBox'),
    )
  })
})
