import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  addItem,
  asked,
  groupLabel,
  itemNamed,
  labelOf,
  nextId,
  readList,
  removeItem,
  replaceItem,
  typeButtons,
  writeList,
  type GroupItem,
  type ListItem,
} from './feature-list'

const feature = (id: string, tags: ReadonlyArray<string>): ListItem => ({
  kind: 'feature',
  id,
  tags,
})

const group = (
  id: string,
  tags: ReadonlyArray<string>,
  results: GroupItem['results'] = 'all',
): GroupItem => ({ kind: 'group', id, tags, results })

const named = (tag: string): PartFeature => ({ featureTag: tag }) as unknown as PartFeature

/** "hole-1" is a Through Hole, "pocket-1" a Pocket: the type is in the tag. */
const nameOf = (tag: string): string =>
  tag.startsWith('hole') ? 'Through Hole' : tag.startsWith('pocket') ? 'Pocket' : 'Slot'

describe('what the list holds', () => {
  it('adds at the end, so a row never moves under somebody reading it', () => {
    const list = addItem([feature('feature-1', ['a'])], group('group-1', ['b', 'c']))

    expect(list.map((each) => each.id)).toEqual(['feature-1', 'group-1'])
  })

  /** An edit lands where the row was: a right-click that reorders the list is a right-click that loses it. */
  it('replaces in place and removes by id', () => {
    const list = [feature('feature-1', ['a']), group('group-1', ['b'])]

    expect(replaceItem(list, group('group-1', ['b', 'c'], 'each'))[1]).toEqual(
      group('group-1', ['b', 'c'], 'each'),
    )
    expect(removeItem(list, 'feature-1').map((each) => each.id)).toEqual(['group-1'])
    expect(itemNamed(list, 'group-1')?.kind).toBe('group')
    expect(itemNamed(list, null)).toBeNull()
  })

  /**
   * **Ids are arithmetic, not a clock.** `Date.now()` and a random suffix are
   * the usual way to mint one and both make a test that renders twice fail
   * differently each run; the list already holds every id there is.
   */
  it('numbers a new id past the highest of its kind', () => {
    const list = [feature('feature-1', ['a']), group('group-1', ['b']), group('group-4', ['c'])]

    expect(nextId(list, 'group')).toBe('group-5')
    expect(nextId(list, 'feature')).toBe('feature-2')
    expect(nextId([], 'group')).toBe('group-1')
  })
})

/**
 * **A group is named by what is in it** (Paul, 2026-09-02). A name somebody
 * has to invent for every group is a name most groups will not get, and
 * "4 × Through Hole" is what anybody would have typed anyway.
 */
describe('what a group is called', () => {
  it('counts each kind, in the order they were added', () => {
    expect(groupLabel(['Through Hole', 'Through Hole', 'Through Hole'])).toBe('3 × Through Hole')
    expect(groupLabel(['Pocket', 'Through Hole', 'Through Hole'])).toBe('Pocket + 2 × Through Hole')
    expect(groupLabel(['Pocket'])).toBe('Pocket')
  })

  /** Two kinds is as wide as the row is; the rest are counted rather than truncated. */
  it('counts the kinds past the second rather than spilling them', () => {
    expect(groupLabel(['Pocket', 'Through Hole', 'Slot', 'Chamfer'])).toBe(
      'Pocket + Through Hole + 2 more',
    )
  })

  it('names an empty group rather than reading as an unnamed one', () => {
    expect(groupLabel([])).toBe('Empty group')
  })

  /** A feature row is what the feature is; the count of identical holes is the row's own badge. */
  it('calls a feature row by its one name', () => {
    expect(labelOf(feature('feature-1', ['hole-1', 'hole-2']), nameOf)).toBe('Through Hole')
    expect(labelOf(group('group-1', ['hole-1', 'pocket-1']), nameOf)).toBe('Through Hole + Pocket')
  })
})

/**
 * The quick buttons: every kind on the part, commonest first. A part with
 * twelve holes and one boss is a part somebody wants "all twelve holes" from,
 * and the kernel's own reporting order buries it.
 */
describe('selecting every feature of a kind', () => {
  it('offers each kind with its tags, commonest first', () => {
    const part = [named('pocket-1'), named('hole-1'), named('hole-2'), named('hole-3')]

    expect(typeButtons(part, nameOf)).toEqual([
      { name: 'Through Hole', tags: ['hole-1', 'hole-2', 'hole-3'] },
      { name: 'Pocket', tags: ['pocket-1'] },
    ])
  })
})

/**
 * **What the bottom of the page is being asked.** Four things can be true at
 * once and the order they win in is the whole rule.
 */
describe('what the tool list is asked', () => {
  it('leaves the list to speak for itself when nothing is selected or clicked', () => {
    expect(asked({})).toEqual({ tags: [], results: 'all', summary: true })
  })

  /**
   * A click answers before anything is added: it shows the tools for what was
   * clicked and asks whether to keep it (Paul, 2026-09-02, on what a plain
   * click should mean now the list is explicit).
   */
  it('answers a previewed face with that face’s own tools', () => {
    expect(asked({ preview: ['hole-1', 'hole-2'] })).toEqual({
      tags: ['hole-1', 'hole-2'],
      results: 'all',
      summary: false,
    })
  })

  /** A selected row is the question somebody asked and left standing, so it beats a preview. */
  it('prefers the selected row over whatever is under the mouse', () => {
    expect(asked({ selected: feature('feature-1', ['pocket-1']), preview: ['hole-1'] })).toEqual({
      tags: ['pocket-1'],
      results: 'all',
      summary: false,
    })
  })

  /** A group being built changes under the mouse, so it wins outright. */
  it('shows the group being built over anything already selected', () => {
    expect(
      asked({
        draft: { tags: ['hole-1'], results: 'each' },
        selected: group('group-1', ['pocket-1']),
      }),
    ).toEqual({ tags: ['hole-1'], results: 'each', summary: false })
  })

  /**
   * A draft with nothing in it is asking nothing: the panel below would
   * otherwise have to answer "these no features", and what it answered with
   * was the whole catalog (Paul, 2026-09-02).
   */
  it('leaves an empty draft to the list', () => {
    expect(asked({ draft: { tags: [], results: 'all' }, selected: null })).toEqual({
      tags: [],
      results: 'all',
      summary: true,
    })
  })

  /** A group wanting one tool for all of them has a flat list: one question, one answer. */
  it('lists tools flat for a group that wants one tool for all of it', () => {
    expect(asked({ selected: group('group-1', ['hole-1', 'pocket-1'], 'all') })).toEqual({
      tags: ['hole-1', 'pocket-1'],
      results: 'all',
      summary: false,
    })
  })

  /**
   * And a group wanting one **each** is a summary of itself: one row for the
   * group, opened to a row per feature (Paul, 2026-09-02). There is no flat
   * list, because "the tools for these six" is six answers rather than one.
   */
  it('summarises a group that wants a tool for each of its features', () => {
    expect(asked({ selected: group('group-1', ['hole-1', 'pocket-1'], 'each') })).toEqual({
      tags: ['hole-1', 'pocket-1'],
      results: 'each',
      summary: true,
    })
  })
})

/**
 * **The list is the work, so it survives a reload** (Paul, 2026-09-02: "we need
 * to be showing the tool/feature list — it keeps disappearing"). The setup
 * sheet has been kept per part since 2026-08-10 and this was not, so a refresh
 * threw away everything somebody had picked out while the tools they had chosen
 * for it stayed on the bill.
 */
describe('what is kept in the browser', () => {
  const store = () => {
    const held = new Map<string, string>()
    return {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
    }
  }

  it('reads back what it wrote, for that part', () => {
    const storage = store()
    const list = [feature('feature-1', ['pocket-1']), group('group-1', ['hole-1'], 'each')]

    writeList(storage, 'part-a', list)

    expect(readList(storage, 'part-a')).toEqual(list)
    expect(readList(storage, 'part-b')).toEqual([])
  })

  /** Another part's, half-written, or from a version that held something else: nothing. */
  it('takes nothing from what it cannot read', () => {
    const storage = store()
    storage.setItem('tool-catalog.features.part-a', 'not json')
    expect(readList(storage, 'part-a')).toEqual([])

    storage.setItem('tool-catalog.features.part-b', JSON.stringify([{ kind: 'wat', id: 1 }, null]))
    expect(readList(storage, 'part-b')).toEqual([])

    expect(readList(null, 'part-a')).toEqual([])
  })

  /** A group with no result option is not a group this application can answer. */
  it('drops an item that does not say what it wants back', () => {
    const storage = store()
    storage.setItem(
      'tool-catalog.features.part-a',
      JSON.stringify([{ kind: 'group', id: 'group-1', tags: ['hole-1'] }]),
    )

    expect(readList(storage, 'part-a')).toEqual([])
  })
})
