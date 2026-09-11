import { ArrowSquareOutIcon, CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { Button, cn } from '@toolpath/ui'
import type { ReactNode } from 'react'
import {
  opensDescending,
  sortComponents,
  type ComponentSort,
  type SortableComponent,
} from 'shared/order-list'
import type { Component } from 'shared/setup-sheet'
import { SECTION_LABEL, TABLE_FACE, TABLE_INK } from 'shared/type'

/**
 * The order list added up by component: what to buy, and how many.
 *
 * **The same component across several assemblies is one order** (Paul,
 * 2026-09-09: "the same component may be used across multiple assemblies, and
 * it should be easy to see how many to order through this view"). The assembly
 * view answers "how is this feature machined"; this one answers "what do I put
 * in the basket", and a shop reading a stack of assemblies for one collet
 * repeated six times is a shop adding up by hand.
 *
 * **And it is read by whichever column the question is about** (Paul,
 * 2026-09-09: "I should be able to sort the columns in component view in the
 * parts page"). Buying, it is walked by vendor, because that is one order to
 * place; checking the crib, by part number; deciding what to buy first, by how
 * many. `sortComponents` in `shared/order-list.ts` is the rule, tested there.
 *
 * Read-only otherwise (Paul, 2026-09-09: "read only rollup in the parts page
 * components view, editable on the order list page"). A count is changed where
 * the assembly it belongs to is, which keeps one number with one place to
 * change it.
 */
export interface ComponentTallyRow extends SortableComponent {
  readonly key: string
  /** What kind of thing it is, for the column that says so. */
  readonly kind: string
  readonly icon: ReactNode
  /**
   * The vendor's page for it, or null where the vendor published none.
   *
   * **On the number, the way the order-list page puts it there** (Paul,
   * 2026-09-01: "vendor link should be in part ID cell"). The part number is
   * what a shop orders by and looks up, so the link belongs on it rather than
   * in a column of its own — and this view is the one a shop buys from.
   */
  readonly productLink: string | null
  /** The assemblies it is in, for the row to say so when asked. */
  readonly uses: ReadonlyArray<string>
}

export interface ComponentTallyProps {
  readonly rows: ReadonlyArray<ComponentTallyRow>
  /** What it says with nothing on the list, in the words the page uses. */
  readonly empty: string
  readonly sort: ComponentSort
  readonly descending: boolean
  /**
   * A column pressed. The page holds which one, because the panel beside it is
   * redrawn whenever the part is — a sort kept in here would be lost with it.
   */
  readonly onSort: (by: ComponentSort) => void
}

/**
 * The columns, in the order a bill is read across.
 *
 * Narrow deliberately: this stands on the part in a 320px column, so a header
 * is a word rather than a phrase and the type sits under the part number where
 * it can take the ellipsis.
 */
const COLUMNS: ReadonlyArray<{
  readonly by: ComponentSort
  readonly label: string
  readonly title: string
  readonly end?: boolean
}> = [
  { by: 'kind', label: 'Kind', title: 'Tools first, then what holds them' },
  { by: 'vendor', label: 'Vendor', title: 'Who makes it — one vendor is one order to place' },
  { by: 'part', label: 'Part ID', title: 'The number it is ordered by' },
  { by: 'count', label: 'Qty', title: 'How many to order', end: true },
]

const Heading = ({
  column,
  sort,
  descending,
  onSort,
}: {
  column: (typeof COLUMNS)[number]
  sort: ComponentSort
  descending: boolean
  onSort: (by: ComponentSort) => void
}) => {
  const here = sort === column.by
  return (
    <th
      scope="col"
      /*
        **The header is named for its column, not for its button.** A `th` takes
        its accessible name from its contents, and the contents here are a
        button that has to say what pressing it does — so without this the
        column came out called "Sort by vendor", and every cell under it was
        announced as belonging to that. The column is Vendor; the button sorts
        by it.
      */
      aria-label={column.label}
      /*
        `aria-sort` on the header rather than a glyph alone: the caret says
        which way to somebody looking at it and this says it to somebody who
        is not.
      */
      aria-sort={here ? (descending ? 'descending' : 'ascending') : 'none'}
      className={cn('px-1 py-0.5 font-semibold', column.end === true ? 'text-right' : 'text-left')}
    >
      <Button
        type="button"
        variant="muted"
        size="sm"
        aria-label={`Sort by ${column.label.toLowerCase()}`}
        title={column.title}
        onClick={() => onSort(column.by)}
        className={cn(
          SECTION_LABEL,
          'inline-flex items-center gap-0.5 rounded px-0.5 transition',
          here ? 'text-info' : 'text-zinc-500 hover:text-zinc-200',
        )}
      >
        {column.label}
        {here ? (
          descending ? (
            <CaretDownIcon aria-hidden="true" />
          ) : (
            <CaretUpIcon aria-hidden="true" />
          )
        ) : null}
      </Button>
    </th>
  )
}

export const ComponentTally = ({ rows, empty, sort, descending, onSort }: ComponentTallyProps) => {
  if (rows.length === 0) {
    return (
      <p className="text-2xs pointer-events-auto rounded bg-zinc-950/75 px-1.5 py-1 text-zinc-500">
        {empty}
      </p>
    )
  }
  const shown = sortComponents(rows, sort, descending)
  return (
    /*
      **The table takes the pointer; the column it stands in does not** — the
      same rule the feature list follows over the canvas, and the defect
      `tests/on-the-part.spec.ts` § "at a laptop width" exists for.
    */
    <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto rounded bg-zinc-950/75">
      <table
        data-over-part
        className={cn(TABLE_FACE, TABLE_INK, 'w-full border-collapse text-left')}
      >
        <caption className="sr-only">Components to order</caption>
        <thead className="sticky top-0 bg-zinc-950/95">
          <tr className="border-b border-zinc-800">
            {COLUMNS.map((column) => (
              <Heading
                key={column.by}
                column={column}
                sort={sort}
                descending={descending}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr
              key={row.key}
              className="border-t border-zinc-900 align-top"
              title={`${row.brand} ${row.catalogNumber} — ${row.detail}${
                row.uses.length === 0 ? '' : ` — in ${row.uses.join(', ')}`
              }`}
            >
              <th
                scope="row"
                className="text-2xs w-6 px-1 py-1 text-left font-normal text-zinc-400"
              >
                <span className="flex items-center" aria-label={row.kind} title={row.kind}>
                  {row.icon}
                </span>
              </th>
              <td className="text-2xs max-w-20 truncate px-1 py-1">{row.brand}</td>
              <td className="text-2xs min-w-0 px-1 py-1">
                {row.productLink === null ? (
                  <span className="block truncate">{row.catalogNumber}</span>
                ) : (
                  <a
                    href={row.productLink}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={`${row.catalogNumber} on the vendor's site`}
                    className="text-info/90 hover:text-info focus-visible:ring-info/60 flex min-w-0 items-center gap-1 rounded underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <span className="min-w-0 truncate">{row.catalogNumber}</span>
                    <ArrowSquareOutIcon aria-hidden="true" className="shrink-0" />
                  </a>
                )}
                {/* What it is, under what it is ordered by: the number keeps
                    its width and the phrase takes the ellipsis. */}
                <span className="block truncate text-zinc-500">{row.detail}</span>
              </td>
              <td className="px-1 py-1 text-right">
                <span className="text-2xs rounded bg-zinc-800 px-1 py-0.5">×{row.count}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Only so the route can name the kinds without a second table of words. */
export const KIND_LABEL: Readonly<Record<Component, string>> = {
  tool: 'Tool',
  holder: 'Holder',
  collet: 'Collet',
}
