import { ArrowSquareOutIcon, DownloadSimpleIcon, TrashIcon } from '@phosphor-icons/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge, Card } from '@toolpath/ui'
import { classNames } from '@toolpath/domain/class-names'
import { formatLength, type Unit } from '@toolpath/domain/units'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { AppHeader } from 'components/app-header'
import { ColletIcon, HolderIcon, ToolTypeIcon, formLabel } from './../components/tool-icons'
import { allTools, collets as allCollets, holders as allHolders } from 'shared/catalog'
import {
  addChoice,
  quantityOf,
  removeChoice,
  setQuantity,
  setTotal,
  totalOf,
  useSetupSheet,
  type Choice,
  type Component,
  type SetupSheet,
} from 'shared/setup-sheet'
import { fusionLibrary } from 'shared/fusion-library'
import { stepFile, type ProfileStep } from 'shared/step-file'
import { stackProfile, toolProfile } from 'shared/tool-profile'
import { recallPart } from 'shared/part-session'
import { useUnit } from 'shared/use-unit'

/**
 * The order list: what has been decided for this part, in one list.
 *
 * The setup sheet read the other way round. It stores guids and resolves them
 * through the catalog on every render — Justin Gray's rule, kept since
 * 2026-08-10 — so this page can never disagree with the catalog about a
 * diameter, and a line whose tool has left the catalog shows as gone rather
 * than as a stale number.
 *
 * A line may be a tool on its own: deciding the cutter and leaving the holder
 * for later is a real state of a job, and the page says which lines are in it
 * rather than refusing to hold them.
 *
 * **A row is a component, not an assembly** (Paul, 2026-08-31). Three cutters
 * usually go in one holder, so tool, holder and collet each get their own row,
 * their own quantity and their own way to the vendor; a rule under each row
 * and a heavier one between assemblies say which rows belong together.
 */

/**
 * A component's own page at the vendor, where they publish one.
 *
 * On the detail line under the number, beside the brand and the form — that
 * line is where somebody reads what a thing *is*, and where it comes from is
 * the same kind of fact (Paul, 2026-08-31).
 */
const Vendor = ({ href, of }: { href: string | null; of: string }) =>
  href === null ? null : (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Buy ${of} at the vendor`}
      onClick={(event) => event.stopPropagation()}
      className="text-info/90 hover:text-info focus-visible:ring-info/60 inline-flex items-center gap-0.5 rounded underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:outline-none"
    >
      vendor
      <ArrowSquareOutIcon aria-hidden="true" />
    </a>
  )

/** One bought thing, whatever kind it is. */
interface Line {
  readonly component: Component
  readonly catalogNumber: string
  readonly brand: string
  readonly detail: string
  readonly productLink: string | null
  /**
   * The numbers that decide whether this is the right one, beyond the
   * diameter — a bill somebody orders from is read away from the part, so it
   * carries what the tool table showed rather than sending them back for it
   * (Paul, 2026-08-31).
   */
  readonly geometry: ReadonlyArray<{ readonly label: string; readonly value: string }>
  /** Only a tool has a page of its own to link to. */
  readonly toolGuid?: string
  /**
   * What it looks like, at a glance.
   *
   * A holder and a collet get one as much as a cutter does: the column header
   * says which is which, but a row is read by its shapes (Paul, 2026-08-31).
   */
  readonly icon: ReactNode
  /**
   * Its own shape, bottom-up, for the STEP button — null where the vendor
   * publishes none, which is a button that stays off rather than a guess.
   */
  readonly profile: { readonly steps: Array<ProfileStep>; readonly top: number } | null
}

/** A stated number, or nothing at all — never a zero standing in for silence. */
const stated = (
  label: string,
  value: number | null | undefined,
  say: (value: number) => string,
): Array<{ label: string; value: string }> =>
  value === undefined || value === null ? [] : [{ label, value: say(value) }]

const KIND: Readonly<Record<Component, string>> = {
  tool: 'Tool',
  holder: 'Holder',
  collet: 'Collet',
}

const toolLine = (tool: CatalogTool, unit: Unit): Line => {
  const say = (value: number) => formatLength(value, unit)
  return {
    component: 'tool',
    catalogNumber: tool.catalogNumber,
    brand: tool.brand,
    detail: formLabel(tool),
    productLink: tool.productLink,
    toolGuid: tool.guid,
    icon: <ToolTypeIcon toolType={tool.form} />,
    profile: toolProfile(tool),
    geometry: [
      ...stated('⌀', tool.geometry.DC, say),
      ...stated('flute', tool.geometry.LCF, say),
      ...stated('below holder', tool.geometry.LBH, say),
      ...stated('overall', tool.geometry.OAL, say),
      ...stated('corner', tool.geometry.RE, say),
      ...stated('flutes', tool.geometry.NOF, (value) => String(value)),
      ...stated('shank', tool.geometry.SFDM, say),
    ],
  }
}

const holderLine = (holder: Holder, unit: Unit): Line => {
  const say = (value: number) => formatLength(value, unit)
  return {
    component: 'holder',
    catalogNumber: holder.catalogNumber,
    brand: holder.brand,
    detail: `${holder.taper} · ${holder.clamping}${holder.colletSeries === null ? '' : ` ${holder.colletSeries}`}`,
    productLink: holder.productLink,
    icon: <HolderIcon />,
    // The nose, the body and the flange, each at the height the vendor states
    // it — the same three the drawing sweeps.
    profile:
      holder.noseDiameter === null
        ? null
        : {
            steps: [
              { fromHeight: 0, radius: holder.noseDiameter / 2 },
              ...(holder.bodyDiameter === null || holder.noseLength === null
                ? []
                : [{ fromHeight: holder.noseLength, radius: holder.bodyDiameter / 2 }]),
              ...(holder.flangeDiameter === null || holder.projection === null
                ? []
                : [{ fromHeight: holder.projection, radius: holder.flangeDiameter / 2 }]),
            ],
            top:
              holder.projection === null
                ? (holder.noseLength ?? 0) + (holder.bodyLength ?? 0)
                : holder.projection + 10,
          },
    geometry: [
      ...stated('gauge', holder.gaugeLength, say),
      ...stated('nose ⌀', holder.noseDiameter, say),
      ...stated('projection', holder.projection, say),
    ],
  }
}

const colletLine = (collet: Collet, unit: Unit): Line => ({
  component: 'collet',
  catalogNumber: collet.catalogNumber,
  brand: collet.brand,
  detail: collet.series,
  productLink: collet.productLink,
  icon: <ColletIcon />,
  // A collet is published as what it grips, never as a shape.
  profile: null,
  geometry: [
    {
      label: 'grips',
      value: `${formatLength(collet.clampMin, unit)} – ${formatLength(collet.clampMax, unit)}`,
    },
    ...stated('grip length', collet.clampLength, (value) => formatLength(value, unit)),
  ],
})

/**
 * How many, typed.
 *
 * A number field's spinner arrows are not how a quantity gets entered on a
 * bill — nobody clicks up thirty times (Paul, 2026-08-31: "just text entry
 * please"). Still a number field, so a phone offers digits and the value is
 * still a number; only the arrows are gone.
 */
const Count = ({
  value,
  onValue,
  label,
}: {
  value: number
  onValue: (many: number) => void
  label: string
}) => (
  <input
    type="number"
    inputMode="numeric"
    min={1}
    step={1}
    value={value}
    onChange={(event) => onValue(Number(event.target.value))}
    aria-label={label}
    className="focus-visible:ring-info/60 w-14 [appearance:textfield] rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-right font-mono text-xs text-zinc-100 focus-visible:ring-1 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
  />
)

/**
 * Saving one component as a STEP file.
 *
 * A shop that has decided what cuts a part wants the solid to drop into CAM or
 * a fixture model, and every diameter on a cutter or a holder is published —
 * so the body is revolved from the profile rather than asked for from a vendor
 * who may not publish one (Paul, 2026-08-31). `step-file.ts` writes it, and is
 * tested there; a component with no published shape gets a button that is off.
 */
const StepButton = ({
  name,
  profile,
  title,
  label = 'STEP',
}: {
  name: string
  profile: { readonly steps: Array<ProfileStep>; readonly top: number } | null
  title: string
  label?: string
}) => {
  const save = () => {
    if (profile === null) {
      return
    }
    const text = stepFile(name, profile.steps, profile.top)
    if (text === null) {
      return
    }
    const href = URL.createObjectURL(new Blob([text], { type: 'application/step' }))
    const link = document.createElement('a')
    link.href = href
    link.download = `${name}.step`
    link.click()
    URL.revokeObjectURL(href)
  }
  return (
    <button
      type="button"
      disabled={profile === null}
      onClick={save}
      title={profile === null ? 'This vendor publishes no shape for it' : title}
      aria-label={`Export ${name} as a STEP file`}
      className="text-2xs focus-visible:ring-info/60 inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 whitespace-nowrap text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700"
    >
      <DownloadSimpleIcon aria-hidden="true" />
      {label}
    </button>
  )
}

/**
 * The head of an assembly's rows: what it is, what it machines, how many, and
 * the two things that are decided about the whole stack rather than about one
 * component — the holder it sits in, and the model of the lot.
 */
interface AssemblyHead {
  readonly tool: string
  /** What it machines, in the words the panel uses — a note, not the subject. */
  readonly features: ReadonlyArray<string>
  /** How the note reads: what it machines, or what machines it. */
  readonly verb: string
  readonly total: number
  readonly onTotal: (many: number) => void
  readonly onRemove: () => void
  /** The whole stack as one revolved solid, where there is a shape for it. */
  readonly stack: { readonly steps: Array<ProfileStep>; readonly top: number } | null
}

const AssemblyHead = ({ tool, features, verb, total, onTotal, onRemove, stack }: AssemblyHead) => (
  <>
    <span className="flex items-center gap-1.5">
      <span className="text-sm break-words text-zinc-200">{tool}</span>
      <button
        type="button"
        aria-label={`Remove ${tool} from the order list`}
        title="Remove the whole assembly"
        onClick={onRemove}
        className="focus-visible:ring-danger/60 hover:text-danger shrink-0 rounded p-0.5 text-zinc-600 transition focus-visible:ring-1 focus-visible:outline-none"
      >
        <TrashIcon aria-hidden="true" />
      </button>
    </span>
    <span className="text-2xs block text-zinc-500">
      {verb} {features.join(', ')}
    </span>
    <span className="mt-0.5 flex items-center gap-2">
      <label className="text-2xs flex items-center gap-1 whitespace-nowrap text-zinc-500">
        <span>× total</span>
        <Count value={total} onValue={onTotal} label={`How many of the ${tool} assembly`} />
      </label>
      <StepButton
        name={`${tool}-assembly`}
        profile={stack}
        title="Save the whole stack — tool, holder and all — as one STEP solid"
        label="Assembly"
      />
    </span>
  </>
)

/**
 * One bought thing on its own line.
 *
 * **Columns, not a summary** (Paul, 2026-08-31). A bill is read across: who
 * makes it, what its number is, what kind of thing it is, where to buy it, and
 * the model to drop into CAM. The numbers that decide a *choice* belong to the
 * list beside the part; by the time something is on the bill it has been
 * chosen.
 */
const Row = ({
  line,
  assembly,
  first,
  quantity,
  onQuantity,
  onRemove,
  total,
}: {
  line: Line
  /** Written once at the top of the assembly's rows; null on the rest. */
  assembly: AssemblyHead | null
  first: boolean
  quantity: number
  onQuantity: (many: number) => void
  /** Dropping this one component, leaving the rest of the assembly. */
  onRemove: () => void
  /** How many of the whole assembly, so the row can say what that comes to. */
  total: number
}) => (
  <tr
    className={classNames(
      'align-top',
      first ? 'border-t border-zinc-600' : 'border-t border-zinc-800',
    )}
  >
    <th scope="row" className="w-64 min-w-56 px-3 py-1.5 text-left font-normal">
      {assembly === null ? null : <AssemblyHead {...assembly} />}
    </th>
    <td className="w-28 px-3 py-1.5">
      <span className="flex items-center gap-1">
        <Count
          value={quantity}
          onValue={onQuantity}
          label={`How many ${line.catalogNumber} (${KIND[line.component].toLowerCase()}) per assembly`}
        />
        {total === 1 ? null : (
          <span className="text-2xs font-mono text-zinc-400">= {String(total * quantity)}</span>
        )}
        {/* One component off the assembly, rather than the whole of it. */}
        <button
          type="button"
          aria-label={`Remove ${line.catalogNumber} from this assembly`}
          title="Remove this component"
          onClick={onRemove}
          className="focus-visible:ring-danger/60 hover:text-danger shrink-0 rounded p-0.5 text-zinc-600 transition focus-visible:ring-1 focus-visible:outline-none"
        >
          <TrashIcon aria-hidden="true" />
        </button>
      </span>
    </td>
    <td className="text-2xs w-24 px-3 py-1.5 tracking-wide whitespace-nowrap text-zinc-400 uppercase">
      <span className="flex items-center gap-1.5">
        <span className="text-zinc-500">{line.icon}</span>
        {KIND[line.component]}
      </span>
    </td>
    <td className="px-3 py-1.5 text-sm whitespace-nowrap text-zinc-300">{line.brand}</td>
    <td className="px-3 py-1.5">
      {line.toolGuid === undefined ? (
        <span className="block font-mono whitespace-nowrap text-zinc-100">
          {line.catalogNumber}
        </span>
      ) : (
        <Link
          to={`/tools/${line.toolGuid}`}
          className="block font-mono whitespace-nowrap text-zinc-100 underline-offset-2 hover:underline"
        >
          {line.catalogNumber}
        </Link>
      )}
    </td>
    <td className="w-full px-3 py-1.5 text-sm text-zinc-400">{line.detail}</td>
    <td className="px-3 py-1.5">
      {line.productLink === null ? (
        <span className="text-2xs text-zinc-600">no link</span>
      ) : (
        <Vendor href={line.productLink} of={line.catalogNumber} />
      )}
    </td>
    <td className="px-3 py-1.5 text-right">
      <StepButton
        name={line.catalogNumber}
        profile={line.profile}
        title={`Save ${line.catalogNumber} as a STEP file`}
      />
    </td>
  </tr>
)

const Bom = () => {
  const { partId } = useParams()
  const [search] = useSearchParams()
  const jobId = search.get('job')
  const [unit, setUnit] = useUnit()
  const { sheet, commit } = useSetupSheet(partId ?? '')
  const remembered = partId && jobId ? recallPart(partId, jobId) : null
  const features = remembered?.report.features ?? []
  /**
   * The sheet grouped by **assembly**: one row-group per tool, holder and
   * collet, whatever it machines.
   *
   * Paul (2026-08-31): "the tool assembly is the important thing, the geometry
   * it machines is just a useful note." The sheet is stored per feature — that
   * is what a choice is about — so the page turns it round here, exactly as
   * the cards over the part do.
   *
   * Two features that gave the same cutter different holders are two
   * assemblies, because they are two things to buy and set up.
   */
  /** Which way the list is read: by what gets bought, or by what gets cut. */
  const [grouping, setGrouping] = useState<'assembly' | 'feature'>('assembly')

  const assemblies = useMemo(() => {
    const groups = new Map<
      string,
      {
        choice: Choice
        /** What it machines, for the head to note. */
        features: Array<string>
        /** Every place it is kept, for the controls that write to all of them. */
        tags: Array<string>
        /** What the head leads with, which is what the list is grouped by. */
        title: string
      }
    >()
    for (const [featureTag, kept] of Object.entries(sheet.choices)) {
      for (const choice of kept) {
        const feature = features.find((each) => each.featureTag === featureTag)
        const named = featureTag === '*' ? 'the whole part' : (feature?.featureType ?? featureTag)
        const tool = allTools.find((each) => each.guid === choice.toolGuid)
        /**
         * **The two ways a shop reads this list.**
         *
         * Buying, it is a list of assemblies: one line per thing to order,
         * whatever it machines. Planning, it is a list of features: what each
         * one takes, whatever it costs. Same rows either way — what changes is
         * what the head leads with and what gets folded together (Paul,
         * 2026-08-31).
         */
        const key =
          grouping === 'assembly'
            ? `${choice.toolGuid}|${choice.holderGuid ?? ''}|${choice.colletGuid ?? ''}`
            : `${featureTag}|${choice.toolGuid}`
        const had = groups.get(key) ?? {
          choice,
          features: [],
          tags: [],
          title: grouping === 'assembly' ? (tool?.catalogNumber ?? 'this assembly') : named,
        }
        had.features.push(grouping === 'assembly' ? named : (tool?.catalogNumber ?? 'a tool'))
        had.tags.push(featureTag)
        groups.set(key, had)
      }
    }
    const sections = [...groups.entries()].map(([key, group]) => ({ key, ...group }))
    return grouping === 'assembly'
      ? sections
      : sections.sort((a, b) => a.title.localeCompare(b.title))
  }, [sheet, features, grouping])

  /**
   * The whole bill as a Fusion library, saved from the browser.
   *
   * Built here rather than on the server because everything it needs is
   * already in this page: the sheet's guids, resolved through the catalog.
   * `fusion-library.ts` is where the shape of the file lives, and is tested
   * there.
   */
  const downloadFusion = () => {
    const { library } = fusionLibrary(
      assemblies.flatMap(({ choice }) => {
        const tool = allTools.find((each) => each.guid === choice.toolGuid)
        return tool === undefined
          ? []
          : [
              {
                tool,
                holder: allHolders.find((each) => each.guid === choice.holderGuid),
                collet: allCollets.find((each) => each.guid === choice.colletGuid),
              },
            ]
      }),
    )
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = href
    link.download = `${partId ?? 'part'}-tools.json`
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />
      <div className="min-h-0 flex-1 p-3">
        <Card className="flex size-full min-h-0 flex-col overflow-hidden">
          <p className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2 text-sm">
            <span className="text-zinc-200">Order list</span>
            <Badge variant={assemblies.length === 0 ? 'secondary' : 'primary'}>
              {String(assemblies.length)}
            </Badge>
            <span className="text-2xs text-zinc-500">what has been decided for this part</span>
            <span className="flex gap-1">
              {(['assembly', 'feature'] as const).map((each) => (
                <button
                  key={each}
                  type="button"
                  aria-pressed={grouping === each}
                  onClick={() => setGrouping(each)}
                  className={classNames(
                    'text-2xs focus-visible:ring-info/60 rounded border px-2 py-0.5 transition focus-visible:ring-1 focus-visible:outline-none',
                    grouping === each
                      ? 'border-info/60 bg-info/15 text-info'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                  )}
                >
                  By {each}
                </button>
              ))}
            </span>
            {assemblies.length === 0 ? null : (
              <button
                type="button"
                onClick={downloadFusion}
                title="Every tool on this bill, as a library Fusion can import"
                className="text-2xs focus-visible:ring-info/60 border-info/40 text-info hover:border-info/70 hover:bg-info/10 ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 font-semibold whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none"
              >
                <DownloadSimpleIcon aria-hidden="true" />
                Fusion tool library
              </button>
            )}
          </p>
          <div className="min-h-0 flex-1 overflow-auto">
            {assemblies.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">
                Nothing kept yet. Pick a feature on the part, then <em>Add to list</em> on the tool
                that cuts it.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Everything kept for this part</caption>
                <thead>
                  <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      {grouping === 'assembly' ? 'Assembly' : 'Feature'}
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Component
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Vendor
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Part ID
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Product
                    </th>
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                      Model
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assemblies.flatMap(({ key, choice, features: machines, tags, title }) => {
                    const tool = allTools.find((each) => each.guid === choice.toolGuid)
                    const holder = allHolders.find((each) => each.guid === choice.holderGuid)
                    const collet = allCollets.find((each) => each.guid === choice.colletGuid)
                    /**
                     * A control on the group writes to every feature it is
                     * kept for: one assembly, one count, however many
                     * features it machines.
                     */
                    const across = (change: (sheetSoFar: SetupSheet, tag: string) => SetupSheet) =>
                      commit(tags.reduce(change, sheet))
                    /**
                     * The bill **reads out** what was decided; it is not where
                     * the deciding happens (Paul, 2026-08-31). The holder is
                     * chosen on the part, beside the feature it has to clear,
                     * where there is a reach curve to grade it against — this
                     * page has none, so a picker here could only offer a list
                     * it could say nothing about.
                     */
                    const lines: Array<Line> = [
                      ...(tool ? [toolLine(tool, unit)] : []),
                      ...(holder ? [holderLine(holder, unit)] : []),
                      ...(collet ? [colletLine(collet, unit)] : []),
                    ]
                    const named: AssemblyHead = {
                      tool: title,
                      /** "machines a pocket" one way round, "cut by a ⌀6" the other. */
                      verb: grouping === 'assembly' ? 'machines' : 'cut by',
                      features: machines,
                      total: totalOf(choice),
                      onTotal: (many: number) =>
                        across((sheetSoFar, tag) =>
                          setTotal(sheetSoFar, tag, choice.toolGuid, many),
                        ),
                      onRemove: () =>
                        across((sheetSoFar, tag) => removeChoice(sheetSoFar, tag, choice.toolGuid)),
                      stack: stackProfile(tool, holder, choice.stickout ?? null),
                    }
                    if (lines.length === 0) {
                      return (
                        <tr key={key} className="border-t border-zinc-600 align-top">
                          <th scope="row" className="w-52 px-3 py-1.5 text-left font-normal">
                            <span className="block text-sm text-zinc-200">{named.tool}</span>
                            <span className="text-2xs block text-zinc-500">
                              {named.verb} {machines.join(', ')}
                            </span>
                          </th>
                          <td colSpan={5} className="text-2xs text-danger px-3 py-2">
                            no longer in the catalog
                          </td>
                        </tr>
                      )
                    }
                    return lines.map((line, at) => (
                      <Row
                        key={`${key}:${line.component}`}
                        line={line}
                        assembly={at === 0 ? named : null}
                        first={at === 0}
                        total={totalOf(choice)}
                        quantity={quantityOf(choice, line.component)}
                        onQuantity={(many) =>
                          across((sheetSoFar, tag) =>
                            setQuantity(sheetSoFar, tag, choice.toolGuid, line.component, many),
                          )
                        }
                        onRemove={() =>
                          across((sheetSoFar, tag) =>
                            line.component === 'tool'
                              ? removeChoice(sheetSoFar, tag, choice.toolGuid)
                              : addChoice(sheetSoFar, tag, {
                                  ...choice,
                                  ...(line.component === 'holder'
                                    ? { holderGuid: undefined, colletGuid: undefined }
                                    : { colletGuid: undefined }),
                                }),
                          )
                        }
                      />
                    ))
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}

export default Bom
