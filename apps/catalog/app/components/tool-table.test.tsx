import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { CatalogTool } from '@toolpath/catalog-data'
import { TAP_COLUMNS, ToolTable } from './tool-table'

const tool: CatalogTool = {
  guid: 'aaaa-1111',
  familyId: 'vhm-endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: '6694846',
  toolType: 'endmill',
  productLine: null,
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 12.7, NOF: 4 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
}

const show = (tools: ReadonlyArray<CatalogTool>, unit: 'in' | 'mm' = 'mm') =>
  render(
    <MemoryRouter>
      <ToolTable tools={tools} unit={unit} />
    </MemoryRouter>,
  )

describe('a column that the rail also asks about', () => {
  /**
   * One filter, one place to answer it: the header opens the rail's own
   * bubble rather than a second control for the same question (Paul,
   * 2026-09-01).
   */
  it('hands its filter to the rail instead of opening its own', () => {
    const onRailFilter = vi.fn()
    render(
      <MemoryRouter>
        <ToolTable
          tools={[tool]}
          unit="mm"
          onRange={() => {}}
          onRailFilter={onRailFilter}
          railKeys={{ DC: 'DC' }}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Diameter' }))

    expect(onRailFilter).toHaveBeenCalledWith('DC')
    // And no second control opened in the header.
    expect(screen.queryByRole('textbox', { name: /Diameter/ })).not.toBeInTheDocument()
  })

  it('keeps its own control for a column the rail does not ask about', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" onRange={() => {}} onRailFilter={() => {}} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Filter by Diameter' }))

    expect(screen.getByRole('combobox', { name: /How to compare Diameter/ })).toBeInTheDocument()
  })
})

/**
 * **The row does not badge itself** (Paul, 2026-09-02: "get rid of 'near miss'
 * there"). Every row of a nearest-miss list wore one, under a heading already
 * saying "nothing in the crib fits — the closest are shown, with what stops
 * each" and beside a column already showing the refusal in red.
 */
describe('a list of near misses', () => {
  it('leaves the badge off the row, and lets the column say what stopped it', () => {
    render(
      <MemoryRouter>
        <ToolTable
          tools={[tool]}
          unit="mm"
          marks={() => ({
            DC: { ok: false, level: 'must', why: 'too large', detail: 'Wider than the hole.' },
          })}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByText('near miss')).not.toBeInTheDocument()
    expect(screen.getByLabelText('too large — Wider than the hole.')).toBeInTheDocument()
  })

  /**
   * **The reason is on the glyph, not written into the row** (Paul, 2026-09-02:
   * "it is writing out too large — it should be red text, red x icon with hover
   * over to show that"). Two words on a second line gave a failing row a height
   * no passing row had, and said in text what the red already said.
   */
  it('hangs the refusal on a red x rather than writing it under the number', () => {
    render(
      <MemoryRouter>
        <ToolTable
          tools={[tool]}
          unit="mm"
          marks={() => ({
            DC: { ok: false, level: 'must', why: 'too large', detail: 'Wider than the hole.' },
          })}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByText('too large')).not.toBeInTheDocument()
    expect(screen.getByText('12.70 mm').closest('td')?.className).toContain('text-danger')
    expect(
      screen.getByLabelText('too large — Wider than the hole.').closest('span')?.className,
    ).toContain('text-danger')
  })
})

/**
 * **The number wears its mark's colour** (Paul, 2026-09-02: "show the tool's
 * tip angle in orange and have an icon to show"). The glyph said amber while
 * the figure it was about stayed the plain colour of a number nobody had
 * anything to say about.
 */
describe('the colour a marked number is read in', () => {
  const cellFor = (marks: Parameters<typeof ToolTable>[0]['marks']) => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" marks={marks} />
      </MemoryRouter>,
    )
    return screen.getByText('12.70 mm').closest('td')
  }

  it('paints a caution orange, with the glyph that says why', () => {
    const cell = cellFor(() => ({ DC: { ok: true, caution: '22.0° shallower than the bottom' } }))

    expect(cell?.className).toContain('text-amber-300')
    expect(screen.getByLabelText('22.0° shallower than the bottom')).toBeInTheDocument()
  })

  /**
   * **In range is in range** (Paul, 2026-09-02: "normal text, light grey icon
   * for within tolerance"). A drill inside the shop's own deviation passed, so
   * its number is read like any other and the grey `i` is where the figure
   * lives, not a warning about it. Yellow is kept for a caution, red for the
   * rule that took the tool off the list — three colours, and no blue.
   */
  it('leaves a difference inside the tolerance uncoloured, under a grey glyph', () => {
    const cell = cellFor(() => ({ DC: { ok: true, note: '+0.10 mm from the hole' } }))

    expect(cell?.className).toContain('text-zinc-300')
    expect(cell?.className).not.toContain('text-info')
    expect(cell?.className).not.toContain('text-amber')
    expect(screen.getByLabelText('+0.10 mm from the hole').closest('span')?.className).toContain(
      'text-zinc-400',
    )
  })

  it('leaves a number the rules simply passed alone, for the tick to speak', () => {
    const cell = cellFor(() => ({ DC: { ok: true } }))

    expect(cell?.className).toContain('text-zinc-300')
    expect(screen.getByLabelText('within the rules')).toBeInTheDocument()
  })
})

describe('what a tool stands out', () => {
  const held: CatalogTool = { ...tool, geometry: { DC: 12.7, NOF: 4, LBH: 40, OAL: 60 } }

  /** On its own: the overall length less the shank the clamping rule holds. */
  it('shows the tool’s own length below the holder', () => {
    show([held])

    expect(screen.getByText('40.00 mm')).toBeInTheDocument()
  })

  /**
   * A holder chosen makes the part decide instead, and where that is a
   * different number the cell says it was the holder (Paul, 2026-09-01).
   */
  it('says when a holder changed it', () => {
    render(
      <MemoryRouter>
        <ToolTable
          tools={[held]}
          unit="mm"
          holding={{
            holdersFor: () => [],
            colletsFor: () => [],
            chosen: () => ({ holderGuid: 'h', colletGuid: null }),
            requiredStickout: () => 47,
            stickoutFor: () => 47,
            onChoose: () => {},
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('holder needs')).toBeInTheDocument()
    expect(screen.getByText('47.00 mm')).toBeInTheDocument()
  })
})

describe('ToolTable', () => {
  it('shows a tool by the number a shop orders it with', () => {
    show([tool])

    expect(screen.getByText('TDMX0500')).toBeInTheDocument()
  })

  it('shows every dimension in the unit being read in', () => {
    show([tool], 'in')

    expect(screen.getByText('0.500 in')).toBeInTheDocument()
  })

  /** A zero would read as a measured value of zero, which is a different claim. */
  it('marks a dimension the vendor does not state rather than showing a zero', () => {
    show([tool])

    const cells = screen.getAllByRole('cell').map((cell) => cell.textContent)
    expect(cells).toContain('—')
    expect(cells).not.toContain('0.00 mm')
  })

  it('says so when nothing matches, instead of rendering an empty table', () => {
    show([])

    expect(screen.getByText(/No tool in the catalog matches/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('where the page has somewhere to put a tool', () => {
  /**
   * Leaving the part to read a tool loses the selection that produced the list,
   * so the number chooses the tool instead of navigating to it.
   */
  it('chooses the tool rather than linking away', async () => {
    const chosen: Array<string> = []
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" onChoose={(each) => chosen.push(each.guid)} />
      </MemoryRouter>,
    )

    const number = screen.getByRole('button', { name: 'TDMX0500' })
    expect(screen.queryByRole('link', { name: 'TDMX0500' })).not.toBeInTheDocument()

    number.click()
    expect(chosen).toEqual(['aaaa-1111'])
  })

  /** One click is one choice, even though the row is clickable too. */
  it('does not choose twice when the number inside a clickable row is clicked', () => {
    const chosen: Array<string> = []
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" onChoose={(each) => chosen.push(each.guid)} />
      </MemoryRouter>,
    )

    screen.getByRole('button', { name: 'TDMX0500' }).click()

    expect(chosen).toHaveLength(1)
  })

  it('does not link to a removed standalone tool page', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: 'TDMX0500' })).not.toBeInTheDocument()
    expect(screen.getByText('TDMX0500')).toBeInTheDocument()
  })
})

describe('the L/D column', () => {
  /** The figure the dataset derived, shown by default: it is the first thing compared to a depth. */
  it('is shown by default, as the dataset’s own figure', () => {
    show([{ ...tool, geometry: { DC: 10, LCF: 26, LD: 2.6 } }])

    expect(screen.getByRole('columnheader', { name: 'L/D' })).toBeInTheDocument()
    expect(screen.getByText('2.6')).toBeInTheDocument()
  })

  it('can be hidden like any other column', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" hiddenColumns={['LD']} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('columnheader', { name: 'L/D' })).not.toBeInTheDocument()
  })
})

describe('the order of the columns', () => {
  /**
   * The order is the page's, dragged in the column picker, so the table takes
   * it as given rather than owning it (Paul, 2026-08-31).
   */
  it('draws them in the order it is given', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" columnOrder={['RE', 'DC', 'LCF']} />
      </MemoryRouter>,
    )
    const headers = screen.getAllByRole('columnheader').map((each) => each.textContent)

    expect(headers.indexOf('Corner radius')).toBeLessThan(headers.indexOf('Diameter'))
  })

  /** A column the order has never heard of is still drawn, on the end. */
  it('keeps a column the order does not mention', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" columnOrder={['RE']} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('columnheader', { name: 'Diameter' })).toBeInTheDocument()
  })
})

describe('the holder and collet columns', () => {
  const holding = {
    holdersFor: () => [{ guid: 'h1', label: 'BT30ER16060M', trouble: null, holder: {} as never }],
    colletsFor: (_tool: CatalogTool, holderGuid: string | null) =>
      holderGuid === null ? [] : [{ guid: 'c1', label: 'ER16-8' }],
    chosen: () => ({ holderGuid: null, colletGuid: null }),
    requiredStickout: () => null,
    stickoutFor: () => null,
    onChoose: vi.fn(),
  }

  /** Off unless asked for: they are a choice, and the list opens on geometry. */
  it('are hidden until they are ticked', () => {
    show([tool])

    expect(screen.queryByRole('columnheader', { name: 'Holder' })).not.toBeInTheDocument()
  })

  /**
   * Shown, each row asks the question rather than reporting an answer — and
   * what is picked here is what *Add to list* opens on.
   */
  it('are a dropdown per row when they are shown', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" hiddenColumns={[]} holding={holding} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('combobox', { name: 'Holder for TDMX0500' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'BT30ER16060M' })).toBeInTheDocument()
    // Nothing is chosen, so there is no holder to take a collet.
    expect(screen.getByRole('combobox', { name: 'Collet for TDMX0500' })).toBeDisabled()
  })
})

describe('the order list button', () => {
  const kept = () => ({ onBom: vi.fn(), onRemoveBom: vi.fn(), onAlsoBom: vi.fn() })

  it('adds a tool that is not on the bill at all', () => {
    const on = kept()
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" {...on} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Add TDMX0500/ }))

    expect(on.onBom).toHaveBeenCalled()
    expect(on.onAlsoBom).not.toHaveBeenCalled()
  })

  /** Kept for the feature in view, the same button takes it back off. */
  it('removes a tool kept for this feature', () => {
    const on = kept()
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" inBom={() => true} {...on} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Remove TDMX0500/ }))

    expect(on.onRemoveBom).toHaveBeenCalledWith(tool)
  })

  /**
   * Kept for **another** feature, it offers a plus instead: one cutter often
   * does more than one feature, and the holder it already has comes with it
   * rather than being chosen again (Paul, 2026-08-31).
   */
  it('offers a plus for a tool already kept elsewhere', () => {
    const on = kept()
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" keptElsewhere={() => true} {...on} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Also cut this feature/ }))

    expect(on.onAlsoBom).toHaveBeenCalledWith(tool)
    expect(on.onBom).not.toHaveBeenCalled()
  })
})

/**
 * **A fact is a glyph, not a line** (Paul, 2026-09-02: "I don't like how the
 * drill deviation is changing the row height — let's do an i that you hover
 * over to see the deviation, prompted by the color of the text").
 *
 * It was a second line under the figure, which every drill in a list carries
 * and no tap or mill does. Read on hover, the row is one line like every other
 * row; the colour of the glyph is what says there is something to read.
 */
describe('a note that says what it is measured from', () => {
  const withNote = (note: string) =>
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" marks={() => ({ DC: { ok: true, note } })} />
      </MemoryRouter>,
    )

  it('hangs it on a glyph beside the number rather than a line under it', () => {
    withNote('+0.10 mm from the specified tap drill')

    const glyph = screen.getByLabelText('+0.10 mm from the specified tap drill')
    expect(glyph.closest('[title]')).toHaveAttribute(
      'title',
      '+0.10 mm from the specified tap drill',
    )
    // The words are the hover, not a second line in the cell.
    expect(screen.queryByText('+0.10 mm from the specified tap drill')).not.toBeInTheDocument()
    expect(glyph.closest('td')?.textContent).toBe('12.70 mm')
  })

  /** Nothing to read, nothing to hover: the plain tick a passed column wears. */
  it('leaves the tick alone where the rules had nothing to add', () => {
    render(
      <MemoryRouter>
        <ToolTable tools={[tool]} unit="mm" marks={() => ({ DC: { ok: true } })} />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText('within the rules')).toBeInTheDocument()
  })
})

/**
 * **A tap list is this table, with the taps' own columns.**
 *
 * The taps had a table of their own until 2026-09-02 — no vendor column, no
 * sorting, no search, and a dash under the two columns a tap does not have —
 * which is what Paul was reading when he asked "why do these all look a little
 * different?". What is different about a tap list is `TAP_COLUMNS`; the rest
 * of it is every other list. These pin what the old table's own tests pinned,
 * through the one table.
 */
const tap: CatalogTool = {
  ...tool,
  guid: 'tap-1',
  familyId: 'khsst-spiral-point-plug-inch',
  brand: 'Kennametal',
  catalogNumber: 'KTAP440',
  toolType: 'tap',
  form: 'tap right hand',
  geometry: { DC: 2.845, LCF: 12, LBH: 15.5, NOF: 3, OAL: 44.45, SFDM: 3.581, LD: 5.45 },
}

const showTaps = (props: Partial<Parameters<typeof ToolTable>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ToolTable tools={[tap]} unit="mm" columns={TAP_COLUMNS} {...props} />
    </MemoryRouter>,
  )

describe('the list, showing taps', () => {
  /**
   * Nothing picks a holder in this list either, so the number under `LBH` is
   * the tap's own length below the holder — not the stickout a stack needs.
   */
  it('heads the tap’s own length below the holder as what it is', () => {
    showTaps()

    expect(screen.getByText('Below holder')).toBeInTheDocument()
    expect(screen.queryByText('Stickout needed')).not.toBeInTheDocument()
  })

  /**
   * A tap has no corner radius, and its point angle is a chamfer lead nothing
   * states. They were columns of dashes; now they are not columns — and not
   * offered in the picker either, so ticking one cannot draw an empty column.
   */
  it('offers no column for a number a tap does not carry', () => {
    showTaps()

    expect(screen.queryByText('Corner radius')).not.toBeInTheDocument()
    expect(screen.queryByText('Tip angle')).not.toBeInTheDocument()
    expect(TAP_COLUMNS.map((column) => column.code)).not.toContain('RE')
    expect(TAP_COLUMNS.map((column) => column.code)).not.toContain('SIG')
  })

  /** Everything the tool list has, because it is the tool list. */
  it('keeps the vendor, the sorting and the search the old section had none of', () => {
    showTaps({ onSearch: () => {}, onSort: () => {} })

    expect(screen.getByRole('searchbox', { name: 'Search by catalog number' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort by thread diameter' })).toBeInTheDocument()
    expect(screen.getByText('Kennametal')).toBeInTheDocument()
  })

  /** The number that keeps one off the list is still painted on its own column. */
  it('paints the length that fell short, and says by how much', () => {
    showTaps({
      marks: () => ({
        LCF: { ok: false, level: 'must', why: '3.5 short', detail: 'It does not reach.' },
      }),
    })

    expect(screen.getByLabelText('3.5 short — It does not reach.')).toBeInTheDocument()
  })

  /** Said in the caller's words, because an empty tap list is not an empty catalog. */
  it('says what an empty list means where it is given the sentence', () => {
    showTaps({ tools: [], empty: 'No tap of that size in the catalog.' })

    expect(screen.getByText('No tap of that size in the catalog.')).toBeInTheDocument()
  })
})
