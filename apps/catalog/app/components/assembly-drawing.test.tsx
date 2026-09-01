import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Assembly } from '@toolpath/catalog-data'
import { AssemblyDrawing, lastRise, wallCorners, wallPath } from './assembly-drawing'

const assembly: Assembly = {
  tool: {
    guid: 't',
    familyId: 'f',
    brand: 'WIDIA',
    vendor: 'Kennametal',
    catalogNumber: 'TDMX0600',
    materialNumber: null,
    toolType: 'endmill',
    form: 'flat end mill',
    unitSystem: 'metric',
    geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, LBH: 19 },
    materialGroups: ['P'],
    productLink: null,
    provenance: { LBH: 'derived' },
  },
  holder: {
    guid: 'h',
    familyId: 'bt30',
    brand: 'REGO-FIX',
    vendor: 'REGO-FIX',
    catalogNumber: 'BT 30 / PG 6 x 050',
    materialNumber: null,
    taper: 'BT30',
    contact: 'taper',
    clamping: 'collet',
    gaugeLength: 50,
    colletSeries: 'PG6',
    boreDiameter: null,
    noseDiameter: 28,
    noseLength: null,
    bodyDiameter: null,
    bodyLength: null,
    projection: null,
    flangeDiameter: null,
    colletProtrusion: null,
    productLink: null,
    cadModelUrl: null,
    provenance: {},
  },
  collet: null,
  stickout: 25,
  maxStickout: null,
}

const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }
describe('the assembly, drawn', () => {
  it('draws every part from the stated dimensions', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" />,
    )

    expect(screen.getByRole('img')).toBeInTheDocument()
    expect(
      [...container.querySelectorAll('[data-part]')].map((each) => each.getAttribute('data-part')),
    ).toEqual(['tip', 'flutes', 'shank', 'nose'])
  })

  /**
   * The dimensions are the panel's to ask for: the same drawing is used small,
   * beside a list, where a dimension line is noise.
   */
  it('dimensions the tool only when it is asked to', () => {
    const plain = render(<AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" />)
    expect(plain.container.querySelector('[data-dimensions]')).toBeNull()

    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" dimensions />,
    )
    const drawn = [...container.querySelectorAll('[data-dimension]')].map((each) =>
      each.getAttribute('data-dimension'),
    )

    // With a holder: the stickout, and no overall length — most of the shank
    // is inside the holder.
    expect(drawn).toContain('stickout')
    expect(drawn).not.toContain('OAL')
    expect(drawn).toEqual(expect.arrayContaining(['DC', 'SFDM', 'LCF']))
  })

  /** The tool alone states its own overall length, and nothing about a holder. */
  it('dimensions the overall length when the tool is drawn by itself', () => {
    const { container } = render(<AssemblyDrawing tool={assembly.tool} unit="mm" dimensions />)
    const drawn = [...container.querySelectorAll('[data-dimension]')].map((each) =>
      each.getAttribute('data-dimension'),
    )

    expect(drawn).toContain('OAL')
    expect(drawn).not.toContain('stickout')
  })

  /** A collision is a picture: the part that meets the material turns red. */
  it('paints the part that meets the material', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={curve} />,
    )

    expect(screen.getByText('collides with the part')).toBeInTheDocument()
    expect(container.querySelector('[data-part="nose"]')?.getAttribute('class')).toContain('danger')
    expect(container.querySelector('[data-part="shank"]')?.getAttribute('class')).not.toContain(
      'danger',
    )
  })

  /** Paul's call: every line solid; what was assumed is on the element and in the caption, not in the line style. */
  it('draws every line solid, keeps the provenance on the element, and names what was assumed', () => {
    const drill = { ...assembly, tool: { ...assembly.tool, form: 'drill' as const } }
    const { container } = render(<AssemblyDrawing tool={drill.tool} assembly={drill} unit="mm" />)

    const tip = container.querySelector('[data-part="tip"]')
    expect(tip?.getAttribute('stroke-dasharray')).toBeNull()
    expect(tip?.getAttribute('data-provenance')).toBe('assumed')
    expect(screen.getByText(/tip angle assumed/)).toBeInTheDocument()
  })

  /**
   * **A drawing sheet, in its own colours.** Gold flutes, a steel body, the
   * holder behind it in a grey of its own — hard values rather than the
   * application's ramp, because the ramp flips under light mode and a drawing
   * is a drawing in either theme (Paul, 2026-09-01).
   */
  /**
   * **One set of colours per theme** (Paul, 2026-09-01: "2d tool visualization
   * can't have the white background in dark mode — make it just barely lighter
   * than any of the other backgrounds"). The tests run in the application's
   * default, which is dark.
   */
  it('paints the flutes gold, the body steel and the holder its own grey', () => {
    const connected = {
      ...assembly,
      holder: {
        ...assembly.holder,
        bodyDiameter: 40,
        bodyLength: 20,
        // Past the nose and the body, so the cone nobody states is drawn up to it.
        projection: 110,
        flangeDiameter: 46,
      },
    }
    const { container } = render(
      <AssemblyDrawing tool={connected.tool} assembly={connected} unit="mm" />,
    )
    const painted = (selector: string) => container.querySelector(selector)?.getAttribute('fill')

    expect(painted('[data-part="flutes"]')).toBe('#c9a44b')
    expect(painted('[data-part="shank"]')).toBe('#5b626c')
    expect(painted('[data-part="nose"]')).toBe('#474d57')
    expect(painted('[data-part="flange"]')).toBe('#3a4048')
  })

  /**
   * And the sheet is a shade above the card rather than a white rectangle in a
   * dark application — with the ink turned over to match.
   */
  it('draws on a dark sheet in dark mode', () => {
    const { container } = render(<AssemblyDrawing tool={assembly.tool} unit="mm" dimensions />)
    const svg = container.querySelector('svg')!

    expect(svg.style.background).toBe('rgb(34, 37, 43)')
    expect(container.querySelector('[data-centreline]')?.getAttribute('stroke')).toBe('#e8ebef')
  })

  it('says so rather than drawing a tool with no dimensions', () => {
    render(<AssemblyDrawing tool={{ ...assembly.tool, geometry: {} }} unit="mm" />)

    expect(screen.getByText(/nothing to draw/)).toBeInTheDocument()
  })
})

describe('the tool alone', () => {
  it('draws the tool with no holder, and dimensions no stickout', () => {
    const { container } = render(<AssemblyDrawing tool={assembly.tool} unit="mm" />)

    expect(
      [...container.querySelectorAll('[data-part]')].map((each) => each.getAttribute('data-part')),
    ).toEqual(['tip', 'flutes', 'shank'])
    expect(screen.queryByText(/stickout/)).not.toBeInTheDocument()
  })
})

describe('the wall the sweep read', () => {
  /** Paul (2026-08-30): "show me why this is red" — the staircase beside the stack, and the number the check used at the point that decides it. */
  it('draws the material staircase on the right and dimensions the deciding point', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={curve} />,
    )
    expect(container.querySelector('[data-part="material"]')).not.toBeNull()
    // The tightest point only: its axial clearance (negative, into the wall here) and its radial clearance.
    const tight = container.querySelector('[data-tight]')
    expect(tight?.getAttribute('data-clears')).toBe('false')
    expect(container.querySelector('[data-dim="axial"]')?.textContent).toMatch(/^−.* axial$/)
    // Into the wall there is nothing to measure sideways: only the axial figure is drawn.
    expect(container.querySelector('[data-dim="radial"]')).toBeNull()
    expect(screen.getByText('collides with the part')).toBeInTheDocument()
  })

  /**
   * Flutes exactly the wall plus the room: the shank sits 0.5 mm over the
   * wall, which is the 0.5 mm wanted — a pass, measured as the gap it is,
   * not "0.000 short" of the room (Paul, 2026-08-30).
   */
  it('measures the gap to the wall and passes a gap exactly the room wanted', () => {
    const exact = { horizontalOffset: [0, 1, 30], verticalOffset: [12.5, 12.5, 12.5] }
    const stack: Assembly = { ...assembly, stickout: 60 }
    const { container } = render(
      <AssemblyDrawing
        tool={assembly.tool}
        assembly={stack}
        unit="mm"
        curve={exact}
        margins={{ radial: 0.5, axial: 0.5 }}
      />,
    )
    const tight = container.querySelector('[data-tight]')
    expect(tight?.getAttribute('data-tight')).toBe('shank')
    expect(tight?.getAttribute('data-clears')).toBe('true')
    expect(container.querySelector('[data-dim="axial"]')?.textContent).toBe('0.50 mm axial')
    // Nothing stands as tall as the shank's bottom, so there is no wall face to measure to sideways.
    expect(container.querySelector('[data-dim="radial"]')).toBeNull()
    expect(
      screen.getByText(
        /tightest: 0.50 mm above the wall at the shank — 0.50 mm up and 0.50 mm sideways wanted/,
      ),
    ).toBeInTheDocument()
  })

  it('draws no wall without a curve', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" />,
    )
    expect(container.querySelector('[data-part="material"]')).toBeNull()
    expect(container.querySelector('[data-tight]')).toBeNull()
  })
})

describe('the radial clearance', () => {
  /**
   * A 10 mm wall at the cut and a 60 mm wall from 12 mm out. Up, the tightest
   * is the bottom of the shank, 13 mm up on a 6 mm cut: 3 mm above the 10 mm
   * wall. Sideways, it is the ⌀28 nose: 3 + 12 − 14 = 1 mm to the face that
   * stands taller than it — a different part from the one measured up.
   */
  it('is measured to the wall face taller than the part, at its own tightest point', () => {
    const beside = { horizontalOffset: [0, 12, 30], verticalOffset: [10, 10, 60] }
    const stack: Assembly = { ...assembly, stickout: 30 }
    const { container } = render(
      <AssemblyDrawing
        tool={assembly.tool}
        assembly={stack}
        unit="mm"
        curve={beside}
        margins={{ radial: 0.5, axial: 0.5 }}
      />,
    )
    const tight = container.querySelector('[data-tight]')
    expect(tight?.getAttribute('data-tight')).toBe('shank')
    expect(tight?.getAttribute('data-sideways')).toBe('nose')
    expect(container.querySelector('[data-dim="axial"]')?.textContent).toBe('3.00 mm axial')
    expect(container.querySelector('[data-dim="radial"]')?.textContent).toBe('1.00 mm radial')
  })

  /**
   * A face out past where the part is broken off is not on the drawing, so
   * the dimension is broken at the break — and keeps the number the check
   * used, which is the whole point of drawing it at all.
   */
  it('breaks the dimension when the face it measures to is past the break', () => {
    const far = { horizontalOffset: [0, 20, 40], verticalOffset: [10, 10, 60] }
    const { container } = render(
      <AssemblyDrawing
        tool={assembly.tool}
        assembly={{ ...assembly, stickout: 30 }}
        unit="mm"
        curve={far}
      />,
    )

    expect(container.querySelector('[data-break="dimension"]')).not.toBeNull()
    // The ⌀28 nose is the nearest to it: 3 + 20 − 14.
    expect(container.querySelector('[data-dim="radial"]')?.textContent).toBe('9.00 mm radial')
  })
})

/**
 * A panel of a given shape, for the one rule that needs to know one.
 *
 * jsdom has no `ResizeObserver`, so the drawing never measures and falls back
 * to the stack's own frame — which is what every other test here reads. This
 * stands one in that reports a fixed box the moment it is asked.
 */
const withPanel = (width: number, height: number) => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly run: ResizeObserverCallback) {}
      observe() {
        this.run(
          [{ contentRect: { width, height } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }
      unobserve() {}
      disconnect() {}
    },
  )
}

describe('the room the panel has spare', () => {
  afterEach(() => vi.unstubAllGlobals())

  const far = { horizontalOffset: [0, 1, 40, 80], verticalOffset: [12, 12, 12, 40] }
  const drawn = () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={far} />,
    )
    const box = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number)
    const d = container.querySelector('[data-part="material"]')!.getAttribute('d')!
    const material = Math.max(
      ...[...d.matchAll(/(-?\d+(?:\.\d+)?),-?\d/g)].map((match) => Number(match[1])),
    )
    return { width: box[2]!, material }
  }

  /**
   * The stack settles the height, so a panel taller than the stack is wide
   * has width over — and the viewBox used to letterbox it away while the part
   * was broken off short of it (Paul, 2026-08-30: "you can use the full area
   * to the right of the tool").
   */
  it('gives it to the part instead of letterboxing it away', () => {
    const tight = drawn()
    withPanel(400, 600)
    const roomy = drawn()

    expect(roomy.width).toBeGreaterThan(tight.width)
    expect(roomy.material).toBeGreaterThan(tight.material)
    // Still inside the frame, break and all.
    expect(roomy.material).toBeLessThan(roomy.width - 1)
  })

  /**
   * What the part does not want goes back to the other side, so a stack with
   * nothing beside it stays in the middle of the panel.
   */
  it('keeps the stack centred when the part does not want the room', () => {
    withPanel(400, 600)
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" />,
    )
    const width = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2])
    const axis = [...container.querySelectorAll('line')].at(-1)!

    expect(Number(axis.getAttribute('x1'))).toBeCloseTo(width / 2, 6)
  })
})

describe('the wall’s corners', () => {
  /**
   * Both ends of every run, so a step draws as a step.
   *
   * Keeping only the point where a new height begins left two corners that
   * spanned a run *and* the rise after it, and the line drew one diagonal
   * across both — a square step read as a chamfer, and the material over the
   * run stood taller than the sweep says (Paul's section view, 2026-08-30).
   * Float noise is still dropped, so a sampled fillet keeps its shape.
   */
  it('keeps both ends of every run and drops noise', () => {
    const stairs = [
      { r: 3, z: 0 },
      { r: 3, z: 2 },
      { r: 3.5, z: 2 },
      { r: 3.5, z: 2.6 },
      { r: 4, z: 2.6 },
      { r: 4, z: 2.6000001 },
      { r: 4.0000001, z: 2.6000001 },
      { r: 4.0000001, z: 4 },
      { r: 30, z: 4 },
    ]
    expect(wallCorners(stairs, 0.001)).toEqual([
      { r: 3, z: 0 },
      // up at the cut, along to 3.5, up again, along to 4, up, and out
      { r: 3, z: 2 },
      { r: 3.5, z: 2 },
      { r: 3.5, z: 2.6 },
      { r: 4.0000001, z: 2.6 },
      { r: 4.0000001, z: 4 },
      { r: 30, z: 4 },
    ])
  })

  /** A run's far end is a corner even where the profile simply stops. */
  it('closes the last run at the end of the profile', () => {
    expect(
      wallCorners(
        [
          { r: 3, z: 0 },
          { r: 3, z: 5 },
          { r: 20, z: 5 },
        ],
        0.001,
      ),
    ).toEqual([
      { r: 3, z: 0 },
      { r: 3, z: 5 },
      { r: 20, z: 5 },
    ])
  })
})

describe('the wall as a path', () => {
  const x = (r: number) => r
  const y = (z: number) => -z

  /** Close-spaced corners are a sampled curve and get a spline; a lone big rise stays a sharp line. */
  it('splines through a fillet’s close corners and keeps a wall’s corner sharp', () => {
    const fillet = Array.from({ length: 12 }, (_, i) => ({
      r: 3 + i * 0.5,
      z: 2 + Math.sqrt(1 - (1 - i / 11) ** 2) * 4,
    }))
    const path = wallPath(
      [{ r: 3, z: 0 }, ...fillet, { r: 8.5, z: 6 }, { r: 30, z: 6 }],
      { run: 2, rise: 5 },
      x,
      y,
    )
    expect(path.startsWith('M3.00,0.00')).toBe(true)
    expect((path.match(/ C/g) ?? []).length).toBeGreaterThan(5)
    // the step up to the flat top and the long run out are lines
    expect(path.endsWith('L30.00,-6.00')).toBe(true)
    const wall = wallPath(
      [
        { r: 3, z: 0 },
        { r: 3, z: 20 },
        { r: 30, z: 20 },
      ],
      { run: 2, rise: 5 },
      x,
      y,
    )
    expect(wall).toBe('M3.00,0.00 L3.00,-20.00 L30.00,-20.00')
  })
})

describe('how far right the wall is drawn', () => {
  /** Past the outermost rise the material is flat: the drawing stops there. */
  it('stops at the last rise', () => {
    expect(
      lastRise([
        { r: 3, z: 0 },
        { r: 3, z: 12 },
        { r: 9, z: 30 },
        { r: 60, z: 30 },
      ]),
    ).toBe(9)
    expect(lastRise([{ r: 4, z: 5 }])).toBe(4)
    expect(lastRise([])).toBe(0)
  })

  /**
   * Paul's rule (2026-08-30): the 2D part geometry is always secondary to the
   * assembly. Material that runs on and on takes no room from the stack —
   * the frame is the same either way, and the stack stays centred in it.
   */
  it('never lets the part widen the frame, and keeps the stack centred', () => {
    const near = { horizontalOffset: [0, 1, 60], verticalOffset: [12, 12, 12] }
    const far = { horizontalOffset: [0, 1, 40, 600], verticalOffset: [12, 12, 12, 400] }
    const boxOf = (reach: typeof near) => {
      const { container } = render(
        <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={reach} />,
      )
      return container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number)
    }
    expect(boxOf(far)[2]).toBe(boxOf(near)[2])
    // The axis sits in the middle of it: the tool is centred, whatever is beside it.
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={far} />,
    )
    const width = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2])
    const axis = [...container.querySelectorAll('line')].at(-1)!
    expect(Number(axis.getAttribute('x1'))).toBeCloseTo(width / 2, 6)
  })

  /** The part is drawn in the room the frame leaves beside the stack, and breaks there. */
  it('breaks the part off inside the frame', () => {
    const far = { horizontalOffset: [0, 1, 40, 600], verticalOffset: [12, 12, 12, 400] }
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={far} />,
    )
    const rightmost = (coordinates: string) =>
      Math.max(...[...coordinates.matchAll(/(-?\d+(?:\.\d+)?),-?\d/g)].map((m) => Number(m[1])))
    const material = rightmost(
      container.querySelector('[data-part="material"]')!.getAttribute('d')!,
    )
    const width = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2])
    // Inside the frame, break included — never against its edge.
    expect(material).toBeLessThan(width - 1)
    const broken = container.querySelector('[data-break="material"]')!.getAttribute('points')!
    expect(new Set(broken.split(' ').map((pair) => pair.split(',')[0])).size).toBeGreaterThan(1)
  })

  /** Material is hatched: it is a section through the part, and nothing on the stack is. */
  it('hatches the part', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} assembly={assembly} unit="mm" curve={curve} />,
    )
    const fill = container.querySelector('[data-part="material"]')!.getAttribute('fill')!
    expect(fill).toMatch(/^url\(#hatch-/)
    expect(container.querySelector(`#${fill.slice(5, -1)}`)?.tagName.toLowerCase()).toBe('pattern')
  })
})

/**
 * **"They need to be layed out in a way that NEVER OVERLAP THE MODEL, A
 * LEADER, OTHER TEXT, OR ANOTHER DIMENSION"** (Paul, 2026-09-01, with three
 * screenshots of figures written over each other). Three goes at placing
 * figures among the lines each produced a smudge somewhere, so this is a check
 * rather than a rule somebody remembers: every figure is in a margin, and no
 * figure covers another.
 */
describe('figures that can be read', () => {
  const boxes = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-figure] rect')].map((each) => ({
      x: Number(each.getAttribute('x')),
      y: Number(each.getAttribute('y')),
      width: Number(each.getAttribute('width')),
      height: Number(each.getAttribute('height')),
    }))

  it('never lets one figure cover another', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} unit="mm" dimensions dimensionSides="both" />,
    )
    const drawn = boxes(container)
    expect(drawn.length).toBeGreaterThan(3)

    for (const [index, one] of drawn.entries()) {
      for (const two of drawn.slice(index + 1)) {
        const apart =
          one.x + one.width <= two.x ||
          two.x + two.width <= one.x ||
          one.y + one.height <= two.y ||
          two.y + two.height <= one.y
        expect(apart).toBe(true)
      }
    }
  })

  /** And in the margin: past the tool, never over it. */
  it('keeps every figure outside the tool', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} unit="mm" dimensions dimensionSides="both" />,
    )
    const svg = container.querySelector('svg')!
    const [, , width] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const tool = [...container.querySelectorAll('[data-part] polygon')].flatMap((each) =>
      each
        .getAttribute('points')!
        .split(' ')
        .map((pair) => Number(pair.split(',')[0])),
    )
    const left = Math.min(...tool)
    const right = Math.max(...tool)

    for (const box of boxes(container)) {
      expect(box.x + box.width <= left || box.x >= right).toBe(true)
      // And on the sheet, rather than off its edge.
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width!)
    }
  })

  /**
   * **Beside its own line, and off every other one** (Paul, 2026-09-01: "put
   * SFDM, LCF and shoulder dia closer to the part — inside the below holder
   * and OAL lines"). Moving the figures in among the lanes is only worth doing
   * if they stay clear of the extension lines that cross those bands.
   */
  it('keeps every figure off the dimension lines', () => {
    const { container } = render(
      <AssemblyDrawing tool={assembly.tool} unit="mm" dimensions dimensionSides="both" />,
    )
    const lines = [...container.querySelectorAll('[data-dimension] line')].map((each) => ({
      x1: Number(each.getAttribute('x1')),
      y1: Number(each.getAttribute('y1')),
      x2: Number(each.getAttribute('x2')),
      y2: Number(each.getAttribute('y2')),
    }))
    expect(lines.length).toBeGreaterThan(4)

    for (const box of boxes(container)) {
      for (const line of lines) {
        const across =
          Math.min(line.x1, line.x2) < box.x + box.width && Math.max(line.x1, line.x2) > box.x
        const down =
          Math.min(line.y1, line.y2) < box.y + box.height && Math.max(line.y1, line.y2) > box.y
        expect(across && down).toBe(false)
      }
    }
  })

  /**
   * **"SFDM and shoulder diameter should use outward leaders, not lines over
   * the tool"** (Paul, 2026-09-01): a ⌀6 shank at this scale has no room for a
   * dimension line inside it, so the arrows stand outside and point in.
   */
  it('draws no width dimension across the tool', () => {
    const { container } = render(<AssemblyDrawing tool={assembly.tool} unit="mm" dimensions />)
    const axis = Number(
      container.querySelector('[data-centreline]')?.getAttribute('x1') ??
        // The centreline is the axis; without one, nothing to check against.
        NaN,
    )
    expect(Number.isNaN(axis)).toBe(false)

    for (const code of ['DC', 'SFDM']) {
      for (const line of container.querySelectorAll(`[data-dimension="${code}"] line`)) {
        const from = Number(line.getAttribute('x1'))
        const to = Number(line.getAttribute('x2'))
        expect(Math.min(from, to) > axis || Math.max(from, to) < axis).toBe(true)
      }
    }
  })
})
