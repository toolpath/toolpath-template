import { labelOf, sheetKeysOf, type ListItem } from './feature-list'
import {
  choicesFor,
  clearChoice,
  quantityOf,
  setQuantity,
  totalOf,
  type Choice,
  type Component,
  type SetupSheet,
} from './setup-sheet'

/**
 * What is on the order list, said once for both places that show it.
 *
 * **The two lists disagreed** (Paul, 2026-09-09: "the order list on the parts
 * page and the order list page should show the exact same tools … I can
 * sometimes trigger something being shown on one list after removing it from
 * either/or"). They were two readings of one store, and neither of them read it
 * the way it was written:
 *
 * - A row's lines are written under **every** key the row stands for — eight
 *   holes of a bolt circle are eight keys — and the part page read `keys[0]`
 *   while the order-list page read every key there was. A line that reached
 *   only some of them showed on one page and not the other.
 * - Taking a row off cleared one key per *distinct* feature, which for a bolt
 *   circle is one key out of eight. The part page then showed nothing and the
 *   order-list page went on showing the assembly, because seven keys still held
 *   it.
 *
 * So reading, writing and clearing are one set of functions here, over
 * `sheetKeysOf` — the same keys in all three — and both pages build their rows
 * from {@link orderAssemblies}.
 *
 * Pure, and knows nothing about the catalog: a line is guids, and resolving one
 * is the page's job (Justin Gray's rule that a reference lives, kept since
 * 2026-08-10).
 */

/**
 * Every line kept under a set of keys, once.
 *
 * A row writes the same line under each of its keys, so the union is what the
 * row holds and the duplicate is the storage rather than a second order. Keyed
 * by tool, which is what the sheet keys a line by.
 */
export const linesOf = (sheet: SetupSheet, keys: ReadonlyArray<string>): Array<Choice> => {
  const byTool = new Map<string, Choice>()
  for (const key of keys) {
    for (const line of choicesFor(sheet, key)) {
      if (!byTool.has(line.toolGuid)) {
        byTool.set(line.toolGuid, line)
      }
    }
  }
  return [...byTool.values()]
}

/** What a row holds on the order list — its keys read together. */
export const linesFor = (sheet: SetupSheet, item: ListItem): Array<Choice> =>
  linesOf(sheet, sheetKeysOf(item))

/** Whether a row has anything on the order list at all. */
export const isOrdered = (sheet: SetupSheet, item: ListItem): boolean =>
  linesFor(sheet, item).length > 0

/**
 * Every key cleared, not the first of them.
 *
 * The one thing `unbill` got wrong: a row's lines live under every key it
 * stands for, so taking the row off has to reach all of them.
 */
export const clearKeys = (sheet: SetupSheet, keys: ReadonlyArray<string>): SetupSheet =>
  keys.reduce((current, key) => clearChoice(current, key), sheet)

/**
 * Whether a row is on the list with nothing ordered against it.
 *
 * **A feature can be flagged before it is answered** (Paul, 2026-09-10: "I
 * should be able to create a feature or group without adding a tool … a feature
 * or group that I flagged to do something with but haven't added a tool assembly
 * to yet"), which reverses the rule of 2026-09-09 that a row with no lines was
 * not a row at all.
 *
 * That rule was right about the thing underneath it and wrong about the cure: a
 * row with no lines was being *answered with the rules' own recommendation*,
 * which reads exactly like an order and is not one, so the page showed a tool
 * the order-list page had never heard of. Dropping the row made that impossible;
 * so does saying what the row is. It is marked incomplete, drawn dashed, and
 * answered with nothing at all — `routes/part.tsx` asks the matcher no question
 * about a row nobody has ordered for, which is what keeps a recommendation from
 * ever standing where an order goes.
 */
export const isIncomplete = (sheet: SetupSheet, item: ListItem): boolean => !isOrdered(sheet, item)

/**
 * One stack on the order list: a tool with its holding, and the rows that
 * ordered it.
 *
 * **Two rows that ordered the same stack are one thing to buy** (Paul,
 * 2026-08-31: "the tool assembly is the important thing, the geometry it
 * machines is just a useful note"), so the key is the assembly and the rows it
 * answers are the note. Two rows that gave one cutter different holders are two
 * assemblies, because they are two things to set up.
 */
export interface OrderAssembly {
  /** Unique on the list: the tool with its holding. */
  readonly key: string
  readonly choice: Choice
  /** The rows that ordered it, in the words the list calls them. */
  readonly rows: ReadonlyArray<string>
  /** Every sheet key it is kept under, which is what a control on it writes to. */
  readonly keys: ReadonlyArray<string>
  /** Whether every row that ordered it answers no feature. */
  readonly featureless: boolean
}

const assemblyKey = (choice: Choice): string =>
  `${choice.toolGuid}|${choice.holderGuid ?? ''}|${choice.colletGuid ?? ''}`

/**
 * The order list, built from the feature list.
 *
 * **The list drives everything** (Paul, 2026-09-02), so a line reaches the bill
 * because a row put it there and is read back through that row — which is what
 * makes the two pages the same list rather than two readings of a store.
 */
export const orderAssemblies = (
  list: ReadonlyArray<ListItem>,
  sheet: SetupSheet,
  nameOf: (tag: string) => string,
): Array<OrderAssembly> => {
  const stacks = new Map<
    string,
    { choice: Choice; rows: Array<string>; keys: Array<string>; featureless: boolean }
  >()
  for (const item of list) {
    const row = labelOf(item, nameOf)
    const keys = sheetKeysOf(item)
    for (const choice of linesOf(sheet, keys)) {
      const key = assemblyKey(choice)
      const had = stacks.get(key)
      if (had === undefined) {
        stacks.set(key, {
          choice,
          rows: [row],
          keys: [...keys],
          featureless: item.kind === 'assembly',
        })
        continue
      }
      if (!had.rows.includes(row)) {
        had.rows.push(row)
      }
      for (const each of keys) {
        if (!had.keys.includes(each)) {
          had.keys.push(each)
        }
      }
      had.featureless = had.featureless && item.kind === 'assembly'
    }
  }
  return [...stacks].map(([key, stack]) => ({ key, ...stack }))
}

/**
 * One thing to buy, and how many of it.
 *
 * **The same component across several assemblies is one order** (Paul,
 * 2026-09-09: "the same component may be used across multiple assemblies, and
 * it should be easy to see how many to order through this view"). One holder
 * answering four features is one holder to buy, and a list that says so four
 * times is a list somebody adds up by hand.
 */
export interface ComponentTotal {
  readonly component: Component
  readonly guid: string
  /** Every assembly it is in, and what each of them asks for. */
  readonly uses: ReadonlyArray<ComponentUse>
  /** What the uses come to: how many to order. */
  readonly count: number
}

export interface ComponentUse {
  /** The assembly, by the key {@link orderAssemblies} gave it. */
  readonly key: string
  /** What that assembly is called, for the row to name it. */
  readonly title: string
  /** How many of this component that assembly holds, per assembly. */
  readonly quantity: number
  /** How many of that assembly, which multiplies the quantity. */
  readonly total: number
  /** The sheet keys the assembly is kept under, for a control to write to. */
  readonly keys: ReadonlyArray<string>
  /** The tool the line is keyed by, which is how a control finds it again. */
  readonly toolGuid: string
}

/** Tools first, then what holds them: a bill is read in the order it is built. */
const ORDER: Readonly<Record<Component, number>> = { tool: 0, holder: 1, collet: 2 }

const guidIn = (choice: Choice, component: Component): string | undefined =>
  component === 'tool'
    ? choice.toolGuid
    : component === 'holder'
      ? choice.holderGuid
      : choice.colletGuid

/**
 * Every component on the order list, with how many of it to buy.
 *
 * Counted over the assemblies rather than over the sheet, so a stack ordered by
 * four features is counted once — the assembly view and this one are the same
 * list, added up two different ways.
 */
export const componentTotals = (
  assemblies: ReadonlyArray<OrderAssembly>,
  titleOf: (assembly: OrderAssembly) => string,
): Array<ComponentTotal> => {
  const totals = new Map<
    string,
    { component: Component; guid: string; uses: Array<ComponentUse> }
  >()
  for (const assembly of assemblies) {
    for (const component of ['tool', 'holder', 'collet'] as const) {
      const guid = guidIn(assembly.choice, component)
      if (guid === undefined) {
        continue
      }
      const at = `${component}:${guid}`
      const had = totals.get(at) ?? { component, guid, uses: [] }
      had.uses.push({
        key: assembly.key,
        title: titleOf(assembly),
        quantity: quantityOf(assembly.choice, component),
        total: totalOf(assembly.choice),
        keys: assembly.keys,
        toolGuid: assembly.choice.toolGuid,
      })
      totals.set(at, had)
    }
  }
  return [...totals.values()]
    .map((total) => ({
      ...total,
      count: total.uses.reduce((sum, use) => sum + use.quantity * use.total, 0),
    }))
    .sort(
      (a, b) =>
        ORDER[a.component] - ORDER[b.component] ||
        b.count - a.count ||
        a.guid.localeCompare(b.guid),
    )
}

/**
 * The sheet with a component's whole order set to `wanted`.
 *
 * **One number, edited once** (Paul, 2026-09-09: "we don't need individual
 * quantity edits per assembly. The total quantity should be shown once and
 * editable, the assemblies are just for reference in this view"). The sheet
 * keeps a quantity per assembly, so the change has to land on one of them, and
 * the first is the one it lands on — the rest stay exactly as the assembly view
 * left them, which is what makes the two views agree afterwards.
 *
 * Every assembly keeps at least one of the component, so the smallest order a
 * component in three stacks can have is three: taking it below that is removing
 * it from a stack, which is the assembly view's press and not a number.
 *
 * A stack ordered more than once multiplies its quantity, so a wanted total the
 * multiplier cannot land on exactly takes the nearest — the row then shows what
 * it really comes to rather than what was typed.
 */
export const setComponentCount = (
  sheet: SetupSheet,
  total: ComponentTotal,
  wanted: number,
): SetupSheet => {
  const [first, ...rest] = total.uses
  if (first === undefined) {
    return sheet
  }
  const others = rest.reduce((sum, use) => sum + use.quantity * use.total, 0)
  const forFirst = Math.max(1, Math.round((Math.max(1, Math.floor(wanted)) - others) / first.total))
  return first.keys.reduce(
    (soFar, key) => setQuantity(soFar, key, first.toolGuid, total.component, forFirst),
    sheet,
  )
}

/* ------------------------------ reading order ----------------------------- */

/**
 * Which column the components view is read by.
 *
 * **A bill is sorted to be read** (Paul, 2026-09-09: "I should be able to sort
 * the columns in component view"). Somebody buying walks it by vendor, because
 * that is one order to place; somebody checking the crib walks it by part
 * number; somebody deciding what to buy first walks it by how many.
 */
export type ComponentSort = 'kind' | 'vendor' | 'part' | 'type' | 'count'

/** What a sort needs to know about a row, whichever view drew it. */
export interface SortableComponent {
  readonly component: Component
  readonly brand: string
  readonly catalogNumber: string
  /** What it is, in the words the tool table uses. */
  readonly detail: string
  readonly count: number
}

const KEY: Readonly<Record<ComponentSort, (row: SortableComponent) => string | number>> = {
  kind: (row) => ORDER[row.component],
  vendor: (row) => row.brand.toLowerCase(),
  part: (row) => row.catalogNumber.toLowerCase(),
  type: (row) => row.detail.toLowerCase(),
  count: (row) => row.count,
}

/**
 * The rows in the order a column asks for.
 *
 * Ties fall back to what {@link componentTotals} already decided — tools first,
 * then the biggest order — so sorting by vendor does not shuffle one vendor's
 * rows into an order nothing chose. `sort` is stable in every engine this runs
 * in, so the fallback is the incoming order rather than a second comparator.
 *
 * Descending reverses the comparison and not the ties, for the same reason: a
 * reversed list would put the *last* of an equal run first, which reads as the
 * rows moving under a press that only meant to flip the column.
 */
export const sortComponents = <Row extends SortableComponent>(
  rows: ReadonlyArray<Row>,
  by: ComponentSort,
  descending: boolean,
): Array<Row> => {
  const read = KEY[by]
  return [...rows].sort((a, b) => {
    const left = read(a)
    const right = read(b)
    const order =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right))
    return descending ? -order : order
  })
}

/**
 * Which way a column opens, the first time it is pressed.
 *
 * A number opens at its biggest — "what do I need most of" is the question a
 * quantity column is pressed to answer — and a word opens at A.
 */
export const opensDescending = (by: ComponentSort): boolean => by === 'count'
