import { useCallback, useEffect, useRef, useState } from 'react'
import type { PartFeature } from '@toolpath/part-contracts'

/**
 * The features somebody is asking about, as a list they built.
 *
 * **The selection used to be invisible.** Clicking a face put its hole group
 * into the interaction reducer's `kept`, and the tool list was quietly judged
 * against everything kept — so a page showing one pocket could be answering a
 * question about four holes and a slot, with nothing on screen saying so. The
 * list is that set made explicit and given a shape: a row per thing asked
 * about, and a group is one row that holds several (Paul, 2026-09-02).
 *
 * Three kinds, because a shop asks three different questions:
 *
 * - a **feature** — this hole, this pocket. What tool cuts it.
 * - a **group** — these six. Either *one* tool that cuts all six, or the best
 *   tool for each of them, which is {@link Results}.
 * - an **assembly** — a stack the part needs and no feature asked for (Paul,
 *   2026-09-08). It holds no features at all; see {@link AssemblyItem}.
 *
 * Pure, and here rather than in the route, because every rule about what the
 * list holds and what it is asking is a sentence somebody can be wrong about.
 */

/** What a group wants back: one tool for all of them, or one for each. */
export type Results = 'all' | 'each'

/**
 * One thing asked about.
 *
 * Both kinds carry **tags**, plural, because a feature is already several: a
 * bolt circle of eight identical holes is one decision and one row, and
 * `groupOf` in `part-interaction` is what says so. The difference between the
 * two kinds is not how many tags they hold — it is whether somebody chose them
 * together.
 */
export interface FeatureItem {
  readonly kind: 'feature'
  readonly id: string
  readonly tags: ReadonlyArray<string>
}

export interface GroupItem {
  readonly kind: 'group'
  readonly id: string
  readonly tags: ReadonlyArray<string>
  readonly results: Results
}

/**
 * A tool assembly of the part's own, answering no feature (Paul, 2026-09-08:
 * "the tool assembly will not be tied to a specific feature or group, it will
 * just exist at the part level").
 *
 * A shop puts a tool on the order list for reasons the part cannot state — a
 * facing mill for the first op, a spare collet — and every way onto that list
 * ran through a feature. This is the third row kind: it holds no tags, it is
 * never painted on the part, and the tools it is answered with are whatever
 * somebody built in its tree.
 *
 * `tags` is empty and stays empty, so nothing that reads a row's features has
 * to know this kind exists. What it *does* need is a key on the setup sheet,
 * which is {@link sheetKeysOf} — its own id, because it stands for itself.
 */
export interface AssemblyItem {
  readonly kind: 'assembly'
  readonly id: string
  /** Always empty: a part-level assembly stands for no feature. */
  readonly tags: ReadonlyArray<string>
  /**
   * What a shop calls this stack (Paul, 2026-09-08: naming a tool assembly when
   * it is made, and from the list afterwards).
   *
   * **The one row kind that has nothing to be named after.** A feature is
   * called what it is and a group is called what it holds, so both read off the
   * part; an assembly answering no feature has only its number, and "Tool
   * assembly 3" says nothing about the facing mill it stands for. It is
   * optional and stays optional — {@link labelOf} falls back to the number, so
   * a stack nobody names reads exactly as it did before.
   *
   * Absent, or empty, on every row stored before the field existed, which reads
   * as unnamed. Trimmed on the way in, in {@link renameItem}, so a name of
   * spaces is no name.
   */
  readonly name?: string
}

export type ListItem = FeatureItem | GroupItem | AssemblyItem

/**
 * The keys this row's lines are kept under on the setup sheet.
 *
 * A feature or a group is keyed by the features it holds — the sheet has been
 * keyed by feature tag since 2026-08-10, and a bolt circle of eight holes
 * writes eight of them. A part-level assembly holds none, so it is keyed by its
 * own id: it is the thing being ordered, and there is nothing else to key it
 * by.
 *
 * One function rather than `item.tags[0]` at each call site, because a row with
 * no tags reading the *focused* feature's lines is how a part-level assembly
 * would quietly order itself against whatever face was last clicked.
 */
export const sheetKeysOf = (item: ListItem): ReadonlyArray<string> =>
  item.kind === 'assembly' ? [item.id] : item.tags

/**
 * Whether a sheet key is a part-level assembly's rather than a feature's.
 *
 * Ids are arithmetic (`assembly-3`) and a feature tag is the kernel's, so the
 * two cannot collide. The order list asks this to say *no feature* where it
 * would otherwise print a row id at somebody buying tools.
 */
export const isAssemblyKey = (key: string): boolean => /^assembly-\d+$/.test(key)

/**
 * The next id for a kind, read off the list rather than invented.
 *
 * `Date.now()` and a random suffix are the usual way and both make a component
 * test that renders twice fail differently each run. The list already holds
 * every id there is, so the next one is arithmetic.
 */
export const nextId = (list: ReadonlyArray<ListItem>, kind: ListItem['kind']): string => {
  let highest = 0
  for (const item of list) {
    const [named, number] = item.id.split('-')
    const at = Number(number)
    if (named === kind && Number.isFinite(at)) {
      highest = Math.max(highest, at)
    }
  }
  return `${kind}-${String(highest + 1)}`
}

export const itemNamed = (list: ReadonlyArray<ListItem>, id: string | null): ListItem | null =>
  id === null ? null : (list.find((item) => item.id === id) ?? null)

/** Added at the end: a list that reorders itself is one nobody can keep their place in. */
export const addItem = (list: ReadonlyArray<ListItem>, item: ListItem): Array<ListItem> => [
  ...list,
  item,
]

/** An edit lands where the row already was, so the list does not jump under a right-click. */
export const replaceItem = (list: ReadonlyArray<ListItem>, item: ListItem): Array<ListItem> =>
  list.map((each) => (each.id === item.id ? item : each))

export const removeItem = (list: ReadonlyArray<ListItem>, id: string): Array<ListItem> =>
  list.filter((each) => each.id !== id)

/**
 * A part-level assembly called what a shop calls it.
 *
 * Empty puts the name back rather than storing one, so clearing the field is
 * the way back to "Tool assembly 3" — there is no second control for un-naming
 * a row, and a stored empty name would read as named everywhere but on screen.
 *
 * Only an assembly: a feature and a group are named by what they hold, and a
 * typed name over either of those is a second name for a thing the part already
 * names.
 */
export const renameItem = (
  list: ReadonlyArray<ListItem>,
  id: string,
  name: string,
): Array<ListItem> =>
  list.map((each) => {
    if (each.id !== id || each.kind !== 'assembly') {
      return each
    }
    const trimmed = name.trim()
    return trimmed === ''
      ? { kind: 'assembly', id: each.id, tags: each.tags }
      : { ...each, name: trimmed }
  })

/**
 * What a group is called, from what is in it.
 *
 * Derived rather than typed (Paul, 2026-09-02): a name somebody has to invent
 * for every group is a name most groups will not get, and "4 × Through Hole"
 * is the only thing anybody would have typed anyway. Kinds in the order they
 * were added, because that is the order somebody clicked them in.
 */
export const groupLabel = (names: ReadonlyArray<string>): string => {
  if (names.length === 0) {
    return 'Empty group'
  }
  const counts = new Map<string, number>()
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const kinds = [...counts].map(([name, count]) =>
    count === 1 ? name : `${String(count)} × ${name}`,
  )
  // Two kinds is as much as the row is wide for; the rest are counted.
  if (kinds.length <= 2) {
    return kinds.join(' + ')
  }
  return `${kinds.slice(0, 2).join(' + ')} + ${String(kinds.length - 2)} more`
}

/**
 * What a row is called: a feature is what it is, a group is what it holds.
 *
 * `nameOf` is handed in because reading a feature's own name needs the
 * measurements reader and the part's regions, which are the route's to hold.
 */
export const labelOf = (item: ListItem, nameOf: (tag: string) => string): string =>
  item.kind === 'assembly' && item.name !== undefined && item.name.trim() !== ''
    ? item.name.trim()
    : defaultLabelOf(item, nameOf)

/**
 * What a row is called when nobody has named it.
 *
 * The name a naming field is typed *over* rather than into — the placeholder is
 * what the row would go on being called — so it is a function of its own rather
 * than something the field reinvents. Everything but a part-level assembly is
 * only ever this.
 */
export const defaultLabelOf = (item: ListItem, nameOf: (tag: string) => string): string => {
  if (item.kind === 'assembly') {
    /*
      Numbered off its own id, the rule `groupLabel` already follows: an
      assembly answering no feature has nothing to be named after until it has
      a tool in it, and a name somebody has to invent for every one of them is
      a name most of them will not get.
    */
    return `Tool assembly ${item.id.split('-')[1] ?? ''}`.trim()
  }
  return item.kind === 'feature'
    ? item.tags[0] === undefined
      ? 'Feature'
      : nameOf(item.tags[0])
    : groupLabel(item.tags.map(nameOf))
}

/**
 * The quick buttons a group editor offers: every kind of feature on the part,
 * with the tags that are of that kind.
 *
 * Commonest first — a part with twelve holes and one boss is a part somebody
 * wants "all twelve holes" from, and a list ordered by the kernel's own
 * reporting order buries it.
 *
 * **Nothing on screen calls this** (Paul, 2026-09-08: take the *Add every…*
 * section off the group editor). The rule is kept and tested here rather than
 * deleted, because putting that section back in `components/group-editor.tsx`
 * is the whole of restoring it — the same shape as the parked `each` result.
 */
export const typeButtons = (
  features: ReadonlyArray<PartFeature>,
  nameOf: (tag: string) => string,
): Array<{ readonly name: string; readonly tags: ReadonlyArray<string> }> => {
  const byName = new Map<string, Array<string>>()
  for (const feature of features) {
    const name = nameOf(feature.featureTag)
    const had = byName.get(name)
    if (had) {
      had.push(feature.featureTag)
    } else {
      byName.set(name, [feature.featureTag])
    }
  }
  return [...byName]
    .map(([name, tags]) => ({ name, tags }))
    .sort((a, b) => b.tags.length - a.tags.length || a.name.localeCompare(b.name))
}

/**
 * What the bottom of the page is being asked, in one answer.
 *
 * Four things can be true at once — a group is being built, a row is selected,
 * a face is being previewed, the list is just sitting there — and the order
 * they win in is the whole rule:
 *
 * 1. **A group being built** wins, because its tags change under the mouse and
 *    the list has to show what the group would be.
 * 2. **A row selected** is the question somebody asked and left standing.
 * 3. **A face previewed** answers before anything is added at all: a click
 *    shows the tools for what was clicked and asks whether to keep it (Paul,
 *    2026-09-02, on what a plain click should mean).
 * 4. Otherwise the list speaks for itself, one recommendation per row.
 */
export interface Asked {
  /** The tags the tools are judged against; empty only in summary. */
  readonly tags: ReadonlyArray<string>
  /** One tool for all of them, or the best for each. */
  readonly results: Results
  /** The list itself is the answer: a row per item, top tool each. */
  readonly summary: boolean
}

export const asked = ({
  draft,
  selected,
  preview,
}: {
  /** The group being built, where one is. */
  readonly draft?: { readonly tags: ReadonlyArray<string>; readonly results: Results } | null
  /** The row selected in the list, where one is. */
  readonly selected?: ListItem | null
  /** The hole group of the face being previewed, where one is. */
  readonly preview?: ReadonlyArray<string> | null
}): Asked => {
  /**
   * A draft with nothing in it yet is asking nothing, so it falls through to
   * the list rather than being an empty question: the panel below would
   * otherwise have to answer "these no features", and what it did answer with
   * was the whole catalog (Paul, 2026-09-02).
   */
  if (draft && draft.tags.length > 0) {
    return { tags: draft.tags, results: draft.results, summary: false }
  }
  /**
   * **A part-level assembly asks nothing.** It has no features, so there is
   * nothing to judge a tool against: the table under it is the catalog, the
   * three racks are the crib, and what is being decided is which of them goes
   * into the stack. Falling through to `selected.tags` would have said the same
   * thing with an empty array, but only by accident — this says it.
   */
  if (selected?.kind === 'assembly') {
    return { tags: [], results: 'all', summary: true }
  }
  if (selected) {
    return {
      tags: selected.tags,
      results: selected.kind === 'group' ? selected.results : 'all',
      /**
       * A group asked for one tool *each* is a summary of itself: one row for
       * the group, opened to a row per feature (Paul, 2026-09-02). There is no
       * flat list to show, because "the tools for these six features" is six
       * answers rather than one.
       */
      summary: selected.kind === 'group' && selected.results === 'each',
    }
  }
  if (preview && preview.length > 0) {
    return { tags: preview, results: 'all', summary: false }
  }
  return { tags: [], results: 'all', summary: true }
}

/* --------------------------- kept in the browser -------------------------- */

/**
 * **The list is the work, so it survives a reload** (Paul, 2026-09-02: "we need
 * to be showing the tool/feature list — it keeps disappearing").
 *
 * The setup sheet has been kept per part since 2026-08-10 and the list was not,
 * so every refresh — and, on a dev server, every hot update — threw away
 * everything somebody had picked out while the tools they had chosen for it
 * stayed on the bill. The two are the same decision seen from two ends; they
 * are kept the same way, under the same part id.
 */
const KEY = (partId: string) => `tool-catalog.features.${partId}`

const isItem = (value: unknown): value is ListItem => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const item = value as ListItem
  return (
    (item.kind === 'feature' || item.kind === 'group' || item.kind === 'assembly') &&
    typeof item.id === 'string' &&
    Array.isArray(item.tags) &&
    item.tags.every((tag) => typeof tag === 'string') &&
    // Absent on every row stored before the field existed, which reads as
    // unnamed — see `AssemblyItem.name`.
    (item.kind !== 'assembly' || item.name === undefined || typeof item.name === 'string') &&
    (item.kind !== 'group' || item.results === 'all' || item.results === 'each')
  )
}

/** What was kept for this part, or nothing where it is another part's or unreadable. */
export const readList = (
  storage: Pick<Storage, 'getItem'> | null,
  partId: string,
): Array<ListItem> => {
  const raw = storage?.getItem(KEY(partId))
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isItem) : []
  } catch {
    return []
  }
}

export const writeList = (
  storage: Pick<Storage, 'setItem'> | null,
  partId: string,
  list: ReadonlyArray<ListItem>,
): void => {
  storage?.setItem(KEY(partId), JSON.stringify(list))
}

/** The list for one part, kept in this browser — `useSetupSheet`'s twin. */
export const useFeatureList = (partId: string) => {
  const [list, setList] = useState<ReadonlyArray<ListItem>>([])
  /**
   * The list as it stands, for an update written from the one before it.
   *
   * The callers pass `current => next`, and the write has to happen outside
   * the state updater: React calls an updater twice in development, and a
   * `localStorage` write inside one is a side effect in a pure function.
   */
  const held = useRef<ReadonlyArray<ListItem>>([])

  useEffect(() => {
    const kept = readList(globalThis.localStorage ?? null, partId)
    held.current = kept
    setList(kept)
  }, [partId])

  const commit = useCallback(
    (
      next:
        | ReadonlyArray<ListItem>
        | ((current: ReadonlyArray<ListItem>) => ReadonlyArray<ListItem>),
    ) => {
      const made = typeof next === 'function' ? next(held.current) : next
      held.current = made
      setList(made)
      writeList(globalThis.localStorage ?? null, partId, made)
    },
    [partId],
  )

  return { list, setList: commit }
}
