// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MapFeaturesPanel } from './map-features'
import { EMPTY_PLAN } from '../shared/setups'
import { lockSetup, setPassFor } from '../shared/plan-actions'
import { TEST_DIRECTIONS, testFeature, testPart } from '../shared/test-part'
import type { FeatureScore } from '../shared/feature-score'
import type { PartFeature } from '../shared/contracts'
import type { UncutFace } from '../shared/plan-summary'

/**
 * The panel where the mapping is done. The two interactions that cannot be
 * driven end to end without a mesh — the checkbox and the offers list — are
 * pinned here instead.
 */
afterEach(cleanup)

const pocket = testFeature('pocket', 'pocket', TEST_DIRECTIONS[0]!, [0])
const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[0]!, [1])
const profile = testFeature('profile', 'profile', TEST_DIRECTIONS[1]!, [0, 1])

/** Identical holes: same diameter, same depth, same way up — one tool. */
const testHole = (tag: string, region: number, direction = TEST_DIRECTIONS[0]!): PartFeature =>
  ({
    ...testFeature(tag, 'blind_hole', direction, [region]),
    datasheet: { facts: { kind: 'Hole', diameter: 6.35 }, zMin: -10, zMax: 0 },
  }) as PartFeature

// On faces the painting tests leave alone, so a hole never joins an offer that
// is measuring what a way up misses.
const holes = [testHole('hole-a', 2), testHole('hole-b', 3), testHole('hole-c', 5)]
const features = [pocket, wall, profile, ...holes]

const uncutFace = (idx: number, from: number[], area = 10): UncutFace => ({
  idx,
  shape: 'planar',
  area,
  // The readings the row opens onto. `from` is derived from these in
  // `uncutRows`; here they are given straight so a row can be built without one.
  owners: from.flatMap((at) =>
    features.filter((f) => f.machiningDirection === TEST_DIRECTIONS[at]),
  ),
  from,
})

const panel = (props: Partial<Parameters<typeof MapFeaturesPanel>[0]> = {}) => {
  const onSetPass = vi.fn()
  const onChoose = vi.fn()
  const onHighlightDirection = vi.fn()
  const onPrune = vi.fn()
  const onDiscard = vi.fn()
  const onInfer = vi.fn()
  const onShowFaces = vi.fn()
  const onMake = vi.fn()
  const onPickFace = vi.fn()
  render(
    <MapFeaturesPanel
      directions={TEST_DIRECTIONS}
      features={features}
      candidates={[]}
      plan={EMPTY_PLAN}
      scores={new Map<string, FeatureScore>()}
      unit="mm"
      mode="face"
      painted={new Set()}
      holding={null}
      focusedTag={null}
      faces={1}
      highlighted={null}
      showingUncut={false}
      uncut={[]}
      onPickFace={onPickFace}
      making={null}
      types={['pocket', 'wall', 'profile']}
      report={{ ...testPart(), features }}
      touching={new Map()}
      onHoverFace={vi.fn()}
      justMade={null}
      onAgain={vi.fn()}
      onDeleteMade={vi.fn()}
      onCutMadeFrom={vi.fn()}
      handedTags={new Set<string>()}
      onMake={onMake}
      onDraft={vi.fn()}
      onConfirmMade={vi.fn()}
      showingPass="rough"
      activeDirection={null}
      onLetGo={vi.fn()}
      proposal={null}
      proposed={[]}
      onInfer={onInfer}
      onPrune={onPrune}
      onDiscard={onDiscard}
      onHighlightDirection={onHighlightDirection}
      onMode={vi.fn()}
      onChoose={onChoose}
      onSetPass={onSetPass}
      onShowFaces={onShowFaces}
      onHover={vi.fn()}
      {...props}
    />,
  )
  return {
    onSetPass,
    onChoose,
    onHighlightDirection,
    onPrune,
    onDiscard,
    onInfer,
    onShowFaces,
    onMake,
    onPickFace,
  }
}

describe('what the list is showing', () => {
  it('leaves every mode unlit while the uncut list has the panel', () => {
    /*
     * **Not one of these buttons.** It was a fourth here and never belonged:
     * the three answer *how do I want to read the part* and stay answered,
     * while what-is-not-cut-yet is a question about the plan, asked from the
     * coverage bars that measure it and put down again. In the toggle it made
     * an exclusive choice out of two different kinds of thing.
     */
    panel({ showingUncut: true })

    const toggle = screen.getByRole('group', { name: 'What this list shows' })
    for (const each of within(toggle).getAllByRole('button')) {
      expect(each.getAttribute('aria-pressed')).not.toBe('true')
    }
  })

  it('offers By face first, because it is where the page opens', () => {
    // By direction needs a way up held before a click paints, and holding one
    // means pressing an arrow — so it cannot be the mode somebody arrives in. A
    // toggle whose pressed button is not the leftmost reads as though the page
    // started elsewhere and was moved.
    panel()

    const toggle = screen.getByRole('group', { name: 'What this list shows' })
    expect(
      within(toggle)
        .getAllByRole('button')
        .map((each) => each.textContent),
      // Create is a fourth thing the panel can be doing, and the only one that
      // adds to the part rather than reading it — so it comes last.
    ).toEqual(['By feature', 'By direction', 'Create'])
  })
})

describe('by face', () => {
  it('lists every reading that owns the picked face, rather than guessing one', () => {
    // Never resolve a multi-face pick silently to a best guess (§3.8).
    panel({ candidates: [pocket, profile] })

    expect(screen.getByText('Pocket')).toBeTruthy()
    expect(screen.getByText('Profile')).toBeTruthy()
  })

  it('groups the readings by the way up they are read from', () => {
    // Usually the same handful of shapes seen from three or four directions.
    // Grouped, the choice reads as "which way up, then which reading".
    panel({ candidates: [pocket, wall, profile] })

    // +Z holds the pocket and the wall; −Z holds the profile. The direction is
    // said once, in the header, rather than repeated on every row.
    expect(screen.getByText('+Z')).toBeTruthy()
    expect(screen.getByText('−Z')).toBeTruthy()
    expect(screen.getAllByText('+Z')).toHaveLength(1)
  })

  it('says what all three modes are for, not only the one being read', () => {
    /*
     * With nothing picked there is nothing to report, so the space is worth the
     * instruction — and the instruction people need is *which of these am I
     * meant to be in*, which a hint about the current one cannot answer.
     *
     * **No multi-pick tip**: gathering several faces is By direction's job done
     * by hand and badly, so teaching it here sends people the long way.
     */
    panel({ candidates: [], faces: 0 })

    expect(screen.getByText(/Click a face on the part to see every feature/)).toBeTruthy()
    expect(screen.getByText(/Click a candidate direction arrow/)).toBeTruthy()
    expect(screen.queryByText(/Hold ⌘ or Ctrl/)).toBeNull()
  })

  it('says how to edit a feature, which is the thing nobody finds', () => {
    panel({ candidates: [], faces: 0 })

    expect(screen.getByText(/Press the pencil on any row to edit that feature/)).toBeTruthy()
  })

  it('keeps Create quiet, because it is rarely the answer', () => {
    // It draws a reading the Engine never reported — right on a part it misread
    // and wrong nearly everywhere else. Three equal offers read as three equal
    // roads.
    panel({ candidates: [], faces: 0 })

    expect(screen.getByText(/Rarely needed/)).toBeTruthy()
  })

  it('gathers readings across faces rather than narrowing to a shared one', () => {
    // Two faces that share no feature still both contribute: mapping asks
    // "what work is here", not "what are these both part of".
    panel({ candidates: [pocket, profile], faces: 2 })

    expect(screen.getByText(/Every reading of/)).toBeTruthy()
    expect(screen.getByText('Pocket')).toBeTruthy()
    expect(screen.getByText('Profile')).toBeTruthy()
  })
})

describe('by direction', () => {
  it('asks for a way up before it asks for faces', () => {
    panel({ mode: 'direction' })

    expect(screen.getByText(/Click a candidate direction arrow/)).toBeTruthy()
  })

  it('shows what the held way up cuts, and only that one', () => {
    // Holding a direction *is* the choice. Offering the other three afterwards
    // asks somebody to make it twice.
    panel({ mode: 'direction', holding: 0, painted: new Set([0, 1]) })

    expect(screen.getByText(/faces\s*painted/)).toBeTruthy()
    expect(screen.getByText('+Z')).toBeTruthy()
    expect(screen.queryByText('−Z')).toBeNull()
  })

  it('says what the held way up would miss rather than hiding it', () => {
    panel({ mode: 'direction', holding: 0, painted: new Set([0, 1, 4]) })

    expect(screen.getAllByText(/misses/).length).toBeGreaterThan(0)
  })

  it('says plainly when the held way up reaches none of the painted faces', () => {
    // An empty list would read as a bug; the next move is to hold another way
    // up, and only saying so makes that obvious.
    panel({ mode: 'direction', holding: 2, painted: new Set([4]) })

    expect(screen.getByText(/cannot reach any of these faces/)).toBeTruthy()
  })
})

describe('which way up is being worked', () => {
  it('says so before anything has been picked', () => {
    // Otherwise the only things saying so are an arrow on the part and a flag
    // over the viewport, and the panel that acts on it stays silent about what
    // it would act on.
    panel({ mode: 'direction', holding: 0 })

    expect(screen.getByText(/Holding \+Z/)).toBeTruthy()
  })

  it('says nothing while no way up is held', () => {
    panel({ mode: 'direction', holding: null })

    expect(screen.queryByText(/Holding/)).toBeNull()
  })
})

describe('a direction row is a control, not a caption', () => {
  it('lights everything that way up would cut of what is in hand', () => {
    const { onHighlightDirection } = panel({ candidates: [pocket, wall, profile] })

    fireEvent.click(screen.getByRole('button', { name: /\+Z/ }))

    expect(onHighlightDirection).toHaveBeenCalledWith(0, ['pocket', 'wall'])
  })

  it('acts on the whole group in one press', () => {
    const { onSetPass } = panel({ candidates: [pocket, wall, profile] })

    const header = screen.getByRole('button', { name: /\+Z/ }).parentElement!
    fireEvent.click(within(header).getByRole('button', { name: 'Both' }))

    expect(onSetPass).toHaveBeenCalledTimes(1)
    expect(onSetPass.mock.calls[0]![0].map((f: { featureTag: string }) => f.featureTag)).toEqual([
      'pocket',
      'wall',
    ])
    expect(onSetPass.mock.calls[0]![1]).toEqual(['rough', 'finish'])
  })

  it('reads as part-done while any reading of the group is not yet cut there', () => {
    /*
     * "Already there" is a property of the whole group: judging it reading by
     * reading would make one press both assign and unassign. So the press still
     * puts the rest on — but the button says `mixed` rather than claiming the
     * group is either untouched or done, because it is neither.
     */
    const plan = {
      setups: [{ id: 's', directionIndex: 0, name: '+Z' }],
      assigned: { pocket: { rough: 's' } },
    }
    const { onSetPass } = panel({ candidates: [pocket, wall], plan })

    const header = screen.getByRole('button', { name: /\+Z/ }).parentElement!
    const rough = within(header).getByRole('button', { name: 'R' })
    expect(rough.getAttribute('aria-pressed')).toBe('mixed')

    fireEvent.click(rough)
    expect(onSetPass.mock.calls[0]![1]).toEqual(['rough'])
  })
})

describe('identical holes are one row, and the row opens', () => {
  it('stands for every identical hole on the part, not just the one clicked', () => {
    /*
     * The candidates hold the readings of the *face* that was clicked, so one
     * of three identical holes arrives alone — while the part lights all three
     * and the datasheet says so. A list saying "×1" about that is the one place
     * the grouping is worth most.
     */
    panel({ candidates: [holes[0]!] })

    expect(screen.getByText('×3')).toBeTruthy()
    expect(screen.getByTitle(/3 identical holes/)).toBeTruthy()
  })

  it('names them as the several they are, with the count against the name', () => {
    // "Blind holes ×3" is one phrase. A singular in front of a count makes the
    // reader correct it, and a count pushed out past the tool and the face
    // count stops being part of the name at all.
    panel({ candidates: [holes[0]!] })

    expect(screen.queryByText('Blind hole')).toBeNull()
    // Immediately beside it, not out past the tool and the face count.
    expect(screen.getByText('Blind holes').nextElementSibling?.textContent).toBe('×3')
  })

  it('presses all of them at once, because they are one tool and one operation', () => {
    const { onSetPass } = panel({ candidates: [holes[0]!] })

    const row = screen.getByRole('button', { name: /Blind hole/ }).parentElement!
    fireEvent.click(within(row).getByRole('button', { name: 'Both' }))

    expect(onSetPass.mock.calls[0]![0].map((f: { featureTag: string }) => f.featureTag)).toEqual([
      'hole-a',
      'hole-b',
      'hole-c',
    ])
  })

  it('counts what the rows stand for in the direction above them', () => {
    // A header saying 1 over a row saying ×3 is two answers to one question,
    // and its own R would then press one hole of three.
    const { onHighlightDirection } = panel({ candidates: [holes[0]!] })

    fireEvent.click(screen.getByRole('button', { name: /\+Z/ }))

    expect(onHighlightDirection).toHaveBeenCalledWith(0, ['hole-a', 'hole-b', 'hole-c'])
  })

  it('is closed to begin with — the group is the decision somebody usually wants', () => {
    panel({ candidates: [holes[0]!] })

    expect(screen.getByRole('button', { name: /Show these 3 holes/ })).toBeTruthy()
    expect(screen.queryByText('hole-b')).toBeNull()
  })

  it('opens to the holes themselves, each pressable on its own', () => {
    // "All but that one" is a fair question — a hole under a boss, one that has
    // to be reamed — and a group that cannot be opened answers it by making
    // somebody click every hole on the part.
    const { onSetPass } = panel({ candidates: [holes[0]!] })

    fireEvent.click(screen.getByRole('button', { name: /Show these 3 holes/ }))

    const row = screen.getByRole('button', { name: /hole-b/ }).parentElement!
    fireEvent.click(within(row).getByRole('button', { name: 'R' }))

    expect(onSetPass).toHaveBeenCalledWith([holes[1]], ['rough'])
  })

  it('reads one hole on its own, so the part stops lighting the other two', () => {
    const { onChoose } = panel({ candidates: [holes[0]!] })

    fireEvent.click(screen.getByRole('button', { name: /Show these 3 holes/ }))
    fireEvent.click(screen.getByRole('button', { name: /hole-b/ }))

    expect(onChoose).toHaveBeenLastCalledWith('hole-b', true)
  })

  it('reads as the row being read whichever of its holes is', () => {
    // The row is not the first hole, it is all three — so a click on the part
    // that landed on the third still lights the row that names it.
    panel({ candidates: [holes[0]!], focusedTag: 'hole-c' })

    expect(screen.getByRole('button', { name: /Blind hole/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })

  it('says what it would assign, for the keys handled at the window', () => {
    // R on a row standing for three holes has to mean three, and the handler
    // only ever sees the DOM.
    panel({ candidates: [holes[0]!] })

    expect(screen.getByRole('button', { name: /Blind hole/ }).dataset['holes']).toBe(
      'hole-a hole-b hole-c',
    )
  })

  it('names the drill, because nothing else tells two groups of one type apart', () => {
    panel({ candidates: [holes[0]!] })

    expect(screen.getByText(/6\.35 mm/)).toBeTruthy()
  })
})

describe('what is not cut yet', () => {
  /*
   * **Faces, not readings.** A feature is unassigned whenever nothing points at
   * it, which on a finished part is most of them — every reading of a face is an
   * alternative and only one can win — and a feature can read as unmapped while
   * every face it covers is already cut by somebody else. Neither is a gap, and
   * a list of them is one somebody has to sort through to find the few that are.
   */
  const held = {
    showingUncut: true,
    uncut: [uncutFace(0, [0]), uncutFace(4, [1])],
  }

  it('lists the faces, and says which ways up could take each', () => {
    panel(held)

    expect(screen.getByRole('button', { name: /^Face 0,/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Face 4,/ })).toBeTruthy()
  })

  it('shows only what the held way up can reach', () => {
    // Pressing an arrow already scopes what a click on the part resolves to.
    // This is the same rule reaching the one list that was ignoring it.
    panel({ ...held, activeDirection: 0 })

    expect(screen.getByRole('button', { name: /^Face 0,/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Face 4,/ })).toBeNull()
  })

  it('says nothing about the filter itself — the viewport carries that flag', () => {
    // A filter switched on from the part has to be visible on the part and
    // clearable from there. A second copy here is one state claimed by two
    // places, which is how they come to disagree.
    panel({ ...held, activeDirection: 1 })

    expect(screen.queryByText(/Only −Z/)).toBeNull()
  })

  it('says a way up with nothing left rather than showing an empty list', () => {
    // An empty list under a flag reads as a bug in the filter.
    panel({ showingUncut: true, uncut: [uncutFace(4, [1])], activeDirection: 0 })

    expect(screen.getByText(/\+Z has nothing left uncut/)).toBeTruthy()
  })

  it('marks a face no way up reaches, because nothing here can fix it', () => {
    // A gap in the analysis rather than in the plan. Left unmarked it reads as
    // work somebody forgot to place, and there is no placing it.
    panel({ showingUncut: true, uncut: [uncutFace(7, [])] })

    expect(screen.getByText('unreached')).toBeTruthy()
  })

  it('opens onto what could cut it, so the gap is closed where it is found', () => {
    /*
     * A list that only says what is missing makes somebody go and find it
     * again. The readings that own the face are the answer to "so cut it how",
     * and they arrive with the pass buttons every other list gives them.
     */
    panel({ showingUncut: true, uncut: [uncutFace(0, [0])] })

    fireEvent.click(screen.getByRole('button', { name: /^Face 0,/ }))

    expect(screen.getByText('Pocket')).toBeTruthy()
    expect(screen.getByText('Wall')).toBeTruthy()
  })

  it('says a face nothing reaches cannot be placed from here', () => {
    // A gap in the analysis rather than in the plan, and an empty list under an
    // opened row reads as a bug.
    panel({ showingUncut: true, uncut: [uncutFace(7, [])] })

    fireEvent.click(screen.getByRole('button', { name: /^Face 7,/ }))

    expect(screen.getByText(/gap in the analysis/)).toBeTruthy()
  })

  it('picks the face, so a row is the same act as a click on the part', () => {
    const { onPickFace } = panel(held)

    fireEvent.click(screen.getByRole('button', { name: /^Face 0,/ }))

    expect(onPickFace).toHaveBeenCalledWith(0)
  })
})

describe('narrowing what is left to one way up', () => {
  it('leaves the other lists alone — By face is already scoped its own way', () => {
    panel({ activeDirection: 0, candidates: [pocket, profile] })

    expect(screen.getByText('Profile')).toBeTruthy()
  })
})

describe('a standing offer', () => {
  const offer = { direction: 0, faces: new Set([0, 1]), kept: new Set<string>() }

  it('says what it is offering, and that nothing has changed yet', () => {
    panel({ mode: 'direction', holding: 0, proposal: offer, proposed: [pocket, wall] })

    expect(screen.getByText(/Proposed · 2 · 2 faces/)).toBeTruthy()
  })

  it('will not build a second offer while one stands', () => {
    // Switching the question abandons the inference in everything but name.
    panel({ mode: 'direction', holding: 0, proposal: offer, proposed: [pocket] })

    expect(screen.getByRole('button', { name: 'Only here' }).hasAttribute('disabled')).toBe(true)
  })

  it('prunes one reading without touching the rest', () => {
    const { onPrune } = panel({
      mode: 'direction',
      holding: 0,
      proposal: offer,
      proposed: [pocket, wall],
    })

    fireEvent.click(screen.getByRole('button', { name: /Remove Pocket from the offer/ }))

    expect(onPrune).toHaveBeenCalledWith([pocket])
  })

  it('reads the row the keyboard lands on, rather than only moving a highlight', () => {
    // Moving a highlight that then has to be pressed is two gestures for one
    // question, and the question is "what is this".
    const { onChoose } = panel({
      mode: 'direction',
      holding: 0,
      proposal: offer,
      proposed: [pocket, wall],
    })

    fireEvent.focus(screen.getAllByRole('button', { name: /Pocket/ })[0]!)

    expect(onChoose).toHaveBeenCalledWith('pocket', false)
  })

  // R / F / A / B / X / Delete are handled once at the window, on the row under
  // the keyboard — see `keys.ts` for what each means and `mapping.spec.ts` for
  // them working through the app. A component test cannot cover them here
  // without asserting that this panel does something it deliberately does not.

  it('throws away what has not been taken', () => {
    const { onDiscard } = panel({
      mode: 'direction',
      holding: 0,
      proposal: offer,
      proposed: [pocket],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(onDiscard).toHaveBeenCalled()
  })

  it('offers the three scopes only once a way up is held', () => {
    panel({ mode: 'direction', holding: null })

    expect(screen.queryByRole('button', { name: 'Infer features' })).toBeNull()
  })

  it('asks for a scope rather than inferring on its own', () => {
    // Nothing is inferred until somebody presses Infer.
    const { onInfer } = panel({ mode: 'direction', holding: 0 })

    expect(onInfer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Holes on axis' }))
    expect(onInfer).toHaveBeenCalledWith('holes')
  })
})

describe('the rows survive a re-render', () => {
  it('keeps focus when the panel re-renders, so the keyboard can walk', () => {
    /*
     * The bug this exists for: `Reading` was defined inside `MapFeaturesPanel`,
     * so every render produced a new component type and React remounted every
     * row. Arrowing onto a row reads it, reading it changes state, and the
     * re-render then destroyed the focus that had just moved — the keyboard did
     * nothing at all.
     *
     * Firing events on a row cannot catch that; only re-rendering can.
     */
    const props = {
      directions: TEST_DIRECTIONS,
      features,
      candidates: [pocket, wall],
      plan: EMPTY_PLAN,
      scores: new Map<string, FeatureScore>(),
      unit: 'mm' as const,
      mode: 'face' as const,
      painted: new Set<number>(),
      holding: null,
      focusedTag: null,
      faces: 1,
      highlighted: null,
      showingUncut: false,
      uncut: [],
      onPickFace: vi.fn(),
      making: null,
      types: [],
      report: { ...testPart(), features },
      touching: new Map(),
      onHoverFace: vi.fn(),
      justMade: null,
      onAgain: vi.fn(),
      onDeleteMade: vi.fn(),
      onCutMadeFrom: vi.fn(),
      handedTags: new Set<string>(),
      onMake: vi.fn(),
      onDraft: vi.fn(),
      onConfirmMade: vi.fn(),
      showingPass: 'rough' as const,
      activeDirection: null,
      onLetGo: vi.fn(),
      proposal: null,
      proposed: [],
      onInfer: vi.fn(),
      onPrune: vi.fn(),
      onDiscard: vi.fn(),
      onMode: vi.fn(),
      onChoose: vi.fn(),
      onHighlightDirection: vi.fn(),
      onSetPass: vi.fn(),
      onShowFaces: vi.fn(),
      onHover: vi.fn(),
    }

    const { rerender } = render(<MapFeaturesPanel {...props} />)

    const row = screen.getAllByRole('button', { name: /Pocket/ })[0]!
    row.focus()
    expect(document.activeElement).toBe(row)

    // The kind of change reading a row causes.
    rerender(<MapFeaturesPanel {...props} focusedTag="pocket" />)

    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: /Pocket/ })[0])
  })
})

describe('a row whose work a settled setup is holding', () => {
  /*
   * Paul, on a real part: a face mapped and settled from one way up, and the
   * R/F/Both on every *other* reading of that same face still lit. Pressing
   * them did nothing — `setPassFor` refused, correctly — but nothing said so
   * before the press.
   *
   * The pieces were both right and the wiring was not: the refusal asked
   * "would this press move settled work", the row asked "is *this* reading
   * settled", and those are different questions wherever cut-once is. This is
   * the test at the layer that was actually wrong.
   */
  const settledOnPocket = () => {
    const mapped = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [pocket], ['rough'])
    return lockSetup(mapped, mapped.setups[0]!.id, true)
  }

  const rowFor = (name: string) => {
    const row = screen.getByText(name).closest('li')
    if (row === null) throw new Error(`no row for ${name}`)
    return within(row)
  }

  it('shuts the reading the lock holds outright', () => {
    panel({ candidates: [pocket, profile], plan: settledOnPocket() })

    expect(
      (rowFor('Pocket').getByRole('button', { name: 'R' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('shuts a reading nobody settled, whose faces the lock is cutting', () => {
    // The profile covers face 0, which the settled pocket is cutting. This is
    // the row that stayed lit, and the one the bug was reported against.
    panel({ candidates: [pocket, profile], plan: settledOnPocket() })

    expect(
      (rowFor('Profile').getByRole('button', { name: 'R' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('names the lock to open rather than only refusing', () => {
    panel({ candidates: [pocket, profile], plan: settledOnPocket() })

    expect(rowFor('Profile').getByRole('button', { name: 'R' }).getAttribute('title')).toMatch(
      /^Settled in /,
    )
  })

  it('leaves a reading the lock never touches alone', () => {
    // The wall holds face 1, which the settled pocket does not cut.
    panel({ candidates: [pocket, wall], plan: settledOnPocket() })

    expect((rowFor('Wall').getByRole('button', { name: 'R' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })

  it('leaves every row alone when nothing is settled', () => {
    const mapped = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [pocket], ['rough'])
    panel({ candidates: [pocket, profile], plan: mapped })

    expect(
      (rowFor('Profile').getByRole('button', { name: 'R' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})
