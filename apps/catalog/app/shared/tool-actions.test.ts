import { describe, expect, it } from 'vitest'
import { toolActionLabel, toolActions } from './tool-actions'

const asked = (over: Partial<Parameters<typeof toolActions>[0]> = {}) =>
  toolActions({ active: true, mapped: 0, here: false, assemblyChanged: false, ...over })

/**
 * **A feature or a group can hold more than one tool** (Paul, 2026-09-02). With
 * more than one allowed, "what does this button do" stops being obvious and
 * becomes four different questions.
 */
describe('what the panel offers for the tool it is showing', () => {
  it('offers nothing where nothing is being asked about', () => {
    expect(asked({ active: false, mapped: 2 })).toEqual([])
  })

  it('adds the first tool to what has none', () => {
    expect(asked()).toEqual(['add'])
  })

  /**
   * The update is offered on a change rather than always: a button that saves
   * what is already saved is one somebody presses to find out whether it did
   * anything (Paul, 2026-09-02: "update tool assembly *if* a holder or collet
   * is added, edited, or removed").
   */
  it('offers to remove a tool it already cuts with, and to update it only when its holding changed', () => {
    expect(asked({ mapped: 1, here: true })).toEqual(['remove'])
    expect(asked({ mapped: 1, here: true, assemblyChanged: true })).toEqual(['update', 'remove'])
  })

  /** A tool that is not one of them can take their place, or stand beside them. */
  it('offers to replace what is mapped, or to join it', () => {
    expect(asked({ mapped: 2, here: false })).toEqual(['replace', 'also'])
  })
})

/**
 * **Replace names the tool it drops** (Paul, 2026-09-02), because with several
 * mapped there is otherwise no telling which one goes.
 */
describe('what each button says', () => {
  it('names the one tool it would drop', () => {
    expect(toolActionLabel('replace', { dropping: ['B976Z02500'] })).toBe('Replace B976Z02500')
  })

  it('says how many where naming one would be a lie', () => {
    expect(toolActionLabel('replace', { dropping: ['B976Z02500', 'K285A03000'] })).toBe(
      'Replace all tools',
    )
    expect(toolActionLabel('replace')).toBe('Replace all tools')
  })

  it('says plainly what the rest do', () => {
    expect(toolActionLabel('add')).toBe('Add tool')
    expect(toolActionLabel('also')).toBe('Add this tool')
    expect(toolActionLabel('update')).toBe('Update tool assembly')
    expect(toolActionLabel('remove')).toBe('Remove tool')
  })
})
