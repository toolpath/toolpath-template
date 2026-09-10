import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  addItem,
  asked,
  groupLabel,
  isAssemblyKey,
  itemNamed,
  defaultLabelOf,
  labelOf,
  renameItem,
  nextId,
  readList,
  removeItem,
  replaceItem,
  rowFor,
  sheetKeysOf,
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

/**
 * **A tool assembly the part needs and no feature asked for** (Paul,
 * 2026-09-08: "the tool assembly will not be tied to a specific feature or
 * group, it will just exist at the part level").
 *
 * It is a row like any other everywhere the list is read, and different in
 * exactly two places: it holds no tags, so it asks the tool table nothing —
 * and it is keyed on the setup sheet by its own id, because there is no feature
 * to key it by.
 */
describe('a tool assembly with no feature', () => {
  const standalone = (id: string): ListItem => ({ kind: 'assembly', id, tags: [] })

  it('is keyed on the bill by its own id, and a feature by its tags', () => {
    expect(sheetKeysOf(standalone('assembly-2'))).toEqual(['assembly-2'])
    expect(sheetKeysOf(feature('feature-1', ['hole-1', 'hole-2']))).toEqual(['hole-1', 'hole-2'])
    expect(isAssemblyKey('assembly-2')).toBe(true)
    // A feature tag is the kernel's, so the two cannot be confused.
    expect(isAssemblyKey('hole-1')).toBe(false)
    expect(isAssemblyKey('assembly')).toBe(false)
  })

  /** Numbered off its own id: there is nothing else to name it after. */
  it('is named for its number, without a feature to be named after', () => {
    expect(labelOf(standalone('assembly-3'), nameOf)).toBe('Tool assembly 3')
  })

  /**
   * **It asks nothing.** With no features there is nothing to judge a tool
   * against, so the table under it is the whole catalog rather than an answer
   * to "which tool cuts these no features".
   */
  it('asks the tool list nothing at all', () => {
    expect(asked({ selected: standalone('assembly-1') })).toEqual({
      tags: [],
      results: 'all',
      summary: true,
    })
  })

  it('is kept in the browser like every other row', () => {
    const held = new Map<string, string>()
    const storage = {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
    }
    const list = [feature('feature-1', ['pocket-1']), standalone('assembly-1')]

    writeList(storage, 'part-a', list)

    expect(readList(storage, 'part-a')).toEqual(list)
  })

  it('mints its id the way every other row does', () => {
    expect(nextId([standalone('assembly-1')], 'assembly')).toBe('assembly-2')
  })

  /**
   * **It is the one row kind with a name to give** (Paul, 2026-09-08). A
   * feature is called what it is and a group what it holds; an assembly
   * answering no feature has only its number until somebody says what the stack
   * is for.
   */
  it('is called what somebody called it, and its number until they do', () => {
    const named = renameItem([standalone('assembly-3')], 'assembly-3', '  Facing stack  ')

    expect(labelOf(named[0] as ListItem, nameOf)).toBe('Facing stack')
    // The placeholder a name is typed over is what it goes on being called.
    expect(defaultLabelOf(named[0] as ListItem, nameOf)).toBe('Tool assembly 3')
  })

  /** Clearing the field is the way back: there is no second un-name control. */
  it('goes back to its number when the name is cleared', () => {
    const named = renameItem([standalone('assembly-3')], 'assembly-3', 'Facing stack')
    const cleared = renameItem(named, 'assembly-3', '   ')

    expect(cleared[0]).toEqual(standalone('assembly-3'))
    expect(labelOf(cleared[0] as ListItem, nameOf)).toBe('Tool assembly 3')
  })

  /** A feature and a group are named by what they hold, and by nothing else. */
  it('names nothing else on the list', () => {
    const list = [feature('feature-1', ['pocket-1']), standalone('assembly-1')]

    expect(renameItem(list, 'feature-1', 'Roughing')[0]).toEqual(list[0])
  })

  it('keeps the name in the browser with the row', () => {
    const held = new Map<string, string>()
    const storage = {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => void held.set(key, value),
    }
    const list = renameItem([standalone('assembly-1')], 'assembly-1', 'Facing stack')

    writeList(storage, 'part-a', list)

    expect(readList(storage, 'part-a')).toEqual(list)
  })
})

/**
 * **One face is one row** (Paul, 2026-09-10). *+ Feature* over a reading that
 * is already on the list used to make a second row for it, and the two are one
 * line on the sheet seen twice — the sheet is keyed by feature tag, so a tool
 * ordered on one shows under both.
 *
 * It healed itself while an unordered row was pruned the moment it stopped
 * being the one in hand. Rows are kept now, so the duplicate is permanent.
 */
describe('the row that already stands for a reading', () => {
  it('finds the feature row holding exactly these tags', () => {
    const list = [feature('feature-1', ['hole-1']), feature('feature-2', ['hole-2'])]

    expect(rowFor(list, 'feature', ['hole-1'])?.id).toBe('feature-1')
  })

  it('finds nothing where no row holds exactly them', () => {
    expect(rowFor([feature('feature-1', ['hole-1'])], 'feature', ['hole-2'])).toBeNull()
  })

  /** A group holding the same features picked in another order is that group. */
  it('does not care what order the features were picked in', () => {
    const list = [group('group-1', ['hole-2', 'hole-1'])]

    expect(rowFor(list, 'group', ['hole-1', 'hole-2'])?.id).toBe('group-1')
  })

  /**
   * A group that merely *contains* the reading is a different question about
   * it, which is why this is not `activeItem`'s looser search.
   */
  it('is not the row that merely contains them', () => {
    const list = [group('group-1', ['hole-1', 'hole-2'])]

    expect(rowFor(list, 'group', ['hole-1'])).toBeNull()
  })

  it('keeps a feature and a group of the same features apart', () => {
    const list = [group('group-1', ['hole-1'])]

    expect(rowFor(list, 'feature', ['hole-1'])).toBeNull()
    expect(rowFor(list, 'group', ['hole-1'])?.id).toBe('group-1')
  })
})
