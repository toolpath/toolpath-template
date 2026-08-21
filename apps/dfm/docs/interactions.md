# Interactions

Every state this app can be in, every input it accepts, and what each one does.
Written from the running code, so a bug report can say "step 3 is wrong" rather
than "the selection is weird".

Read [highlighting.md](highlighting.md) alongside this for what each state
_looks_ like. Where the two disagree, the code wins and both pages are wrong —
say so.

---

## 1. The frame

One part per page, three tabs on the right of the viewport — **Inspector ·
Directions · Rules** — with the part in the middle and the datasheet on the
right. The tabs are what the left column is _about_; the part and the datasheet
do not change between them.

| Tab            | Left column holds                                                    |
| -------------- | -------------------------------------------------------------------- |
| **Inspector**  | The part summary, then every feature, searchable and grouped by type |
| **Directions** | Today: the focused feature's machining axis. See the plan below      |
| **Rules**      | The set in force, what it made of each feature, and the editor       |

**The Directions tab is a placeholder.** It prints the axis of whatever is being
read. What it is meant to become — holding the part a way up, assigning work to
it, coverage, painting by direction — is specified in the picker's
`docs/build/directions.md` and planned here in
[`docs/directions-plan.md`](../../../docs/directions-plan.md). Everything below
describes what exists now.

---

## 2. Every piece of selection state

Held apart on purpose: a click resolves to five to eight readings, so "what was
clicked" and "what is being read" are different questions, and answering both
with one value is where this goes wrong.

| State             | Holds                                              | Set by                                    | Cleared by                                                      |
| ----------------- | -------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `picks`           | The faces being held, most recent last             | A click on the part                       | Escape, a plain click elsewhere, a re-click on the read reading |
| `candidates`      | The readings those faces share, best first         | The same clicks                           | The same                                                        |
| `focused`         | The one reading being read                         | A click, a row, an arrow key              | Escape, walking back onto it                                    |
| `activeDirection` | A way up being held, scoping what a click can mean | Pressing an arrow on the part             | Escape, the same arrow again                                    |
| `expandedType`    | A feature type opened in the list                  | A type header                             | Escape, opening another                                         |
| `typeIsAsking`    | Whether that open type still lights the part       | Opening a type                            | Any click — the type stays open, its paint does not             |
| `paintMode`       | Plain, Directions or Difficulty                    | The control at the viewport's top left    | Persisted, never cleared                                        |
| `arrows`          | All or off                                         | The arrows button, or holding a direction | —                                                               |
| `hoveredTags`     | What a list row under the pointer points at        | Hovering a row                            | Leaving the row                                                 |
| `pointerOnPart`   | Whether the pointer is over the part at all        | The viewport                              | Leaving it                                                      |

`focusFeature` is not selection: it is a **request** to frame the camera on
something, and it is deliberately nulled before being set again so that asking
twice for the same feature reads as two requests rather than as no change.

---

## 3. The mouse, on the part

### 3.1 A click on a face

1. The click resolves to a region, and the region to every feature that owns it,
   ranked — most specific first, and narrowed to the held direction if one is
   held.
2. The best reading is **focused**, so there is something to read. The rest are
   listed beside the part.
3. **Clicking the same face again walks its readings.** Walking back onto the
   one already being read clears the selection — on a face with one reading that
   makes a click a toggle; on a face with eight it is the end of the cycle,
   which is the point at which going round again would say nothing new.
4. That "click again clears" rule is deliberately limited to **the same face**.
   A click on a _different_ face that happens to resolve to the same reading is
   still a click on something, and clearing there would make a feature spanning
   two faces impossible to keep selected.

### 3.2 ⌘ or Ctrl-click

Adds a face to the held set, or takes it off if it was already held — keyed on
the region, so the same face clicked twice is the same face whatever the ray
hit.

With more than one face held, the candidates are **the readings that own every
held face**: two walls of a pocket resolve to the pocket. Empty is a real answer
— two faces with nothing in common are two faces, and saying so beats offering a
reading that only covers one of them.

The order comes from the newest click's ranking, but the _set_ comes from
`owners` rather than `ranked`: `ranked` was already narrowed by whatever
direction was in force when that face was clicked, and these faces outlive that
direction.

### 3.3 A click on empty space

Clears the selection outright.

### 3.4 An arrow

Pressing a candidate direction's arrow **holds** that way up. Three things
happen, and all three are the point:

- What is already held is **re-read from that direction** rather than put down.
- The other arrows come off. Left showing all of them, pressing an arrow changed
  nothing anybody could see, and a filter with no sign of itself reads as a
  click that missed.
- Pressing it again lets go, and the faces are read again unscoped.

### 3.5 Hover

The pointer's own question, and it wins over anything a list is lighting up —
see [highlighting.md](highlighting.md) §3.

---

## 4. The mouse, in the lists

| Where                          | A click does                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A **feature row**              | Reads that feature. It does **not** re-pick — naming a feature from a list is a different question from the one a click on the part asked                                        |
| A **candidate row**            | Switches which reading of the clicked face is being read, keeping the list up: it is the control being used, and clearing it on the first press left nothing to switch back with |
| A **type header**              | Opens that type and lights its features on the part                                                                                                                              |
| Anything, while a type is open | Puts the type's paint down but leaves the list open — it is how somebody got here and how they get back                                                                          |

---

## 5. The keyboard

| Key        | What it does                                             |
| ---------- | -------------------------------------------------------- |
| ↑ ↓        | Walk the readings of the face that was clicked, wrapping |
| Escape     | Takes one thing off, working outward — §5.1              |
| Home / End | Ends of a list, inside a list that has focus             |

The arrow keys are bound to the **window**, not to the list: the click that
produced the candidates left focus on the canvas, and asking somebody to click
the list before they can arrow through it defeats the point of the shortcut. A
list under the pointer walks itself — anything marked `data-keynav` handles its
own arrows and the window handler stands aside. Fields are exempt, always.

### 5.1 Escape works outward, one press at a time

`escapeStep` decides what a press takes off: the selection first, then an open
type, then the held direction. One press, one thing. **The order is how recently
something was asked for, not how big it is** — the click is the newest, the open
type is what was being browsed before it, and the direction is a scope somebody
set deliberately and would be annoyed to lose while undoing a click.

**This differs from the picker deliberately**, and it is worth knowing which
model you are in: there, Escape clears every state at once — picks, selection,
focus, filter, held direction, open panels and any standing offer — on the
argument that "get me out of this" should not need to be pressed five times, and
that half a list of exceptions is a list nobody can remember. Here the states
are fewer and nest cleanly, so stepping outward is legible. **When the
Directions page lands, this decision has to be revisited**: a held direction, a
painted set, an open offer and a selection are four things a person is _in_ at
once, and that is the point at which stepwise Escape stops being obvious and
starts being a thing to remember.

---

## 6. Direction states

Only one exists here today: **holding** (`activeDirection`), set by an arrow and
scoping what a click can resolve to.

The picker has four — filtering, holding, looking at, and naming — and tells
them apart with a flag pinned under the paint controls, because a scope you can
switch on from the part and only switch off from another view is one people get
stuck in. **This app has no such flag**, which is safe only while there is
exactly one such state and the arrow that set it is still on screen. It stops
being safe in PR 7 of the directions plan.

### Which arrows are drawn

`arrowsVisible` / `shownArrow`, in priority order:

1. A direction held → that one alone.
2. Something being read → its own direction's arrow, whatever the toggle says.
3. The toggle on → all of them.
4. Otherwise → none.

Off by default: an arrow per way up is most of a small part, and they answer a
question nobody has asked yet. There is **no "one arrow" setting** — looking at
a feature shows its arrow by itself, and putting the selection down takes it
away, so a mode for it would be a mode to remember to leave.

---

## 7. What persists

| Thing                   | Where        | Scope                             |
| ----------------------- | ------------ | --------------------------------- |
| Paint mode              | localStorage | `part-viewer.paint`, across parts |
| Units                   | localStorage | Across parts                      |
| Rules                   | memory       | Temporary; resets on reload       |
| Selection, picks, focus | memory       | Cleared when the part changes     |

The two stored preferences are read **after mount** rather than during render:
the server has no `localStorage`, and a value that differed between the two
hydrates as a flash of the wrong colours or the wrong numbers.

---

## 8. Known divergences from the picker

Each of these is a decision, not an oversight — but each is also a place where
the picker learned something the hard way, so they are listed with what it cost
there.

1. **A guessed focus paints.** Here, the best reading of a clicked face is
   focused _and_ painted. In the picker, a focus the app guessed after a face
   click paints nothing, because painting it claimed a decision nobody had made
   — clicking two walls lit up an eleven-face profile. The fix there was one
   flag (`focusFromPick`) and the rule "a chosen focus paints, a guessed one
   does not". Worth adopting **before** the Directions page makes a focus mean
   an assignment; harmless while a focus only opens a datasheet.
2. **Escape steps outward** rather than clearing everything — §5.1.
3. **No flag for a held direction** — §6.
4. **One selection palette, not two.** This app reads a part; the picker also
   plans one, so it carries a warm rig for Directions and a cool rig for
   Difficulty. See [highlighting.md](highlighting.md) §4.
5. **No selection outline.** The picker draws a line around the boundary of what
   is selected, so two picked faces that touch read as one shape and "picked"
   survives on a part already wearing a colour per face. Not ported.
