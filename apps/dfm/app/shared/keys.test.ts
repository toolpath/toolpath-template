import { describe, expect, it } from 'vitest'

import { isTyping, keyIntent, planKey } from './keys'

describe('what a key means to the reading in hand', () => {
  it('assigns one pass with R or F', () => {
    expect(planKey('r')).toEqual({ act: 'pass', passes: ['rough'] })
    expect(planKey('f')).toEqual({ act: 'pass', passes: ['finish'] })
  })

  it('assigns both with either A or B', () => {
    // People reach for either, and neither is worth being the one that does
    // nothing.
    expect(planKey('a')).toEqual({ act: 'pass', passes: ['rough', 'finish'] })
    expect(planKey('b')).toEqual({ act: 'pass', passes: ['rough', 'finish'] })
  })

  it('prunes with X, Delete or Backspace', () => {
    // The three mean the same thing to a hand on a keyboard. What they prune
    // from is the caller's business — an offer, and only an offer.
    for (const key of ['x', 'Delete', 'Backspace']) {
      expect(planKey(key)).toEqual({ act: 'remove' })
    }
  })

  it('reads a capital the same as a small letter', () => {
    expect(planKey('R')).toEqual(planKey('r'))
  })

  it('has nothing to say about any other key', () => {
    for (const key of ['q', 'Enter', 'ArrowDown', ' ']) {
      expect(planKey(key)).toBeNull()
    }
  })
})

describe('somebody typing rather than acting', () => {
  it('leaves an input alone', () => {
    // A plan rewritten by somebody spelling a word.
    expect(isTyping({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTyping({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
  })

  it('acts anywhere else', () => {
    expect(
      isTyping({ tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget),
    ).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})

describe('what a keystroke at the window means', () => {
  const press = (key: string, where: { typing?: boolean; inList?: boolean } = {}) =>
    keyIntent({ key, typing: where.typing ?? false, inList: where.inList ?? false })

  // A shortcut that fires while a name is being typed is a plan rewritten by
  // somebody spelling a word.
  it('is nothing at all while somebody is typing', () => {
    expect(press('r', { typing: true })).toBeNull()
    expect(press('Escape', { typing: true })).toBeNull()
    expect(press('z', { typing: true })).toBeNull()
    expect(press('ArrowDown', { typing: true })).toBeNull()
  })

  it('sends Escape outward', () => {
    expect(press('Escape')).toEqual({ act: 'escape' })
  })

  // Escape works even inside a list: leaving is the one thing that has to be
  // possible from wherever the keyboard happens to be.
  it('sends Escape outward from inside a list too', () => {
    expect(press('Escape', { inList: true })).toEqual({ act: 'escape' })
  })

  it('gives Z the arrows, in either case', () => {
    expect(press('z')).toEqual({ act: 'arrows' })
    expect(press('Z')).toEqual({ act: 'arrows' })
  })

  it('reads the plan keys, wherever the keyboard is', () => {
    expect(press('r')).toEqual({ act: 'plan', plan: { act: 'pass', passes: ['rough'] } })
    expect(press('f', { inList: true })).toEqual({
      act: 'plan',
      plan: { act: 'pass', passes: ['finish'] },
    })
    expect(press('x', { inList: true })).toEqual({ act: 'plan', plan: { act: 'remove' } })
  })

  /*
   * The guard that only the last rung gets. The keys above act on the row under
   * the keyboard, which is usually *inside* one of these lists — guarding all
   * of them is why they did nothing at all.
   */
  it('steps through the readings only outside a list', () => {
    expect(press('ArrowDown')).toEqual({ act: 'step', by: 1 })
    expect(press('ArrowUp')).toEqual({ act: 'step', by: -1 })

    // Inside one, the list walks itself in the order it is drawn.
    expect(press('ArrowDown', { inList: true })).toBeNull()
    expect(press('ArrowUp', { inList: true })).toBeNull()
  })

  it('leaves everything else alone', () => {
    expect(press('q')).toBeNull()
    expect(press('ArrowLeft')).toBeNull()
    expect(press('Enter')).toBeNull()
  })
})
