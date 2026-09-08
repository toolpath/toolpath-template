import { PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import { Button, IconButton, cn } from '@toolpath/ui'
import {
  SLOTS,
  assemblyName,
  guidAt,
  isEmpty,
  sameNode,
  slotLabel,
  treeRows,
  type Slot,
  type TreeAssembly,
  type TreeNode,
} from 'shared/assembly-tree'

/**
 * The stacks a feature is answered with, as a tree beside the tool table.
 *
 * **A tool assembly is the unit, not a tool** (Paul, 2026-09-07). The page asked
 * "which tool cuts this" and hung a holder and a collet off the answer as
 * dropdowns; the tree asks the same question as three of equal rank, and asks it
 * as many times as the feature needs — twice by default on a threaded hole,
 * which is the only honest opening position for a hole that is drilled and then
 * tapped.
 *
 * It draws and reports; every rule about what a tree holds is in
 * `shared/assembly-tree.ts` and what a stack offers is in
 * `shared/assembly-actions.ts`, both tested there. A press here is one call to
 * `setSlot`, `addAssembly`, `removeAssembly`, or one of the actions handed in.
 */

/** One press a stack offers, as `shared/assembly-actions` describes it. */
export interface AssemblyRowAction {
  readonly key: string
  readonly label: string
  readonly onClick: () => void
  readonly danger?: boolean
  /** The way back, drawn quietly beside the press that goes forward. */
  readonly quiet?: boolean
  /** What else the press changes, said under it before it is pressed. */
  readonly note?: string
}

export interface AssemblyTreePanelProps {
  readonly assemblies: ReadonlyArray<TreeAssembly>
  readonly selected: TreeNode | null
  readonly onSelect: (node: TreeNode) => void
  /** What a slot holds, in words — the catalog number, resolved by the route. */
  readonly labelFor: (assembly: TreeAssembly, slot: Slot) => string | null
  /**
   * What the order list holds in a slot, where that differs from what the slot
   * holds now — and null where there is nothing to say.
   *
   * Read from the bill by the route, so the row and the button under it cannot
   * disagree about what the change is.
   */
  readonly orderedFor: (assembly: TreeAssembly, slot: Slot) => string | null
  readonly onClear: (assemblyId: string, slot: Slot) => void
  /**
   * What this stack offers, drawn under the components it is about.
   *
   * **One button per assembly, and its label is the change** (Paul, 2026-09-07:
   * "I should just have an 'add to order list' button (or update, context
   * aware), at the top level of each tool assembly"). The rule is
   * `shared/assembly-actions`; the route resolves the names and does the
   * writing, and this draws what comes back.
   */
  readonly actionsFor: (assembly: TreeAssembly) => ReadonlyArray<AssemblyRowAction>
  readonly onAdd: () => void
  readonly onRemove: (assemblyId: string) => void
  /** What the tree is for, drawn above it. */
  readonly title: string
  /**
   * Whether the feature this answers is a row on the list yet.
   *
   * **A stack built for a feature that does not exist has to say so** (Paul,
   * 2026-09-07). Everything here is being tried and nothing is on a feature
   * until a tick says so, and a tree that looks identical either way is one
   * somebody reads as already done.
   */
  readonly confirmed?: boolean
}

const SlotRow = ({
  assembly,
  slot,
  selected,
  label,
  ordered,
  onSelect,
  onClear,
}: {
  assembly: TreeAssembly
  slot: Slot
  selected: boolean
  label: string | null
  /**
   * What the order list holds in this slot, where that is not what the slot
   * holds now — and null where there is nothing to say.
   */
  ordered: string | null
  onSelect: () => void
  onClear: () => void
}) => (
  <div
    className={cn(
      'group flex items-center gap-2 rounded px-2 py-1 text-left text-xs',
      selected ? 'bg-primary/15 ring-1 ring-primary/50' : 'hover:bg-zinc-900',
    )}
  >
    <Button
      type="button"
      variant="muted"
      size="sm"
      aria-current={selected ? 'true' : undefined}
      aria-label={`${slotLabel(assembly, slot)} for ${assembly.id}`}
      onClick={onSelect}
      className="flex min-w-0 flex-1 items-center justify-start gap-2 border-0 bg-transparent px-0 py-0 text-xs hover:bg-transparent"
    >
      {/*
        Filled or not, in one glyph. A slot nobody has answered is the question
        the table below is a list for, so it has to read as empty from across
        the screen rather than as a row with a dash in it.
      */}
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          label === null ? 'border border-zinc-600' : 'bg-emerald-400',
        )}
      />
      <span className="w-14 shrink-0 font-semibold tracking-wide text-zinc-500">
        {slotLabel(assembly, slot)}
      </span>
      {/*
        **A change shows on the row it is a change to** (Paul, 2026-09-07: "when
        I make changes, they should show in the respective component rows (like
        tool x -> tool y)"). The button under the stack names the change too, but
        it names one of them — the row is where somebody looks to see *which*
        slot moved, and it said only what the slot holds now.
      */}
      {ordered === null ? null : (
        <>
          <span className="truncate font-mono text-zinc-500 line-through" title={ordered}>
            {ordered}
          </span>
          <span aria-hidden="true" className="shrink-0 text-zinc-600">
            →
          </span>
        </>
      )}
      <span
        className={cn(
          'truncate font-mono',
          label === null ? 'text-zinc-600' : ordered === null ? 'text-zinc-200' : 'text-amber-300',
        )}
        title={label ?? undefined}
      >
        {label ?? '—'}
      </span>
    </Button>
    {label === null ? null : (
      <IconButton
        variant="muted"
        size="sm"
        aria-label={`Clear the ${slotLabel(assembly, slot).toLowerCase()}`}
        title="Clear this choice"
        onClick={onClear}
        className="!size-5 shrink-0 border-0 bg-transparent text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300 [&_svg]:!size-3"
      >
        <XIcon aria-hidden="true" />
      </IconButton>
    )}
  </div>
)

export const AssemblyTreePanel = ({
  assemblies,
  selected,
  onSelect,
  labelFor,
  orderedFor,
  onClear,
  actionsFor,
  onAdd,
  onRemove,
  title,
  confirmed = true,
}: AssemblyTreePanelProps) => (
  <div
    data-assembly-tree
    /*
      **It fills the panel it is in** (Paul, 2026-09-07: "moving the tool tree
      to the feature panel"). It was a fixed column with a rule down its right
      edge, because it stood inside the tool table's scroll area; in the box
      beside the feature list it is the width of that box, and the box owns the
      scroll — a second one inside it hides half a stack behind a bar nobody
      expects.
    */
    className="flex w-full min-w-0 flex-col gap-2 border-t border-zinc-800 pt-2"
  >
    <div className="pb-1">
      <p className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
        Tool assemblies
      </p>
      <p className="truncate text-xs text-zinc-300" title={title}>
        {title}
      </p>
      {confirmed ? null : <p className="text-2xs text-amber-300">not on the list yet</p>}
    </div>

    {treeRows(assemblies).map(({ assembly, depth }) => {
      const index = assemblies.indexOf(assembly)
      return (
        <div
          key={assembly.id}
          /*
          **A drill hangs under the tap it predrills** (Paul, 2026-09-07). Two
          bordered cards side by side say the tap and the drill are two answers
          of equal rank; the thread is the decision and the hole under it
          follows from which tap was chosen, so the drill is indented into it
          and carries its own holder and collet at the depth below that.
        */
          className={cn('rounded border border-zinc-800', depth > 0 ? 'ml-3' : '')}
        >
          <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1">
            <span className="text-2xs flex-1 font-semibold tracking-wide text-zinc-400 uppercase">
              {/*
              `assemblyName` rather than a name invented here: a table row badges
              a component with the stack it is standing in, and two places
              naming the same stack is how those two end up disagreeing.
            */}
              {assemblyName(assemblies, assembly)}
            </span>
            {assemblies.length > 1 || !isEmpty(assembly) ? (
              <IconButton
                variant="muted"
                size="sm"
                aria-label={`Remove assembly ${String(index + 1)}`}
                title="Remove this assembly"
                onClick={() => onRemove(assembly.id)}
                className="!size-5 border-0 bg-transparent text-zinc-600 hover:text-danger [&_svg]:!size-3"
              >
                <TrashIcon aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 p-1">
            {SLOTS.map((slot) => (
              <SlotRow
                key={slot}
                assembly={assembly}
                slot={slot}
                selected={sameNode(selected, { assemblyId: assembly.id, slot })}
                label={guidAt(assembly, slot) === null ? null : labelFor(assembly, slot)}
                ordered={orderedFor(assembly, slot)}
                onSelect={() => onSelect({ assemblyId: assembly.id, slot })}
                onClear={() => onClear(assembly.id, slot)}
              />
            ))}

            {/*
              **What this stack would put on the order list, and what it would
              change** (Paul, 2026-09-07: "I should just have an 'add to order
              list' button (or update, context aware), at the top level of each
              tool assembly"). One press for the assembly rather than one per
              component: the tool, the holder and the collet are one line on the
              sheet and one thing a shop orders.

              Under the components rather than in the header: it is a sentence
              about all three, and it is as wide as the sentence needs.
            */}
            {actionsFor(assembly).map((action) => (
              <div key={action.key} className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    action.danger === true || action.quiet === true ? 'secondary' : 'primary'
                  }
                  onClick={action.onClick}
                  className={cn(
                    'w-full justify-center text-xs',
                    action.danger === true ? 'text-danger' : '',
                  )}
                >
                  {action.label}
                </Button>
                {/*
                  **What else the press moves is said before it is pressed.** A
                  holder change takes the collet with it, and a button that drops
                  one somebody chose without a word is the defect this line
                  exists to prevent.
                */}
                {action.note === undefined ? null : (
                  <p className="text-2xs text-amber-300">{action.note}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    })}

    {/*
      **Another stack is always one press away** (Paul, 2026-09-07, on the
      "multiple tools for one feature" question). A pocket is a rougher and a
      finisher, and the page had no way to say so at all.
    */}
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onAdd}
      className="justify-center gap-1 text-xs"
    >
      <PlusIcon className="size-3" />
      Add assembly
    </Button>
  </div>
)
