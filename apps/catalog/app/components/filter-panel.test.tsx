import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EMPTY_QUERY } from 'shared/filter'
import { FilterPanel } from './filter-panel'

/**
 * Whose each family is, without the bundled dataset.
 *
 * `brandsOfFamily` reads the catalog that happens to be on this machine — the
 * committed sample on a fresh checkout, a full scrape on Paul's — so a test
 * naming real family ids would pass in one place and fail in the other. The
 * seam is mocked instead, which is also the only part of it these tests are
 * about.
 */
const VENDORS: Record<string, ReadonlyArray<string>> = {
  kennametal_kencut: ['Kennametal'],
  kennametal_gomill: ['Kennametal'],
  widia_varimill: ['WIDIA'],
  widia_hanita: ['WIDIA'],
}

vi.mock('shared/catalog', () => ({
  getFamily: () => null,
  brandsOfFamily: (id: string) => VENDORS[id] ?? [],
  brandsOfProductLine: () => [],
}))

/**
 * The three tool types this catalog holds, and a query that has already picked
 * one of them — the state Paul was stuck in.
 */
const FORMS = ['ball end mill', 'bull nose end mill', 'flat end mill']

const show = (chosen: ReadonlyArray<string>, counts: Readonly<Record<string, number>>) => {
  const onQuery = vi.fn()
  render(
    <FilterPanel
      facets={{
        terms: [
          { key: 'form', label: 'Type', values: FORMS.map((value) => ({ value, count: 1 })) },
        ],
        ranges: [],
      }}
      query={{ ...EMPTY_QUERY, terms: chosen.length > 0 ? { form: chosen } : {} }}
      onQuery={onQuery}
      counts={() => new Map(Object.entries(counts))}
      unit="millimeters"
      only={['form']}
      materialGroup={null}
      onMaterial={() => {}}
      holding={{ tapers: [], series: [] }}
    />,
  )
  return onQuery
}

/**
 * **"I can't get filters back after removing them!"** (Paul, 2026-09-01). With
 * ball end mills the only type left in the list, the bull noses counted zero —
 * and a zero used to take the value off the panel, so there was nothing to
 * press to put them back. Now every value is drawn, and a zero is drawn faint.
 */
describe('a filter you can undo', () => {
  it('shows every value even where the rest of the selection leaves it nothing', () => {
    show(['ball end mill'], { 'ball end mill': 12, 'bull nose end mill': 0, 'flat end mill': 0 })

    for (const form of FORMS) {
      expect(screen.getByRole('button', { name: new RegExp(form, 'i') })).toBeInTheDocument()
    }
  })

  it('lets one be pressed back on', () => {
    const onQuery = show(['ball end mill'], {
      'ball end mill': 12,
      'bull nose end mill': 0,
      'flat end mill': 0,
    })

    fireEvent.click(screen.getByRole('button', { name: /bull nose end mill/i }))

    expect(onQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        terms: { form: ['ball end mill', 'bull nose end mill'] },
      }),
    )
  })

  /** And says which ones are empty, rather than pretending they are all live. */
  it('draws a value nothing is left for as an empty one', () => {
    show(['ball end mill'], { 'ball end mill': 12, 'bull nose end mill': 0, 'flat end mill': 0 })

    expect(screen.getByRole('button', { name: /flat end mill/i })).toHaveAttribute(
      'title',
      expect.stringContaining('none in this list'),
    )
  })
})

/**
 * Twenty families whose names begin at the top of the alphabet, and two the
 * chosen vendor actually has. Alphabetically the two are last; by count they
 * are the only ones that are anything.
 */
const EMPTY_FAMILIES = Array.from({ length: 20 }, (_, index) => `aaa family ${String(index + 1)}`)
const LIVE_FAMILIES = ['kencut ff square', 'gomill pro radiused']

const showFamilies = () => {
  const counts = new Map<string, number>([
    ...EMPTY_FAMILIES.map((value): [string, number] => [value, 0]),
    ['kencut ff square', 8],
    ['gomill pro radiused', 5],
  ])
  render(
    <FilterPanel
      facets={{
        terms: [
          {
            key: 'familyId',
            label: 'Family',
            values: [...EMPTY_FAMILIES, ...LIVE_FAMILIES].map((value) => ({ value, count: 1 })),
          },
        ],
        ranges: [],
      }}
      query={EMPTY_QUERY}
      onQuery={vi.fn()}
      counts={() => counts}
      unit="millimeters"
      only={['familyId']}
      materialGroup={null}
      onMaterial={() => {}}
      holding={{ tapers: [], series: [] }}
    />,
  )
}

/**
 * **"I filtered for just kennametal. But the family list still shows me lots
 * of non kennametal family options"** (Paul, 2026-09-01). Every value stays on
 * the panel, but the twelve in front are the ones the rest of the query left,
 * not the twelve that happen to start with an early letter.
 */
describe('a family list narrowed by the vendor', () => {
  it('leads with the families that still have tools in them', () => {
    showFamilies()

    const chips = within(screen.getByRole('group', { name: 'Family' })).getAllByRole('button')

    // Alphabetical within the live band: the ranking moves them to the front,
    // it does not shuffle them once they are there.
    expect(chips.slice(0, 2).map((chip) => chip.textContent)).toEqual([
      'gomill pro radiused',
      'kencut ff square',
    ])
  })

  it('leaves the empty ones on the panel, behind the rest', () => {
    showFamilies()

    fireEvent.click(screen.getByRole('button', { name: /more/i }))

    for (const family of EMPTY_FAMILIES) {
      expect(screen.getByRole('button', { name: family })).toBeInTheDocument()
    }
  })
})

/**
 * **"I filtered for just kennametal. But the family list still shows me lots
 * of non kennametal family options"** (Paul, 2026-09-01). A family is one
 * vendor's word. With another vendor chosen it is not an empty answer that
 * pressing could widen — the vendor filter stands in front of it — so it comes
 * off the list rather than being greyed.
 */
describe('a family list scoped to the chosen vendor', () => {
  const showVendors = (brands: ReadonlyArray<string>, chosenFamilies: ReadonlyArray<string>) => {
    const onQuery = vi.fn()
    render(
      <FilterPanel
        facets={{
          terms: [
            {
              key: 'familyId',
              label: 'Family',
              values: [...Object.keys(VENDORS), 'unowned_line'].map((value) => ({
                value,
                count: 1,
              })),
            },
          ],
          ranges: [],
        }}
        query={{
          ...EMPTY_QUERY,
          terms: {
            ...(brands.length > 0 ? { brand: brands } : {}),
            ...(chosenFamilies.length > 0 ? { familyId: chosenFamilies } : {}),
          },
        }}
        onQuery={onQuery}
        counts={() => new Map()}
        unit="millimeters"
        only={['familyId']}
        materialGroup={null}
        onMaterial={() => {}}
        holding={{ tapers: [], series: [] }}
      />,
    )
    return onQuery
  }

  it('drops the families belonging to a vendor nobody asked for', () => {
    showVendors(['Kennametal'], [])

    expect(screen.getByRole('button', { name: 'kennametal_kencut' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'kennametal_gomill' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'widia_varimill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'widia_hanita' })).not.toBeInTheDocument()
  })

  /** Both vendors chosen is both vendors' families, which is the same rule. */
  it('keeps the families of every vendor that is chosen', () => {
    showVendors(['Kennametal', 'WIDIA'], [])

    for (const family of Object.keys(VENDORS)) {
      expect(screen.getByRole('button', { name: family })).toBeInTheDocument()
    }
  })

  /** A value no vendor owns is the trade's, and stays under the rule above. */
  it('keeps a family no vendor claims', () => {
    showVendors(['Kennametal'], [])

    expect(screen.getByRole('button', { name: 'unowned_line' })).toBeInTheDocument()
  })

  /** With no vendor chosen the question is the whole catalog's again. */
  it('shows every family when no vendor is chosen', () => {
    showVendors([], [])

    for (const family of Object.keys(VENDORS)) {
      expect(screen.getByRole('button', { name: family })).toBeInTheDocument()
    }
  })

  /**
   * Picking a family and then a different vendor would otherwise leave a
   * filter narrowing the list with nothing on the panel to lift it — Paul's
   * original complaint wearing a different hat.
   */
  it('keeps a chosen family on the panel whatever its vendor', () => {
    const onQuery = showVendors(['Kennametal'], ['widia_varimill'])

    const chip = screen.getByRole('button', { name: 'widia_varimill' })
    expect(chip).toBeInTheDocument()

    fireEvent.click(chip)

    expect(onQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        terms: expect.not.objectContaining({ familyId: expect.anything() }),
      }),
    )
  })
})
