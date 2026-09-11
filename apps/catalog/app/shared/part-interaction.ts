import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { groupHoles } from '@toolpath/part-contracts/hole-groups'
import {
  NOTHING_SELECTED,
  focusWithin,
  pickFace,
  scopeToDirection,
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
 * click resolves to and `focusWithin` what naming a reading from a list does.
 * This module only says what happens *around* them — arming, guessing,
 * keeping, escaping.
 *
 * **Not `stepThrough`, which this application does not use.** A reading is
 * chosen by clicking an arrow on the part or by naming one in the list, never
 * walked with the keyboard (Paul, 2026-09-11) — the arrows belong to the tool
 * list, and `shared/arrow-target.ts` is that rule.
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
   * Whether a **group** is being built.
   *
   * **It says what a click on the part means, and nothing else** (Paul,
   * 2026-09-02): outside a group a click asks about whatever was clicked last,
   * and inside one it puts that feature in the group or takes it out.
   *
   * **It no longer turns identical-hole grouping on.** Grouping happens once,
   * in `group`, where somebody asks for it — never again while the group is
   * open (Paul, 2026-09-11: "In this mode, I should be able to add or remove
   * individual holes, even if they are identical"). It was the flag on this
   * field from 2026-09-09 until then, which made a group of thirty-nine
   * identical holes impossible to correct: every press took all thirty-nine.
   */
  readonly collecting: boolean
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
  collecting: false,
  chose: false,
}

export type InteractionAction =
  /** An arrow pressed on the part. */
  | { readonly type: 'arm'; readonly direction: number }
  /**
   * A click on the part: a face, or `null` for a click that hit nothing on the
   * mesh.
   *
   * A click **while a group is being built** is a different act: an ordinary
   * click swaps the guess for whatever was clicked last, and a group is built
   * by clicking six faces in a row (Paul, 2026-09-02). So a collecting click
   * adds — and, on a face already in, takes it out again, which is the only
   * way to correct a mis-click on the part itself. Which of the two it is
   * comes off {@link Interaction.collecting}, not off the action: the mode
   * outlives the click.
   */
  | { readonly type: 'click'; readonly pick: PartPick | null }
  /** A click on nothing at all — the viewer's `onPointerMissed`. */
  | { readonly type: 'miss' }
  /** A reading named from a list. */
  | { readonly type: 'read'; readonly featureTag: string }
  /** A reading ticked or unticked by hand. */
  | { readonly type: 'toggle'; readonly featureTag: string }
  /** Escape, outward one press at a time. */
  | { readonly type: 'escape' }
  /**
   * Start again from a set somebody already has: editing a group they built.
   *
   * The group is theirs rather than a guess, so nothing here is `guessed` —
   * walking a face's readings afterwards must not quietly take one of them
   * away again.
   */
  | {
      readonly type: 'collect'
      readonly tags: ReadonlyArray<string>
      /**
       * Whether what is being edited is a **group**.
       *
       * A feature row and a group row are both edited this way and a click on
       * the part means a different thing in each — a group collects, a feature
       * asks — so the kind travels with the tags.
       */
      readonly collecting: boolean
    }
  /**
   * A group, begun: what is being asked about becomes a set somebody is
   * building, and identical holes group from here on.
   *
   * **It grows what is already there** (Paul, 2026-09-09: hole grouping is a
   * GROUP rule). Pressing *+ Group* over a previewed hole, or taking the
   * offer the reading panel makes, means asking about that hole *and its
   * identical siblings* — so the tags standing when a group opens are expanded
   * to their whole hole groups rather than carried across one at a time.
   */
  | { readonly type: 'group' }
  /**
   * Everything down at once.
   *
   * Escape puts things down one at a time on purpose, which is right for a
   * keypress and wrong for confirming a group: what was being picked has
   * become a row on the list, and leaving it selected as well would have the
   * page answering the same question twice (Paul, 2026-09-02).
   */
  | { readonly type: 'reset' }

export type InteractionPart = Pick<PublicInspectionReport, 'features' | 'candidateDirections'>

/**
 * The identical holes a hole belongs to — same way up, diameter and depth.
 *
 * A part carries eight holes on a bolt circle and the kernel reports each
 * separately, because each is its own geometry; to a shop they are one tool and
 * one operation, which is the same rule the DFM application groups by.
 *
 * **It is applied where somebody asks for a group and nowhere else** (Paul,
 * 2026-09-09: "the current hole grouping should only be applied in GROUP. In
 * Add Feature, I should be able to select a single hole"). Grouping used to
 * happen on every path here, so one hole could not be asked about at all — the
 * reading panel offers the group instead, and taking the offer is the `group`
 * action, the one caller inside this reducer.
 *
 * **And it is the moment a group opens, not the mode it is open in** (Paul,
 * 2026-09-11). Expanding on every path while {@link Interaction.collecting} was
 * on made the set it grew un-editable: the group was right the instant it
 * opened, and the first correction to it took every hole out at once.
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

  /**
   * What one tag stands for: **itself, always**.
   *
   * Grouping identical holes happens once, where somebody asks for it — the
   * {@link groupOf} expansion in `group` — and never again afterwards (Paul,
   * 2026-09-11: "In this mode, I should be able to add or remove individual
   * holes, even if they are identical"). It used to be applied on every path
   * here while {@link Interaction.collecting} was on, so a group opened on a
   * bolt circle could not be corrected: clicking one hole of the thirty-nine,
   * or pressing the X beside one, took all thirty-nine out at once.
   *
   * Kept as a named step rather than inlined because *where* a tag would be
   * expanded is the thing that was wrong, and this is the list of those places.
   */
  const expand = (featureTag: string): Array<string> => [featureTag]

  /** A click on nothing puts the reading down, leaving what is kept by hand alone. */
  const putDown = (state: Interaction): Interaction => ({
    selection: NOTHING_SELECTED,
    focused: null,
    activeDirection: null,
    chose: false,
    // The group being built outlives the reading inside it: putting a face down
    // is not backing out of the group, which is `reset`.
    collecting: state.collecting,
    // The guess goes with the reading it came from; a tick made by hand stays.
    kept: dropAll(state.kept, state.guessed),
    guessed: [],
  })

  const read = (state: Interaction, featureTag: string): Interaction => {
    const group = expand(featureTag)
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
        const group = expand(scoped.focused)
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
        if (state.collecting) {
          /**
           * **While a group is being built, a click is a toggle** (Paul,
           * 2026-09-02: "if I click on a new one, it should add it to the list
           * of enabled features" and "clicking a pre-selected feature should
           * unselect it").
           *
           * An ordinary click means two things at once — it swaps the guess for
           * whatever was clicked last, and clicking one face twice walks its
           * readings — and neither is what a click means here. A face is in the
           * group or it is not, and pressing it says which. **The arrows choose
           * the reading**, which is the "after I select the direction, if
           * applicable" half and which `arm` already does by swapping what the
           * click guessed.
           *
           * Pressing the *same* face is its own case, and asked the way
           * `pickFace` asks it — by the region held, not by which readings the
           * click resolved to. A reading can own several faces, so a click on a
           * genuinely new face lands on readings a held one already offered:
           * comparing those would have made the second feature of a group read
           * as the first being pressed twice, and taken it out again.
           *
           * So the same face means **the reading already open**, not the next
           * of its readings: every press of one face puts it in and takes it
           * out again, which is what "clicking on them in the model — as they
           * are already selected, clicking on them again should deselect them"
           * asks for (Paul, 2026-09-11). It used to drop whatever the last
           * click had guessed and clear the reading, so a hole selected because
           * the *group* was opened on it survived the press that was meant to
           * take it out, and the press after that was spent re-picking it.
           */
          const again =
            state.selection.picks.length === 1 &&
            state.selection.picks[0]?.region === action.pick.region
          const tag = again ? state.focused : selection.focused
          if (tag === null) {
            return state
          }
          // One hole, not its siblings: a group is corrected a feature at a
          // time, whatever it was opened with (Paul, 2026-09-11).
          if (state.kept.includes(tag)) {
            return {
              /*
                Taken out, and the part goes dark with it. `partHighlight`
                lights what is *focused* as well as what is kept, so a hole
                left under the reading it was dropped from goes on looking
                exactly like the thirty-eight still in the group.
              */
              selection: NOTHING_SELECTED,
              focused: null,
              activeDirection: null,
              collecting: true,
              kept: dropAll(state.kept, [tag]),
              guessed: [],
              chose: false,
            }
          }
          return {
            // The held face keeps the reading it had — walking to the next one
            // is what the arrows are for while a group is being built.
            selection: again ? state.selection : selection,
            focused: tag,
            activeDirection: null,
            collecting: true,
            kept: keepAll(state.kept, [tag]),
            // What this face stands for, so choosing its direction replaces it
            // rather than leaving both readings in the group.
            guessed: [tag],
            chose: false,
          }
        }
        const group = selection.focused === null ? [] : expand(selection.focused)
        return {
          selection,
          focused: selection.focused,
          // Arming is spent by the click it aimed. Holding it after that pinned
          // the arrow to one way up and left clicking the same face again with
          // nothing to cycle to.
          activeDirection: null,
          // Not collecting, or the branch above would have taken this click.
          collecting: false,
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

      /**
       * **One click cancels, the next puts it down** (Paul, 2026-09-01).
       *
       * A click on nothing is how somebody dismisses whatever they have just
       * opened or armed — and it was also what threw the selection away, so a
       * press meant to cancel an arrow cost them the feature they had picked.
       * The first miss spends the pending thing: an armed way up, or the
       * question a face with several readings is asking. Only a miss with
       * nothing pending puts the reading down.
       */
      case 'miss': {
        if (state.activeDirection !== null) {
          return { ...state, activeDirection: null }
        }
        if (state.focused !== null && !state.chose) {
          return { ...state, chose: true }
        }
        return putDown(state)
      }

      case 'read':
        return read(state, action.featureTag)

      case 'toggle': {
        /*
          One feature, in or out — the X beside a hole in the group box takes
          that hole out and leaves the other thirty-eight standing (Paul,
          2026-09-11). It used to take the whole identical set out with it while
          a group was being built, which is the same defect a click on the part
          had.
        */
        const group = expand(action.featureTag)
        const taking = !state.kept.includes(action.featureTag)
        return {
          ...state,
          kept: taking ? keepAll(state.kept, group) : dropAll(state.kept, group),
          // Ticking by hand makes it somebody's rather than a guess, so walking
          // the face's readings will not take it away again.
          guessed: state.guessed.filter((each) => !group.includes(each)),
        }
      }

      case 'collect':
        return {
          ...state,
          kept: [...action.tags],
          guessed: [],
          collecting: action.collecting,
        }

      case 'group': {
        /**
         * **Grouping starts here, and only here.** Whatever was being asked
         * about is expanded to its identical holes, because that is what a
         * group means and what the offer beside a hole promises — pressing
         * *Add all 39 as a group* with one hole read has to arrive at all
         * thirty-nine. Every path after this one takes a hole at a time.
         *
         * **And what it grew is somebody's, not a guess** (Paul, 2026-09-11:
         * "it should pre-select all of the holes, but I should be able to
         * remove individual holes while keeping all the other selections").
         * The guess used to be grown with it, which is a set that any later
         * click, arrow or click on nothing would take back out wholesale — the
         * thirty-nine holes somebody asked for, gone to one press.
         */
        const grow = (tags: ReadonlyArray<string>): Array<string> =>
          keepAll(
            [],
            tags.flatMap((tag) => groupOf(part.features, tag)),
          )
        return {
          ...state,
          collecting: true,
          kept: grow(keepAll(state.kept, state.guessed)),
          guessed: [],
        }
      }

      case 'reset':
        return IDLE

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
