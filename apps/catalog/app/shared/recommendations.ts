import type { CatalogTool } from '@toolpath/catalog-data'
import { groupLabel, labelOf, type ListItem } from './feature-list'

/**
 * The list, answered a row at a time.
 *
 * **With nothing selected the page still has something to say** (Paul,
 * 2026-09-02): the list is a set of questions somebody has asked, so the table
 * under it is the answers — the one tool recommended for each row. Selecting a
 * row is how you go from that answer to the whole list behind it.
 *
 * A group asked for one tool for **all** of its features answers in one row,
 * because that is the question. A group asked for one **each** answers in one
 * row too, and opens: the group has no single answer, and printing six rows
 * where the list has one item would make a two-item list eight rows long.
 *
 * Pure: matching answers arrive as data, so this module is about what a row
 * says and never about calculating a tool choice.
 */
/**
 * What a row is answered with.
 *
 * **The decision where there is one, the recommendation where there is not**
 * (Paul, 2026-09-02: "holders and collets should also be shown with the tool in
 * the feature list"). Once somebody has put a tool on the bill for a feature,
 * that — with whatever it is held in — is the answer; the rules' own pick is
 * what stands in until then.
 */
export interface Pick {
  readonly tool: CatalogTool
  /** The holder it is held in, by catalog number, where one has been chosen. */
  readonly holder: string | null
  readonly collet: string | null
}

export interface Answer {
  /**
   * The tools answering these features.
   *
   * **More than one, where somebody chose more than one** (Paul, 2026-09-02: "a
   * feature or group can have multiple tools saved to it, not just one"). A
   * hole is a spot drill and a drill; the sheet has always held a list, and the
   * row showed the head of it.
   *
   * Exactly one where it is a recommendation: the rules put one tool first.
   */
  readonly picks: ReadonlyArray<Pick>
  /** Whether somebody chose these, rather than the rules recommending one. */
  readonly chosen: boolean
}

export interface RecommendationRow {
  /** Unique in the table: the item's id, or the item's id and the feature's tag. */
  readonly id: string
  /** The item this row belongs to, which is what selecting it selects. */
  readonly itemId: string
  /** The feature a child row is about; null on an item's own row. */
  readonly tag: string | null
  readonly label: string
  /** The tools answering this row — empty where it has no answer. */
  readonly picks: ReadonlyArray<Pick>
  /** Whether the answer is a decision rather than a recommendation. */
  readonly chosen: boolean
  /** What the row says in place of a tool: how many, or that there are none. */
  readonly note: string | null
  /** The rows this one opens to — only a group asked for one tool each. */
  readonly children: ReadonlyArray<RecommendationRow>
}

/** A saved choice is immediate; unsaved worker answers have explicit states. */
export type RecommendationAnswer = Answer | 'pending' | 'nothing-fits' | 'error'

export interface Reading {
  /** Answers keyed by the stable demand key the route sent to the worker. */
  readonly answers: ReadonlyMap<string, RecommendationAnswer>
  /** The key a tags set has in the worker request/result protocol. */
  readonly demandKey: (tags: ReadonlyArray<string>) => string
  /** What one feature is called. */
  readonly nameOf: (tag: string) => string
  /**
   * The distinct features inside a group.
   *
   * Eight identical holes are one decision and one child row — the same rule
   * `groupOf` holds everywhere else. Without it, a group built from a bolt
   * circle opens into eight rows saying the same thing.
   */
  readonly split?: (tags: ReadonlyArray<string>) => Array<ReadonlyArray<string>>
}

const oneEach = (tags: ReadonlyArray<string>): Array<ReadonlyArray<string>> =>
  tags.map((tag) => [tag])

/** How many different tools a set of rows answers with. */
const distinct = (rows: ReadonlyArray<RecommendationRow>): number =>
  new Set(rows.flatMap((row) => row.picks.map((pick) => pick.tool.guid))).size

export const recommendationRows = (
  list: ReadonlyArray<ListItem>,
  { answers, demandKey, nameOf, split = oneEach }: Reading,
): Array<RecommendationRow> =>
  list.map((item) => {
    const label = labelOf(item, nameOf)
    if (item.kind === 'group' && item.results === 'each') {
      const children = split(item.tags).map((tags) => {
        const answer = answers.get(demandKey(tags)) ?? 'pending'
        const picked = typeof answer === 'object' ? answer : null
        return {
          id: `${item.id}:${tags[0] ?? ''}`,
          itemId: item.id,
          tag: tags[0] ?? null,
          label: groupLabel(tags.map(nameOf)),
          picks: picked?.picks ?? [],
          chosen: picked?.chosen ?? false,
          note:
            answer === 'pending'
              ? 'Finding a compatible tool...'
              : answer === 'error'
                ? 'Unable to match tools. Retry the selection.'
                : answer === 'nothing-fits'
                  ? 'nothing fits'
                  : null,
          children: [],
        }
      })
      const kinds = distinct(children)
      const only = kinds === 1 ? (children.find((row) => row.picks.length > 0) ?? null) : null
      const pending = children.some((row) => row.note === 'Finding a compatible tool...')
      const failed = children.some(
        (row) => row.note === 'Unable to match tools. Retry the selection.',
      )
      return {
        id: item.id,
        itemId: item.id,
        tag: null,
        label,
        /*
          One answer for the whole group where every feature landed on the same
          tool — which is what a group of identical holes does, and saying
          "3 tools" about one drill would be a worse answer than the drill.
        */
        picks: only?.picks ?? [],
        chosen: only?.chosen ?? false,
        note: pending
          ? 'Finding compatible tools...'
          : failed
            ? 'Unable to match tools. Retry the selection.'
            : kinds === 1
              ? null
              : kinds === 0
                ? 'nothing fits'
                : `${String(kinds)} tools, one per feature`,
        children,
      }
    }
    const answer = answers.get(demandKey(item.tags)) ?? 'pending'
    const picked = typeof answer === 'object' ? answer : null
    return {
      id: item.id,
      itemId: item.id,
      tag: null,
      label,
      picks: picked?.picks ?? [],
      chosen: picked?.chosen ?? false,
      note:
        answer === 'pending'
          ? 'Finding a compatible tool...'
          : answer === 'error'
            ? 'Unable to match tools. Retry the selection.'
            : answer === 'nothing-fits'
              ? item.kind === 'group'
                ? 'no one tool cuts all of these'
                : 'nothing fits'
              : null,
      children: [],
    }
  })
