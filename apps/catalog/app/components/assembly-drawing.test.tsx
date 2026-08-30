import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Assembly } from '@toolpath/catalog-data'
import { AssemblyDrawing, wallCorners, wallPath } from './assembly-drawing'

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
    expect(screen.getByText(/point angle assumed/)).toBeInTheDocument()
  })

  it('colours the flutes pale yellow, the shank light grey, the holder grey, the connection darker', () => {
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
    const shade = (selector: string) => container.querySelector(selector)?.getAttribute('class')

    expect(shade('[data-part="flutes"]')).toContain('fill-yellow-100')
    expect(shade('[data-part="shank"]')).toContain('fill-zinc-300')
    expect(shade('[data-part="nose"]')).toContain('fill-zinc-500')
    expect(shade('[data-part="body"][data-provenance="assumed"]')).toContain('fill-zinc-700')
    expect(shade('[data-part="flange"]')).toContain('fill-zinc-700')
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
    expect(container.querySelector('[data-dim="axial"]')?.textContent).toMatch(/^−.* up$/)
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
    expect(container.querySelector('[data-dim="axial"]')?.textContent).toBe('0.50 mm up')
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
    expect(container.querySelector('[data-dim="axial"]')?.textContent).toBe('3.00 mm up')
    expect(container.querySelector('[data-dim="radial"]')?.textContent).toBe('1.00 mm sideways')
  })
})

describe('the wall’s corners', () => {
  /** Every sampled rise is a corner; only float noise is dropped, so a fillet keeps its shape. */
  it('keeps every real rise and drops noise', () => {
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
      { r: 3, z: 2 },
      { r: 3.5, z: 2.6 },
      { r: 4.0000001, z: 4 },
      { r: 30, z: 4 },
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
