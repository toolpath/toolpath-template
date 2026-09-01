import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EMPTY_QUERY } from 'shared/filter'
import { FilterPanel } from './filter-panel'

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
      unit="mm"
      only={['form']}
      materialGroup={null}
      onMaterial={() => {}}
      holding={{ tapers: [], series: [] }}
      saved={[]}
      onApply={() => {}}
      onForget={() => {}}
      onSave={() => {}}
      onClear={() => {}}
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
