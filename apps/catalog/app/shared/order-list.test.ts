import { describe, expect, it } from 'vitest'
import { addChoice, emptySheet, setQuantity, setTotal, type SetupSheet } from './setup-sheet'
import type { ListItem } from './feature-list'
import {
  clearKeys,
  componentTotals,
  isOrdered,
  linesFor,
  linesOf,
  isIncomplete,
  opensDescending,
  orderAssemblies,
  setComponentCount,
  sortComponents,
  type SortableComponent,
} from './order-list'

const circle: ListItem = { kind: 'feature', id: 'feature-1', tags: ['h1', 'h2', 'h3'] }
const pocket: ListItem = { kind: 'feature', id: 'feature-2', tags: ['p1'] }
const facing: ListItem = { kind: 'assembly', id: 'assembly-1', tags: [], name: 'Facing' }

const names = (tag: string) => (tag.startsWith('h') ? 'Through Hole' : 'Pocket')

/** A line written the way the tree writes one: under every key the row stands for. */
const order = (
  sheet: SetupSheet,
  item: ListItem,
  choice: { toolGuid: string; holderGuid?: string; colletGuid?: string; assemblyId?: string },
): SetupSheet =>
  (item.kind === 'assembly' ? [item.id] : item.tags).reduce(
    (current, key) => addChoice(current, key, choice),
    sheet,
  )

describe('reading the order list', () => {
  it('reads every key a row stands for, and counts a line once', () => {
    const sheet = order(emptySheet('part-1'), circle, { toolGuid: 'drill' })

    expect(linesFor(sheet, circle)).toEqual([{ toolGuid: 'drill' }])
  })

  /**
   * The defect: the tree writes under all three keys and the part page read the
   * first, so a line that reached only the second showed on the order-list page
   * and nowhere else.
   */
  it('finds a line kept under a key that is not the first', () => {
    const sheet = addChoice(emptySheet('part-1'), 'h3', { toolGuid: 'drill' })

    expect(linesOf(sheet, ['h1', 'h2', 'h3'])).toEqual([{ toolGuid: 'drill' }])
  })

  it('clears every key rather than the first of them', () => {
    const sheet = clearKeys(order(emptySheet('part-1'), circle, { toolGuid: 'drill' }), circle.tags)

    expect(isOrdered(sheet, circle)).toBe(false)
    expect(orderAssemblies([circle], sheet, names)).toEqual([])
  })
})

describe('which rows are incomplete', () => {
  /**
   * The reversal of 2026-09-10: a row with nothing ordered against it used to
   * be dropped from the list, and is now kept and marked — a feature somebody
   * flagged and has not answered yet.
   */
  it('marks a row with nothing ordered against it', () => {
    const sheet = order(emptySheet('part-1'), circle, { toolGuid: 'drill' })

    expect(isIncomplete(sheet, circle)).toBe(false)
    expect(isIncomplete(sheet, pocket)).toBe(true)
  })

  it('marks a row again once its last line comes off', () => {
    const sheet = order(emptySheet('part-1'), circle, { toolGuid: 'drill' })

    expect(isIncomplete(clearKeys(sheet, circle.tags), circle)).toBe(true)
  })

  /** Keyed by its own id, so an unfilled part-level stack reads as incomplete. */
  it('reads a part-level assembly under its own key', () => {
    const sheet = order(emptySheet('part-1'), facing, { toolGuid: 'shell' })

    expect(isIncomplete(sheet, facing)).toBe(false)
    expect(isIncomplete(emptySheet('part-1'), facing)).toBe(true)
  })
})

describe('the order list itself', () => {
  it('is one stack however many rows ordered it', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' }),
      pocket,
      {
        toolGuid: 'em',
        holderGuid: 'bt30',
      },
    )

    expect(orderAssemblies([circle, pocket], sheet, names)).toEqual([
      {
        key: 'em|bt30|',
        choice: { toolGuid: 'em', holderGuid: 'bt30' },
        rows: ['Through Hole', 'Pocket'],
        keys: ['h1', 'h2', 'h3', 'p1'],
        ids: ['em'],
        featureless: false,
      },
    ])
  })

  it('is two stacks where one cutter was given two holders', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'a' }),
      pocket,
      {
        toolGuid: 'em',
        holderGuid: 'b',
      },
    )

    expect(orderAssemblies([circle, pocket], sheet, names).map((each) => each.key)).toEqual([
      'em|a|',
      'em|b|',
    ])
  })

  /**
   * **Two stacks of one cutter on one row are two rows here** (Paul,
   * 2026-09-11: "when I have two (or more) tool assemblies on a feature or
   * group, both need to be shown in the order list. Only the first is being
   * shown right now"). A line is keyed by the stack that wrote it, so the
   * second no longer writes over the first — and the holder each was given is
   * the holder it keeps.
   */
  it('is two stacks where one row gave a cutter two holders', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, {
        toolGuid: 'em',
        holderGuid: 'a',
        assemblyId: 'assembly-1',
      }),
      circle,
      { toolGuid: 'em', holderGuid: 'b', assemblyId: 'assembly-2' },
    )

    expect(orderAssemblies([circle], sheet, names).map((each) => each.key)).toEqual([
      'em|a|',
      'em|b|',
    ])
  })

  /** Identical twice over is still two things to set up, and two to buy. */
  it('is two stacks where one row ordered the same assembly twice', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, {
        toolGuid: 'em',
        holderGuid: 'bt30',
        assemblyId: 'assembly-1',
      }),
      circle,
      { toolGuid: 'em', holderGuid: 'bt30', assemblyId: 'assembly-2' },
    )
    const stacks = orderAssemblies([circle], sheet, names)

    expect(stacks.map((each) => each.key)).toEqual(['em|bt30|', 'em|bt30|#2'])
    expect(
      componentTotals(stacks, (each) => each.rows.join(', ')).map((each) => [
        each.component,
        each.count,
      ]),
    ).toEqual([
      ['tool', 2],
      ['holder', 2],
    ])
  })

  /**
   * And two *rows* that ordered one stack are still one thing to buy (Paul,
   * 2026-08-31), whatever the stacks that wrote them are called.
   */
  it('is one stack where two rows ordered it under different stack ids', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, {
        toolGuid: 'em',
        holderGuid: 'bt30',
        assemblyId: 'assembly-1',
      }),
      pocket,
      { toolGuid: 'em', holderGuid: 'bt30', assemblyId: 'assembly-2' },
    )
    const stacks = orderAssemblies([circle, pocket], sheet, names)

    expect(stacks.map((each) => each.key)).toEqual(['em|bt30|'])
    expect(stacks[0]?.rows).toEqual(['Through Hole', 'Pocket'])
    expect(stacks[0]?.ids).toEqual(['assembly-1', 'assembly-2'])
  })

  it('says a stack answers no feature only where every row it is on does', () => {
    const sheet = order(emptySheet('part-1'), facing, { toolGuid: 'face' })

    expect(orderAssemblies([facing], sheet, names)[0]?.featureless).toBe(true)
  })

  /** Nothing reaches the bill except because a row put it there. */
  it('holds nothing for a key no row stands for', () => {
    const sheet = addChoice(emptySheet('part-1'), 'stale-tag', { toolGuid: 'ghost' })

    expect(orderAssemblies([circle], sheet, names)).toEqual([])
  })
})

describe('what to buy, by component', () => {
  it('adds one component up across every assembly it is in', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' }),
      pocket,
      {
        toolGuid: 'drill',
        holderGuid: 'bt30',
      },
    )
    const totals = componentTotals(orderAssemblies([circle, pocket], sheet, names), (each) =>
      each.rows.join(', '),
    )

    expect(totals.map((each) => [each.component, each.guid, each.count])).toEqual([
      ['tool', 'drill', 1],
      ['tool', 'em', 1],
      ['holder', 'bt30', 2],
    ])
  })

  it('multiplies a component by how many of the assembly are wanted', () => {
    const ordered = order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' })
    const sheet = circle.tags.reduce(
      (current, tag) => setTotal(setQuantity(current, tag, 'em', 'tool', 3), tag, 'em', 2),
      ordered,
    )
    const totals = componentTotals(orderAssemblies([circle], sheet, names), () => 'stack')

    expect(totals.map((each) => [each.component, each.count])).toEqual([
      ['tool', 6],
      ['holder', 2],
    ])
  })

  it('names each assembly a component is in, so a count can be traced', () => {
    const sheet = order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' })
    const [tool] = componentTotals(orderAssemblies([circle], sheet, names), (each) =>
      each.rows.join(', '),
    )

    expect(tool?.uses).toEqual([
      {
        key: 'em|bt30|',
        title: 'Through Hole',
        quantity: 1,
        total: 1,
        keys: ['h1', 'h2', 'h3'],
        ids: ['em'],
      },
    ])
  })
})

describe('setting how many of a component to order', () => {
  const totalsFor = (sheet: SetupSheet, items: ReadonlyArray<ListItem>) =>
    componentTotals(orderAssemblies(items, sheet, names), (each) => each.rows.join(', '))

  const holderIn = (sheet: SetupSheet, items: ReadonlyArray<ListItem>) => {
    const found = totalsFor(sheet, items).find((each) => each.component === 'holder')
    if (found === undefined) {
      throw new Error('no holder on the order list')
    }
    return found
  }

  it('sets the whole order from one number', () => {
    const sheet = order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' })
    const next = setComponentCount(sheet, holderIn(sheet, [circle]), 4)

    expect(holderIn(next, [circle]).count).toBe(4)
  })

  /**
   * The change lands on the first assembly and the rest stay as the assembly
   * view left them — which is what makes the two views agree afterwards.
   */
  it('leaves the other assemblies as they were', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' }),
      pocket,
      {
        toolGuid: 'drill',
        holderGuid: 'bt30',
      },
    )
    const next = setComponentCount(sheet, holderIn(sheet, [circle, pocket]), 5)
    const after = holderIn(next, [circle, pocket])

    expect(after.count).toBe(5)
    expect(after.uses.map((use) => use.quantity)).toEqual([4, 1])
  })

  /** Every assembly keeps one: taking it below that is removing it from a stack. */
  it('never takes an assembly below one of the component', () => {
    const sheet = order(
      order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' }),
      pocket,
      {
        toolGuid: 'drill',
        holderGuid: 'bt30',
      },
    )
    const next = setComponentCount(sheet, holderIn(sheet, [circle, pocket]), 1)

    expect(holderIn(next, [circle, pocket]).count).toBe(2)
  })

  it('counts a stack ordered twice twice over', () => {
    const ordered = order(emptySheet('part-1'), circle, { toolGuid: 'em', holderGuid: 'bt30' })
    const sheet = circle.tags.reduce((current, tag) => setTotal(current, tag, 'em', 2), ordered)
    const next = setComponentCount(sheet, holderIn(sheet, [circle]), 6)

    expect(holderIn(next, [circle]).count).toBe(6)
  })
})

describe('reading the components view by a column', () => {
  const rows: ReadonlyArray<SortableComponent> = [
    {
      component: 'tool',
      brand: 'Harvey',
      catalogNumber: '741462',
      detail: 'Flat end mill',
      count: 1,
    },
    {
      component: 'tool',
      brand: 'Destiny',
      catalogNumber: 'DVH41205C',
      detail: 'Ball end mill',
      count: 3,
    },
    {
      component: 'holder',
      brand: 'MariTool',
      catalogNumber: 'BT30-ER11',
      detail: 'BT30 collet chuck',
      count: 2,
    },
  ]

  const shown = (by: Parameters<typeof sortComponents>[1], descending: boolean) =>
    sortComponents(rows, by, descending).map((row) => row.catalogNumber)

  it('reads by vendor', () => {
    expect(shown('vendor', false)).toEqual(['DVH41205C', '741462', 'BT30-ER11'])
  })

  it('reads by how many to order, biggest first', () => {
    expect(shown('count', true)).toEqual(['DVH41205C', 'BT30-ER11', '741462'])
  })

  it('keeps tools before what holds them when the kind is the column', () => {
    expect(shown('kind', false)).toEqual(['741462', 'DVH41205C', 'BT30-ER11'])
  })

  /** A tie keeps the order the rollup put it in rather than shuffling under the press. */
  it('leaves equal rows where they were', () => {
    expect(shown('kind', false).slice(0, 2)).toEqual(['741462', 'DVH41205C'])
  })

  it('opens a quantity at its biggest and a word at A', () => {
    expect(opensDescending('count')).toBe(true)
    expect(opensDescending('vendor')).toBe(false)
  })
})
