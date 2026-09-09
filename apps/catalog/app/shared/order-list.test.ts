import { describe, expect, it } from 'vitest'
import { addChoice, emptySheet, setQuantity, setTotal, type SetupSheet } from './setup-sheet'
import type { ListItem } from './feature-list'
import {
  clearKeys,
  componentTotals,
  isOrdered,
  linesFor,
  linesOf,
  listedItems,
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
  choice: { toolGuid: string; holderGuid?: string; colletGuid?: string },
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

describe('which rows the list draws', () => {
  it('drops a row with nothing ordered against it', () => {
    const sheet = order(emptySheet('part-1'), circle, { toolGuid: 'drill' })

    expect(listedItems([circle, pocket], sheet, [null])).toEqual([circle])
  })

  it('keeps the row being worked on, so a new feature can be tooled at all', () => {
    expect(listedItems([circle, pocket], emptySheet('part-1'), ['feature-2'])).toEqual([pocket])
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
        toolGuid: 'em',
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
