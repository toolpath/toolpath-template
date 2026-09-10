import { describe, expect, it } from 'vitest'
import type { ListItem } from './feature-list'
import { groupOffer, type GroupAsk } from './group-offer'

const feature: ListItem = { kind: 'feature', id: 'feature-1', tags: ['hole-a'] }
const group: ListItem = { kind: 'group', id: 'group-1', tags: ['hole-a'], results: 'all' }

/** A hole of thirty-nine, read on the part, with nothing else going on. */
const asked = (over: Partial<GroupAsk> = {}): GroupAsk => ({
  siblings: 39,
  dismissed: false,
  building: null,
  row: null,
  editing: false,
  ordered: false,
  ...over,
})

describe('offering the group a hole belongs to', () => {
  it('offers it for a hole with siblings, and opens a new group for a bare reading', () => {
    expect(groupOffer(asked())).toEqual({ count: 39, rowId: null })
  })

  it('says nothing about a hole with nothing like it', () => {
    expect(groupOffer(asked({ siblings: 1 }))).toBeNull()
  })

  /**
   * **Turned down for as long as the reading is held** (Paul, 2026-09-09: "if I
   * choose 'just this hole' but then exit without adding a tool assembly to the
   * order list, clicking the same hole again does not show the group again. It
   * should"). Whose reading it was is the caller's to track; the rule only
   * reads the answer.
   */
  it('stays quiet while it has been turned down', () => {
    expect(groupOffer(asked({ dismissed: true }))).toBeNull()
  })

  it('is not made while a group or a part-level assembly is being built', () => {
    expect(groupOffer(asked({ building: 'group' }))).toBeNull()
    expect(groupOffer(asked({ building: 'assembly' }))).toBeNull()
  })

  /**
   * **A row is turned into the group rather than joined by one** (Paul,
   * 2026-09-09: "when I'm editing the feature, I should have the option to
   * change it to a group always"). A group beside the feature it came from is
   * two rows for one decision.
   */
  it('names the row to change, where the reading is already one', () => {
    expect(groupOffer(asked({ row: feature }))).toEqual({ count: 39, rowId: 'feature-1' })
  })

  it('is never made about a group row', () => {
    expect(groupOffer(asked({ row: group }))).toBeNull()
  })

  /**
   * **Offered while the decision is open.** A feature with tools on the order
   * list is one somebody is buying against; a feature open in the editor is
   * exactly the moment for changing one's mind, whatever it holds.
   */
  it('leaves a row alone once it has tools on the order list', () => {
    expect(groupOffer(asked({ row: feature, ordered: true }))).toBeNull()
  })

  it('offers it anyway while that row is the one being edited', () => {
    expect(groupOffer(asked({ row: feature, ordered: true, editing: true }))).toEqual({
      count: 39,
      rowId: 'feature-1',
    })
  })

  /** Creating a feature is the same moment, with no row to change yet. */
  it('offers a new group while a feature is being created', () => {
    expect(groupOffer(asked({ building: 'feature' }))).toEqual({ count: 39, rowId: null })
  })
})
