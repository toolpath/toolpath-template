import { useMemo, useState } from 'react'
import { Badge, Card } from '@toolpath/ui'
import { formatLength } from '@toolpath/tool-support'
import {
  HOLDER_AXES,
  applicableFilters,
  axisConstrains,
  holderFacet,
  type Holder,
  type HolderAxis,
  type HolderFilters,
} from '@toolpath/catalog-data'
import { AppHeader } from 'components/app-header'
import { CatalogDrawing } from 'components/catalog-drawing'
import { Chip } from 'components/chip'
import { allTools, collets, getProfile, hasProfiles, hasToolholding, holders } from 'shared/catalog'
import { holderRows, representativeAssembly, shortfallNote } from 'shared/holder-browse'
import { useUnit } from 'shared/use-unit'

/**
 * The spindle rack, holder-first.
 *
 * Every other list here starts from a part and ends at a tool. This one exists
 * because a measured holder is worth *looking at* — the V-flange groove and the
 * thread relief that a published nose diameter cannot tell you about — and
 * there was nowhere in this application to look at one.
 *
 * **The drawing is still an assembly.** `@toolpath/tool-drawing` draws a tool
 * and its holder; there is no holder-alone picture and this page does not
 * invent one. It picks a tool the holder can actually take and says which.
 */

/** What each filter axis is called where somebody reads it. */
const AXIS_LABEL: Record<HolderAxis, string> = {
  taper: 'Taper',
  contact: 'Contact',
  clamping: 'Clamping',
  colletSeries: 'Collet series',
}

const Holders = () => {
  const [unit, setUnit] = useUnit()
  const [filters, setFilters] = useState<HolderFilters>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [measured, setMeasured] = useState(true)

  const format = (millimetres: number) => formatLength(millimetres, unit)

  // The rule the filter panel already follows: an axis that cannot narrow
  // anything is not asked, so a collet series stops being offered the moment
  // the clamping filter excludes every holder that takes one.
  const applicable = applicableFilters(filters)
  const rows = useMemo(
    () => holderRows(holders, applicable, (guid) => getProfile(guid) !== null),
    [applicable],
  )

  const holder: Holder | null =
    rows.find((row) => row.holder.guid === selected)?.holder ?? rows[0]?.holder ?? null
  const profile = holder === null ? null : getProfile(holder.guid)
  const assembly = useMemo(
    () => (holder === null ? null : representativeAssembly(holder, allTools, collets)),
    [holder],
  )
  const note = shortfallNote(profile?.shortfallMm ?? null, format)

  const toggle = (axis: HolderAxis, value: string) => {
    setFilters((current) => {
      const chosen = current[axis] ?? []
      const next = chosen.includes(value)
        ? chosen.filter((each) => each !== value)
        : [...chosen, value]
      return { ...current, [axis]: next }
    })
  }

  if (!hasToolholding()) {
    return (
      <main className="min-h-screen">
        <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />
        <p className="p-6 text-sm text-zinc-400">
          This dataset holds no toolholding. That is not the same as nothing fitting these tools —
          run a scrape that ingests holders and collets.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <span>
            {rows.length} of {holders.length} holders
          </span>
          {/* "Nothing measured yet" and "this holder is not measured" look the
              same on screen and mean opposite things, so the page says which. */}
          <Badge variant="secondary">
            {hasProfiles()
              ? `${rows.filter((row) => row.measured).length} measured`
              : 'none measured on this machine'}
          </Badge>
        </div>

        <div className="flex flex-col gap-3">
          {HOLDER_AXES.map((axis) => {
            const values = holderFacet(holders, applicable, axis)
            if (values.length === 0) {
              return null
            }
            // Greyed rather than gone: an axis the current filter has emptied
            // still says what it would have asked. `axisConstrains` is the
            // package's own rule for when it stops being a question at all.
            const live = axisConstrains(applicable, axis)
            return (
              <div key={axis} className="flex flex-wrap items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-zinc-500">{AXIS_LABEL[axis]}</span>
                {values.map(({ value, count }) => (
                  <Chip
                    key={value}
                    pressed={(filters[axis] ?? []).includes(value)}
                    disabled={!live || count === 0}
                    onClick={() => toggle(axis, value)}
                    title={`${count} holders`}
                  >
                    {value} · {count}
                  </Chip>
                ))}
              </div>
            )
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <ul className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.holder.guid}>
                <button
                  type="button"
                  onClick={() => setSelected(row.holder.guid)}
                  aria-pressed={row.holder.guid === holder?.guid}
                  className="w-full text-left"
                >
                  <Card
                    className={`flex flex-col gap-1 p-3 ${
                      row.holder.guid === holder?.guid ? 'ring-1 ring-zinc-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-heading text-sm font-semibold text-zinc-100">
                        {row.holder.catalogNumber}
                      </span>
                      {row.measured ? (
                        <Badge variant="secondary" className="ml-auto">
                          measured
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {row.holder.taper} · {row.holder.clamping}
                      {row.holder.colletSeries === null ? '' : ` · ${row.holder.colletSeries}`}
                      {row.holder.gaugeLength === null
                        ? ''
                        : ` · gauge ${format(row.holder.gaugeLength)}`}
                    </span>
                  </Card>
                </button>
              </li>
            ))}
          </ul>

          <Card className="flex min-h-[24rem] flex-col gap-3 p-4">
            {holder === null || assembly === null ? (
              <p className="text-sm text-zinc-400">
                {holder === null
                  ? 'No holder matches these filters.'
                  : 'No tool in this catalog fits this holder, so there is no assembly to draw.'}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    pressed={measured}
                    disabled={profile === null}
                    onClick={() => setMeasured((on) => !on)}
                    title={
                      profile === null
                        ? 'Nothing has measured this holder'
                        : 'Draw the measured silhouette rather than the published dimensions'
                    }
                  >
                    measured silhouette
                  </Chip>
                  <span className="text-xs text-zinc-500">
                    drawn with {assembly.tool.catalogNumber}
                    {assembly.collet === null ? '' : ` in ${assembly.collet.catalogNumber}`}
                  </span>
                </div>

                <div className="min-h-0 flex-1">
                  <CatalogDrawing
                    tool={assembly.tool}
                    assembly={assembly}
                    unit={unit}
                    measured={measured}
                    dimensions
                  />
                </div>

                {/* The clearance verdict is still reasoned from the published
                    numbers, so a measured drawing and a clearance figure are
                    answering from different geometry. Said out loud rather than
                    left for somebody to discover in a disagreement. */}
                {measured && profile !== null ? (
                  <p className="text-xs text-zinc-500">
                    Measured off the vendor&rsquo;s own CAD model. Clearance is still calculated
                    from the published dimensions.
                  </p>
                ) : null}
                {note === null ? null : <p className="text-xs text-amber-400">{note}</p>}
              </>
            )}
          </Card>
        </div>
      </div>
    </main>
  )
}

export default Holders
