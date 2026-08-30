import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Input } from '@toolpath/ui'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { AppHeader } from 'components/app-header'
import { FilterPanel } from 'components/filter-panel'
import { ToolTable } from 'components/tool-table'
import { allTools, facets, searchableTools } from 'shared/catalog'
import {
  EMPTY_QUERY,
  countBy,
  filterTools,
  queryFromSearch,
  searchWithQuery,
  type ToolQuery,
} from 'shared/filter'
import { HOLDING_AXES, colletSeries, holdableTools, splitHolding, tapers } from 'shared/holding'
import { useSavedFilters } from 'shared/saved-filters'
import { useUnit } from 'shared/use-unit'

/**
 * Browsing the catalog.
 *
 * The selection lives in the URL and nowhere else, so a filtered view is
 * shareable and the back button undoes a filter the way somebody expects. The
 * component holds no copy of it: every control writes the URL, and the URL is
 * what renders.
 */
const Home = () => {
  const [search, setSearch] = useSearchParams()
  const [unit, setUnit] = useUnit()
  const { saved, save, forget } = useSavedFilters()

  const axes = useMemo(
    () => [
      ...facets.terms.map((axis) => axis.key),
      ...facets.ranges.map((axis) => axis.key),
      ...HOLDING_AXES,
    ],
    [],
  )
  const query = useMemo(() => queryFromSearch(search, axes), [search, axes])
  const results = useMemo(() => {
    const { tools, holding } = splitHolding(query)
    return holdableTools(filterTools(searchableTools(), tools), holding)
  }, [query])

  const apply = (next: ToolQuery) => {
    setSearch(searchWithQuery(search, next, axes), { replace: true, preventScrollReset: true })
  }

  return (
    <main className="min-h-screen">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      <div className="grid gap-6 p-6 lg:grid-cols-[18rem_1fr]">
        <aside>
          <FilterPanel
            facets={facets}
            query={query}
            onQuery={apply}
            counts={(key) => countBy(results, key)}
            unit={unit}
            holding={{ tapers, series: colletSeries }}
            // No part here, so the material is only ever a filter — it is read
            // straight back out of the query rather than being held twice.
            materialGroup={query.terms.materialGroups?.[0] ?? null}
            onMaterial={(group) => {
              const terms = { ...query.terms }
              if (group === null) {
                delete terms.materialGroups
              } else {
                terms.materialGroups = [group]
              }
              apply({ ...query, terms })
            }}
            saved={saved}
            onSave={(name) => save(name, query)}
            onApply={apply}
            onForget={forget}
            onClear={() => apply(EMPTY_QUERY)}
          />
        </aside>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Input
              id="tool-search"
              name="tool-search"
              icon={MagnifyingGlassIcon}
              placeholder="Catalog or material number"
              aria-label="Search tools"
              value={query.text}
              onChange={(event) => apply({ ...query, text: event.target.value })}
              className="max-w-md"
            />
            <p className="text-sm text-zinc-400" role="status">
              {results.length} of {allTools.length} tools
            </p>
          </div>

          <ToolTable
            tools={results}
            unit={unit}
            ranges={query.ranges}
            onRange={(code, bound) => {
              const ranges = { ...query.ranges }
              if (bound === undefined || (bound.min === undefined && bound.max === undefined)) {
                delete ranges[code]
              } else {
                ranges[code] = bound
              }
              apply({ ...query, ranges })
            }}
          />
        </section>
      </div>
    </main>
  )
}

export default Home
