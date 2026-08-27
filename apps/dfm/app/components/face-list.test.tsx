// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FaceList } from './face-list'
import { PartViewProvider, type PartView } from './part-view'
import { EMPTY_PLAN, PASSES, type SetupPlan } from 'shared/setups'
import { setFaceCut } from 'shared/faces'
import { setPassFor } from 'shared/plan-actions'
import { TEST_DIRECTIONS, testFeature, testReport } from 'shared/test-part'

/**
 * The face editor. The clicks it arms happen on a mesh no fixture mounts (F51),
 * so what the part does with them is pinned in `faces.test.ts` and what the
 * panel says about them is pinned here.
 */
afterEach(cleanup)

const profile = testFeature('profile', 'profile', TEST_DIRECTIONS[0]!, [0, 1])
const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[1]!, [2])
const features = [profile, wall]
const report = testReport(features)

/** What every FaceList in here is looking at, with the plan under test in it. */
const view = (plan: SetupPlan): PartView => ({
  part: report,
  directions: TEST_DIRECTIONS,
  plan,
  scores: new Map(),
  verdicts: [],
  unit: 'mm',
  showingPass: 'rough',
})

const editor = (plan: SetupPlan = EMPTY_PLAN) => {
  const onSetFace = vi.fn()
  const onSelectAll = vi.fn()
  const onSelectFree = vi.fn()
  const onRetype = vi.fn()
  const onHoverFace = vi.fn()

  const panel = (shown: SetupPlan) => (
    <PartViewProvider view={view(shown)}>
      <FaceList
        feature={profile}
        focusedTag={null}
        reveal={null}
        cutting={PASSES}
        onCutting={vi.fn()}
        onSelectAll={onSelectAll}
        onUnlockSetup={vi.fn()}
        onSelectFree={onSelectFree}
        types={['profile', 'wall', 'open_pocket']}
        onRetype={onRetype}
        onCurrentFace={vi.fn()}
        onSetFace={onSetFace}
        onSetFacePass={vi.fn()}
        onSetPass={vi.fn()}
        onChoose={vi.fn()}
        onHoverFace={onHoverFace}
        onCancel={vi.fn()}
        changed={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onCutFrom={vi.fn()}
      />
    </PartViewProvider>
  )

  const { rerender } = render(panel(plan))

  return {
    onSetFace,
    onSelectAll,
    onSelectFree,
    onRetype,
    onHoverFace,
    rerender: (next: SetupPlan) => rerender(panel(next)),
  }
}

/** Face 2 handed to the profile, which the Engine never reported there. */
const handed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 2, true)

describe('adding a face to a reading', () => {
  it('says what a click on the part will do, because that is where it is done', () => {
    // Nothing to arm: in here a click has only one meaning.
    editor()

    expect(screen.queryByRole('button', { name: 'Add a face' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Clicking a face' })).toBeInTheDocument()
    expect(screen.getByText(/Puts it in or takes it out/)).toBeInTheDocument()
  })

  it('lists the handed face, so there is a row to take it back off', () => {
    editor(handed)

    expect(screen.getByRole('checkbox', { name: /face 2 /i })).toBeInTheDocument()
  })

  it('marks it as added, because an unmarked row would read as the Engine own answer', () => {
    editor(handed)

    expect(screen.getByText('added')).toBeInTheDocument()
  })

  it('counts it among the reading faces', () => {
    // One of the profile's own two is cut, plus the one handed to it.
    editor(handed)

    expect(screen.getByText('1 of 3 faces')).toBeInTheDocument()
  })
})

describe('what the list highlights', () => {
  /*
   * A highlight that is on everything points at nothing. Cut rows used to carry
   * a fill of their own, and on a reading whose faces are all cut — which is
   * most of them — that is every line lit the moment it opens.
   */
  const rowFor = (label: RegExp) =>
    screen.getByRole('checkbox', { name: label }).closest('div')?.className ?? ''

  it('leaves a cut face unfilled, because the tick already says it is cut', () => {
    editor(setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 0, true))

    expect(screen.getByRole('checkbox', { name: /face 0 /i, checked: true })).toBeInTheDocument()
    expect(rowFor(/face 0 /i)).not.toContain('bg-info')
  })

  it('fills the one being worked on, which is what the list cannot otherwise show', () => {
    editor()
    fireEvent.click(screen.getByRole('button', { name: /Show what else covers face 1/ }))

    expect(rowFor(/face 1 /i)).toContain('bg-info/20')
    expect(rowFor(/face 0 /i)).not.toContain('bg-info')
  })
})

describe('what the tick says', () => {
  /** Finished from its own way up, and roughed nowhere. */
  const finishedOnly: SetupPlan = {
    setups: [{ id: 'a', directionIndex: 0, name: '+Z' }],
    assigned: { profile: { finish: 'a' } },
  }

  it('is ticked for a face this reading finishes, with roughing on screen', () => {
    /*
     * Paul's screenshot: "0 of 12 faces" above an expanded row showing that
     * very reading with F lit. The tick writes both passes and was reading one.
     */
    editor(finishedOnly)

    expect(screen.getByRole('checkbox', { name: /face 0 /i })).toHaveProperty('checked', true)
    expect(screen.getByText('2 faces')).toBeInTheDocument()
  })

  it('reads mixed when only one pass holds it, like the pass buttons do', () => {
    editor(finishedOnly)

    expect(screen.getByRole('checkbox', { name: /face 0 /i })).toHaveProperty('indeterminate', true)
  })

  it('fills a half-cut face up rather than emptying it', () => {
    // Pressing a dashed control takes the rest back — the rule R, F and Both
    // already follow.
    const { onSetFace } = editor(finishedOnly)

    fireEvent.click(screen.getByRole('checkbox', { name: /face 0 /i }))
    expect(onSetFace).toHaveBeenCalledWith(profile, 0, true)
  })
})

describe('the order the faces come in', () => {
  const named = () => screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))

  /*
   * Scoped to the list, because the four names now appear twice on purpose.
   *
   * The headings say what this reading *has*; the key beside the switch says
   * what the colours *mean*. Asking the page finds both, and the two are
   * answering different questions.
   */
  const heading = (label: string) =>
    within(screen.getByRole('list', { name: 'Faces' })).queryByText(label)

  it('groups them by what the plan does with each', () => {
    /*
     * The question the panel is opened with. A face roughed here and finished
     * from the other side costs a second setup, and that fact was spread
     * through a column of rows for the eye to gather.
     */
    const roughed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, ['rough'], 1, true)
    editor(roughed)

    expect(heading('Roughed only')).toBeInTheDocument()
    expect(heading('Not cut here')).toBeInTheDocument()
  })

  it('puts the faces it cuts above the ones it does not', () => {
    editor(setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 1, true))

    expect(named()?.[0]).toMatch(/face 1 /i)
  })

  it('names no group it has no faces for', () => {
    // An empty heading is a claim about the reading that is not true of it —
    // which is a different statement from the colour key, where the same four
    // words mean "this is what green would mean".
    editor()

    expect(heading('Roughed only')).not.toBeInTheDocument()
    expect(heading('Finished only')).not.toBeInTheDocument()
  })

  it('is the key to the part as well as a list', () => {
    // The headings carry the swatch the model is painted in, so a row's group
    // says what colour that face is wearing without a second lookup.
    editor(setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 1, true))

    expect(heading('Roughed and finished')).toBeInTheDocument()
  })
})

describe('a face handed to the reading being edited', () => {
  /*
   * Paul's case: a wall the Engine sees only from one direction, added to a
   * group it sees from the other. Adding it means "this face is part of the
   * feature I am editing", not "enable the reading the Engine reported".
   */
  const handed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 2, true)

  it('lists the reading being edited among the face readings, and says which it is', () => {
    /*
     * The Engine's own list is `regionIdxs`, and an added face is by definition
     * not in it — so the row opened onto a list not containing the reading the
     * face had just been added to. The only row was the other direction, with
     * its passes off, and pressing it enabled the face there instead.
     */
    editor(handed)
    fireEvent.click(screen.getByRole('button', { name: /Show what else covers face 2/ }))

    expect(screen.getByText('this one')).toBeInTheDocument()
  })
})

describe('clicking a face row', () => {
  it('opens it, rather than taking the face out of the reading', () => {
    /*
     * The whole row used to be a `<label>`, so a click anywhere in it toggled
     * the tick — and what somebody most often wants from a row is to look at
     * it. Reading a face by accidentally unmapping it is the worst possible
     * default, and it was the one there.
     */
    const { onSetFace } = editor()

    fireEvent.click(screen.getByRole('button', { name: /Show what else covers face 0/ }))
    expect(onSetFace).not.toHaveBeenCalled()
  })

  it('leaves the tick working as a tick', () => {
    const { onSetFace } = editor()

    fireEvent.click(screen.getByRole('checkbox', { name: /face 0 /i }))
    expect(onSetFace).toHaveBeenCalledWith(profile, 0, true)
  })
})

describe('the sweep that is left', () => {
  /*
   * `Select all` is gone. It put every face the reading covers in, which is
   * right when the reading is the answer for all of them and silently
   * overrides somebody's decision the rest of the time — as part of a press
   * about twenty other faces.
   *
   * `All unmapped` is the same press with that failure removed, and taking a
   * face off another reading is still done in the mapping list, where it is
   * the thing being asked for rather than a side effect.
   */
  it('offers to clear, and to fill what nothing else is cutting', () => {
    editor(setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 0, true))

    expect(screen.queryByRole('button', { name: 'Select all' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All unmapped/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument()
  })

  it('hands the clear back', () => {
    const { onSelectAll } = editor(
      setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 0, true),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onSelectAll).toHaveBeenCalledWith(false)
  })
})

describe('reading the list with the keyboard', () => {
  it('lights the face on the part, exactly as the pointer does', () => {
    /*
     * Arrowing down the list is the same question as running the pointer down
     * it — which face is this row — and the answer is on the part. Without it,
     * the one way of reading the list that never leaves the keyboard was the
     * one that could not see what it was reading.
     */
    const { onHoverFace } = editor()

    fireEvent.focus(screen.getByRole('button', { name: /Show what else covers face 1/ }))
    expect(onHoverFace).toHaveBeenCalledWith(1)

    fireEvent.blur(screen.getByRole('button', { name: /Show what else covers face 1/ }))
    expect(onHoverFace).toHaveBeenLastCalledWith(null)
  })
})

describe('filling only what nothing else has claimed', () => {
  /*
   * The gap `Select all` left. Taking every face this reading covers is right
   * when the reading is the answer for all of them, and the rest of the time it
   * overrides a decision somebody made — silently, as part of a press about
   * twenty other faces.
   */
  it('offers only the faces nothing is cutting, and counts them', () => {
    // Face 2 is the wall's, in both passes; faces 0 and 1 are nobody's.
    const taken = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, wall, PASSES, 2, true)
    const { onSelectFree } = editor(taken)

    fireEvent.click(screen.getByRole('button', { name: /All unmapped/ }))
    expect(onSelectFree).toHaveBeenCalledWith([
      { region: 0, passes: PASSES },
      { region: 1, passes: PASSES },
    ])
  })

  it('has nothing to offer once every face has a home', () => {
    const everywhere = [0, 1, 2].reduce(
      (plan, region) => setFaceCut(plan, TEST_DIRECTIONS, features, wall, PASSES, region, true),
      EMPTY_PLAN,
    )
    editor(everywhere)

    expect(screen.getByRole('button', { name: /All unmapped/ })).toHaveProperty('disabled', true)
  })

  /*
   * Free is asked of the whole part, not of this reading: a face this reading
   * already holds is not free either, or the press would keep offering work it
   * had already done.
   *
   * And the offer is drawn from this reading's own faces — the list shows what
   * it covers, so face 2, which only the wall reads, is not on it either way.
   */
  it('does not offer a face this reading is already cutting', () => {
    const { onSelectFree } = editor(
      setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 0, true),
    )

    fireEvent.click(screen.getByRole('button', { name: /All unmapped/ }))
    expect(onSelectFree).toHaveBeenCalledWith([{ region: 1, passes: PASSES }])
  })
})

describe('a face roughed here and finished elsewhere', () => {
  it('names where each pass is cut, rather than reporting one and hiding the other', () => {
    const split = setFaceCut(
      setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, ['rough'], 0, true),
      TEST_DIRECTIONS,
      features,
      wall,
      ['finish'],
      0,
      true,
    )
    editor(split)

    expect(screen.getByTitle('Roughed here, as this reading')).toBeInTheDocument()
    expect(screen.getByTitle(/^Finished as .* from /)).toBeInTheDocument()
  })
})

describe('filling a face that is already finished somewhere else', () => {
  /*
   * Paul's case. With **Both** selected, a face finished from another way up
   * and roughed by nobody is free *in roughing only* — filling it in both
   * passes would pull the finishing off the reading that has it, in a press
   * that exists to fill gaps rather than argue with any of them.
   */
  const finishedElsewhere = setFaceCut(
    EMPTY_PLAN,
    TEST_DIRECTIONS,
    features,
    wall,
    ['finish'],
    0,
    true,
  )

  it('offers that face for roughing alone, not for both passes', () => {
    const { onSelectFree } = editor(finishedElsewhere)

    fireEvent.click(screen.getByRole('button', { name: /All unmapped/ }))
    expect(onSelectFree).toHaveBeenCalledWith([
      { region: 0, passes: ['rough'] },
      { region: 1, passes: PASSES },
    ])
  })
})

describe('disagreeing with what the Engine called it', () => {
  /*
   * The type is not a label: it decides which rules speak about a reading, so
   * it decides what the reading scores and where a generator puts it. After
   * faces have been added a machinist is often right to disagree — a wall that
   * has picked up a floor and two fillets is not a wall.
   */
  it('offers every type the part uses, and its own', () => {
    editor()

    const select = screen.getByLabelText('Feature type') as HTMLSelectElement
    expect(select.value).toBe('profile')
    expect([...select.options].map((option) => option.value)).toEqual([
      'open_pocket',
      'profile',
      'wall',
    ])
  })

  it('hands the new type back against the reading it belongs to', () => {
    const { onRetype } = editor()

    fireEvent.change(screen.getByLabelText('Feature type'), { target: { value: 'open_pocket' } })
    expect(onRetype).toHaveBeenCalledWith('profile', 'open_pocket')
  })

  // A select whose value is not among its options renders blank, and a blank
  // type field reads as a reading with no type at all.
  it('keeps its own type on the list even where the part uses it nowhere else', () => {
    const onRetype = vi.fn()
    render(
      <PartViewProvider view={view(EMPTY_PLAN)}>
        <FaceList
          feature={profile}
          focusedTag={null}
          reveal={null}
          cutting={PASSES}
          onCutting={vi.fn()}
          onSelectAll={vi.fn()}
          onUnlockSetup={vi.fn()}
          onSelectFree={vi.fn()}
          types={['wall']}
          onRetype={onRetype}
          onCurrentFace={vi.fn()}
          onSetFace={vi.fn()}
          onSetFacePass={vi.fn()}
          onSetPass={vi.fn()}
          onChoose={vi.fn()}
          onHoverFace={vi.fn()}
          onCancel={vi.fn()}
          changed={false}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onCutFrom={vi.fn()}
        />
      </PartViewProvider>,
    )

    const select = screen.getByLabelText('Feature type') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toContain('profile')
    expect(select.value).toBe('profile')
  })
})

describe('what the colours on the part mean', () => {
  /*
   * All four, always, and beside the switch that arms the click.
   *
   * The list headings carry a swatch each, which made the list its own key.
   * That works for colours the reading already wears and fails for the rest: a
   * heading only exists once a face is in that state, so the meaning of the
   * colour somebody is about to paint arrived **after** they had painted it.
   */
  it('names every colour on an empty reading, before anything is in any of them', () => {
    editor()

    const key = screen.getByRole('list', { name: 'What the colours mean' })
    for (const state of ['Roughed and finished', 'Roughed only', 'Finished only', 'Not cut here']) {
      expect(within(key).getByText(state)).toBeInTheDocument()
    }
  })

  // Beside the switch rather than under the list: it is needed where the click
  // is armed, not where the result turns up.
  it('sits with the control that arms the click', () => {
    editor()

    const arming = screen.getByRole('group', { name: 'Clicking a face' })
    const key = screen.getByRole('list', { name: 'What the colours mean' })

    // A bit out of a mask rather than an element, so it is compared to the bit
    // it is testing for: `compareDocumentPosition` returns 0 or exactly this.
    expect(arming.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})

describe('a reading cut from a settled way up', () => {
  /*
   * Stopping the generators and leaving the editor open was half an answer: the
   * offers respected the lock and a hand edit walked straight through it, which
   * is the sort of half-rule people learn not to trust.
   */
  const settled = () => {
    const plan = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], PASSES)

    return {
      ...plan,
      setups: plan.setups.map((setup) => ({ ...setup, locked: true })),
    }
  }

  it('says which way up is settled, rather than failing quietly', () => {
    editor(settled())

    expect(screen.getByText(/which is settled/)).toBeInTheDocument()
  })

  // The answer to "I want to change this" is almost always "then unsettle it",
  // so it is offered here rather than only on the direction row.
  it('offers to unlock it from where somebody wanted to edit', () => {
    const onUnlockSetup = vi.fn()
    const plan = settled()
    render(
      <PartViewProvider view={view(plan)}>
        <FaceList
          feature={profile}
          focusedTag={null}
          reveal={null}
          cutting={PASSES}
          onCutting={vi.fn()}
          onSelectAll={vi.fn()}
          onUnlockSetup={onUnlockSetup}
          onSelectFree={vi.fn()}
          types={['profile']}
          onRetype={vi.fn()}
          onCurrentFace={vi.fn()}
          onSetFace={vi.fn()}
          onSetFacePass={vi.fn()}
          onSetPass={vi.fn()}
          onChoose={vi.fn()}
          onHoverFace={vi.fn()}
          onClose={vi.fn()}
          onCancel={vi.fn()}
          changed={false}
          onDelete={vi.fn()}
          onCutFrom={vi.fn()}
        />
      </PartViewProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Unlock/ }))
    expect(onUnlockSetup).toHaveBeenCalledWith(plan.setups[0]!.id)
  })

  // The rows stay readable — a settled reading is still worth looking at, it
  // just cannot be argued with.
  it('leaves the faces on screen', () => {
    editor(settled())

    expect(screen.getByRole('list', { name: 'Faces' })).toBeInTheDocument()
  })
})
