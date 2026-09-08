import { PlusIcon, TrashIcon, WarningIcon, XIcon } from '@phosphor-icons/react'
import { Button, IconButton, cn } from '@toolpath/ui'
import {
  SLOTS,
  assemblyName,
  guidAt,
  isEmpty,
  sameNode,
  slotLabel,
  stacksOf,
  treeGroups,
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
   * Why this slot holds something the rules turned down, or null where nothing
   * is wrong with it.
   *
   * **A choice made against the rules has to say so where the choice is**
   * (Paul, 2026-09-08: "a small warning should show in the tree denoting that I
   * chose a geometrically incompatible tool"). The table below is where the
   * rules are argued with — a widened filter, a red column, a row picked
   * anyway — and that argument is over the moment the list is narrowed again.
   * The stack is what survives it, so the stack is where the warning belongs.
   *
   * The route resolves the words, off `TreeAssembly.overrides` and whatever the
   * matcher can still say about the tool; this draws what comes back.
   */
  readonly warningFor: (assembly: TreeAssembly, slot: Slot) => string | null
  /**
   * What this stack offers, drawn under the components it is about.
   *
   * **One button for the full assembly, and its label is the change** (Paul,
   * 2026-09-08: "there should only be one 'add to order list' button for the
   * full assembly"). It is handed every stack of the group — a tap and the
   * drill under it are one thing to order — and the rule is
   * `shared/assembly-actions` `groupActions`; the route resolves the names and
   * does the writing, and this draws what comes back.
   */
  readonly actionsFor: (stacks: ReadonlyArray<TreeAssembly>) => ReadonlyArray<AssemblyRowAction>
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
  warning,
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
  /** Why the rules turned this choice down, where somebody made it anyway. */
  warning: string | null
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
      {/*
        The row that heads a stack is the tool, and it reads as the head: the
        holding under it is what it is held by, not two more things of the same
        rank (Paul, 2026-09-08).
      */}
      <span
        className={cn(
          'w-14 shrink-0 font-semibold tracking-wide',
          slot === 'tool' ? 'text-zinc-300' : 'text-zinc-500',
        )}
      >
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
      {/*
        **Small, and on the row it is about.** The rules are advice a shop is
        allowed to overrule, so this is a caution rather than a fault: one glyph
        in the colour the page already uses for "allowed, and here is what you
        allowed", with the rule's own sentence behind it on hover.
      */}
      {warning === null ? null : (
        <span
          role="img"
          aria-label={`Overrides the rules: ${warning}`}
          title={warning}
          className="shrink-0 text-amber-400"
        >
          <WarningIcon aria-hidden="true" className="size-3" weight="fill" />
        </span>
      )}
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

/** The two slots a tool is held by, drawn under the tool rather than beside it. */
const HOLDING: ReadonlyArray<Slot> = SLOTS.filter((slot) => slot !== 'tool')

/**
 * One stack: the tool, and the holding indented under it.
 *
 * **The levels have to be told apart** (Paul, 2026-09-08: "it needs to be clear
 * that the tap holder and tap collet go with the tap, and the drill is separate
 * from them and has sublevels"). Six rows at one indent read as six things of
 * equal rank, so a tap's holder and a drill sat at the same distance from the
 * left as the drill itself. The holding hangs off the tool it holds, behind a
 * rule that says so, and the tap and the drill are drawn by this one function
 * so the two can never be indented differently.
 */
const StackRows = ({
  assembly,
  selected,
  labelFor,
  orderedFor,
  warningFor,
  onSelect,
  onClear,
}: {
  assembly: TreeAssembly
  selected: TreeNode | null
  labelFor: (assembly: TreeAssembly, slot: Slot) => string | null
  orderedFor: (assembly: TreeAssembly, slot: Slot) => string | null
  warningFor: (assembly: TreeAssembly, slot: Slot) => string | null
  onSelect: (node: TreeNode) => void
  onClear: (assemblyId: string, slot: Slot) => void
}) => {
  const rowFor = (slot: Slot) => (
    <SlotRow
      key={slot}
      assembly={assembly}
      slot={slot}
      selected={sameNode(selected, { assemblyId: assembly.id, slot })}
      label={guidAt(assembly, slot) === null ? null : labelFor(assembly, slot)}
      ordered={orderedFor(assembly, slot)}
      warning={guidAt(assembly, slot) === null ? null : warningFor(assembly, slot)}
      onSelect={() => onSelect({ assemblyId: assembly.id, slot })}
      onClear={() => onClear(assembly.id, slot)}
    />
  )

  return (
    <div className="flex flex-col gap-1">
      {rowFor('tool')}
      <div className="ml-3 flex flex-col gap-1 border-l border-zinc-800 pl-2">
        {HOLDING.map(rowFor)}
      </div>
    </div>
  )
}

export const AssemblyTreePanel = ({
  assemblies,
  selected,
  onSelect,
  labelFor,
  orderedFor,
  warningFor,
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

    {treeGroups(assemblies).map((group) => {
      const stacks = stacksOf(group)
      const index = assemblies.indexOf(group.root)
      return (
        <div key={group.root.id} className="rounded border border-zinc-800">
          <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1">
            <span className="text-2xs flex-1 font-semibold tracking-wide text-zinc-400 uppercase">
              {/*
                `assemblyName` rather than a name invented here: a table row badges
                a component with the stack it is standing in, and two places
                naming the same stack is how those two end up disagreeing.
              */}
              {assemblyName(assemblies, group.root)}
            </span>
            {/*
              **The trash takes the whole assembly** (Paul, 2026-09-08). A tap
              removed on its own leaves a drill hanging under nothing, which the
              next read makes a stack of its own: a hole drilled for a thread
              nobody is cutting.
            */}
            {treeGroups(assemblies).length > 1 || !stacks.every(isEmpty) ? (
              <IconButton
                variant="muted"
                size="sm"
                aria-label={`Remove assembly ${String(index + 1)}`}
                title="Remove this assembly"
                onClick={() => onRemove(group.root.id)}
                className="!size-5 border-0 bg-transparent text-zinc-600 hover:text-danger [&_svg]:!size-3"
              >
                <TrashIcon aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 p-1">
            <StackRows
              assembly={group.root}
              selected={selected}
              labelFor={labelFor}
              orderedFor={orderedFor}
              warningFor={warningFor}
              onSelect={onSelect}
              onClear={onClear}
            />

            {/*
              **The drill is a branch of the tap, not a fourth slot of it**
              (Paul, 2026-09-08: "the drill is separate from them and has
              sublevels", and 2026-09-07: "Second Level: Tap Drill / Third Level
              (under Tap Drill): Drill Holder"). It starts where the tap's
              holding starts, because which drill to run follows from which tap
              was chosen — and it is boxed, because everything inside it is the
              drill's rather than the tap's, which one more indent on its own
              was not enough to say.
            */}
            {group.under.map((child) => (
              <div
                key={child.id}
                data-assembly-branch={child.id}
                className="ml-3 rounded border border-zinc-800/80 bg-zinc-900/40 p-1"
              >
                <StackRows
                  assembly={child}
                  selected={selected}
                  labelFor={labelFor}
                  orderedFor={orderedFor}
                  warningFor={warningFor}
                  onSelect={onSelect}
                  onClear={onClear}
                />
              </div>
            ))}

            {/*
              **One press for the whole assembly** (Paul, 2026-09-08: "there
              should only be one 'add to order list' button for the full
              assembly"). Every component of it — the tap, its holding, the
              drill under it and its holding — is one thing a shop orders, and
              a tap orderable without the hole it threads is half a decision.

              Under the components rather than in the header: it is a sentence
              about all of them, and it is as wide as the sentence needs.
            */}
            {actionsFor(stacks).map((action) => (
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
