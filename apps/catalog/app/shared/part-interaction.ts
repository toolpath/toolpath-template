import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { groupHoles } from '@toolpath/part-contracts/hole-groups'
import {
  NOTHING_SELECTED,
  focusWithin,
  pickFace,
  stepThrough,
  type SelectionState,
} from '@toolpath/part-contracts/selection'
import { sameDirection, type PartPick } from '@toolpath/viewer'
import { dropAll, escapeStep, keepAll, preferLargest } from './part-selection'

/**
 * What a click on the part means, as one pure function.
 *
 * **Every rule about arrows, faces, readings and the kept group lives here**,
 * and the part page only dispatches. It was five `useState`s and eight handlers
 * spread through the route, and the arrow bugs of 2026-08-28 — a miss on the
 * mesh un-arming the arrow that was just pressed; an armed arrow pinning every
 * later click to one way up — were each a two-line interaction between
 * handlers that nothing could test without a rendered 3D scene. Here they are
 * three assertions each.
 *
 * The vocabulary is the DFM application's: `pickFace` decides what a face
 * click resolves to, `focusWithin` what naming a reading from a list does, and
 * `stepThrough` how the keyboard walks. This module only says what happens
 * *around* them — arming, guessing, keeping, escaping.
 */
export interface Interaction {
  /** What the viewport was asked about, and the readings that answer it. */
  readonly selection: SelectionState
  /**
   * A way up somebody pressed, held until the next face click spends it.
   *
   * Held apart from the reading's own direction: pressing an arrow is a
   * statement, and it stands whether or not it has found anything to read.
   */
  readonly activeDirection: number | null
  /**
   * The one reading being read.
   *
   * Separate from what is kept: reading a candidate to see where it is on the
   * part is not the same as adding it to the group, and conflating them makes
   * looking around destructive.
   */
  readonly focused: string | null
  /** The group being asked about, in the order it was kept. */
  readonly kept: ReadonlyArray<string>
  /**
   * What the last face click put on the list by itself.
   *
   * Held apart from what somebody ticked: walking a face's readings swaps this
   * one for the next, and a tick made by hand must survive that.
   */
  readonly guessed: ReadonlyArray<string>
}

export const IDLE: Interaction = {
  selection: NOTHING_SELECTED,
  activeDirection: null,
  focused: null,
  kept: [],
  guessed: [],
}

export type InteractionAction =
  /** An arrow pressed on the part. */
  | { readonly type: 'arm'; readonly direction: number }
  /** A click on the part: a face, or `null` for a click that hit nothing on the mesh. */
  | { readonly type: 'click'; readonly pick: PartPick | null }
  /** A click on nothing at all — the viewer's `onPointerMissed`. */
  | { readonly type: 'miss' }
  /** A reading named from a list. */
  | { readonly type: 'read'; readonly featureTag: string }
  /** The keyboard walking a list, in the order it is drawn. */
  | { readonly type: 'step'; readonly order: ReadonlyArray<string>; readonly by: 1 | -1 }
  /** A reading ticked or unticked by hand. */
  | { readonly type: 'toggle'; readonly featureTag: string }
  /** Escape, outward one press at a time. */
  | { readonly type: 'escape' }

export type InteractionPart = Pick<PublicInspectionReport, 'features' | 'candidateDirections'>

/**
 * Identical holes are one decision.
 *
 * A part carries eight holes on a bolt circle and the kernel reports each
 * separately, because each is its own geometry — but to a shop they are one
 * tool and one operation. So keeping one keeps its group, and taking one out
 * takes the group out: the same rule the DFM application groups by, on the
 * same three facts (way up, diameter, depth).
 */
export const groupOf = (
  features: ReadonlyArray<PartFeature>,
  featureTag: string,
): Array<string> => {
  const group = groupHoles(features).find((each) =>
    each.holes.some((hole) => hole.featureTag === featureTag),
  )
  return group ? group.holes.map((hole) => hole.featureTag) : [featureTag]
}

/** The reducer for one part. Pure: the same state and action always give the same answer. */
export const interactionFor = (part: InteractionPart) => {
  const largest = preferLargest(part.features)
  const byTag = new Map(part.features.map((feature) => [feature.featureTag, feature]))

  /**
   * An armed way up decides which reading a face click opens.
   *
   * `pickFace` ranks by the whole face; with an arrow pressed first, only the
   * readings reached that way up are candidates for the answer — which is the
   * shortcut arming it was for. A face with no reading that way up falls back
   * to the whole face rather than opening nothing.
   */
  const preferArmed = (activeDirection: number | null) => {
    const armed = activeDirection === null ? null : part.candidateDirections[activeDirection]
    if (!armed) {
      return largest
    }
    return (tags: ReadonlyArray<string>): string | null => {
      const here = tags.filter((tag) => {
        const feature = byTag.get(tag)
        return feature ? sameDirection(feature.machiningDirection, armed) : false
      })
      return largest(here.length > 0 ? here : tags)
    }
  }

  /** A click on nothing puts the reading down, leaving what is kept by hand alone. */
  const putDown = (state: Interaction): Interaction => ({
    selection: NOTHING_SELECTED,
    focused: null,
    activeDirection: null,
    // The guess goes with the reading it came from; a tick made by hand stays.
    kept: dropAll(state.kept, state.guessed),
    guessed: [],
  })

  const read = (state: Interaction, featureTag: string): Interaction => ({
    ...state,
    // Naming a reading from inside the list is an answer, not a new question:
    // the picked faces and the readings they produced stay exactly as they
    // were. And it does **not** arm the reading's way up — arming is what
    // pressing an arrow means, and a selection that quietly armed one left
    // every later click scoped to a setup nobody chose.
    selection: focusWithin(state.selection, featureTag),
    focused: featureTag,
  })

  return (state: Interaction, action: InteractionAction): Interaction => {
    switch (action.type) {
      case 'arm': {
        if (!part.candidateDirections[action.direction]) {
          return state
        }
        // Arming chooses nothing on its own. Pressing the armed arrow again
        // moves to the next way up, so the arrows can be walked without hunting
        // for the right one on screen.
        const next =
          state.activeDirection === action.direction
            ? (action.direction + 1) % part.candidateDirections.length
            : action.direction
        return { ...state, activeDirection: next }
      }

      case 'click': {
        // A click that hit nothing on the mesh is not a click on a face, and it
        // is not a clear either: pressing an arrow reports exactly this, because
        // the arrow sits over the mesh. Clearing is `miss`, from the viewer.
        if (action.pick === null) {
          return state
        }

        const selection = pickFace(state.selection, action.pick, preferArmed(state.activeDirection))
        const group = selection.focused === null ? [] : groupOf(part.features, selection.focused)
        return {
          selection,
          focused: selection.focused,
          // Arming is spent by the click it aimed. Holding it after that pinned
          // the arrow to one way up and left clicking the same face again with
          // nothing to cycle to.
          activeDirection: null,
          // The best reading goes on the list at once — one click from a face
          // to a tool list. Clicking again swaps the guess for the next reading
          // rather than piling them up; a tick made by hand is not a guess.
          kept: keepAll(dropAll(state.kept, state.guessed), group),
          guessed: group,
        }
      }

      case 'miss':
        return putDown(state)

      case 'read':
        return read(state, action.featureTag)

      case 'step': {
        const next = stepThrough(action.order, state.focused, action.by)
        return next === null ? state : read(state, next)
      }

      case 'toggle': {
        const group = groupOf(part.features, action.featureTag)
        const taking = !state.kept.includes(action.featureTag)
        return {
          ...state,
          kept: taking ? keepAll(state.kept, group) : dropAll(state.kept, group),
          // Ticking by hand makes it somebody's rather than a guess, so walking
          // the face's readings will not take it away again.
          guessed: state.guessed.filter((each) => !group.includes(each)),
        }
      }

      case 'escape': {
        // The reading first, then the list — undoing a click must not cost the
        // list somebody spent five clicks building.
        switch (
          escapeStep({
            reading: state.selection.picks.length > 0 || state.focused !== null,
            keptCount: state.kept.length,
          })
        ) {
          case 'selection':
            return putDown(state)
          case 'kept':
            return { ...state, kept: [] }
          default:
            return state
        }
      }
    }
  }
}
