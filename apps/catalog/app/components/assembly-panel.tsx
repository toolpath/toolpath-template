import type { ReactNode } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Badge, cn } from '@toolpath/ui'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import {
  columnsFor,
  familyLabel,
  formatValue,
  holderTypeLabel,
  colletTypeLabel,
  valueOf,
  type ComponentKind,
} from 'shared/component-columns'
import type { Slot } from 'shared/assembly-tree'

/**
 * The stack being built, and the component being read.
 *
 * **Every component of an assembly is confirmed in this panel** (Paul,
 * 2026-09-07: "the components of the tool assembly are selected in the table and
 * confirmed in the right hand panel"). The table is where a holder is picked out
 * of a hundred; this is where it is looked at next to the tool it will hold and
 * the part it has to clear, which is the only place the decision is actually
 * made.
 *
 * The tool's own reading is unchanged and still `<ToolDetails>` — handed in as
 * `toolDetails` rather than rebuilt here, because that panel already carries
 * fifteen props' worth of wiring the route holds and nothing about it changed.
 * What is new is that a holder and a collet get the same treatment, which they
 * have never had: the stack drawn as far as it has been chosen, and the fields
 * the vendor published under it.
 *
 * **The stack is listed once, and the tree is where** (Paul, 2026-09-07: "I
 * don't need to see the component list in both the tree and right hand panel").
 * This panel used to repeat the three slots as a strip of its own, which put two
 * component lists a table apart, each of them selectable — so the same fact had
 * two places to be read from and two places to be clicked. The tree is the one
 * that owns it; what is left here is the reading of whichever slot the tree has
 * open, and a button that says what confirming it would change.
 */

export interface AssemblyPanelProps {
  readonly tool: CatalogTool | null
  readonly holder: Holder | null
  readonly collet: Collet | null
  /** Which slot of the tree is open — what this panel is a reading of. */
  readonly selected: Slot
  readonly unit: UnitSystem
  /**
   * `<ToolDetails>` for the tool in this assembly, given what to put under its
   * drawing.
   *
   * **One view, and only the details change** (Paul, 2026-09-07). A render prop
   * rather than an element, because the panel owns what a holder and a collet
   * read as and the route owns the fifteen props that panel already takes —
   * neither has to learn the other's half.
   */
  readonly toolDetails?: (details: ReactNode) => ReactNode
  /** Why there is nothing to confirm yet, where there is a reason worth saying. */
  readonly notice?: string | null
}

/** What a vendor published about one holder or collet, every field of it. */
const ComponentFacts = ({
  kind,
  record,
  unit,
}: {
  kind: ComponentKind
  record: Holder | Collet
  unit: UnitSystem
}) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-zinc-100">{record.catalogNumber}</p>
        <p className="truncate text-xs text-zinc-400">
          {kind === 'holder'
            ? holderTypeLabel(record as Holder)
            : colletTypeLabel(record as Collet)}
        </p>
      </div>
      {record.productLink === null ? null : (
        <a
          href={record.productLink}
          target="_blank"
          rel="noreferrer noopener"
          className="flex shrink-0 items-center gap-1 text-xs text-info"
        >
          Vendor
          <ArrowSquareOutIcon className="size-3" />
        </a>
      )}
    </div>
    <div className="flex flex-wrap gap-1">
      <Badge variant="secondary">{record.brand}</Badge>
      <Badge variant="secondary">{familyLabel(record.familyId)}</Badge>
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {columnsFor(kind).map((column) => {
        const value = valueOf(kind, record, column.code)
        return (
          <div key={column.code} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-zinc-500">{column.label}</dt>
            <dd
              className={cn(
                'shrink-0 font-mono',
                value === null ? 'text-zinc-600' : 'text-zinc-200',
              )}
            >
              {formatValue(value, column.kind, unit)}
            </dd>
          </div>
        )
      })}
    </dl>
  </div>
)

export const AssemblyPanel = ({
  tool,
  holder,
  collet,
  selected,
  unit,
  toolDetails,
  notice = null,
}: AssemblyPanelProps) => {
  /**
   * The column under the drawing: the component the tree has open.
   *
   * `undefined` for the tool, which is `<ToolDetails>` reading its own numbers —
   * the eight a cutter is chosen on, with their provenance and the hover that
   * lights the dimension line.
   */
  const facts: ReactNode =
    selected === 'tool' ? undefined : selected === 'holder' ? (
      holder === null ? (
        <p className="p-2 text-center text-xs text-zinc-500">
          Pick a holder in the table to read it here.
        </p>
      ) : (
        <ComponentFacts kind="holder" record={holder} unit={unit} />
      )
    ) : collet === null ? (
      <p className="p-2 text-center text-xs text-zinc-500">
        Pick a collet in the table to read it here.
      </p>
    ) : (
      <ComponentFacts kind="collet" record={collet} unit={unit} />
    )

  return (
    /*
      **A full-height column, and every child says whether it stretches.**
      `<ToolDetails>` is `h-full min-h-0` and the drawing inside it takes the
      room left over — and `orientationFor` reads the box it ends up with, so a
      parent of no stated height collapses that box and the tool is drawn lying
      on its side (2026-09-07). Height here is not styling; it is what decides
      which way the cutter points.
    */
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      {/*
        **The stack is confirmed in the tree, not here** (Paul, 2026-09-07:
        "move the confirmation of adding a tool tree component to a feature to
        the feature dialog … a check mark icon next to the component in the
        list"). This panel had the row of buttons that wrote the bill — add,
        update, cancel, remove — each of them a sentence about a stack drawn
        somewhere else on the page. The tick is beside the component it is
        about, so what is left here is the reading and, where a stack cannot be
        confirmed at all, why.
      */}
      {notice === null || tool === null ? null : (
        <p className="shrink-0 rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-500">
          {notice}
        </p>
      )}

      {/*
        **The same sheet, whichever component is being read.** `<ToolDetails>`
        owns the drawing and the press that frames it; what changes with the
        tree's selection is the column under it. A second drawing for the
        holder is what this replaces — it came out lying on its side, and it
        took the press away the moment somebody looked at a holder.
      */}
      {tool !== null && toolDetails !== undefined ? (
        <div className="min-h-0 flex-1">{toolDetails(facts)}</div>
      ) : (
        <>
          <p className="shrink-0 rounded border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
            {/*
              Nothing to draw without a cutter: `@toolpath/tool-drawing` draws a
              tool and what holds it, and a holder on its own is a picture the
              package does not offer. Saying so beats an empty frame — and the
              component's own numbers are still read below.

              **Said once** (Paul, 2026-09-11). `nothingToConfirm` asks for the
              same tool in the same words, so a holder with no cutter carried
              two notices stacked on each other — the reason the frame is empty
              and the reason nothing can be ordered are one sentence. Where
              there is a notice it fills this frame and the strip above goes.
            */}
            {notice ?? 'Choose a tool to draw the assembly.'}
          </p>
          <div className="min-h-0 flex-1 overflow-auto">{facts}</div>
        </>
      )}
    </div>
  )
}
