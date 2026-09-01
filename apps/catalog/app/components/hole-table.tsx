import type { CatalogTool } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import { PlusIcon, TrashIcon, WarningIcon } from '@phosphor-icons/react'
import { ToolTypeIcon } from './tool-icons'
import type { HolePlanRow } from 'shared/hole-plan'
import { HOLE_MODES, THREADS, likelyThread, threadNamed, type HoleMode } from 'shared/threads'
import type { GroupChoice } from 'shared/hole-plan'

const MODE_LABELS: Record<HoleMode, string> = {
  plain: 'Plain',
  'cut tap': 'Cut tap',
  'form tap': 'Form tap',
  'thread mill': 'Thread mill',
}

/**
 * Every hole on the part, by size, with what makes it.
 *
 * **Select all holes** (Paul, 2026-08-31): the mode a shop opens a part in
 * when the holes are the job. One row per size — not per hole, because eight
 * ⌀5 is one drill and one line on a bill — each row saying what it is threaded
 * for, the drill that makes it, the tap that finishes it, and one button that
 * keeps the lot.
 *
 * The tool cells are dropdowns rather than a list: the row has already been
 * judged, and what is left is the choice among the ones that fit.
 */
export interface HoleTableProps {
  readonly rows: ReadonlyArray<HolePlanRow>
  readonly unit: Unit
  readonly onChoice: (key: string, choice: GroupChoice) => void
  /** Which tool is chosen for each row, by group key; absent is the best. */
  readonly chosen: Readonly<Record<string, string | undefined>>
  readonly onChoose: (key: string, guid: string) => void
  /** Which tap or thread mill is chosen for each row, by group key. */
  readonly chosenMaker: Readonly<Record<string, string | undefined>>
  readonly onChooseMaker: (key: string, guid: string) => void
  readonly inBom: (tool: CatalogTool) => boolean
  readonly onBom: (tools: ReadonlyArray<CatalogTool>, features: ReadonlyArray<string>) => void
  readonly onRemoveBom: (tools: ReadonlyArray<CatalogTool>, features: ReadonlyArray<string>) => void
}

const Pick = ({
  label,
  options,
  value,
  onValue,
  caution = false,
}: {
  label: string
  options: ReadonlyArray<{ guid: string; label: string }>
  value: string | undefined
  onValue: (guid: string) => void
  caution?: boolean
}) =>
  options.length === 0 ? (
    <span className="text-2xs text-zinc-600">none fits</span>
  ) : (
    <select
      aria-label={label}
      value={value ?? options[0]?.guid ?? ''}
      onChange={(event) => onValue(event.target.value)}
      className={classNames(
        'focus-visible:ring-info/60 w-full rounded border bg-zinc-950 px-1.5 py-1 font-mono text-xs focus-visible:ring-1 focus-visible:outline-none',
        caution ? 'border-amber-500/50 text-amber-300' : 'border-zinc-800 text-zinc-100',
      )}
    >
      {options.map((each) => (
        <option key={each.guid} value={each.guid}>
          {each.label}
        </option>
      ))}
    </select>
  )

export const HoleTable = ({
  rows,
  unit,
  onChoice,
  chosen,
  onChoose,
  chosenMaker,
  onChooseMaker,
  inBom,
  onBom,
  onRemoveBom,
}: HoleTableProps) => {
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-zinc-400">This part has no holes the kernel reported.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Every hole on the part, by size</caption>
        <thead>
          <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
            <th scope="col" className="px-3 py-2 font-semibold">
              Holes
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Made by
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Thread
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Drill
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Tap or mill
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              <span className="sr-only">Order list</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const drill =
              row.drills.find((each) => each.tool.guid === chosen[row.group.key])?.tool ??
              row.drills[0]?.tool ??
              null
            const tap =
              row.makers.find((each) => each.guid === chosenMaker[row.group.key]) ??
              row.makers[0] ??
              null
            const kept = [drill, tap].filter((each): each is CatalogTool => each !== null)
            const tags = row.group.features.map((each) => each.featureTag)
            const held = kept.length > 0 && kept.every((each) => inBom(each))
            return (
              <tr
                key={row.group.key}
                className="hover:bg-info/10 border-b border-zinc-900 align-top"
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="block font-mono text-zinc-100">
                    {row.group.features.length} × ⌀{formatLength(row.group.diameter, unit)}
                  </span>
                  <span className="text-2xs block text-zinc-500">
                    {formatLength(row.group.depth, unit)} deep
                    {row.group.through ? ' · through' : ''}
                  </span>
                </th>
                <td className="w-32 px-3 py-2">
                  {/* How it is made decides the hole it starts from, so it is
                      asked before the thread rather than after it. */}
                  <select
                    aria-label={`How the ⌀${formatLength(row.group.diameter, unit)} holes are made`}
                    value={row.mode}
                    onChange={(event) => {
                      const mode = event.target.value as HoleMode
                      onChoice(row.group.key, {
                        mode,
                        spec:
                          mode === 'plain'
                            ? null
                            : (row.thread ?? likelyThread(row.group.diameter)?.spec ?? null),
                      })
                    }}
                    className="focus-visible:ring-info/60 w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
                  >
                    {HOLE_MODES.map((each) => (
                      <option key={each} value={each}>
                        {MODE_LABELS[each]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="w-36 px-3 py-2">
                  {row.mode === 'plain' ? (
                    <span className="text-2xs text-zinc-600">—</span>
                  ) : (
                    <select
                      aria-label={`Thread for the ⌀${formatLength(row.group.diameter, unit)} holes`}
                      value={row.thread?.name ?? ''}
                      onChange={(event) =>
                        onChoice(row.group.key, {
                          mode: row.mode,
                          spec: threadNamed(event.target.value),
                        })
                      }
                      className="focus-visible:ring-info/60 w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
                    >
                      {THREADS.map((each) => (
                        <option key={each.name} value={each.name}>
                          {each.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="w-56 px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    {row.interpolated ? (
                      <span
                        className="shrink-0 text-amber-300"
                        title="No drill in the crib makes this size, so a mill that can interpolate it is offered instead"
                      >
                        <WarningIcon aria-label="not a drill" />
                      </span>
                    ) : drill === null ? null : (
                      <span className="shrink-0 text-zinc-500">
                        <ToolTypeIcon toolType={drill.form} />
                      </span>
                    )}
                    <Pick
                      label={`Drill for the ⌀${formatLength(row.group.diameter, unit)} holes`}
                      options={row.drills.map((each) => ({
                        guid: each.tool.guid,
                        label: `${each.tool.catalogNumber} · ⌀${formatLength(each.tool.geometry.DC ?? 0, unit)}`,
                      }))}
                      value={chosen[row.group.key]}
                      onValue={(guid) => onChoose(row.group.key, guid)}
                      caution={row.interpolated}
                    />
                  </span>
                </td>
                <td className="w-56 px-3 py-2">
                  {row.thread === null ? (
                    <span className="text-2xs text-zinc-600">—</span>
                  ) : (
                    <Pick
                      label={`Tap or mill for the ⌀${formatLength(row.group.diameter, unit)} holes`}
                      options={row.makers.map((each) => ({
                        guid: each.guid,
                        label: `${each.catalogNumber} · ⌀${formatLength(each.geometry.DC ?? 0, unit)}`,
                      }))}
                      value={chosenMaker[row.group.key]}
                      onValue={(guid) => onChooseMaker(row.group.key, guid)}
                    />
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {/* One button for the row: the drill and the tap are one
                      decision about one size of hole. */}
                  <button
                    type="button"
                    disabled={kept.length === 0}
                    onClick={() => (held ? onRemoveBom(kept, tags) : onBom(kept, tags))}
                    aria-label={
                      held
                        ? `Remove the tools for the ⌀${formatLength(row.group.diameter, unit)} holes from the order list`
                        : `Add the tools for the ⌀${formatLength(row.group.diameter, unit)} holes to the order list`
                    }
                    className={classNames(
                      'text-2xs focus-visible:ring-info/60 rounded border px-2 py-1 whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700',
                      held
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-info/50 text-info hover:border-info/80 hover:bg-info/10 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-transparent dark:hover:text-zinc-100',
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {held ? <TrashIcon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
                      {held
                        ? 'On list'
                        : row.thread === null
                          ? 'Drill'
                          : row.mode === 'thread mill'
                            ? 'Drill + mill'
                            : 'Drill + tap'}
                    </span>
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
