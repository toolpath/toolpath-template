import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { groupHoles } from '@toolpath/part-contracts/hole-groups'
import {
  NOTHING_SELECTED,
  focusWithin,
  pickFace,
  scopeToDirection,
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
  /**
   * Whether the reading on screen was **named** rather than guessed.
   *
   * A face click opens the largest of five to eight readings, which is a
   * guess; naming one from the list, or pressing an arrow, is an answer. The
   * panel says "select a direction" instead of the guess where the face reads
   * more than one way up, so the application never claims to know which
   * setup somebody meant (Paul, 2026-08-31).
   */
  readonly chose: boolean
}

export const IDLE: Interaction = {
  selection: NOTHING_SELECTED,
  activeDirection: null,
  focused: null,
  kept: [],
  guessed: [],
  chose: false,
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
    chose: false,
    // The guess goes with the reading it came from; a tick made by hand stays.
    kept: dropAll(state.kept, state.guessed),
    guessed: [],
  })

  const read = (state: Interaction, featureTag: string): Interaction => {
    const group = groupOf(part.features, featureTag)
    return {
      ...state,
      // Naming a reading from inside the list is an answer, not a new question:
      // the picked faces and the readings they produced stay exactly as they
      // were. And it does **not** arm the reading's way up — arming is what
      // pressing an arrow means, and a selection that quietly armed one left
      // every later click scoped to a setup nobody chose.
      selection: focusWithin(state.selection, featureTag),
      focused: featureTag,
      chose: true,
      /**
       * **And it keeps what it read**, exactly as a click and an arrow do.
       *
       * The tool list is judged against what is *kept*, not against what is
       * focused. Naming a reading moved the focus and left the kept list
       * alone, so reading a feature from its card on the part — the way back
       * to a decision already made — showed the panel one feature and judged
       * the list against another, or against nothing at all: "no tool in the
       * catalog matches every part of this selection", under a hole with a
       * drill already on the bill (Paul, 2026-08-31).
       */
      kept: keepAll(dropAll(state.kept, state.guessed), group),
      guessed: group,
    }
  }

  return (state: Interaction, action: InteractionAction): Interaction => {
    switch (action.type) {
      case 'arm': {
        if (!part.candidateDirections[action.direction]) {
          return state
        }
        /**
         * **An arrow means its own way up, every time.**
         *
         * Pressing the armed arrow used to walk to the next direction, from
         * when arrows were a scope to aim the next click with. They are not:
         * one is drawn per way up the held face reads, and pressing one says
         * which reading was meant. Walking from there landed on a direction
         * with nothing to read, which is a press that does nothing (Paul,
         * 2026-08-31: "clicking the arrow to select the direction isn't
         * working").
         */
        const next = action.direction
        const way = part.candidateDirections[next]
        /**
         * With a face held, pressing an arrow is a question **about that
         * face**: which reading covers it from over there. It used to arm and
         * nothing else, so the answer only arrived on the next click — and
         * since a reading had taken the other arrows off screen there was
         * often no arrow left to press (Paul, 2026-08-30). With nothing held
         * it is still only a scope for the next click.
         */
        const scoped =
          way === undefined
            ? state.selection
            : scopeToDirection(state.selection, (tag) => {
                const feature = byTag.get(tag)
                return feature ? sameDirection(feature.machiningDirection, way) : false
              })
        // Nothing to read that way up is not an answer: the reading stands,
        // and the arming scopes the next click as it always did.
        if (scoped.focused === null) {
          return { ...state, activeDirection: next }
        }
        // The arrow of the reading already open **is** an answer, and was the
        // one press that did nothing: the panel went on asking which way up
        // while the person had just said (Paul, 2026-08-31).
        if (scoped.focused === state.focused) {
          return { ...state, activeDirection: next, chose: true }
        }
        const group = groupOf(part.features, scoped.focused)
        return {
          ...state,
          activeDirection: next,
          // **The reading moves; the list of readings does not.** Scoping the
          // selection narrowed the candidates to that one way up, so the
          // dropdown lost the others and there was no way back (Paul,
          // 2026-08-31: "clicking the arrow just makes the selection"). The
          // face still reads every way it read a moment ago.
          selection: focusWithin(state.selection, scoped.focused),
          focused: scoped.focused,
          chose: true,
          // The guess follows the reading, exactly as a face click's does.
          kept: keepAll(dropAll(state.kept, state.guessed), group),
          guessed: group,
        }
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
          // The largest reading is a guess, and a face that reads several
          // ways up has not been answered by opening one of them.
          chose: false,
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
