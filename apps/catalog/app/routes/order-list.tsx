import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretUpIcon,
  DownloadSimpleIcon,
  ListBulletsIcon,
  TrashIcon,
  TreeStructureIcon,
} from '@phosphor-icons/react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Badge, Button, Card, IconButton, cn, Input } from '@toolpath/ui'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { AppHeader } from 'components/app-header'
import { FusionExportDialog } from 'components/fusion-export-dialog'
import { ColletIcon, HolderIcon, ToolTypeIcon, formLabel } from './../components/tool-icons'
import { allTools, getCollet, getHolder, getProfile, getTool } from 'shared/catalog'
import {
  addChoice,
  lineUnder,
  quantityOf,
  removeChoice,
  setQuantity,
  setTotal,
  totalOf,
  useSetupSheet,
  type Component,
  type SetupSheet,
} from 'shared/setup-sheet'
import { readList } from 'shared/feature-list'
import {
  componentTotals,
  opensDescending,
  orderAssemblies,
  setComponentCount,
  sortComponents,
  type ComponentSort,
  type ComponentTotal,
  type OrderAssembly,
} from 'shared/order-list'
import {
  fusionLibrary,
  fusionLibraryJson,
  sanitizeName,
} from '@toolpath/tool-support/export/fusion'
import { fusionInput, fusionReport } from 'shared/fusion-input'
import { saveInBrowser } from 'shared/save-file'
import { recallPart } from 'shared/part-session'
import { useUnit } from 'shared/use-unit'
import { SECTION_LABEL, TABLE_FACE, TABLE_INK } from 'shared/type'

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

const toolLine = (tool: CatalogTool, unit: UnitSystem): Line => {
  const say = (value: number) => formatLength(value, unit)
  return {
    component: 'tool',
    catalogNumber: tool.catalogNumber,
    brand: tool.brand,
    detail: formLabel(tool),
    productLink: tool.productLink,
    icon: <ToolTypeIcon toolType={tool.form} />,
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

const holderLine = (holder: Holder, unit: UnitSystem): Line => {
  const say = (value: number) => formatLength(value, unit)
  return {
    component: 'holder',
    catalogNumber: holder.catalogNumber,
    brand: holder.brand,
    detail: `${holder.taper} · ${holder.clamping}${holder.colletSeries === null ? '' : ` ${holder.colletSeries}`}`,
    productLink: holder.productLink,
    icon: <HolderIcon />,
    geometry: [
      ...stated('gauge', holder.gaugeLength, say),
      ...stated('nose ⌀', holder.noseDiameter, say),
      ...stated('projection', holder.projection, say),
    ],
  }
}

const colletLine = (collet: Collet, unit: UnitSystem): Line => ({
  component: 'collet',
  catalogNumber: collet.catalogNumber,
  brand: collet.brand,
  detail: collet.series,
  productLink: collet.productLink,
  icon: <ColletIcon />,
  // A collet is published as what it grips, never as a shape.
  geometry: [
    {
      label: 'grips',
      value: `${formatLength(collet.clampMin, unit)} – ${formatLength(collet.clampMax, unit)}`,
    },
    ...stated('grip length', collet.clampLength, (value) => formatLength(value, unit)),
  ],
})

/**
 * What a stack is called on the bill: the cutter it is built around.
 *
 * Paul (2026-09-01): the row is a tool with its holding, and the thing somebody
 * looks for in the list is the cutter.
 */
const titleOf = (assembly: OrderAssembly): string =>
  getTool(assembly.choice.toolGuid)?.catalogNumber ?? 'this tool'

/**
 * One component on the bill, resolved through the catalog.
 *
 * The same three builders the assembly view uses, so a component reads the same
 * whichever way the list is being read — and null where the guid no longer
 * resolves, which the row says out loud rather than dropping.
 */
const lineFor = (component: Component, guid: string, unit: UnitSystem): Line | null => {
  if (component === 'tool') {
    const tool = getTool(guid)
    return tool === null ? null : toolLine(tool, unit)
  }
  if (component === 'holder') {
    const holder = getHolder(guid)
    return holder === null ? null : holderLine(holder, unit)
  }
  const collet = getCollet(guid)
  return collet === null ? null : colletLine(collet, unit)
}

/** The columns of the components view, each a way to read the bill. */
const SORTABLE: ReadonlyArray<{
  readonly by: ComponentSort
  readonly label: string
  readonly title: string
}> = [
  { by: 'kind', label: 'Component', title: 'Tools first, then what holds them' },
  { by: 'count', label: 'Order', title: 'How many to order' },
  { by: 'vendor', label: 'Vendor', title: 'Who makes it — one vendor is one order to place' },
  { by: 'part', label: 'Part ID', title: 'The number it is ordered by' },
  { by: 'type', label: 'Type', title: 'What it is' },
]

const SortHeading = ({
  column,
  sort,
  onSort,
}: {
  column: (typeof SORTABLE)[number]
  sort: { readonly by: ComponentSort; readonly descending: boolean }
  onSort: (by: ComponentSort) => void
}) => {
  const here = sort.by === column.by
  return (
    <th
      scope="col"
      // Said to somebody looking at the caret and to somebody who is not.
      aria-sort={here ? (sort.descending ? 'descending' : 'ascending') : 'none'}
      className="px-3 py-1.5 font-semibold"
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
          'inline-flex items-center gap-0.5 rounded transition',
          here ? 'text-info' : 'text-zinc-400 hover:text-zinc-100',
        )}
      >
        {column.label}
        {here ? (
          sort.descending ? (
            <CaretDownIcon aria-hidden="true" />
          ) : (
            <CaretUpIcon aria-hidden="true" />
          )
        ) : null}
      </Button>
    </th>
  )
}

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
  <Input
    id={`quantity-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
    name="quantity"
    type="number"
    inputMode="numeric"
    min={1}
    step={1}
    value={value}
    onValueChange={(next) => onValue(next === null ? 1 : Number(next))}
    aria-label={label}
    variant="ghost"
    size="md"
    textEnd
    className="inline-flex w-14 rounded border border-zinc-700 text-xs text-zinc-100"
  />
)

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
}

const AssemblyHead = ({ tool, features, verb, total, onTotal, onRemove }: AssemblyHead) => (
  <>
    <span className="flex items-center gap-1.5">
      <span className="text-sm break-words text-zinc-200">{tool}</span>
      <IconButton
        size="md"
        variant="muted"
        aria-label={`Remove ${tool} from the order list`}
        title="Remove the whole assembly"
        onClick={onRemove}
        className="focus-visible:ring-danger/60 hover:text-danger shrink-0 rounded p-0.5 text-zinc-600 transition focus-visible:ring-1 focus-visible:outline-none"
      >
        <TrashIcon aria-hidden="true" />
      </IconButton>
    </span>
    <span className="text-2xs block text-zinc-500">
      {verb} {features.join(', ')}
    </span>
    <span className="mt-0.5 flex items-center gap-2">
      <label className="text-2xs flex items-center gap-1 whitespace-nowrap text-zinc-500">
        <span>× total</span>
        <Count value={total} onValue={onTotal} label={`How many of the ${tool} assembly`} />
      </label>
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
  <tr className={cn('align-top', first ? 'border-t border-zinc-600' : 'border-t border-zinc-800')}>
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
          <span className="text-2xs text-zinc-400">= {String(total * quantity)}</span>
        )}
        {/* One component off the assembly, rather than the whole of it. */}
        <IconButton
          size="md"
          variant="muted"
          aria-label={`Remove ${line.catalogNumber} from this assembly`}
          title="Remove this component"
          onClick={onRemove}
          className="focus-visible:ring-danger/60 hover:text-danger shrink-0 rounded p-0.5 text-zinc-600 transition focus-visible:ring-1 focus-visible:outline-none"
        >
          <TrashIcon aria-hidden="true" />
        </IconButton>
      </span>
    </td>
    <td className="text-2xs w-24 px-3 py-1.5 tracking-wide whitespace-nowrap text-zinc-400 uppercase">
      <span className="flex items-center gap-1.5">
        <span className="text-zinc-500">{line.icon}</span>
        {KIND[line.component]}
      </span>
    </td>
    <td className="px-3 py-1.5 text-sm whitespace-nowrap">{line.brand}</td>
    {/*
      **The vendor's page is on the number** (Paul, 2026-09-01: "vendor link
      should be in part ID cell, and we need to make sure it's working"). The
      part number is what somebody orders by and what they look up; a separate
      "Product" column put the link a cell away from the thing it is for.
    */}
    <td className="px-3 py-1.5">
      {line.productLink === null ? (
        <span className="block whitespace-nowrap">{line.catalogNumber}</span>
      ) : (
        <a
          href={line.productLink}
          target="_blank"
          rel="noreferrer noopener"
          title={`${line.catalogNumber} on the vendor's site`}
          className="text-info/90 hover:text-info focus-visible:ring-info/60 inline-flex items-center gap-1 rounded whitespace-nowrap underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:outline-none"
        >
          {line.catalogNumber}
          <ArrowSquareOutIcon aria-hidden="true" />
        </a>
      )}
    </td>
    <td className="w-full px-3 py-1.5 text-sm text-zinc-500">{line.detail}</td>
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
   * The rows the part page built, for the one thing this list cannot read off
   * a feature: what a part-level assembly is called (Paul, 2026-09-08: "it
   * should show the name of the assembly in the order list as well").
   *
   * Read once rather than through `useFeatureList`, because nothing here edits
   * the list — the same store, the same part id, and a part answered in another
   * tab is a reload away either way.
   */
  const list = useMemo(() => readList(globalThis.localStorage ?? null, partId ?? ''), [partId])
  /**
   * What one feature is called on the bill.
   *
   * The kernel's type where the report is still in this browser's session, and
   * the tag where it is not — never a raw id where a name can be had.
   */
  const nameOf = useCallback(
    (tag: string) => features.find((each) => each.featureTag === tag)?.featureType ?? tag,
    [features],
  )

  /**
   * The order list, built from the rows that ordered it.
   *
   * **The same list the parts page draws, by the same function** (Paul,
   * 2026-09-09: "the order list on the parts page and the order list page
   * should show the exact same tools"). It used to walk `sheet.choices`
   * directly, which is the store rather than the list: a line left under one
   * key of a row whose other keys had been cleared showed here and nowhere
   * else, and a key no row stands for showed here as a bill line about nothing.
   * `shared/order-list` § `orderAssemblies` is the one reading now.
   *
   * Two rows that gave the same cutter different holders are still two
   * assemblies, because they are two things to buy and set up.
   */
  const assemblies = useMemo(
    () =>
      orderAssemblies(list, sheet, nameOf).map((stack) => ({ ...stack, title: titleOf(stack) })),
    [list, sheet, nameOf],
  )

  /**
   * The same list added up by component: what to buy, and how many of it.
   *
   * **One component across several assemblies is one order** (Paul, 2026-09-09:
   * "the same component may be used across multiple assemblies, and it should
   * be easy to see how many to order through this view"). Counted over the
   * assemblies above rather than over the sheet, so the two views are the same
   * list added up two different ways.
   */
  /** Which column the components view is read by — `shared/order-list` is the rule. */
  const [sort, setSort] = useState<{ readonly by: ComponentSort; readonly descending: boolean }>({
    by: 'kind',
    descending: false,
  })

  /**
   * What to buy, resolved and in the order the column asks for.
   *
   * Resolved before it is sorted, because a vendor and a type are the
   * catalog's words rather than the sheet's — the same reason the assembly
   * view resolves a line before it draws one.
   */
  const components = useMemo(() => {
    const rows = componentTotals(assemblies, titleOf).map((total) => {
      const line = lineFor(total.component, total.guid, unit)
      return {
        total,
        line,
        component: total.component,
        brand: line?.brand ?? '',
        catalogNumber: line?.catalogNumber ?? '',
        detail: line?.detail ?? '',
        count: total.count,
      }
    })
    return sortComponents(rows, sort.by, sort.descending)
  }, [assemblies, unit, sort])

  /** Which way the list is read: by assembly, or by what the assemblies come to. */
  const [view, setView] = useState<'assembly' | 'components'>('assembly')
  const [fusionDialogOpen, setFusionDialogOpen] = useState(false)

  /**
   * The whole bill as a Fusion library, saved from the browser.
   *
   * Built here rather than on the server because everything it needs is already
   * in this page: the sheet's guids, resolved through the catalog. This route
   * resolves them and nothing more — `shared/fusion-input.ts` turns the records
   * into what the exporter takes and reads its notes back, and the exporter
   * itself is `@toolpath/tool-support/export/fusion`, whose rules come from
   * Autodesk's own schema rather than from anything written here.
   */
  const downloadFusion = async (name: string) => {
    const requests = fusionInput(
      assemblies.flatMap(({ key, choice }) => {
        const tool = getTool(choice.toolGuid)
        if (tool === null) {
          return []
        }
        const holder = choice.holderGuid == null ? null : getHolder(choice.holderGuid)
        return [
          {
            key,
            tool,
            ...(holder === null ? {} : { holder, profile: getProfile(holder.guid) }),
            stickout: choice.stickout,
          },
        ]
      }),
    )
    const { document, notes } = fusionLibrary({
      tools: requests.map((each) => each.request),
    })
    const report = fusionReport(requests, document, notes)
    if (report.exported > 0) {
      saveInBrowser(`${sanitizeName(name)}.json`, fusionLibraryJson(document), 'application/json')
    }
    return report
  }

  return (
    <main className="flex min-h-screen flex-col">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />
      <div className="min-h-0 flex-1 p-3">
        <Card className="flex size-full min-h-0 flex-col overflow-hidden">
          <p className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2 text-sm">
            <span className="text-zinc-200">Order list</span>
            {/* The badge counts what is on screen: assemblies in one view,
                things to buy in the other. */}
            <Badge variant={assemblies.length === 0 ? 'secondary' : 'primary'}>
              {String(view === 'components' ? components.length : assemblies.length)}
            </Badge>
            <span className="text-2xs text-zinc-500">what has been decided for this part</span>
            {/*
              **Two readings of one list** (Paul, 2026-09-09: "in the order list
              page, this can be a button switcher at the top"). Buying is not
              the same reading as planning: the same collet in six stacks is one
              collet to order, and a list that says so six times is a list
              somebody adds up by hand.
            */}
            <span
              role="group"
              aria-label="How the order list is shown"
              className="ml-3 inline-flex items-center gap-0.5 rounded border border-zinc-800 p-0.5"
            >
              {(
                [
                  ['assembly', 'Assemblies', <TreeStructureIcon key="a" aria-hidden="true" />],
                  ['components', 'Components', <ListBulletsIcon key="c" aria-hidden="true" />],
                ] as const
              ).map(([each, label, icon]) => (
                <Button
                  key={each}
                  type="button"
                  variant="muted"
                  size="sm"
                  aria-pressed={view === each}
                  onClick={() => setView(each)}
                  title={
                    each === 'assembly'
                      ? 'The assemblies on the order list, with their components'
                      : 'Every component on the order list, and how many to order'
                  }
                  className={cn(
                    'text-2xs inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold transition',
                    view === each
                      ? 'bg-info/15 text-info'
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200',
                  )}
                >
                  {icon}
                  {label}
                </Button>
              ))}
            </span>
            {assemblies.length === 0 ? null : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFusionDialogOpen(true)}
                title="Every assembly on this bill, as a Fusion tool library"
                className="text-2xs focus-visible:ring-info/60 border-info/40 text-info hover:border-info/70 hover:bg-info/10 ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 font-semibold whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none"
              >
                <DownloadSimpleIcon aria-hidden="true" />
                Export Fusion library
              </Button>
            )}
          </p>
          <div className="min-h-0 flex-1 overflow-auto">
            {assemblies.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">
                Nothing kept yet. Pick a feature on the part, then <em>Add to list</em> on the tool
                that cuts it.
              </p>
            ) : view === 'components' ? (
              /*
                **What to buy, once each** (Paul, 2026-09-09). The assembly view
                answers "how is this feature machined"; this one answers "what
                goes in the basket", and the count is the whole point of it — so
                it is the column beside the component and never a thing to be
                worked out from six rows saying the same holder.

                The counts are editable here and read-only on the parts page
                (Paul, 2026-09-09), and what is edited is the quantity *in one
                assembly*: a collet in three stacks has three numbers behind its
                total, and a single field over them could only guess which of
                the three a shop meant.
              */
              <table className={cn(TABLE_FACE, TABLE_INK, 'w-full border-collapse text-sm')}>
                <caption className="sr-only">
                  Every component on the order list, and how many to order
                </caption>
                <thead>
                  <tr
                    className={cn(
                      SECTION_LABEL,
                      'border-b border-zinc-800 text-left text-zinc-400',
                    )}
                  >
                    {/*
                      **Every column is a way to read it** (Paul, 2026-09-09,
                      of the same view on the part). Buying, the list is walked
                      by vendor, because that is one order to place; checking
                      the crib, by part number; deciding what to buy first, by
                      how many. What is *in* an assembly is a note rather than
                      an axis, so it is the one heading that does not press.
                    */}
                    {SORTABLE.map((column) => (
                      <SortHeading
                        key={column.by}
                        column={column}
                        sort={sort}
                        onSort={(by) =>
                          setSort((current) =>
                            current.by === by
                              ? { by, descending: !current.descending }
                              : { by, descending: opensDescending(by) },
                          )
                        }
                      />
                    ))}
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      In these assemblies
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {components.map(({ total, line }) => {
                    return (
                      <tr
                        key={`${total.component}:${total.guid}`}
                        className="border-t border-zinc-800 align-top"
                      >
                        <th
                          scope="row"
                          className="text-2xs w-28 px-3 py-1.5 text-left font-normal tracking-wide whitespace-nowrap text-zinc-400 uppercase"
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-zinc-500">{line?.icon}</span>
                            {KIND[total.component]}
                          </span>
                        </th>
                        {/*
                          **One number, edited once** (Paul, 2026-09-09: "we
                          don't need individual quantity edits per assembly. The
                          total quantity should be shown once and editable, the
                          assemblies are just for reference in this view"). The
                          sheet keeps a quantity per assembly, so the change
                          lands on the first of them and the rest stay as the
                          assembly view left them — `setComponentCount` in
                          `shared/order-list.ts` is the rule, tested there.
                        */}
                        <td className="w-24 px-3 py-1.5">
                          <Count
                            value={total.count}
                            onValue={(many) => commit(setComponentCount(sheet, total, many))}
                            label={`How many ${line?.catalogNumber ?? KIND[total.component]} to order`}
                          />
                        </td>
                        {line === null ? (
                          <td colSpan={4} className="text-2xs text-danger px-3 py-2">
                            no longer in the catalog
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-1.5 text-sm whitespace-nowrap text-zinc-300">
                              {line.brand}
                            </td>
                            <td className="px-3 py-1.5">
                              {line.productLink === null ? (
                                <span className="block whitespace-nowrap">
                                  {line.catalogNumber}
                                </span>
                              ) : (
                                <a
                                  href={line.productLink}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  title={`${line.catalogNumber} on the vendor's site`}
                                  className="text-info/90 hover:text-info focus-visible:ring-info/60 inline-flex items-center gap-1 rounded whitespace-nowrap underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:outline-none"
                                >
                                  {line.catalogNumber}
                                  <ArrowSquareOutIcon aria-hidden="true" />
                                </a>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-sm text-zinc-400">{line.detail}</td>
                            {/* Reference, not a second place to edit: what the
                                number above is made of, in the words the list
                                calls each stack. */}
                            <td className="text-2xs w-full px-3 py-1.5 text-zinc-400">
                              {total.uses
                                .map((use) =>
                                  use.total === 1
                                    ? use.title
                                    : `${use.title} ×${String(use.total)}`,
                                )
                                .join(', ')}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className={cn(TABLE_FACE, TABLE_INK, 'w-full border-collapse text-sm')}>
                <caption className="sr-only">Everything kept for this part</caption>
                <thead>
                  <tr
                    className={cn(
                      SECTION_LABEL,
                      'border-b border-zinc-800 text-left text-zinc-400',
                    )}
                  >
                    <th scope="col" className="px-3 py-1.5 font-semibold">
                      Tool
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
                  </tr>
                </thead>
                <tbody>
                  {assemblies.flatMap(
                    ({ key, choice, rows: machines, keys, ids, featureless, title }) => {
                      const tool = getTool(choice.toolGuid) ?? undefined
                      const holder =
                        choice.holderGuid == null
                          ? undefined
                          : (getHolder(choice.holderGuid) ?? undefined)
                      const collet =
                        choice.colletGuid == null
                          ? undefined
                          : (getCollet(choice.colletGuid) ?? undefined)
                      /**
                       * A control on the group writes to every feature it is
                       * kept for: one assembly, one count, however many
                       * features it machines.
                       */
                      const across = (
                        change: (sheetSoFar: SetupSheet, tag: string, id: string) => SetupSheet,
                      ) =>
                        commit(
                          keys.reduce(
                            (soFar, tag) => ids.reduce((held, id) => change(held, tag, id), soFar),
                            sheet,
                          ),
                        )
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
                        /*
                        **A part-level assembly machines nothing** (Paul,
                        2026-09-08). Its note is what it is *for* — the name the
                        shop gave the stack — and "machines Facing stack" is a
                        sentence about a feature that does not exist.
                      */
                        verb: featureless ? 'for' : 'machines',
                        features: machines,
                        total: totalOf(choice),
                        onTotal: (many: number) =>
                          across((sheetSoFar, tag, id) => setTotal(sheetSoFar, tag, id, many)),
                        onRemove: () =>
                          across((sheetSoFar, tag, id) => removeChoice(sheetSoFar, tag, id)),
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
                            across((sheetSoFar, tag, id) =>
                              setQuantity(sheetSoFar, tag, id, line.component, many),
                            )
                          }
                          onRemove={() =>
                            across((sheetSoFar, tag, id) => {
                              if (line.component === 'tool') {
                                return removeChoice(sheetSoFar, tag, id)
                              }
                              /*
                                The line as this feature holds it, rather than
                                the one the assembly was drawn from: a stack
                                ordered by two rows is one row here and two
                                lines on the sheet, and writing one of them back
                                under the other's key would leave that feature
                                holding a line belonging to a stack of another.
                              */
                              const had = lineUnder(sheetSoFar, tag, id)
                              return had === null
                                ? sheetSoFar
                                : addChoice(sheetSoFar, tag, {
                                    ...had,
                                    ...(line.component === 'holder'
                                      ? { holderGuid: undefined, colletGuid: undefined }
                                      : { colletGuid: undefined }),
                                  })
                            })
                          }
                        />
                      ))
                    },
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
      {fusionDialogOpen ? (
        <FusionExportDialog
          initialName="tool-library"
          onCancel={() => setFusionDialogOpen(false)}
          onExport={downloadFusion}
        />
      ) : null}
    </main>
  )
}

export default Bom
