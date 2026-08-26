import { describe, expect, it } from 'vitest'

import { isTyping, planKey } from './keys'

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
