import { describe, expect, it } from 'vitest'
import { arrowsVisible, nextArrows, shownArrow } from './arrows'

const nothing = { focusedDirection: null, activeDirection: null }

describe('nextArrows', () => {
  it('has two states', () => {
    expect(nextArrows('off')).toBe('all')
    expect(nextArrows('all')).toBe('off')
  })
})

describe('arrowsVisible', () => {
  it('draws nothing with the toggle off and nothing selected', () => {
    // An arrow per way up is most of a small part, answering a question nobody
    // has asked yet.
    expect(arrowsVisible('off', nothing)).toBe(false)
  })

  it('draws them when they are asked for', () => {
    expect(arrowsVisible('all', nothing)).toBe(true)
  })

  it('draws one on its own while a feature is being read', () => {
    expect(arrowsVisible('off', { focusedDirection: 2, activeDirection: null })).toBe(true)
  })

  it('draws one while a direction is being held', () => {
    expect(arrowsVisible('off', { focusedDirection: null, activeDirection: 1 })).toBe(true)
  })
})

describe('shownArrow', () => {
  it('narrows nothing when they were turned on deliberately', () => {
    // Every way up is the question being asked, so none of them is the answer.
    expect(shownArrow('all', { focusedDirection: 2, activeDirection: 1 })).toBeNull()
  })

  it('prefers the direction being held over the one being read', () => {
    // Holding one is the more immediate thing to have said, and it survives
    // looking at readings within it.
    expect(shownArrow('off', { focusedDirection: 2, activeDirection: 1 })).toBe(1)
  })

  it('falls back to the way up the feature being read is cut from', () => {
    expect(shownArrow('off', { focusedDirection: 2, activeDirection: null })).toBe(2)
  })

  it('shows none rather than all when there is nothing to show', () => {
    // `-1` matches no candidate, where `null` would mean "all of them" — the
    // difference between an empty answer and every answer at once.
    expect(shownArrow('off', nothing)).toBe(-1)
  })
})
