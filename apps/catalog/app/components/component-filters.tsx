import { Button } from '@toolpath/ui'
import { Chip } from './chip'
import type { Collet, Holder } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import { columnsFor, type ComponentKind } from 'shared/component-columns'
import {
  countTerms,
  optionsOn,
  setBound,
  termAxesFor,
  toggleTerm,
  type Bound,
  type ComponentQuery,
} from 'shared/component-query'
import { RangeFilter } from './column-filter'

/**
 * Narrowing a rack of holders, or a drawer of collets.
 *
 * **Brand and type were not things this page could filter on** (Paul,
 * 2026-09-07). The four holder filters that existed — taper, contact, clamping,
 * series — narrowed the dropdown behind a tool, and a brand and a family were
 * not among them, so "show me the REGO-FIX powRgrip chucks" had no answer.
 *
 * The rule the tool filter panel follows holds here too: **what is offered is
 * what is there.** Every value comes off the records currently on show, with a
 * count beside it, so a taper nothing in the narrowed list carries is a click
 * that cannot empty the list because it is not on it.
 */

export interface ComponentFiltersProps {
  readonly kind: ComponentKind
  /** The records the values are read off — the narrowed list, not the whole catalog. */
  readonly records: ReadonlyArray<Holder | Collet>
  readonly query: ComponentQuery
  readonly onQuery: (query: ComponentQuery) => void
  readonly unit: UnitSystem
}

export const ComponentFilters = ({
  kind,
  records,
  query,
  onQuery,
  unit,
}: ComponentFiltersProps) => {
  /**
   * How many narrowings are set, on the button that clears them.
   *
   * **A Clear that says how much it clears.** With six term axes and nine
   * numbers on a holder, a filter set in one panel and forgotten is the usual
   * way a list ends up empty, and a bare "Clear" says nothing about whether
   * there is anything to clear.
   */
  const set = countTerms(query)

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {termAxesFor(kind).map((axis) => {
          const options = optionsOn(kind, records, axis.code)
          if (options.length === 0) {
            return null
          }
          const chosen = query.terms[axis.code] ?? []
          return (
            <div key={axis.code} className="flex flex-col gap-1">
              <p className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
                {axis.label}
              </p>
              <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                {options.map((option) => (
                  <Chip
                    key={option.value}
                    pressed={chosen.includes(option.value)}
                    onClick={() => onQuery(toggleTerm(query, axis.code, option.value))}
                  >
                    {option.value}
                    <span className="text-zinc-500">{option.count}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {columnsFor(kind)
          .filter((column) => column.kind === 'length')
          .map((column) => (
            <RangeFilter
              key={column.code}
              label={column.label}
              bound={query.bounds[column.code]}
              onBound={(bound: Bound | undefined) => onQuery(setBound(query, column.code, bound))}
              unit={unit}
              kind="length"
            />
          ))}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={set === 0}
          onClick={() => onQuery({ terms: {}, bounds: {} })}
          className="text-xs"
        >
          {set === 0 ? 'No filters set' : `Clear ${String(set)} filter${set === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
