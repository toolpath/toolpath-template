import type { CatalogTool } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import { PlusIcon } from '@phosphor-icons/react'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { COLUMN_WIDTH } from './tool-table'
import { formatGeometry } from 'shared/geometry'

/**
 * The columns a threading tool has nothing to put in.
 *
 * A tap has no corner radius, and its point angle is its chamfer lead, which
 * nothing in this data states. The column stays — the two tables line up —
 * but its heading is a dash as well as its cells, so it reads as a column
 * that does not apply rather than one nobody filled in (Paul, 2026-08-31).
 */
const NOT_THEIRS: ReadonlySet<string> = new Set(['RE', 'SIG'])

/**
 * Where a column means something different here, it says so.
 *
 * The list above heads `LBH` "Stickout needed", because there it is the
 * required stickout of the stack somebody chose. Nothing chooses a holder in
 * this section, so the number under it was the tap's own **length below the
 * holder** — the derived `LCF + DC` — printed under a heading about something
 * else entirely (Paul, 2026-08-31: "what is the stickout needed coming from on
 * the tap?"). The columns still line up; only the word changes.
 */
const THEIR_WORDS: Readonly<Record<string, string>> = { LBH: 'Below holder' }

/**
 * The columns are the drill table's own, in its order.
 *
 * Two tables in one panel with columns that do not line up read as two
 * different things, so this one mirrors the list above it and shows a dash
 * where a tap has nothing to put in a column (Paul, 2026-08-31: "get the Add
 * to list buttons aligned, and the columns aligned").
 */
import { minorOf, type HoleMode, type ThreadSpec } from 'shared/threads'

/**
 * What makes the thread, under the drills that make the hole.
 *
 * The **second section of hole mode**: a threaded hole takes a drill and then
 * a tap or a thread mill, so the list is two sections stacked rather than one
 * ranking — a tap and a drill would otherwise be compared on a diameter that
 * means the thread in one case and the bore in the other (Paul, 2026-08-31,
 * who asked for them side by side first and then for this).
 *
 * Short on purpose: a tap is chosen on its size, its hand and its flutes, and
 * this catalog holds no pitch — so the section says so once, at the top,
 * rather than pretending to rank on it.
 */
export interface TapTableProps {
  readonly makers: ReadonlyArray<CatalogTool>
  readonly mode: HoleMode
  readonly spec: ThreadSpec
  readonly unit: Unit
  readonly chosen: string | null
  readonly onChoose: (tool: CatalogTool) => void
  /** The columns the list above is showing, so the two line up. */
  readonly columns: ReadonlyArray<{ readonly code: string; readonly label: string }>
  /**
   * True when none of them reach the bottom and these are the nearest misses.
   *
   * An empty section is a true answer told uselessly; this one says what is
   * closest and lets the numbers show why (Paul, 2026-08-31).
   */
  readonly short?: boolean
  /**
   * True when they reach but nothing in the crib holds one at the stickout
   * this feature needs — the holder stage every drill goes through.
   */
  readonly unheld?: boolean
  /**
   * The number that keeps one off the list, and by how much — painted red on
   * the column it is about, so "none reach" says which length and how far.
   */
  readonly shortfall?: (tool: CatalogTool) => {
    readonly code: string
    readonly by: number | null
  } | null
}

export const TapTable = ({
  makers,
  mode,
  spec,
  unit,
  chosen,
  onChoose,
  columns,
  short = false,
  unheld = false,
  shortfall,
}: TapTableProps) => (
  <div className="flex min-h-0 flex-col">
    {/*
      **The tab above says what this list is** (Paul, 2026-09-02, moving the
      tabs onto the table), so the chrome here is only what the tab cannot say:
      what the taps were matched on, and what is wrong with the answer.
    */}
    <p
      data-list-chrome
      className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2 text-sm"
    >
      <span className="text-2xs text-zinc-500">
        {mode === 'thread mill'
          ? `inside the ⌀${formatLength(minorOf(spec), unit)} minor diameter`
          : `matched on ⌀${formatLength(spec.major, unit)} — this catalog holds no pitch, so check it`}
      </span>
      {short ? (
        <span className="text-2xs text-amber-300">
          none reach the bottom — the closest are shown
        </span>
      ) : null}
      {unheld ? (
        <span className="text-2xs text-amber-300">
          nothing in the crib holds one at the stickout this needs
        </span>
      ) : null}
    </p>
    <div className="min-h-0 flex-1 overflow-auto">
      {makers.length === 0 ? (
        <p className="p-4 text-sm text-zinc-400">
          {mode === 'thread mill'
            ? 'No thread mill in the catalog fits inside this hole. The hole can still be drilled.'
            : 'No tap of that size in the catalog. The hole can still be drilled.'}
        </p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">
            {mode === 'thread mill' ? 'Thread mills' : 'Taps'} for {spec.name}
          </caption>
          <thead data-list-chrome>
            <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
              <th scope="col" className={classNames(COLUMN_WIDTH.name, 'px-3 py-2 font-semibold')}>
                Catalog number
              </th>
              <th scope="col" className={classNames(COLUMN_WIDTH.type, 'px-3 py-2 font-semibold')}>
                Type
              </th>
              {columns.map((column) => (
                <th
                  key={column.code}
                  scope="col"
                  aria-label={THEIR_WORDS[column.code] ?? column.label}
                  {...(NOT_THEIRS.has(column.code)
                    ? { title: `${column.label} is not a number a threading tool carries` }
                    : {})}
                  className={classNames(
                    COLUMN_WIDTH.value,
                    'px-3 py-2 text-right font-semibold',
                    NOT_THEIRS.has(column.code) && 'text-zinc-600',
                  )}
                >
                  {NOT_THEIRS.has(column.code) ? '—' : (THEIR_WORDS[column.code] ?? column.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {makers.map((tap) => (
              <tr
                key={tap.guid}
                onClick={() => onChoose(tap)}
                aria-selected={chosen === tap.guid}
                className={classNames(
                  'cursor-pointer border-b border-zinc-900 hover:bg-info/10',
                  chosen === tap.guid && 'bg-info/25',
                )}
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="flex items-center gap-1.5">
                    <span className="text-zinc-500">
                      <ToolTypeIcon toolType={tap.form} />
                    </span>
                    <span className="font-mono text-zinc-100">{tap.catalogNumber}</span>
                    <span className="text-xs text-zinc-500">{tap.brand}</span>
                  </span>
                </th>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{formLabel(tap)}</td>
                {columns.map((column) => {
                  const value = NOT_THEIRS.has(column.code) ? undefined : tap.geometry[column.code]
                  const missed = shortfall?.(tap) ?? null
                  const guilty = missed !== null && missed.code === column.code
                  return (
                    <td
                      key={column.code}
                      className={classNames(
                        'px-3 py-2 text-right font-mono whitespace-nowrap',
                        guilty ? 'text-danger' : 'text-zinc-300',
                      )}
                    >
                      {guilty ? (
                        <span className="text-2xs mr-1.5 font-sans">
                          {missed.by === null
                            ? 'fouls the part'
                            : `${formatLength(missed.by, unit)} short`}
                        </span>
                      ) : null}
                      {value === undefined ? (
                        <span className="text-2xs font-sans text-zinc-600">—</span>
                      ) : (
                        formatGeometry(column.code, value, unit)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
)
