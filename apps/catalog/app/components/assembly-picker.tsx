import { useEffect, useState, type ReactNode } from 'react'
import { Badge, Button, Card } from '@toolpath/ui'
import {
  HOLDER_AXES,
  axisApplies,
  colletsFor,
  holderFacet,
  holderFiltersFrom,
  holderNeedsCollet,
  holdersFor,
  isOnSize,
  selectCollet,
  selectHolder,
  toggleBuildTerm,
  type BuildSelection,
  type CatalogTool,
  type Collet,
  type Holder,
  type HolderAxis,
} from '@toolpath/catalog-data'
import { classNames } from '@toolpath/domain/class-names'
import { formatLength, type Unit } from '@toolpath/domain/units'
import {
  loadAssemblies,
  saveAssemblies,
  sameAssembly,
  withAssembly,
  withoutAssembly,
  type SavedAssembly,
} from 'shared/assemblies'
import { collets as allCollets, hasToolholding, holders as allHolders } from 'shared/catalog'
import { describeCollet, describeHolder, styleLabel, taperLabel } from 'shared/describe'
import { formLabel } from './tool-icons'

/**
 * Build an assembly around one tool: pick a holder, pick a collet.
 *
 * **The DFM catalog's flow (Justin Gray, 2026-08-05), which this application
 * follows.** Three panes, each narrowing the next:
 *
 * - **Holders** that can hold the shank, filtered by spindle taper, contact,
 *   holding style and collet series, in the recommended order — smallest
 *   collet series, then shortest gauge length, the least overhang a machinist
 *   picks by hand. The first row is badged, so a choice made on the shop's
 *   behalf is visible as one rather than hidden in the sort.
 * - **Collets** of the chosen holder's series that close on the shank,
 *   closest to on-size first. A direct-bore holder needs none, and "no collet
 *   needed" is a different fact from "none fit"; the pane says which.
 * - **The assembly**: the three parts, numbered, each in words as well as by
 *   number, and the way to keep it.
 *
 * Nothing here is invented: every holder and collet is vendor-published and
 * orderable, and the stickout is set on the drawing beside this, where it is
 * labelled as this application's default rather than a vendor's number.
 */

export interface AssemblyPickerProps {
  readonly tool: CatalogTool
  readonly unit: Unit
  readonly selection: BuildSelection
  readonly onChange: (next: BuildSelection) => void
  readonly title?: string
  readonly footer?: ReactNode
}

const AXIS_LABELS: Readonly<Record<HolderAxis, string>> = {
  taper: 'Spindle taper',
  contact: 'Spindle contact',
  clamping: 'Holding style',
  colletSeries: 'Collet series',
}

/** Values whose raw form is a field name rather than a word. */
const VALUE_LABELS: Partial<Record<HolderAxis, Readonly<Record<string, string>>>> = {
  contact: { taper: 'Taper only', face: 'Face contact' },
  clamping: { bore: 'Direct bore', collet: 'Collet chuck', shrink: 'Shrink fit' },
}

const LOCK_HINTS: Partial<Record<HolderAxis, string>> = {
  colletSeries:
    'A bore or shrink-fit holder clamps the shank itself, so no collet — and no series — is involved.',
}

/** One column of the picker: a named section, addressable by its label. */
const Pane = ({
  label,
  muted = false,
  children,
}: {
  label: string
  muted?: boolean
  children: ReactNode
}) => (
  <section aria-label={label} className="min-w-0">
    <h4
      className={classNames(
        'text-2xs mb-2 font-semibold tracking-wide uppercase',
        muted ? 'text-zinc-600' : 'text-zinc-400',
      )}
    >
      {label}
    </h4>
    {children}
  </section>
)

const Hint = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={classNames('text-2xs text-zinc-500', className)}>{children}</p>
)

const OPTION =
  'w-full cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5 text-left outline-none transition hover:border-zinc-700 hover:bg-zinc-900 focus-visible:ring-info/60 focus-visible:ring-1 aria-pressed:border-info/60 aria-pressed:bg-info/10'

/**
 * The chips. Counts are live, and a zero is a dead end shown as one — disabled
 * where it stands, never hidden, because the vocabulary is what tells you what
 * the catalog has. An axis the selection has answered away (series, under a
 * bore style) is locked with a sentence saying why, and its numbers go: each
 * would report the same unconstrained count.
 */
const HolderFilters = ({
  selection,
  holders,
  onChange,
}: {
  selection: BuildSelection
  holders: ReadonlyArray<Holder>
  onChange: (next: BuildSelection) => void
}) => {
  const filters = holderFiltersFrom(selection)
  return (
    <div className="mb-3 flex flex-col gap-2">
      {HOLDER_AXES.map((axis) => {
        const values = holderFacet(holders, filters, axis)
        if (values.length === 0) {
          return null
        }
        const applies = axisApplies(selection, axis)
        return (
          <fieldset key={axis} disabled={!applies}>
            <legend
              className={classNames(
                'text-2xs mb-1 font-semibold tracking-wide uppercase',
                applies ? 'text-zinc-500' : 'text-zinc-700',
              )}
            >
              {AXIS_LABELS[axis]}
            </legend>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {values.map(({ value, count }) => {
                const checked =
                  applies && (selection[axis] as ReadonlyArray<string>).includes(value)
                const disabled = !applies || (count === 0 && !checked)
                return (
                  <label
                    key={value}
                    className={classNames(
                      'text-2xs flex items-center gap-1.5',
                      disabled
                        ? 'cursor-not-allowed text-zinc-600'
                        : 'cursor-pointer text-zinc-200',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onChange(toggleBuildTerm(selection, axis, value))}
                      className="accent-info size-3"
                    />
                    <span>{VALUE_LABELS[axis]?.[value] ?? value}</span>
                    {applies ? (
                      <span className="font-mono tabular-nums text-zinc-600">{count}</span>
                    ) : null}
                  </label>
                )
              })}
            </div>
            {applies ? null : <Hint className="mt-1">{LOCK_HINTS[axis]}</Hint>}
          </fieldset>
        )
      })}
    </div>
  )
}

const HolderRow = ({
  holder,
  unit,
  recommended,
  selected,
  onSelect,
}: {
  holder: Holder
  unit: Unit
  recommended: boolean
  selected: boolean
  onSelect: () => void
}) => (
  <li className="flex items-stretch gap-1">
    <button
      type="button"
      aria-pressed={selected}
      className={classNames(OPTION, 'min-w-0 flex-1')}
      onClick={onSelect}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
        <span className="truncate font-mono">{holder.catalogNumber}</span>
        {recommended ? (
          <Badge size="sm" variant="info">
            recommended
          </Badge>
        ) : null}
      </span>
      <span className="text-2xs mt-0.5 block text-zinc-400">{describeHolder(holder, unit)}</span>
    </button>
    {holder.cadModelUrl === null ? null : (
      // A sibling of the button, never a child: an anchor inside a button is
      // invalid and gives the row two keyboard behaviours. It downloads
      // rather than navigates, which is a property of the file.
      <a
        aria-label={`Download the STEP model for ${holder.catalogNumber}`}
        title={`${holder.brand}'s STEP model for ${holder.catalogNumber}`}
        href={holder.cadModelUrl}
        download
        rel="noreferrer"
        className="text-2xs inline-flex shrink-0 items-center rounded-md border border-zinc-800 px-2 font-semibold text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-200"
      >
        STEP
      </a>
    )}
  </li>
)

const ColletRow = ({
  collet,
  unit,
  onSize,
  selected,
  onSelect,
}: {
  collet: Collet
  unit: Unit
  onSize: boolean
  selected: boolean
  onSelect: () => void
}) => (
  <li>
    <button type="button" aria-pressed={selected} className={OPTION} onClick={onSelect}>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
        <span className="truncate font-mono">{collet.catalogNumber}</span>
        {onSize ? (
          <Badge size="sm" variant="secondary">
            on-size
          </Badge>
        ) : null}
      </span>
      <span className="text-2xs mt-0.5 block text-zinc-400">{describeCollet(collet, unit)}</span>
    </button>
  </li>
)

export const AssemblyPicker = ({
  tool,
  unit,
  selection,
  onChange,
  title = 'Assembly',
  footer,
}: AssemblyPickerProps) => {
  const [saved, setSaved] = useState<ReadonlyArray<SavedAssembly>>([])
  useEffect(() => {
    setSaved(loadAssemblies(globalThis.localStorage ?? null))
  }, [])

  if (!hasToolholding()) {
    return (
      <Card className="p-4">
        <h3 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h3>
        {/* Not the same claim as "nothing holds this tool": one is a gap in
            the dataset, the other a gap in the crib. */}
        <Hint className="mt-2">
          This dataset carries no toolholding, so there is nothing to build with yet.
        </Hint>
      </Card>
    )
  }

  const unfiltered = holdersFor(tool, allHolders, allCollets)
  const holders = holdersFor(tool, allHolders, allCollets, holderFiltersFrom(selection))
  const holder = allHolders.find((each) => each.guid === selection.holder) ?? null
  const collets = holder === null ? [] : colletsFor(tool, holder, allCollets)
  const collet = allCollets.find((each) => each.guid === selection.collet) ?? null
  const shank = tool.geometry.SFDM
  const needsCollet = holder !== null && holderNeedsCollet(holder)
  const complete = holder !== null && (!needsCollet || collet !== null)

  const entry: SavedAssembly | null =
    holder === null
      ? null
      : {
          holderGuid: holder.guid,
          colletGuid: collet?.guid ?? null,
          toolGuid: tool.guid,
          stickout: selection.stickout,
        }
  const kept = entry !== null && saved.some((each) => sameAssembly(each, entry))
  const keep = () => {
    if (entry === null) {
      return
    }
    const next = kept ? withoutAssembly(saved, entry) : withAssembly(saved, entry)
    setSaved(next)
    saveAssemblies(globalThis.localStorage ?? null, next)
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h3>
        <span className="text-2xs ml-auto font-mono tabular-nums text-zinc-500">
          {holders.length} of {unfiltered.length} holders fit this shank
        </span>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-3">
        <Pane label="Holders">
          <HolderFilters selection={selection} holders={unfiltered} onChange={onChange} />
          {unfiltered.length === 0 ? (
            <Hint>
              Nothing in this catalog holds a{' '}
              {shank === undefined
                ? 'shank this tool does not state'
                : `${formatLength(shank, unit)} shank`}
              . That is a gap in the crib rather than a problem with the tool.
            </Hint>
          ) : holders.length === 0 ? (
            <Hint>
              No holder matches these filters. {unfiltered.length} fit the shank without them.
            </Hint>
          ) : (
            <>
              <Hint className="mb-2">
                Smallest collet series first, then shortest gauge — the least overhang at the
                spindle nose. The first row is the recommendation, not simply the first thing found.
              </Hint>
              <ul className="flex flex-col gap-1">
                {holders.map((option, index) => (
                  <HolderRow
                    key={option.guid}
                    holder={option}
                    unit={unit}
                    recommended={index === 0}
                    selected={option.guid === selection.holder}
                    onSelect={() => onChange(selectHolder(selection, option.guid))}
                  />
                ))}
              </ul>
            </>
          )}
        </Pane>

        <Pane label="Collets" muted={holder !== null && !needsCollet}>
          {holder === null ? (
            <Hint>Choose a holder first.</Hint>
          ) : !needsCollet ? (
            <Hint>No collet needed: a {styleLabel(holder)} clamps the shank itself.</Hint>
          ) : collets.length === 0 ? (
            <Hint>No {holder.colletSeries} collet in the catalog closes on this shank.</Hint>
          ) : (
            <>
              <Hint className="mb-2">
                Closest to on-size first. A collet grips and runs truest at its nominal size — and a
                powRgrip collet is made for one size only.
              </Hint>
              <ul className="flex flex-col gap-1">
                {collets.map((option) => (
                  <ColletRow
                    key={option.guid}
                    collet={option}
                    unit={unit}
                    onSize={shank !== undefined && isOnSize(option, shank)}
                    selected={option.guid === selection.collet}
                    onSelect={() => onChange(selectCollet(selection, option.guid))}
                  />
                ))}
              </ul>
            </>
          )}
        </Pane>

        <Pane label="Assembly">
          <ol className="mb-3 flex flex-col gap-1.5">
            {[
              {
                number: tool.catalogNumber,
                text: `${formLabel(tool)}${tool.geometry.DC === undefined ? '' : ` ⌀${formatLength(tool.geometry.DC, unit)}`}`,
              },
              collet === null
                ? { number: needsCollet ? 'no collet chosen' : '—', text: null }
                : { number: collet.catalogNumber, text: describeCollet(collet, unit) },
              holder === null
                ? { number: 'no holder chosen', text: null }
                : { number: holder.catalogNumber, text: describeHolder(holder, unit) },
            ].map((part, index) => (
              <li key={index} className="flex items-baseline gap-2 text-xs text-zinc-100">
                <span className="text-2xs grid size-4 shrink-0 place-items-center self-start rounded-full bg-zinc-800 font-bold text-zinc-400">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-mono">{part.number}</span>
                  {part.text === null ? null : (
                    <span className="text-2xs block text-zinc-400">{part.text}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>

          {holder === null ? (
            <Hint>Pick a holder{needsCollet ? ' and a collet' : ''}.</Hint>
          ) : (
            <Hint>
              {taperLabel(holder)}
              {holder.gaugeLength === null
                ? ''
                : `, ${formatLength(holder.gaugeLength, unit)} gauge`}
              . The stickout is set on the drawing, where it is this application's default rather
              than a vendor's number.
            </Hint>
          )}

          <div className="mt-3 flex items-center gap-2">
            {footer}
            <Button
              size="sm"
              variant={kept ? 'primary' : 'secondary'}
              aria-pressed={kept}
              disabled={!complete}
              onClick={keep}
            >
              {kept ? 'Saved' : 'Save assembly'}
            </Button>
          </div>
        </Pane>
      </div>
    </Card>
  )
}
