import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import type { Verdict } from 'shared/judge'
import type { HolderOption } from 'shared/holder-choice'
import { RecommendationTable, type RecommendationRow } from './recommendation-table'

const tool = (guid: string): CatalogTool => ({
  guid,
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: guid.toUpperCase(),
  materialNumber: null,
  toolType: 'endmill',
  form: 'bull nose end mill',
  unitSystem: 'metric',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, RE: 1, LD: 2.17 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
})

const holder = (guid: string): Holder => ({
  guid,
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: guid,
  materialNumber: null,
  taper: 'BT30',
  contact: 'taper',
  clamping: 'shrink',
  gaugeLength: 60,
  colletSeries: null,
  boreDiameter: 6,
  noseDiameter: 20,
  noseLength: 30,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
})

const verdict = (t: CatalogTool, over: Partial<Verdict> = {}): Verdict => ({
  tool: t,
  removed: [],
  warned: [],
  demoted: [],
  key: [0],
  readings: ['corner radius 1 = floor fillet radius', 'L/D 2.17'],
  // The readings are the working of the sort. The list stopped showing them
  // on 2026-08-31: what a row carries now is what the tool is best for and
  // the few numbers that confirm it works.
  ...over,
})

const option = (guid: string, grade: HolderOption['grade'], recommended = false): HolderOption => ({
  holder: holder(guid),
  collet: null,
  stickout: 20,
  required: 18,
  range: { min: 13, max: 38 },
  band: grade,
  clears: grade !== 'bad',
  collisions: [],
  grade,
  recommended,
})

const rows: Array<RecommendationRow> = [
  {
    verdict: verdict(tool('a')),
    standing: 'fits',
    options: [option('PG 6 × 50', 'good', true), option('PG 6 × 80', 'medium')],
    holderGuid: null,
    colletGuid: null,
    saved: false,
    highlights: [{ key: 'stiffest', label: 'stiffest', title: 'least deflection here' }],
    underBy: 0.5,
  },
  {
    verdict: verdict(tool('b'), {
      removed: [
        {
          rule: null,
          text: 'diameter 12 over 10 widest tool diameter — cannot get in',
          shortfall: 0.2,
        },
      ],
    }),
    standing: 'close',
    options: [option('PG 6 × 50', 'good', true)],
    holderGuid: null,
    colletGuid: null,
    saved: true,
    highlights: [],
    underBy: null,
  },
]

describe('the list, led by assemblies', () => {
  it('shows each tool with why, its recommended holder pulled out to what it needs, and a way to keep it', () => {
    render(
      <RecommendationTable
        rows={rows}
        unit="mm"
        chosen="a"
        onChoose={vi.fn()}
        onHolder={vi.fn()}
        onCollet={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByText('fits')).toBeInTheDocument()
    expect(screen.getByText('incompatible, but close')).toBeInTheDocument()
    // What it is best for, and the numbers that confirm it — not the working
    // of the sort, which is what the rank readings were (Paul, 2026-08-31).
    expect(screen.getByText('stiffest')).toBeInTheDocument()
    expect(screen.queryByText(/corner radius 1 = floor fillet radius/)).not.toBeInTheDocument()
    // Under the widest the feature admits, the ratio, and the stickout.
    expect(screen.getByText(/−0.50 mm\s+2.2 L\/D\s+20.00 mm out/)).toBeInTheDocument()
    // A rule that removed it is still said: an exception is not noise.
    expect(screen.getByText(/diameter 12 over 10 widest tool diameter/)).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: 'Holder for A' })
    expect(select).toHaveValue('PG 6 × 50')
    expect(
      within(select).getByRole('option', { name: /PG 6 × 50 · recommended$/ }),
    ).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: /PG 6 × 80 · medium/ })).toBeInTheDocument()
    // The stickout to set it up at, and the range that clears this feature beside it.
    expect(screen.getAllByText(/^20.00 mm out \(13.00 mm – 38.00 mm\)$/)[0]).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save assembly' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('draws the row that is clicked, and the holder that is changed', () => {
    const onChoose = vi.fn()
    const onHolder = vi.fn()
    render(
      <RecommendationTable
        rows={rows}
        unit="mm"
        chosen={null}
        onChoose={onChoose}
        onHolder={onHolder}
        onCollet={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('B'))
    expect(onChoose).toHaveBeenLastCalledWith(expect.objectContaining({ guid: 'b' }))

    fireEvent.change(screen.getByRole('combobox', { name: 'Holder for A' }), {
      target: { value: 'PG 6 × 80' },
    })
    expect(onChoose).toHaveBeenLastCalledWith(expect.objectContaining({ guid: 'a' }))
    expect(onHolder).toHaveBeenCalledWith(expect.objectContaining({ guid: 'a' }), 'PG 6 × 80')
  })
})
