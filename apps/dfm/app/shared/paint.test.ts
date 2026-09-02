import { describe, expect, it } from 'vitest'
import {
  PAINT_WEIGHT,
  loadPaintMode,
  paintWash,
  regionWash,
  savePaintMode,
  PAINTED_HEX,
  PROPOSED_HEX,
  paintedWash,
  proposedWash,
} from './paint'
import { BAND_HEX, UNJUDGED_HEX } from './bands'

describe('paintWash', () => {
  it('paints nothing at all in plain', () => {
    expect(paintWash('plain')).toEqual([])
  })
})

describe('the mode persists', () => {
  it('round-trips through storage and defaults to plain', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }

    expect(loadPaintMode(storage)).toBe('plain')
    savePaintMode(storage, 'difficulty')
    expect(loadPaintMode(storage)).toBe('difficulty')
  })

  it('restores the directions mode, now that it is offered again', () => {
    // It was removed once and `loadPaintMode` deliberately fell back to plain
    // for a stored 'directions'. It is a real mode again, pointed at the plan.
    const storage = { getItem: () => 'directions', setItem: () => undefined }

    expect(loadPaintMode(storage)).toBe('directions')
  })

  it('still falls back to plain for a mode this release does not offer', () => {
    // A part coloured by something with no button to turn it off reads as the
    // part being wrong.
    const storage = { getItem: () => 'sharp-corners', setItem: () => undefined }

    expect(loadPaintMode(storage)).toBe('plain')
  })

  it('survives having no storage at all', () => {
    expect(loadPaintMode(null)).toBe('plain')
    expect(() => savePaintMode(null, 'difficulty')).not.toThrow()
  })
})

describe('the difficulty wash', () => {
  const verdicts = [
    { tag: 'easy-1', band: 'easy' as const },
    { tag: 'refused-1', band: 'no go' as const },
    { tag: 'unjudged-1', band: null },
  ]

  /*
   * Everything mapped, because difficulty paints the work **the plan will do**.
   * A face is read from every way up that reaches it and all but one of those
   * must lose, so painting every verdict coloured the part by trouble no
   * operation on it would ever meet.
   */
  const allMapped = new Map(verdicts.map((verdict, at) => [verdict.tag, at]))

  it('gives every mapped feature the colour of the band it landed in', () => {
    const wash = paintWash('difficulty', verdicts, allMapped)

    expect(wash.find((each) => each.tag === 'easy-1')?.color).toBe(BAND_HEX.easy)
    expect(wash.find((each) => each.tag === 'refused-1')?.color).toBe(BAND_HEX['no go'])
  })

  it('gives a feature nothing judged a colour that is not the colour of easy', () => {
    const wash = paintWash('difficulty', verdicts, allMapped)

    // "Nothing judged this" and "this is fine" are different statements, and a
    // part that shows them the same way is a part claiming to have been checked.
    expect(wash.find((each) => each.tag === 'unjudged-1')?.color).toBe(UNJUDGED_HEX)
    expect(UNJUDGED_HEX).not.toBe(BAND_HEX.easy)
  })

  it('paints the easiest reading last, so a shared surface shows its best', () => {
    const order = paintWash('difficulty', verdicts, allMapped).map((each) => each.tag)

    // A face nobody has placed is shown at its best — the best a shop could do
    // if it held the part that way. Unjudged sits behind everything, since
    // "nobody looked" should not cover a colour that means something.
    expect(order).toEqual(['unjudged-1', 'refused-1', 'easy-1'])
  })

  it('says nothing in the other modes, whatever the rules made of the part', () => {
    expect(paintWash('plain', verdicts)).toEqual([])
  })
})

describe('what each layer of the part means', () => {
  it('painting, an offer and difficulty are three different colours', () => {
    // Painted faces used to render through the picked-face highlight, so the
    // part showed two meanings in one colour and neither could be told apart.
    expect(PAINTED_HEX).not.toBe(PROPOSED_HEX)
  })

  it('an offer goes on over what is painted', () => {
    // Weakest first: the newest question is the one on screen.
    const wash = [...paintedWash([{ featureTag: 'a' }]), ...proposedWash([{ featureTag: 'a' }])]

    expect(wash.at(-1)?.color).toBe(PROPOSED_HEX)
  })
})

describe('the part by who cuts what', () => {
  it('colours a feature by the way up the plan gives it, not the one it was reported from', () => {
    // A feature is reported from every direction that can reach it, so
    // colouring by that would paint a decision nobody made.
    const wash = paintWash('directions', [], new Map([['pocket', 1]]))

    expect(wash).toHaveLength(1)
    expect(wash[0]?.tag).toBe('pocket')
  })

  it('leaves a feature nothing cuts with no colour at all', () => {
    // Which is the question the page exists to close.
    expect(paintWash('directions', [], new Map())).toEqual([])
  })

  it('has no standing opinion in plain', () => {
    expect(paintWash('plain', [], new Map([['pocket', 1]]))).toEqual([])
  })
})

describe('how hard the part is once a plan exists', () => {
  const verdicts = [
    { tag: 'easy-alternative', band: 'easy' as const },
    { tag: 'the-one-we-cut', band: 'rats' as const },
  ]

  it('lets the mapped reading paint over the alternatives nobody chose', () => {
    // Letting the gentlest reading paint says the part is easier than the plan
    // makes it.
    const wash = paintWash('difficulty', verdicts, new Map([['the-one-we-cut', 0]]))

    expect(wash.at(-1)?.tag).toBe('the-one-we-cut')
  })

  it('paints nothing at all while nothing is mapped', () => {
    /*
     * **A change of model.** Difficulty showed every candidate because there
     * was no mapping to show instead; now there is, and a part with nothing
     * placed has no work to be hard. The colour arrives face by face as the
     * work does, which makes the wash a picture of the plan rather than of the
     * report.
     */
    expect(paintWash('difficulty', verdicts, new Map())).toEqual([])
  })

  it('follows the pass being shown', () => {
    // The map it is given is already the pass's own, so roughing and finishing
    // can disagree about which reading cuts a face and the part follows.
    const roughed = paintWash('difficulty', verdicts, new Map([['the-one-we-cut', 0]]))
    const finished = paintWash('difficulty', verdicts, new Map([['easy-alternative', 0]]))

    expect(roughed.at(-1)?.tag).not.toBe(finished.at(-1)?.tag)
  })
})

describe('the difficulty wash on a reading that was split', () => {
  /*
   * Paul, running it: a feature cut down to only some of its faces lost its
   * difficulty colour entirely. Such a reading drops out of the by-tag map on
   * purpose — the viewer would expand its tag to faces the plan has given
   * away — and difficulty had no face-by-face layer to catch it, so the part
   * went grey exactly where a reading had been divided.
   */
  const cut = new Map([
    [1, 'profile-1'],
    [2, 'profile-1'],
  ])

  it('paints the faces it still cuts, in the band of the reading cutting them', () => {
    expect(regionWash('difficulty', new Map(), cut, [{ tag: 'profile-1', band: 'rats' }])).toEqual([
      { region: 1, color: BAND_HEX.rats, weight: PAINT_WEIGHT },
      { region: 2, color: BAND_HEX.rats, weight: PAINT_WEIGHT },
    ])
  })

  it('paints a reading no rule reached in the unjudged colour, not in nothing', () => {
    const [face] = regionWash('difficulty', new Map(), cut, [{ tag: 'profile-1', band: null }])

    expect(face?.color).toBe(UNJUDGED_HEX)
  })

  it('leaves a face grey when nothing judged the reading at all', () => {
    // Grey means "nothing cuts this", which the page depends on being able to
    // say — so a tag with no verdict of any kind is not painted over it.
    expect(regionWash('difficulty', new Map(), cut, [])).toEqual([])
  })

  it('still paints directions face by face, and does not cross the two', () => {
    expect(regionWash('directions', new Map([[1, 0]]), cut, []).map((face) => face.region)).toEqual(
      [1],
    )
    expect(regionWash('plain', new Map([[1, 0]]), cut, [])).toEqual([])
  })
})
