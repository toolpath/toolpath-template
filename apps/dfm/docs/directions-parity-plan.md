# Directions parity plan — transitioning the picker's interactions

**Goal:** move what `tp-ui@pc-feature-picker` can do on the Directions page into
this app, interaction by interaction, in stages where every stage ships working.

This document is written **from the picker's side**. §3 is an inventory of every
interaction that app has — every click, key, toggle and state — with where each
one is implemented there, whether this app has it, and which PR brings it
across. The picker is the spine: the question is "where does each of these
land", not "what is missing here".

Status: **built, in a sandbox — 21 Aug 2026.** Stages 0–5 are done and working:
the mapping model, the Directions view, all six generators, painting by
direction, the two pick modes, and inference. Stage 6 (naming a way up the
Engine never reported) is the only one untouched. Beyond the plan, the sandbox
also grew what a real part asked for — hole grouping, the Unmapped list and its
direction filter, and the three-state arrows; see §5 "Beyond the picker".

506 unit tests and 47 end-to-end tests pass, `check-types` clean.

> **Doing this again? Read
> [directions-replay.md](directions-replay.md).** It is this work in the order it
> should have been done, with the wrong turns removed — roughly a third of the
> sandbox's commits undo the other two thirds, and the patch series replays all
> of it.

> **Read §10 first.** This plan was written before any of it was built, and
> building it corrected a great deal. §10 is what is actually true now, what is
> left, and what to watch for when this is redone against the real repo. §§4–9
> have been rewritten to match; §3 is the one part that needed no correction,
> and its **Status** column is now maintained rather than historical.

The work was done in a detached sandbox (`~/dev/toolpath-sandbox`, no remote)
because `toolpath` was frozen for a repo split. Findings are in
[directions-parity-findings.md](directions-parity-findings.md) — forty-six of
them, numbered F1–F48 (F40 and F41 are superseded) and referenced throughout
below.

> **This replaces a plan that was deleted.** The first version lived at
> `docs/directions-plan.md` and went in `441b7bc` ("Rework rules persistence",
> 16 Aug) along with `viewer-parity-plan.md` and `rules-plan.md` — 855 lines
> removed by a commit about something else. Recover any of them with
> `git show 441b7bc^:docs/<name>`. This one lives beside the specs it references
> rather than in top-level `docs/`, which is what got swept.

---

## 1. Requirements

Paul's, stated while building this, each with what would show it was met.

### R1 — A selection outline on the part _(deferred)_

A slight outline highlight around selected faces and features, **in addition
to** the fill.

_Why:_ a fill alone leaves two selected faces that meet at an edge reading as
one shape, and on a part already painted by direction or difficulty "picked" is
nothing but a hue — which is the one thing a face can only carry once.

_Met when:_ the outer boundary of the selection is drawn — boundary edges only,
so two touching faces outline as one shape; faces picked by hand carry it before
any feature owns them; it survives on a part painted by difficulty.

**Still deferred, and now the strongest remaining candidate.** The part carries
five layers at once — a direction wash, painting in orange, an offer in violet,
the selection and the hover — and a face can only be one colour. Nothing else in
this plan draws a line rather than a fill. If a painted set stops reading, this
is the answer.

### R2 — Focus without selecting

A list that takes the keyboard on its own must not light a feature up.

_Why:_ the assign keys need a target, so the offers list has to take focus — but
focus normally selects, and lighting a feature up between the clicks that paint
faces fights the hand doing the painting.

_Met when:_ in By-direction mode the first offer row takes the keyboard with no
change to what is painted, R assigns **that row**, and arrowing off it selects
as normal. The mechanism: assign keys read the selection first and the row under
the keyboard second (`tagUnderKeyboard`, off a `data-tag` attribute).

**Half built.** The assign keys already prefer the row under the keyboard over
the selection — `part-inspector.tsx`, the `planKey` branch — so the mechanism is
there. What is missing is the _quiet_ part: arrowing onto a row calls `onChoose`,
which lights it up. Row 37, and the reason it is still open is that the same
`onFocus` is what makes the keyboard work at all in every other list (F19).

### R3 — Recreate in stages

Every stage a usable app, in dependency order — not a big-bang port. _Met when_
each stage names what a person can do at the end of it that they could not
before.

### R4 — Reasonably sized PRs

_Met when_ no PR is more than ~500 LOC of source and each states what it makes
possible.

### R5 — Documentation goes first and travels with the code

_Met when_ [interactions.md](interactions.md) and
[highlighting.md](highlighting.md) are updated **in the PR that lands the
behaviour**, not after it.

### R6 — The plan survives

_Met when_ this document is committed, beside the specs, where a cleanup of
top-level `docs/` cannot take it.

### R7 — The page reads left to right

Left is what a plan is made of, middle is the part, right is what is being
worked on now. _Met when_ a person can work the page left to right without
crossing back, and the datasheet sits under the panel that produced it.

---

## 2. How to read the inventory

**Status** is what this app does today:

- **Built** — works here, same as the picker or near enough
- **Differs** — works here, but not the way the picker does it; the difference
  is named
- **Partly** — some of the row is here; what is missing is named
- **Dropped** — built and then removed, deliberately; the reason is footnoted
- **Absent** — not here at all

**This column is maintained.** It was written as "what this app does today"
before any of the plan was built, and it says the same thing now — so a row
still marked Absent is genuinely still absent.

Rows are grouped the way somebody uses them, not the way the code is arranged.
The last column was the PR that would settle a row; it now reads **—** for
anything done and **open** for anything still outstanding, which §10 lists.

The picker's files are under `apps/feature-picker/` in `tp-ui@pc-feature-picker`
unless they say `packages/viewer/`.

---

## 3. The inventory

### 3.1 The mouse, on the part

The picker resolves a click through **five branches, first match winning**, and
which branch runs depends on the pick mode (§3.9). That order is the single most
important thing to carry across: implementing the branches without the order
produces a page that works until two states are live at once.

| #   | Interaction                                                                                    | In the picker                                                | Status    | Lands in |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- | -------- |
| 1   | **Naming a direction** — a click means the face's own normal                                   | `feature-picker.tsx` `onPick`, branch 1; `new-direction.tsx` | Absent    | PR 11    |
| 2   | **Empty space** — picks, candidates and focus all go                                           | branch 2                                                     | Built     | —        |
| 3   | **In a standing offer, left click** — that face leaves it                                      | branch 3; re-covered by `coverFaces`                         | **Built** | —        |
| 4   | **In an offer, right click** — show that reading, in green                                     | branch 3                                                     | **Built** | —        |
| 5   | **Outside an offer** — add the smallest reading of that face                                   | branch 3                                                     | **Built** | —        |
| 6   | **Painting by direction** — every click adds a face, a painted face comes off, **no modifier** | branch 4                                                     | **Built** | —        |
| 7   | **Plain click by face** — replaces the picked set                                              | branch 5; `face-picks.ts` `nextPicks`                        | Built     | —        |
| 8   | **⌘/Ctrl click** — adds a face; owners narrow to what owns them all                            | `face-picks.ts`                                              | Built     | —        |
| 9   | **Repeated click on one face** — walks its readings                                            | `cycleOwner` in `packages/viewer/src/core/selection.ts`      | Differs¹  | —        |
| 10  | **The focus a click produces is a guess** — and a guess paints nothing                         | `focusFromPick`                                              | Differs²  | **open** |
| 11  | **A click folds the direction list** and drops any direction being looked at                   | `picksMade` / `foldAt`                                       | Absent    | open     |
| 12  | **Hover** — the pointer's own layer, winning outright                                          | viewer `setHoverRegion`                                      | Built     | —        |
| 13  | **An arrow means "hold it this way"** — creating the direction and opening it                  | `onPickDirection`                                            | **Built** | —        |
| 14  | Right-drag pans, right-**click** picks — a distance test tells them apart                      | `packages/viewer/src/core/controls.ts`                       | **Built** | —ᵃ       |
| 15  | View cube → named view; section handle drag                                                    | `packages/viewer/src/core/overlays/`                         | Built     | —        |

¹ Here, walking back onto the reading already being read **clears** the
selection; the picker keeps cycling. Ours is a deliberate improvement — keep it,
and note it where the two specs disagree.

² The picker paints nothing for a guessed focus, because painting it claimed a
decision nobody made: clicking two walls lit up an eleven-face profile. **This
app paints it.** Harmless while a focus only opens a datasheet; not harmless
once a focus is a step toward an assignment.

³ Here an arrow **scopes** what a click can resolve to and nothing more. On the
picker's Directions page it also creates the setup and opens it. **Now both**:
an arrow scopes _and_ holds the way up that painting works from.

ᵃ Row 14 was marked Built against the picker's viewer. Half of it was not here —
picks are emitted from `onClick`, which the right mouse button never fires, so
`PartPick.modifiers.secondary` could never be true. Fixed in
`packages/viewer/src/part-mesh.tsx` (F25).

ᵇ Checkboxes were built and removed. They selected without reading, as §3.8
asks, but the only thing they fed was a bulk action a row's own buttons already
did. The **selected features** multi-selection went with them; picked faces and
the offer cover the same ground.

### 3.2 The mouse, in the lists

Pass assignment is spelled out in §3.7 and the two kinds of multi-selection in
§3.8. The rule underneath all of it: **naming a feature from a list _about the
plan_ asks the part a fresh question, so the face list refills. Naming one from
_inside_ the face list is an answer to the question that list is already asking,
so the picks are left alone.** Getting this wrong emptied the list a reading had
just been chosen from — twice.

| #   | Interaction                                                                          | In the picker             | Status      | Lands in         |
| --- | ------------------------------------------------------------------------------------ | ------------------------- | ----------- | ---------------- |
| 16  | Row in **Map features** — focuses, does **not** re-pick                              | `face-candidates.tsx`     | Built       | —                |
| 17  | Row in the **direction list** — focuses, opens its direction, refills Map features   | `setups-panel.tsx`        | **Built**   | —                |
| 18  | Row in the **offer** — focuses; the offer is unchanged                               | `proposal-panel.tsx`      | **Built**   | —                |
| 19  | **Direction row** in Map features — draws that arrow, nothing else                   | `peekDirection`           | **Built**   | —                |
| 20  | **Band count** in the summary — selects the band, reads the first                    | `rules-summary.tsx`       | Built       | —                |
| 21  | **Checkbox** on a candidate row — selects without focusing                           | `face-candidates.tsx`     | **Dropped** | —ᵇ               |
| 22  | **R / F / Both** on a reading row                                                    | `setPassHere`, `cutOnce`  | **Built**   | —                |
| 23  | **Rough all / Finish all / Both** on a direction group — judged **across the group** | `onSetGroupPass`          | **Built**   | —                |
| 24  | The same three on an **offer header**, plus **Discard**                              | `proposal-panel.tsx`      | **Built**   | —                |
| 25  | **Follow-up strip** after assigning — only here / everything / holes                 | `FollowUp`                | Absent      | open             |
| 26  | **Infer features** under a direction                                                 | `inferInto`               | **Built**   | —                |
| 27  | Rename, remove, open a direction                                                     | `setups-panel.tsx`        | Partly      | open — rename    |
| 28  | Six **generators**, plus save / load / rename / forget a snapshot                    | `generate-directions.tsx` | Partly      | open — snapshots |

### 3.3 The keyboard

| #   | Interaction                                                                                     | In the picker                             | Status    | Lands in  |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- | --------- |
| 29  | **↑ ↓** walk any list, and the model highlight follows                                          | `list-keys.ts` `onListKeys`               | **Built** | —         |
| 30  | **Home / End**                                                                                  | `onListKeys`                              | Built     | —         |
| 31  | **R / F** — rough or finish the reading in hand                                                 | window handler → `passKeyRef`             | **Built** | —         |
| 32  | **A or B** — both passes                                                                        | same                                      | **Built** | —         |
| 33  | **X / Delete / Backspace** — prune from the offer, keeping the keyboard's place (`keepWalking`) | same                                      | **Built** | —         |
| 34  | **Escape** — leaves every state at once                                                         | window handler                            | Differs⁵  | **open**  |
| 35  | **Rows take focus on pointer-down** — macOS does not focus a clicked button                     | `rowProps`                                | Built     | —         |
| 36  | **One key handler per panel, at the top** — a click on the part leaves focus on the canvas      | `onListKeys` on the panel                 | Differs⁶  | —         |
| 37  | **Quiet focus** in By-direction mode, with the row-under-the-keyboard fallback — **R2**         | `face-candidates.tsx`, `tagUnderKeyboard` | Absent    | open — R2 |
| 38  | Pressing the pass something already has **takes it off**                                        | `cutOnce`                                 | **Built** | —         |

⁴ Ours walk the **candidates of the clicked face** from the window; the picker
walks whichever list has focus. Both are needed once there are several lists —
and both are now here: a list marked `data-keynav` walks itself in the order it
is _drawn_, and the window shortcut covers focus still being on the canvas.

⁵ Ours steps outward, one thing per press (`escape.ts`); the picker clears
everything. Ours is more legible with three states and less so with seven — and
all seven are now live at once, so this is genuinely due a decision. Painted
faces were folded into the first press so they cannot be stranded, which is a
patch rather than an answer.

⁶ Ours uses `data-keynav` for the same job. No change needed.

### 3.4 Modes, toggles and the flags over the viewport

| #   | Interaction                                                                    | In the picker                | Status        | Lands in |
| --- | ------------------------------------------------------------------------------ | ---------------------------- | ------------- | -------- |
| 39  | **Paint: Plain / Directions / Difficulty**, persisted                          | `theme/theme.ts`, `paint.ts` | **Built**     | —        |
| 40  | **Rough / Finish** pass toggle, beside the modes when not Plain                | `showingPass`                | **Built**     | —        |
| 41  | **Arrows: all / off**, with one arrow while something is selected              | `arrows-toggle.tsx`          | **Differs**¹⁰ | —        |
| 42  | **Sharp corners** toggle, with a count, painted over everything                | `showSharp`                  | Absent        | —⁸       |
| 43  | **Pick mode: By face / By direction**                                          | `face-candidates.tsx`        | **Built**     | —        |
| 44  | **Holding** flag — blue, "clicking a face paints what it cuts", with Clear     | viewport overlay             | Partly        | open     |
| 45  | **Filtering** flag — amber, "Only −Y · everything else is hidden from a click" | viewport overlay             | **Built**     | —        |
| 46  | **Faces-painted count** — appears at two                                       | viewport overlay             | **Built**     | —        |
| 47  | **Summary card** — coverage per pass, or score and band counts                 | `viewer-summary.tsx`         | **Built**     | —        |

⁷ **Directions was removed from `PAINT_MODES` here** and is now back, pointed at
the plan rather than at the Engine's reported direction — a feature is reported
from every way up that reaches it, so colouring by that would paint a decision
nobody made. A face with no colour is a face **nothing cuts**. Two tests pinned
its absence and both had to be inverted (F27); they read as regressions and are
the opposite. Difficulty follows the plan the same way (F29).

⁸ Deliberately not planned. The picker's own `docs/sharp-corners.md` says the
layer floods a whole pocket to point at one edge and needs rebuilding, not
copying.

¹⁰ **Three states here, not two**: All → Confirmed → Off, narrowing all the way
round. Confirmed draws only the ways up the plan holds, which is the question
that replaces "what does this part have" once a plan exists. It needed
`DirectionArrows.shownDirection` in `packages/viewer` to widen from one index to
a set (F43).

⁹ This app holds a direction with no flag at all. Safe with one such state and
the arrow still on screen; not safe once a second lands — and a second has. The
Map features header now names the way up being held, but the viewport still has
only the filter flag.

¹⁰ Band counts and score are here; coverage per pass is now in the Directions
tab rather than on the summary card.

### 3.5 The layers on the part

Painted weakest first, later layers overwriting earlier ones. The picker's stack
is nine deep; ours is six.

| #   | Layer                                               | Status    | Lands in |
| --- | --------------------------------------------------- | --------- | -------- |
| 48  | Paint mode wash — directions                        | **Built** | —        |
| 49  | Paint mode wash — difficulty                        | Built     | —        |
| 50  | Sharp corners                                       | Absent    | —⁸       |
| 51  | Proposal, violet, **per face**                      | **Built** | —        |
| 52  | "Looking at" inside a proposal, green               | **Built** | —        |
| 53  | Faces being painted right now                       | **Built** | —        |
| 54  | Selection                                           | Built     | —        |
| 55  | Hover                                               | Built     | —        |
| 56  | **Selection outline** — a line, not a fill — **R1** | Absent    | PR 7     |

Two rules travel with the stack. **A face can only be one colour**, so later
layers overwrite and nothing blends — which is why the outline earns its place
as the one mark that is a line. And **the selection palette follows what the
part is painted with**: warm over the cool direction cycle, cool over the warm
difficulty ramp. This app has one blue triad, which is right for Difficulty and
wrong for Directions — **settled**: `SETUP_COLORS` is a warm triad worn over the
direction cycle, `READING_COLORS` the blue one over difficulty. Spread in
lightness rather than hue, because the warm end is crowded — painting is already
orange and sits between the two. `selection-colors.test.ts` pins the rules
rather than the hex values, including that no selection colour may equal a
direction colour.

### 3.6 The state behind all of it

The picker's Directions page runs on thirteen independent pieces. Most of its
bugs have been two of them disagreeing.

| State              | Status                                  | Lands in |
| ------------------ | --------------------------------------- | -------- |
| `pickedRegions`    | Built (`picks`)                         | —        |
| `candidates`       | Built                                   | —        |
| `focusedTag`       | Built (`focused`)                       | —        |
| `focusFromPick`    | **Open** — a guessed focus still paints | —        |
| `selected`         | **Dropped** — see row 21                | —        |
| `plan`             | **Built**                               | —        |
| `showingPass`      | **Built**                               | —        |
| `pickMode`         | **Built**                               | —        |
| `chosenDirection`  | **Built** (`picking.holding`)           | —        |
| `peekDirection`    | **Built** (`litDirection`)              | —        |
| `highlightedSetup` | **Built** (`litDirection`)              | —        |
| `proposal`         | **Built**                               | —        |
| `namingDirection`  | Absent — PR 11                          | —        |

`activeDirection` — a filter — exists here already, and is the one piece of
direction state this app got first.

### 3.7 Rough and finish, in full

The inventory rows are 22, 23, 24, 31, 32, 38 and 40. What they mean:

**An assignment is per `(feature, pass)`.** Not per feature. `assigned[tag]`
holds up to two setup ids — one for roughing, one for finishing — and **either
may be unset**. A part roughed everywhere and finished nowhere is a real,
half-planned state that the app has to be able to hold and report, not an error.

| Rule                                                                                                                                                        | Why                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Cut-once is per pass.** A region claimed for roughing is still free for finishing                                                                         | The same face is roughed once and finished once; claiming across passes would make a plan impossible      |
| **A button on one feature sets one pass** — `cutOnce`, not `assign`                                                                                         | A generator may set both, because the press asked for a whole arrangement. A row's R button asked for one |
| **Pressing the pass something already has takes it off**                                                                                                    | One key, both directions — the same rule the buttons follow                                               |
| **A group press is judged across the whole group.** Rough all where every reading is already roughed takes them all off; where some are not, the rest go on | Deciding per feature would make one press both assign and unassign                                        |
| **A group shares a way up** — that is what makes it a group — so the setup is worked out once, from the first of them                                       | `setPassFor`                                                                                              |
| **Both passes apply in one update.** Pass a _list_ of passes, never two `setState` calls                                                                    | Two updates computed from one snapshot land one pass. This was a bug                                      |
| **Coverage is per pass**, and so is the part's colouring                                                                                                    | One picture cannot show both. `coverageOf(model, features, plan, pass)`                                   |
| **A direction emptied by a change is dropped; one somebody made by hand is not**                                                                            | `withoutEmptied` — an orphaned setup nobody chose is noise, one somebody named is a decision              |

**The viewport pass toggle** (row 40, `showingPass`) changes _which assignments
count_, so it moves both the direction colours and which features read as
placed. It appears beside the paint modes whenever the mode is not Plain.

**In an offer, pressing a pass is what accepts it** — there is no Confirm button
(rows 24, 31–32). Discard is the only other exit.

**This is the one-way door in §7.3.** Every rule above is written per pass;
shipping one pass and splitting later means revisiting all of them.

### 3.8 The two kinds of multi-selection

Easy to conflate, and they are independent — different inputs, different
clearing rules, different jobs. The picker runs both at once.

|             | **Picked faces**                                         | **Selected features**                                                |
| ----------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Holds       | Regions on the part (`pickedRegions`)                    | Feature tags (`selected`)                                            |
| Set by      | ⌘/Ctrl-click on the part (row 8)                         | Checkboxes on candidate rows, band counts, hole groups (rows 20, 21) |
| Answers     | "What could cut **all** of these?"                       | "Do this to **these** readings"                                      |
| Drives      | The candidate list — owners narrowed to the intersection | The selection paint, and the selection bar's count / copy / clear    |
| Focus       | Yes — one owner is focused as a guess                    | **No.** A checkbox selects without reading: picking is not reading   |
| Cleared by  | Escape, empty space, a plain click, changing pick mode   | Escape, empty space                                                  |
| Status here | **Built** — `picks.ts`                                   | **Dropped** — see row 21                                             |

**A third rule this app needed and the picker did not.** Picked faces resolve to
readings **two different ways**, and using the wrong one is a bug in each
direction:

- _Inspecting_, holding two faces asks what they are both part of, so the
  readings are the **intersection** — two walls of a pocket give the pocket.
- _Mapping_, the faces need not belong to one feature. A floor and a wall from
  the same way up are two readings to assign, so they are **gathered**, not
  narrowed. Narrowing there empties the list exactly when somebody is
  accumulating work into it.

`sharedReadings` is the first, `gatheredReadings` the second, and each is
documented against the other so they do not get swapped.

Three rules that travel with them:

- **⌘ _or_ Ctrl, on both platforms.** A Mac user with a PC keyboard reaches for
  Ctrl. The viewer reports which modifier was down and the app decides what it
  means.
- **An empty intersection is a real answer.** Two faces with nothing in common
  are two faces, and saying so beats offering a reading that covers only one of
  them.
- **Never resolve a multi-face pick silently to a best guess.** If a click is
  ambiguous the panel must list every owner. This is the main way the
  interaction goes wrong, and it is why the candidate list is not droppable.

What the app paints as "selected" is **the selected features plus whatever is
focused but not yet selected** — and a focus the app _guessed_ is excluded (row
10). The outline (R1) follows the same set.

### 3.9 The two pick modes

Row 43, and rows 6, 19, 23, 44 and 46 hang off it. `pickMode` is `'face'` or
`'direction'`, and it decides what a click on the part means before the click
happens.

| Mode             | A click on the part                  | The panel below the toggle                                              |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| **By face**      | Picks that face and ranks its owners | The candidate list, each row with its pass buttons                      |
| **By direction** | Paints that face into a set          | The per-direction offers: what each way up would cut of what is painted |

- **The toggle is always visible**, not behind a menu: how a click will be read
  is a choice to make _before_ clicking, and one hidden until after the first
  click is one discovered by making the wrong kind.
- **By face is drawn first, because it is where the page opens.** By direction
  needs a way up held before a click paints anything, so it cannot be the mode
  somebody arrives in — and a toggle whose pressed button is not the one the eye
  lands on first reads as though the page started elsewhere and was moved.
  _(This app draws them By face, By direction, Unmapped; the picker's order was
  the reverse of the first two.)_
- **Switching modes clears the picked faces and the candidates**, and switching
  back to `face` also lets go of the held direction. A set painted for one
  question is not an answer to the other.
- **The toggle is disabled while an offer stands** — "Confirm or discard the
  offer first". An offer is already a question about one direction.
- **By direction needs a direction held** before a click paints anything; the
  arrow is what holds it (row 13).
- The mode is **reset to `face`** on leaving for a page where nothing can be
  assigned.

**Two of those diverge here.**

_By direction shows the held way up only_, not every direction that reaches the
painted set (§7.8, F21). Holding a direction is the choice; offering the other
three afterwards asks for it twice. It says plainly when the held way up reaches
none of what is painted, rather than showing an empty list.

_The toggle is not disabled while an offer stands_ — **still open**. The scope
buttons are, so a second offer cannot be built over the first, but switching how
a click is read while an offer is up abandons the inference in everything but
name. Worth closing.

_And `face` is the default_, where the toggle lists By direction first: by
direction is worked by pressing an arrow, so opening there would open in a mode
whose only gesture is not on screen yet.

---

---

## 4. The stages

The inventory in dependency order. **Everything up to stage 5 is built.**

| Stage | A person can…                                                       | Status                                 |
| ----- | ------------------------------------------------------------------- | -------------------------------------- |
| **0** | Click a face, see what owns it, walk the readings, read a datasheet | Was already here                       |
| **1** | Assign a reading to a direction and see the direction list fill     | **Built**                              |
| **2** | See how much is mapped, and what is missing                         | **Built** — by face, not reading (F31) |
| **3** | Hold a way up, paint faces, take a group in one press               | **Built**                              |
| **4** | Get an arrangement from one press                                   | **Built** — all six generators         |
| **5** | Be offered what else a direction cuts, and prune it                 | **Built**                              |
| **6** | Name a way up the Engine never reported                             | Not started                            |

The dependency order in the original plan was **wrong in one place**: stage 4
(generators) was sequenced after stage 5's workflow, and in practice it depends
on nothing but stage 1. It was built third and nothing broke.

---

## 5. The PRs — what they actually were

The original estimate was thirteen PRs and ≈4,850 source LOC. What follows is
what the work turned out to be, since that is the useful thing when it is redone
against the real repo.

### The model

| What                | LOC  | Notes                                                    |
| ------------------- | ---- | -------------------------------------------------------- |
| `setups.ts`         | 392  | Ported whole. Est. 410                                   |
| `directions.ts`     | 211  | Pure geometry. Est. 237                                  |
| `plan-actions.ts`   | ~180 | `setPassFor`, `cutOnce` wiring, the ranking a click uses |
| `plan-summary.ts`   | ~140 | Coverage, the confirmed list, what is not cut            |
| `direction-rows.ts` | 77   | What each candidate direction reaches                    |

**The type swap was three import lines**, not a mapping layer — `Vec3` comes from
`@toolpath/api` and is structurally identical (F1). The real cost was renaming
`feature.tag` → `feature.featureTag` throughout, because the picker normalises
its reports and this app consumes the raw wire shape (F6).

### The page

| What               | LOC  | Notes                                             |
| ------------------ | ---- | ------------------------------------------------- |
| `setups-panel.tsx` | ~290 | Coverage, generators, the confirmed directions    |
| `map-features.tsx` | ~470 | Both pick modes, the offer, the group headers     |
| `pass-buttons.tsx` | 65   | R / F / Both, and the rules they follow           |
| `pick-mode.ts`     | ~120 | Mode, painted set and held direction as one state |

### The generators

| What              | LOC  | Notes                                       |
| ----------------- | ---- | ------------------------------------------- |
| `generate.ts`     | ~300 | `planFor` and four generators resting on it |
| `best-reading.ts` | ~470 | `from the rules` and `fill from current`    |

**The 9a/9b split was wrong in kind, not just in size** (F18, F30). `planFor` and
its four dependents are small and mechanical — about a third of one PR.
`byBestReading` is all of the remaining risk and took four rounds to get right
(F32, F34, F35, F36). Split it that way, not "generators 1–3 / 4–6".

### Inference

| What          | LOC  | Notes                                       |
| ------------- | ---- | ------------------------------------------- |
| `infer.ts`    | ~250 | `inferable`, `coverFaces`, `readingsFor`    |
| `proposal.ts` | ~160 | The offer lifecycle, held as a set of faces |

### Beyond the picker

Not in the inventory, because the inventory is written from the picker's side and
the picker has none of this. It came from using the app on a real part.

| What                                                   | Where                                       | Why                                                                                          |
| ------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Identical holes are one row, and the row opens**     | `hole-groups.ts` (~200), `map-features.tsx` | Sixteen holes of one diameter, depth and way up are one tool and one operation (F44)         |
| **Unmapped** as a third thing the panel can be showing | `map-features.tsx`, `plan-summary.ts`       | "What is nothing cutting" was only answerable from the Directions tab, away from the presses |
| **Holding a way up narrows Unmapped**                  | `map-features.tsx`                          | The one list that ignored `activeDirection`, which already scoped everything else            |
| **Arrows: Confirmed**                                  | `arrows.ts`, `packages/viewer`              | Row 41 note 10 (F43)                                                                         |
| **Plan limits as rules**                               | `plan-limits.tsx`, `rules.ts`               | The shop's economics are the only levers that change what an arrangement decides (F38)       |
| **Making a reading the Engine did not report**         | `make-feature.ts`, `create-feature.tsx`     | Four faces a shop runs as one operation, which no reported feature covers exactly — §12      |

### Not built

| What                              | Why                                                    |
| --------------------------------- | ------------------------------------------------------ |
| PR 7 — the selection outline (R1) | Still deferred, and now the best remaining idea        |
| PR 11 — naming a way up (stage 6) | Not started. `recognize.ts` is 138 lines in the picker |
| `saved-plans.ts` — snapshots      | Persistence, §7.2                                      |
| Rename a direction (row 27)       | Remove and open are built; rename is not               |
| The follow-up strip (row 25)      | Absent                                                 |
| Quiet focus (row 37, R2)          | Half built — see R2                                    |

---

## 6. Sequencing, as it actually went

The spine held: **model → page → assignment**. Everything after it was more
independent than the plan assumed.

- **Generators do not depend on the workflow.** Built before painting and before
  inference; nothing broke.
- **PR 2a is not a shippable stage.** "The direction list, read-only" shows
  nothing on an empty plan, and three of its four inventory rows mutate the plan
  (F10). Merge 2a and 2b.
- **A standalone Directions page was a wrong turn** (F13). The picker has no such
  thing: its Directions _view_ is a tab whose left column is the setups panel.
- **Inference is not last and not optional.** It is what makes a mapping
  finishable, and it landed cleanly once `docs/inference.md` was read.

### If this is redone against the real repo, in this order

1. `setups.ts` + `directions.ts` + their tests. Nothing renders.
2. The Directions **tab**, the confirmed-direction list, coverage.
3. Assignment — pass buttons, the keys, `cutOnce`.
4. `planFor` and the four cheap generators.
5. Painting by direction, the pass toggle, the pick modes.
6. Inference and the offer.
7. `byBestReading` — on its own, with a part-sized performance test from the
   first commit (F36).
8. Naming a way up (stage 6).

Stop points that leave a coherent app: after 3 (a mapping by hand), after 5 (a
mapping you can see), after 7 (a mapping the app builds for you).

---

## 7. Decisions

The four that blocked the first PR, plus what building it settled.

1. **Does this app want a planning page at all? — Yes, a mapping page.**
   Unchanged. It answers "how would this part be approached", which is a DFM
   question, and stops there.

2. **Where the plan lives — nowhere, for now.** Unchanged, and it held up: the
   mapping is in memory and lost on reload, like the rules beside it.

3. **Rough and finish, or one pass? — Keep the split.** Unchanged, and every
   rule in §3.7 held. This remains the one-way door.

4. **Tab or route? — ~~A route~~ a tab.** _Reversed._ A route was built and
   reverted (F9, F13, F16). The report is component state from one SSE
   subscription with no cache, so a sibling route re-opens the stream and
   re-fetches on every visit. A **nested** route would work, but the picker's own
   Directions is a view beside Inspect and Rules, and a tab is what it should be.
   The observation is worth keeping: **any future page needing the report must be
   a tab or a nested route, never a sibling.**

5. **Does Escape stay stepwise? — Still open.** Row 34. Painted faces now count
   as part of the newest gesture so the first press takes them, but with a held
   direction, a painted set, an offer and a selection all live, stepwise Escape
   is harder to defend than it was.

### Settled while building

6. **Which reading cuts a face — by score, then band.** The picker orders it
   band-first so a refusal can never win. A band is five buckets and a score is
   continuous, so band-first discards every distinction inside a bucket. **The
   cost is named in a test**: a reading one rule refuses can now win a face.

7. **`fill from current` buys no new ways up.** The picker's version fills _and_
   buys, making it "from the rules with a head start". Here the two answer
   different questions: from the rules asks what the best arrangement is, fill
   from current asks what the best is _given this fixturing_. It leaves ground
   uncut where nothing held reaches it, and that is the answer rather than a
   failure.

8. **By direction shows only the way up being held.** The picker offers every
   direction that reaches the painted set; holding one _is_ the choice, and
   offering the rest asks for it twice (F21).

9. **Right reads, left acts** — everywhere on the part, and a peek needs a list
   on screen or it does nothing (F26, F28). The picker gives right-click one job
   inside an offer; generalising it removes the special case, and refusing to
   guess when no list is open honours §3.8.

10. **A click prefers a square way up.** ±X, ±Y, ±Z before an off-axis
    direction, and what the plan already cuts before either. Off-axis is a real
    answer and a more expensive one.

11. **Counts are faces, not readings.** A face is reported from every way up that
    reaches it, so most readings must lose. Counting readings made a finished
    arrangement read as mostly unmapped (F31).

---

## 8. What actually bit

The original list was seven bugs reported in the picker. Six of them were real
and are guarded; the seventh never came up. What follows is that list, marked,
plus what bit that nobody predicted.

### From the picker, and still true

- **Assigning everything a direction can reach** — guarded by `claimedRegions`
  and cut-once. Never observed.
- **Two `setState` calls from one plan** — `setPassFor` takes a _list_ of passes
  and applies once. A test pins it.
- **Offers built largest-first** — `inferable` builds smallest-first, with a
  second pass for what the small readings blocked.
- **Inference offering work another direction already cuts** — the claimed set is
  seeded from the whole plan.
- **Undercuts volunteered** — never offered unless the face has no other reading
  anywhere. Two tests.
- **A scope with no flag** — row 45; the flag is there.
- **A panel remembering its first height** — Map features is a content-sized
  block, not a resizable panel.

### What bit that the plan did not predict

- **Greedy swaps judged against an incomplete future.** Four rounds on
  `byBestReading` (F32, F34, F35, F36): dominance-per-face, coverage-before-fill,
  stranded-ground-at-zero, and finally non-termination. Each fix narrowed the gap
  between the greedy step and the real objective, which is set-partitioning and
  will never be exactly right.
- **Nothing terminates by accident.** The fixed point only ended because every
  comparison used already-realised values. Introducing one speculative term
  removed the guarantee silently, and the page froze.
- **Every test ran on a toy part.** Three to twenty-six faces, where
  non-termination is unreachable and quadratic is invisible. **Write the
  part-sized test first.**
- **A list's shape has more dependents than it looks** (F22). Regrouping the face
  list broke the highlight, the choose-handler and the keyboard, separately, none
  caught by types.
- **Half a pair.** Four stuck-highlight bugs, every one "N places set it, N−1
  clear it". Route every clearing gesture through one function.
- **The mapping UI kept being unreachable** (F19). Three separate gates each
  needed a click on the 3D part. The picker assumes the part is the primary
  input; this app's lists are far more prominent.

---

## 9. Where the source material is

| What                                                           | Where                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| The page spec, its interactions in order, the ladder           | `tp-ui@pc-feature-picker` · `apps/feature-picker/docs/build/directions.md` |
| The full interaction spec                                      | same repo · `docs/interactions.md`                                         |
| **The inference spec — 158 lines, read it whole**              | same repo · `docs/inference.md`                                            |
| The colour spec                                                | same repo · `docs/highlighting.md`                                         |
| Names for everything                                           | same repo · `docs/vocabulary.md`                                           |
| The plan model, generators, leftovers                          | same repo · `src/setups/*.ts`                                              |
| **`direction-scores.ts` — in `src/rules/`, not `src/setups/`** | same repo · `src/rules/direction-scores.ts`                                |
| The outline (R1)                                               | same repo · `packages/viewer/src/core/part.ts`, `core/theme.ts`            |
| The quiet focus (R2)                                           | same repo · `src/components/{face-candidates.tsx,list-keys.ts}`            |
| This app today                                                 | [interactions.md](interactions.md), [highlighting.md](highlighting.md)     |
| **What building it corrected**                                 | [directions-parity-findings.md](directions-parity-findings.md), F1–F36     |
| The deleted plans                                              | `git show 441b7bc^:docs/{directions,viewer-parity,rules}-plan.md`          |

`docs/inference.md` was **missing from this table** in the first version, and it
is the single most valuable source in the list: every rule in it is a reported
bug, and none is guessable from the code (F23).

**A warning about the viewer rows.** The picker's `packages/viewer` is a
_different package that happens to share the name_ `@toolpath/viewer` — private,
v0.0.0, organised `core/` `api/` `react/`. This repo's is published, v0.3.1,
organised `render/` `engine/`. Nothing lifts across unchanged, and **the
inventory's own Status column was written against the picker's viewer**: rows 9,
12, 14 and 15 cite `packages/viewer/` paths that do not exist here. Row 14 was
marked **Built** and half of it was not — right-click never reached a pick,
because this app's viewer emits from `onClick`, which the right button does not
fire (F25).

To compare side by side, the picker runs from `tp-ui` with
`pnpm --filter @toolpath/feature-picker dev --port 5178 --strictPort`.

---

## 10. Where this stands, and what to do next

### Running it

|                        |                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Sandbox                | `~/dev/toolpath-sandbox` — clone of `toolpath` @ `fdcff0e`, **no remote**                     |
| The app                | `pnpm --filter @toolpath/part-viewer dev --port 5173`                                         |
| The picker, to compare | `~/dev/tp-ui`, `pnpm --filter @toolpath/feature-picker dev --port 5178`                       |
| Checks                 | `npx vitest run` (~2 s) · `npx tsc --noEmit -p tsconfig.json` · `npx playwright test` (~40 s) |
| Getting work out       | `./export-patches.sh` → `~/dev/directions-patches/`                                           |

`~/dev/toolpath` has its push URL disabled while the repo split runs. Restore it
with `git remote set-url --push origin git@github.com:toolpath/toolpath.git`.

**Restart the dev server after touching `routes.ts` or `styles.css`** — both wedge
it while leaving the build, tests and types completely clean (F12). It has cost
two round trips already; the tell is a broken page with a green suite.

### The shape of the code

```
app/shared/
  setups.ts          the plan model — Setup, SetupPlan, cutOnce, coverage
  directions.ts      vector geometry, and whether a way up is square
  plan-actions.ts    setPassFor, and the order a click offers readings in
  plan-summary.ts    coverage per pass, the confirmed list, what is not cut
  direction-rows.ts  what each candidate direction reaches
  generate.ts        planFor, and four generators resting on it
  best-reading.ts    from the rules, fill from current — read the comments
  infer.ts           inferable, coverFaces, readingsFor
  proposal.ts        the offer, held as a set of faces
  pick-mode.ts       mode, painted set, held direction — one state
  keys.ts            what R / F / A / B / X mean
app/components/
  setups-panel.tsx   the left column of the Directions tab
  map-features.tsx   the right column — both modes and the offer
  pass-buttons.tsx   R / F / Both, and the rules they follow
```

### Known-open, roughly in the order I would take them

1. **A guessed focus paints nothing** (row 10, F19). The plan calls this out and
   it is still wrong here: clicking two walls lights up whatever profile owns
   them both. Needs `focusFromPick`, and it is entangled with the `onFocus` that
   makes the keyboard work.
2. **Quiet focus** (row 37, R2). Same entanglement. Doing 1 and 2 together is
   probably one change.
3. **Rename a direction** (row 27). Remove and open are built.
4. **Escape** (row 34, §7.5). Now genuinely worth revisiting.
5. **Stage 6 — naming a way up** (`recognize.ts`, 138 lines). The only stage that
   invents a direction rather than reading one.
6. **The selection outline** (R1). Five layers on the part and a face can only be
   one colour.
7. **A click folds the direction list** (row 11). Small.
8. **The row re-render cost** (F46). Measured on a 420-feature part: 27 ms per
   keystroke, because every row takes `focusedTag` and works out `isFocused`
   itself, so moving focus one row re-renders all 288. Pass a precomputed
   boolean and `React.memo` the row. **This is the only thing that makes the app
   feel slow, and it is not the API** — the same measurement with the API stubbed
   out shows the whole cost is ours.
9. **Two Reacts under vitest** (F45). Blocks component tests for anything using
   `@toolpath/ui`, which is most of the app. Belongs in the split.

### What to watch while testing

- **`byBestReading` is greedy and will not be perfect.** It maximises
  score-weighted covered area over whole, non-overlapping readings — a
  set-partitioning problem. If a face looks wrongly assigned, the question is
  whether the _set_ is better, not whether that face got its best reading; F33
  explains why per-face optimal is unreachable.
- **Faces the Engine reports no reading for** are counted separately in "not cut
  yet". That is a gap in the analysis, not the plan.
- **Undercuts are never volunteered** by any generator or by inference. A face
  left uncut may simply be one.
- **Coverage and "not cut yet" measure the same thing** and cannot disagree. If
  they ever do, one of them has gone back to counting readings.
- **The performance test is a canary.** `perf.test.ts` builds a 108-face part and
  asserts the arrangement settles. If it slows, the swap loop has stopped
  converging — that is what a frozen page is from the outside.

### If the whole thing is redone against the real repo

The port itself is cheap: the model came across in an afternoon and the type swap
was three import lines. **What is expensive is everything the picker knows and
does not say in code** — `docs/inference.md`, the ordering rules in
`byBestReading`, and the bugs listed in §8. Bring the docs across with the code.

Two questions for whoever owns the split:

1. Do `packages/{ui,viewer,sdk-typescript}` travel with `apps/part-viewer`? All
   three are `workspace:*` dependencies and the viewer needed a change today
   (F25). If they split away, that change becomes a release cycle.
2. Does `apps/part-viewer` keep its path? The patches in
   `~/dev/directions-patches/` replay with `git am`, or `git am -p3 --directory=.`
   if it becomes a repo root.
