import type { PartPick } from '@toolpath/viewer'
import { describe, expect, it } from 'vitest'
import { holdFace, sharedReadings, gatheredReadings, peekTarget } from './picks'

/**
 * Holding two faces asks "which reading covers both of these", which is the
 * only way to name one of the five to eight readings on a face without hunting
 * through a list of them.
 */
const pick = (region: number, ranked: string[]): PartPick => ({
  region,
  owners: ranked,
  ranked,
  best: ranked[0] ?? null,
  triangleIndex: region * 2,
  point: [0, 0, 0],
  normal: [0, 0, 1],
  modifiers: { alt: false, ctrl: false, meta: false, shift: false, secondary: false },
})

describe('holdFace', () => {
  it('adds a face that is not held', () => {
    expect(holdFace([pick(1, ['a'])], pick(2, ['b'])).map((p) => p.region)).toEqual([1, 2])
  })

  it('drops a face that is held, so the same click is a toggle', () => {
    expect(holdFace([pick(1, ['a']), pick(2, ['b'])], pick(1, ['a'])).map((p) => p.region)).toEqual(
      [2],
    )
  })
})

describe('sharedReadings', () => {
  it('keeps only the readings that own every held face', () => {
    const held = [
      pick(1, ['pocket', 'wall-a', 'profile']),
      pick(2, ['pocket', 'wall-b', 'profile']),
    ]

    // Two walls of a pocket resolve to the pocket and the profile that traces
    // it — the walls themselves own one face each and drop out.
    expect(sharedReadings(held)).toEqual(['pocket', 'profile'])
  })

  it('ranks by the newest click, so the face just added leads', () => {
    const held = [pick(1, ['profile', 'pocket']), pick(2, ['pocket', 'profile'])]

    expect(sharedReadings(held)).toEqual(['pocket', 'profile'])
  })

  it('reports nothing when the faces have no reading in common', () => {
    expect(sharedReadings([pick(1, ['a']), pick(2, ['b'])])).toEqual([])
  })

  it('is the face itself when only one is held', () => {
    expect(sharedReadings([pick(1, ['a', 'b'])])).toEqual(['a', 'b'])
  })
})

describe('gathering readings across several faces', () => {
  const pick = (region: number, owners: string[], ranked?: string[]) =>
    ({
      region,
      owners,
      ranked: ranked ?? owners,
      best: owners[0] ?? null,
      triangleIndex: region,
      point: [0, 0, 0],
      normal: [0, 0, 1],
      modifiers: { alt: false, ctrl: false, meta: false, shift: false, secondary: false },
    }) as unknown as PartPick

  it('takes every reading of every held face, not only the shared ones', () => {
    // Mapping asks "what work is here". A floor and a wall cut the same way up
    // are two readings to assign, not a failed intersection.
    const held = [pick(0, ['floor', 'profile']), pick(1, ['wall', 'profile'])]

    expect(gatheredReadings(held)).toEqual(['floor', 'profile', 'wall'])
  })

  it('still answers when the faces share nothing at all', () => {
    // Where `sharedReadings` correctly gives nothing, this gives both — which
    // is the difference between the two pages.
    const held = [pick(0, ['pocket']), pick(1, ['boss'])]

    expect(sharedReadings(held)).toEqual([])
    expect(gatheredReadings(held)).toEqual(['pocket', 'boss'])
  })

  it('keeps each face in pick order and its own ranking within that', () => {
    const held = [pick(0, ['a', 'b'], ['b', 'a']), pick(1, ['c'])]

    expect(gatheredReadings(held)).toEqual(['b', 'a', 'c'])
  })

  it('names a reading once however many held faces it owns', () => {
    const held = [pick(0, ['profile']), pick(1, ['profile'])]

    expect(gatheredReadings(held)).toEqual(['profile'])
  })

  it('is nothing when nothing is held', () => {
    expect(gatheredReadings([])).toEqual([])
  })
})

describe('what a right click is asking about', () => {
  it('means the reading that is already on screen', () => {
    // A face in a standing offer means the offered reading, not whichever
    // alternative the geometry ranked first.
    expect(peekTarget(['wall', 'profile'], [['profile']])).toBe('profile')
  })

  it('prefers the more specific list when a face is in several', () => {
    // Offered beats painted beats mapped: the newest question wins.
    expect(peekTarget(['a', 'b', 'c'], [['c'], ['b'], ['a']])).toBe('c')
  })

  it('means nothing when the face is in no list at all', () => {
    // Peeking is a question about a list. Opening the top-ranked reading
    // instead would be the silent best guess §3.8 forbids — a face usually has
    // several readings, and choosing one unasked decides which question was
    // meant. Left click asks that, and answers with the whole list.
    expect(peekTarget(['wall', 'profile'], [[], []])).toBeNull()
  })

  it('keeps the ranking among readings within one list', () => {
    expect(peekTarget(['wall', 'profile'], [['profile', 'wall']])).toBe('wall')
  })

  it('has nothing to say about a face with no readings', () => {
    expect(peekTarget([], [['a']])).toBeNull()
  })
})
