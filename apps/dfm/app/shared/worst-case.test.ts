import { describe, expect, it } from 'vitest'

import { addedFrom, asPlanned, isDerived, withEngineDatasheet, worstDatasheet } from './worst-case'
import { EMPTY_PLAN, PASSES } from './setups'
import { TEST_DIRECTIONS, testFeature } from './test-part'
import { setFaceCut } from './faces'
import type { PartFeature } from './contracts'

/**
 * A reading as the plan has it, rather than as the Engine reported it.
 *
 * A face handed to a reading is a face one tool now has to reach, and the
 * datasheet had no idea — it went on reporting the reading as it was before.
 */
const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!

const sheet = (over: Record<string, unknown>) => over as unknown as PartFeature['datasheet']

const wall: PartFeature = {
  ...testFeature('wall', 'wall', UP, [0]),
  datasheet: sheet({ zMin: -2, facts: { kind: 'Wall', cd: { ignore: { min: 10 } } } }),
}

/** Deeper, and needing a smaller tool, than the wall it is handed to. */
const slot: PartFeature = {
  ...testFeature('slot', 'slot', UP, [1, 2, 3]),
  datasheet: sheet({ zMin: -20, facts: { kind: 'Slot', cd: { ignore: { min: 2 } } } }),
}

/** The same face, but reached from the other side: a different operation. */
const other: PartFeature = {
  ...testFeature('other', 'pocket', DOWN, [1]),
  datasheet: sheet({ zMin: -50, facts: { kind: 'Pocket', cd: { ignore: { min: 1 } } } }),
}

const features = [wall, slot, other]
const handed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, wall, PASSES, 1, true)
const planned = asPlanned({ features }, [1], wall)

describe('a reading handed a face', () => {
  it('reaches the deeper floor the added face brought with it', () => {
    // Reporting the depth of the reading as it was before is a measurement of
    // something nobody is going to cut.
    expect((planned.datasheet as unknown as { zMin: number }).zMin).toBe(-20)
  })

  it('takes the smaller tool, because one tool has to reach all of it', () => {
    const facts = (planned.datasheet as unknown as { facts: { cd: { ignore: { min: number } } } })
      .facts

    expect(facts.cd.ignore.min).toBe(2)
  })

  it('names where the extra numbers came from, so they can be checked', () => {
    expect(addedFrom(planned).map((each) => each.featureTag)).toEqual(['slot'])
  })

  it('folds in the reading from the same way up, not one reaching in from elsewhere', () => {
    // The operation that face would otherwise have been part of — a reading cut
    // from the other side is a different setup and says nothing about this one.
    expect(addedFrom(planned).map((each) => each.featureTag)).not.toContain('other')
  })

  it('leaves a reading nothing was added to exactly as the Engine reported it', () => {
    // So every caller can ask without checking first.
    expect(asPlanned({ features }, [], wall)).toBe(wall)
  })

  it('reads the added faces off the plan, which is where they live', () => {
    expect(handed.assigned['wall']?.also?.['rough']).toEqual([1])
  })
})

describe('whose numbers these are', () => {
  /*
   * A made feature is meant to go back to the Engine for analysis, so anything
   * holding a datasheet has to be able to tell which kind it is holding. A
   * derived number presented as a measured one is the worst thing this panel
   * could do.
   */
  it('marks arithmetic as ours', () => {
    expect(isDerived(planned)).toBe(true)
  })

  it('leaves the Engine own readings unmarked', () => {
    expect(isDerived(wall)).toBe(false)
  })

  describe('when the Engine answers', () => {
    const measured = { zMin: -18.4, facts: { kind: 'Slot', cd: { ignore: { min: 2.2 } } } }
    const answered = withEngineDatasheet(planned, measured)

    it('replaces our arithmetic with the measurement', () => {
      expect((answered.datasheet as unknown as { zMin: number }).zMin).toBe(-18.4)
    })

    it('stops claiming to be derived, because it no longer is', () => {
      expect(isDerived(answered)).toBe(false)
    })

    it('keeps the construction record, which the Engine cannot produce', () => {
      // How this feature came to exist and what it was assembled from is
      // provenance a shop needs whether or not the numbers were measured.
      expect(addedFrom(answered).map((each) => each.featureTag)).toEqual(['slot'])
    })

    it('keeps it marked as made, so it is never mistaken for a reported reading', () => {
      const drawn = withEngineDatasheet(
        { ...wall, datasheet: { madeHere: true, derivedHere: true } } as unknown as PartFeature,
        measured,
      )

      expect((drawn.datasheet as unknown as { madeHere: boolean }).madeHere).toBe(true)
    })
  })
})

describe('the edges of the arithmetic', () => {
  it('invents nothing for a field no source reports', () => {
    /*
     * An absent measurement is a question the Engine did not answer, and
     * filling it in with zero answers it wrongly — a shop reading `0.00 in` for
     * a required cutter radius would take it as a measurement.
     */
    const bare = [
      { ...testFeature('a', 'wall', UP, [0]), datasheet: sheet({ zMin: -1 }) },
      { ...testFeature('b', 'wall', UP, [1]), datasheet: sheet({ zMin: -2 }) },
    ]
    const sheetOut = worstDatasheet(bare) as Record<string, unknown>

    expect(sheetOut['zMin']).toBe(-2)
    expect(sheetOut['wallishArea']).toBeUndefined()
    expect((sheetOut['facts'] as Record<string, unknown>)['cd']).toBeUndefined()
  })

  it('takes a field from the sources that do report it', () => {
    // Half an answer beats none: the source that reports a corner still has to
    // be cut by whatever tool this operation uses.
    const mixed = [
      { ...testFeature('a', 'wall', UP, [0]), datasheet: sheet({ facts: { kind: 'Wall' } }) },
      {
        ...testFeature('b', 'wall', UP, [1]),
        datasheet: sheet({ facts: { kind: 'Wall', cd: { ignore: { min: 4 } } } }),
      },
    ]
    const facts = (worstDatasheet(mixed) as { facts: { cd: { ignore: { min: number } } } }).facts

    expect(facts.cd.ignore.min).toBe(4)
  })

  it('answers nothing at all when no source has a datasheet', () => {
    const none = [testFeature('a', 'wall', UP, [0]), testFeature('b', 'wall', UP, [1])]

    expect(worstDatasheet(none)).toBeNull()
  })
})
