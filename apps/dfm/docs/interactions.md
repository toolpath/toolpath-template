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
| **Directions** | The ways up the plan holds, and the work mapped to each              |
| **Rules**      | The set in force, what it made of each feature, and the editor       |

**The Directions tab is where a part is planned**, and it is the largest thing
in the app. It was a placeholder that printed the axis of whatever was being
read; it now holds:

- **Choosing the ways up** — five generators (Pick directions, From the rules,
  Required filled, Required only, From Toolpath) with Fill all beside them, a
  chooser that previews on the part before anything is accepted, run order, and
  locking a setup so a generator leaves it alone
- **Mapping** — by feature, by direction, rough and finish as separate passes,
  under cut-once: a face is cut by one reading per pass, and giving one up is
  recorded
- **What is not cut yet** — a list of _faces_, biggest gap first, opening onto
  the readings that would cut them
- **Making a reading the Engine never reported**, and re-pointing it

Sections 9 to 16 below describe all of it. The specification it was built
against is [directions-parity-plan.md](directions-parity-plan.md), and what
building it turned up is in
[directions-parity-findings.md](directions-parity-findings.md).

---

## 2. Every piece of selection state

Held apart on purpose: a click resolves to five to eight readings, so "what was
clicked" and "what is being read" are different questions, and answering both
with one value is where this goes wrong.

| State             | Holds                                                                               | Set by                                        | Cleared by                                                      |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `picks`           | The faces being held, most recent last                                              | A click on the part                           | Escape, a plain click elsewhere, a re-click on the read reading |
| `candidates`      | The readings those faces share, best first                                          | The same clicks                               | The same                                                        |
| `focused`         | The one reading being read                                                          | A click, a row, an arrow key                  | Escape, walking back onto it                                    |
| `alone`           | Whether that reading stands for itself rather than for its group of identical holes | A hole named from inside its own opened group | Any other way of naming a reading                               |
| `activeDirection` | A way up being held, scoping what a click can mean                                  | Pressing an arrow on the part                 | Escape, the same arrow again                                    |
| `expandedType`    | A feature type opened in the list                                                   | A type header                                 | Escape, opening another                                         |
| `typeIsAsking`    | Whether that open type still lights the part                                        | Opening a type                                | Any click — the type stays open, its paint does not             |
| `paintMode`       | Plain, Directions or Difficulty                                                     | The control at the viewport's top left        | Persisted, never cleared                                        |
| `arrows`          | All, Confirmed or Off                                                               | The arrows button, Z, or holding a direction  | —                                                               |
| `hoveredTags`     | What a list row under the pointer points at                                         | Hovering a row                                | Leaving the row                                                 |
| `pointerOnPart`   | Whether the pointer is over the part at all                                         | The viewport                                  | Leaving it                                                      |

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

### 3.2b Which reading a first click opens

Two answers, and which one depends on whether the plan has anything to say about
the face yet:

- **Something cuts it** → that reading, whatever its score. A click on a face
  already being cut is nearly always a question about that cut: where it is
  machined from, whether it is roughed as well as finished, what came with it.
  Opening a different reading of the same face answers a question nobody asked
  and hides the one that matters. Cut in **either** pass counts, like everywhere
  else.
- **Nothing cuts it** → the **easiest**, by what the rules made of each. 0–100
  with 100 meaning every rule sitting in `easy`, so the highest is the one a
  shop has least trouble with, and an unjudged reading loses to any judged one
  because "nobody looked" is not a recommendation.

Ties keep the order the click ranked them in, so two equally easy readings still
resolve the way the geometry said.

The rules' answer used to be computed and then thrown away: the pick preferred
the easiest, and the panel immediately overrode it with "whatever is mapped,
else the first axis-aligned one".

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

### 3.5 Right click reads, and only from a list somebody put up

Right never changes anything — that is what makes the part safe to interrogate
half-way through a decision. Which of a face's readings it means is decided by
what is **already on screen**, most specific first: an open face editor, then a
standing offer, then a painted set.

**A face in none of those means nothing, and nothing happens.** The plan used to
count as a list too, which made right click open a datasheet on any mapped face
— on a mostly mapped part, every right click. A list somebody put up is a
question they are asking; the plan is just the part.

It is judged on **release**, not on `contextmenu`. That event fires on right
_mouse-down_, so the tap guard saw a gesture that had not moved yet and let
every one of them through — and right-drag is how the camera pans, so every pan
emitted a pick from the point it started at. `contextmenu` now does the one
thing it is still needed for: suppressing the browser's own menu over geometry.

### 3.5 Hover

The pointer's own question, and it wins over anything a list is lighting up —
see [highlighting.md](highlighting.md) §3.

---

## 4. The mouse, in the lists

| Where                             | A click does                                                                                                                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A **feature row**                 | Reads that feature. It does **not** re-pick — naming a feature from a list is a different question from the one a click on the part asked                                                                                                                                          |
| A **candidate row**               | Switches which reading of the clicked face is being read, keeping the list up: it is the control being used, and clearing it on the first press left nothing to switch back with                                                                                                   |
| A **hole group row**              | Reads the group — all of it, lit on the part. Its R / F / Both press every hole it stands for, and so do the keys: the row carries a `data-holes` list because the key handler at the window only ever sees the DOM                                                                |
| Its **triangle**, or → and ←      | Opens the group to its holes, one row each, and closes it again                                                                                                                                                                                                                    |
| A **hole inside an opened group** | Reads that hole **on its own** — `alone`, so the part stops lighting the other fifteen — and its two presses act on it alone                                                                                                                                                       |
| The **Unmapped** button           | Shows everything no way up cuts. Narrowed to one way up while one is held — see §6 — and no count on the button: the honest measure of what is left is **faces**, the list under it is **readings**, and one word over two numbers is a figure somebody has to be told how to read |
| A **type header**                 | Opens that type and lights its features on the part                                                                                                                                                                                                                                |
| Anything, while a type is open    | Puts the type's paint down but leaves the list open — it is how somebody got here and how they get back                                                                                                                                                                            |

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
exactly one such state and the arrow that set it is still on screen. That is
still true, and it is still the thing to watch: a second scope arriving without
a flag is how people get stuck.

### Holding one narrows what is left

Pressing a way up's arrow on the part — or its row in the summary — sets
`activeDirection`, which scopes what a click on the part can resolve to. **It
scopes the Unmapped list too.** "What is not cut" and "what is not cut _from
here_" are the two questions somebody planning asks, and the second used to mean
reading past five groups to find the sixth.

Two things follow, and both are about keeping the gesture usable:

- **Entering Unmapped puts the arrows on screen**, the same reason By direction
  does: a mode whose only gesture is invisible is one nobody starts.
- **Holding one does not narrow the arrows to it while Unmapped is showing.**
  Everywhere else it does — pressing an arrow with all of them up otherwise
  changes nothing anybody can see. But here the arrows _are_ the control, and
  one that vanishes after a single press cannot be used to choose a different
  way up.

The flag stays on the viewport, with its own Clear. A filter switched on from
the part has to be visible on the part and clearable from there, and a second
copy in the panel would be one state claimed by two places. A way up with
nothing left says so — an empty list under a flag reads as a bug in the filter.

### Which arrows are drawn

The toggle has **three states, and the cycle narrows**: All → Confirmed → Off,
and round. All is "which ways up does this thing have", asked deliberately.
Confirmed is the question that replaces it once a plan exists — "which ways up
am I actually using" — where the candidates the plan passed over have become the
clutter. Off is the default.

`shownArrow` decides, in priority order, and `arrowsVisible` is read off it
rather than worked out again — two rules for one picture is two rules to keep in
step:

1. **All** → every arrow. Every way up is the question, so nothing narrows it.
2. **A direction held** → that one alone, in any state. Choosing a direction is
   asking about that direction, and the answer is not improved by four other
   arrows crossing the part.
3. **Confirmed** → the plan's setups, plus whatever is being read. A reading's
   own direction is part of the answer whether or not the plan has claimed it;
   dropping it would make clicking a feature take its arrow away.
4. **Something being read** → its own direction's arrow, whatever the toggle
   says.
5. Otherwise → none.

**Confirmed with an empty plan draws nothing**, and that is the answer rather
than a failure: falling back to all of them would be the toggle refusing the
state it was put in. The button carries the state as a word beside the glyph, so
"nothing is drawn" is legible as _Confirmed_ rather than as _Off_.

Off by default: an arrow per way up is most of a small part, and they answer a
question nobody has asked yet. There is **no "one arrow" setting** — looking at
a feature shows its arrow by itself, and putting the selection down takes it
away, so a mode for it would be a mode to remember to leave.

A note on the word. **Confirmed** means the plan's setups — `setupGroups`'s own
term, "what has been decided" as against the candidates the part offers. It is
deliberately not called _active_: `activeDirection` already means the way up
being held, which is a filter on what a click can resolve to, and one word for
both would make every sentence about arrows ambiguous.

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

---

## 9. Identical holes are one row

A part carries dozens of holes the Engine reports separately, because each is
its own geometry. To a shop they are **one decision and one tool**: same
diameter, same depth, same way up, drilled in one operation — so Map features
draws them as one row, and one press maps all of them.

The row is named as the several it is — **"Blind holes ×16"**, with the count
immediately against the name. A singular in front of a count makes the reader
correct it, and a count pushed out past the tool and the face count stops being
part of the name at all.

**And the row opens.** "Which sixteen" is a fair question, and so is "all but
that one" — a hole under a boss, one that has to be reamed. Opened, each hole is
a row in its own right: it reads on its own, lights on its own, and carries its
own R and F. A group that cannot be opened answers both questions by making
somebody click every hole on the part.

**Which holes are in the row depends on which list is asking**, and the two
rules are not interchangeable — see `groupAcrossPart`:

| The list                                  | Groups                | Because                                                                                                                                                                               |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **By feature** — what a click found       | Across the whole part | The candidates hold the readings of one _face_, so a hole arrives alone while the part lights all sixteen. Saying "×1" there would be the list disagreeing with the part              |
| **By direction**, the offer, **Unmapped** | Within the list only  | Each is an answer about a _set_ — the painted faces, or what nothing cuts. Reaching across the part would offer holes nobody painted, and put mapped holes in a list of unmapped ones |

The datasheet says **how many** and nothing more. _Which_ sixteen is a question
about the plan, so the list of them lives in Map features, where each can be
assigned, read and lit. A second copy in the datasheet was a table that could
only be looked at.

---

## 10. A claim takes faces, not readings

**Experimental — `paul/partial-readings`.** This reverses a rule the rest of
these documents state plainly, so it is written up rather than folded in
quietly. See F49.

Every face belongs to five to eight readings, and a face is cut once per pass.
The question is what happens to the _other_ reading when one of its faces is
claimed.

|                                         | Before                                                                          | Now                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Claim one wall of a twelve-face profile | The profile is unassigned outright — eleven other faces silently leave the plan | The profile gives up that one face and keeps the other eleven   |
| The reading it was taken from           | Gone from the way up that held it                                               | Still there, marked `11 of 12f`                                 |
| Its last face taken                     | —                                                                               | Unassigned, because a reading cutting nothing is not a decision |

`Assignment.without` records what a reading gave up, per pass, and
`Assignment.also` what it was handed (§11). Both are absent on almost every
assignment, and absent means "exactly what it covers", so a plan a generator
wrote is shaped exactly as it was. Both are written from one place — `noting`,
which takes the set of faces a reading keeps and states the two lists as a diff
against its own. Keeping them consistent by hand at every branch is how they
drift apart.

**`cutRegions` is the one function to ask** what a reading actually cuts —
coverage, claimed ground, "not cut yet" and the paint all go through it, and any
one of them reading `feature.regionIdxs` directly is a plan claiming ground it
is not cutting. **`coveredRegions`** answers the wider question the editor asks:
every face the reading is _about_, in either pass, its own and any handed to it.

### What follows from it

- **A part-cut reading paints face by face.** Colouring the whole feature would
  colour a face the plan has given to another way up, and the two layers would
  fight over it in whatever order they happened to be in. The viewer's region
  layer already existed for exactly this — "which part of a feature it is
  talking about".
- **Its pass buttons read `mixed`**, dashed rather than filled. Pressing one
  takes the rest of the reading back; pressing again lets the whole thing go.
  Two presses, each with a visible result — where before the only gesture that
  could repair a split claim was the one that destroyed it.
- **A press is "already there" only when the reading is whole.** Otherwise the
  toggle-off rule would fire on the very press meant to repair it.
- **Nothing is handed back when a claim is undone.** Unassigning the wall leaves
  its face uncut rather than guessing which of the readings that once covered it
  should have it — several may have given it up over time, and picking one would
  be the app deciding. The face shows as uncut, and one press puts it wherever
  it belongs.

### The cost, stated

A reading cut on part of itself is **not one CAM operation**. The Engine reports
one operation over the faces a feature covers, and "run the profile, but only
these eleven faces" is not a thing a post can emit. Every other document here
says whole readings only, and means it.

What buys it back is that the old behaviour was worse in the one place it
mattered: moving a single wall to the way up that squares it threw eleven faces
out of the plan, said nothing, and left somebody to notice them reappearing in
"not cut yet". Either the app models a split claim or it silently discards work.
This models it, and marks it everywhere it shows.

---

## 11. The faces of a reading

**Experimental — `paul/partial-readings`, with §10.** A face count is a
**control**, in every place a reading is listed: the mapping lists, the
confirmed directions, and the datasheet. Pressing it opens that reading's faces
**in place of the datasheet** — both are about the same reading, and showing
both would ask somebody to hold "twelve faces" and "one of them" at once. The
count is the way in and Close is the way back.

A face is what a plan is actually made of — it is what gets cut once, what
coverage counts, and what a claim takes. Until this existed the only way to
argue with one was to find it on the part and click it.

**The number itself comes from one function**, `faceCounts`, in all four places
it appears. The total is every face the reading is _about_, its own and any
handed to it; the numerator counts a face cut in **either** pass, exactly as the
tick does. Per-pass state is the pass buttons' job and they say it precisely, so
the count answers the question they cannot: how much of this reading is in the
plan at all. A reading assigned in neither pass reads as whole — `0 of 12` on an
unmapped row would say a decision had been made about it. See F64.

| In the list                  | What it does                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| One row per face             | Its index, how the Engine classified the surface, its area, and how many readings cover it                                    |
| The **tick**                 | Whether this face is part of this reading, in **either** pass. Ticking claims it — off whatever held it, like any other claim |
| The **triangle**, or → and ← | Opens the face onto every reading that covers it, each with its own R / F / Both                                              |
| **R here · F −Z**            | Where each pass of the face is cut, when the two do not agree — see below                                                     |
| A **reading** under a face   | Walks to that reading's faces. The rows are alternatives for one face                                                         |
| Hovering a row               | Lights that face alone, over the set                                                                                          |

Three rules the ticks follow, all inherited rather than invented:

- **Ticking a face on a reading nothing has claimed assigns it**, cutting that
  face alone. That is how a claim is built up face by face instead of taken
  whole and argued back down.
- **Unticking the last face unassigns the reading**, and drops its way up if
  that emptied it. Same rule as a claim taking a reading's last face.
- **A face is still cut once.** Ticking takes it off whatever held it, leaving
  the rest of that reading where it was — §10.

### The tick is about both passes

It **writes** both — "cut this face here" describes the work, not one half of it
— so it **reads** both. Reading back only the pass on screen left a face this
reading finishes sitting unticked in its own editor, directly above an expanded
row showing that very reading with F lit, and a header saying `0 of 12 faces`
about a reading that cuts all twelve.

So: ticked when either pass holds it, **dashed** when only one does — the same
`mixed` the pass buttons show, and for the same reason. Pressing a dashed tick
**fills it up** rather than emptying it, which is the rule R, F and Both already
follow. Taking one pass off one face is a real thing to want and it has its own
control: that face's own R or F, in the row under it.

Everything else in the panel still follows the **viewport's pass toggle** — the
`→ −Y` marker, the paint, the "machined across two ways up" banner — and the
panel says which pass outright.

### The order the faces come in

**Faces this reading cuts first, the ones it does not below.** The question the
panel is opened with is almost always about one group or the other — "what is
actually mine", "what is going somewhere else" — and the part's own face order
interleaves them, so both questions were answered by reading every row.

**Fixed when the reading is opened, not live.** A list that re-sorted as faces
were ticked would move the row out from under the pointer at the moment of the
press, and working down a column of faces every tick would reshuffle everything
below it. It is a default order, taken once, settling again next time the panel
opens. Within each group the part's own order stands, and a face added since it
opened goes to the top — it was just handed over, and seeing it land is the
confirmation.

### A reading expands to its faces in the directions list too

Read rather than edited: which faces it covers, what each one is, and which
passes hold it. Editing them is Edit Feature's job, one press away on the same
row — this answers the question that comes first, which is "what is actually in
this thing".

The triangle is the one the row already had. A group of identical holes expands
to its holes and a single reading has nothing else worth expanding to, so one
control means two things depending on what the row stands for, rather than two
triangles competing for the same three pixels.

### Where each pass of a face is cut

A face missing from a reading is not missing from the part: something else took
it, from some other way up, and this feature is therefore machined across two
setups.

The row used to say this once, as `→ −Z`, which meant asking `cutBy` about a
single pass — so **whichever pass was not asked about was reported as silence**.
That hid the arrangement most worth checking: one feature roughs a face and
another finishes it from a different way up.

It is now said per pass, as two chips, and only where the passes disagree:

| Chip     | Means                                                               |
| -------- | ------------------------------------------------------------------- |
| `R here` | Roughed by this reading                                             |
| `F −Z`   | Finished as something else, from −Z — the full name is in the title |
| `R —`    | Nothing in the plan roughs it                                       |

Both passes here is the ordinary case and draws nothing. Neither pass cut
anywhere still reads `not cut`, which is a different answer from "cut, but
somewhere else".

### Getting around the part

**Zoom to cursor or to centre**, a toggle in the viewport toolbar, remembered
across parts like the paint mode and the scene aids. Cursor by default — it is
what Fusion does and what most people reach for — and a preference rather than
a right answer, because on a trackpad it can walk the model off screen.

Worth recording: this was expected to be a port from the product viewer and was
not. `camera-controls` has had `dollyToCursor` all along and neither app had
switched it on; the two `controls.ts` files are byte-identical.

**Double click re-frames the part**, keeping the current view direction — a
double click means "show me all of this", not "start again". Bound to the
canvas rather than to the mesh, so it works on empty space, which is where
somebody reaches for it after losing the part off the edge.

The two belong together: re-framing is the way back from having zoomed into a
corner, which is exactly what zooming to the cursor makes easy to do.

### The part while a feature is open

**Nothing is done to it.** The editor forces Plain on the way in and gives the
wash back on the way out, so the part is already quiet — the feature's own four
colours are the only thing on it, and that is enough.

Recorded because a long attempt to do more failed, and failed the same way
every time. The rest of the part was mixed toward the page, made translucent
behind a depth prepass, hatched out in screen space, and multiplied darker; the
feature was lit from within and ringed in black. Each read as _the part
changing_ rather than as one thing being pointed at, and stacked together they
read as noise.

The finding underneath: **a part that is light on a dark ground fades by
getting darker**, and darker reads as the render going wrong. There is no
amount of opacity that says "further away" on a dark page.

**Except under a wash.** Somebody turning Directions or Difficulty back on
while an editor is open gets a part painted twenty ways at once, with the
feature one more colour among them. There, every face outside the feature is
**struck through** with screen-space diagonals.

A hatch rather than a fade, and that is the one thing worth keeping from the
attempts above: a stripe is a different _kind_ of mark from a wash, so it says
"not this" rather than "this, but dimmer" — which is the only thing that stays
legible over a part already carrying twenty colours.

### The part is the control

Everything face-level happens on the model rather than in the list, because the
faces are _on the part_ and a column of twelve indices is a poor way to point at
one. While the editor is open, a click on a face:

- **makes it exactly what the R / F / Both switch names** — the switch says what
  the face is _for_, not which pass to toggle
- **takes it off**, and only where the face is already exactly that

Remove, add, and split the passes: the whole of face editing.

**The switch names the destination, not the toggle.** A face cut in both passes,
clicked with Finish selected, used to _lose_ finishing and turn orange — a click
labelled finish taking finishing away from a face that had it. It now becomes
finished only, which is what somebody who pressed Finish and then a face was
asking for.

The only click that takes a face off is the one that would otherwise change
nothing: Finish on a face already finished and nothing else, Both on a face
already cut in both. That is what keeps a second click an undo of the first —
the property the whole mode rests on, since it has no arming and no
confirmation. The alternative, _add_ the selected pass and leave the rest, makes
that same click do nothing at all, and a dead control in a mode worked entirely
by clicking is worse than a surprising one.

The list rows are unchanged: their **R** and **F** pips are explicit per-pass
toggles, which is a different gesture asking a different question.

**This reverses an earlier rule**, that a click here should only _find_ the face
in the list, on the grounds that toggling it was "one gesture with no
confirmation and no undo, aimed at whatever the pointer happened to be over".
What changed is that face editing is entered and left deliberately, so a click
inside it is not ambiguous. The row still opens on the face clicked, so the
gesture shows its result, and clicking again undoes it.

### Save, and the way back out

Every click writes straight to the plan. That is what makes editing on the
model worth doing — the colours change as you work, and a draft the part did
not paint would be a list of intentions rather than a plan.

What was missing was not a draft but **a way back**. The only undo was clicking
each face again and remembering what it had been. So the plan is snapshotted
when the editor opens, and leaving is a choice:

- **Save** keeps the work.
- **Cancel** puts the plan back exactly as it was when this opened — the whole
  snapshot, not an unpicking of each press, because an editing session is a set
  of changes somebody made together.

Neither is `Close`, which said nothing about which of the two it did.

**Save is the only thing that keeps the changes.** Escape, a click on empty
space, anything else — all of them put the plan back.

This kept the work at first, on the reasoning that those gestures mean "that's
enough" rather than "undo the last ten minutes", and that losing a session
should take saying so. Paul's call, and the better one: a way out that sometimes
commits and sometimes does not is one somebody has to remember the rule for, and
the whole point of a Save button is not having to.

Escape reaches it through a new rung, innermost of the ladder in §4 — the only
one that _undoes_ something rather than putting it down.

A session spans however many readings are opened without leaving — go straight
from one reading's editor into another's and Cancel puts both back. The same
idiom the paint-mode restore uses, for the same reason.

**Nothing needs arming.** `Add a face` existed because a click here could mean
"add this" or "I am done, show me that instead". It cannot any more, so there is
no second meaning to disambiguate and no mode to enter inside a mode.

**It opens on Both, every time.** The switch is session state and nothing put
it back, so an editor opened after a session of splitting passes came up armed
to cut _finishing only_ — and the next click on the part quietly did that
instead of what it looks like it does. A mode that persists across the thing it
belongs to is a mode nobody remembers setting. Both is also what a tick here has
always meant: somebody saying "cut this face here" is describing the work, not
one half of it.

**The colours are named where the click is armed.** The group headings each
carry the swatch the part is painted in, which makes the list its own key — and
that works for the colours a reading already wears and fails for the rest. A
heading only exists once a face is in that state, so the meaning of the colour
somebody is about to paint arrived _after_ they had painted it. All four are now
named beside the Cut switch, always. The headings stay: they say what this
reading **has**, and only one of the two is a claim about the reading.

The switch is the editor's own, **not the viewport's pass toggle**: that one
says which pass the part is _coloured_ by, and this one says what a press
_does_. Letting a single control mean both is what F63 and F64 were, twice.

**All unmapped** puts in every face the reading covers that **nothing is
cutting**, in the passes the switch names — the gap `Select all` left.

Taking every face a reading covers is right when the reading is the answer for
all of them and wrong the rest of the time: on a face already finished from
another way up, `Select all` overrides a decision somebody made, silently, as
part of a press about twenty other faces. `All unmapped` fills the gaps in a
plan without arguing with any of it, which is the usual thing wanted after a
generator has run. It carries the count, so the press says how much it will do
before it does it.

Free is asked **per pass and of the whole part**: a face this reading already
holds is not free, and neither is one another reading holds.

**Each face carries its own passes.** With Both selected, a face finished from
another way up and roughed by nobody is free _in roughing only_ — so it is
roughed here and its finishing is left where it is. Giving every face the
switch's passes would pull that finishing off the reading that has it, which is
the one thing this press exists not to do.

The write is **additive** rather than a claim, for the same reason: a face free
in finishing and already roughed here keeps its roughing, where setting it to
exactly _finish_ would take work away in a press that exists to add some.

**Select all** puts every face the reading covers in, in the passes the switch
names, as one update rather than one per face. It reads `Clear all` once
everything is held — pressing what a thing already holds is how somebody unsays
it, the rule every other control here follows. A reading of twenty faces is
twenty clicks otherwise, and the usual case for opening this panel is "all of
it, then take two back".

### The list is grouped by what the plan does with each face

**Roughed and finished · Roughed only · Finished only · Not cut here**, in that
order, each with a count and the swatch the part is painted in. Within a group,
the part's own face order.

It is the question the panel is opened with: a face roughed here and finished
from the other side costs a second setup, and that fact used to be spread
through a column of twenty rows for the eye to gather.

**The headings are the legend.** They carry the same colours the model wears, so
the list is the key to the part rather than something a separate legend has to
be kept in step with. A group with no faces is not drawn — an empty heading is a
claim about the reading that is not true of it.

**Live, unlike the order it replaced.** That one was fixed when the panel opened,
because a list re-sorting under a press moves the row out from under the pointer
at the worst moment. The press moved to the part, so a row changing group is now
the confirmation rather than a hazard. It is still a hazard for the **tick**,
which is in the row: unticking moves that row to another group, so a second
click lands on whatever took its place. Visible and undoable, and the reason the
end-to-end tests address a face by name rather than by position.

### Four states on the part, and on every row

Two colours was the whole answer while a face was claimed all at once. Once
roughing and finishing are separate claims, **which** of them is held is the
thing somebody is reading the part for — a face roughed here and finished from
the other side costs a second setup, and painting it the same green as a face
done in one is the app hiding the cost.

| On the part | Means                                     |
| ----------- | ----------------------------------------- |
| Green       | Roughed **and** finished here             |
| Amber       | Roughed here only — finished elsewhere    |
| Violet      | Finished here only — roughed elsewhere    |
| Red         | Covered by this reading, and not cut here |

The panel carries the legend, because four colours is more than anybody should
have to remember and the part cannot label itself.

**Only the face under the pointer wears the picked colour.** The face being
_worked on_ used to as well, and the picked layer paints above the state
colours — so clicking a face left it blue and hid the very thing the click had
just changed. One channel per question (F62): the part says what each face is,
the filled row says which one is current, and hover is transient enough to
borrow the part for a moment.

Every face row carries **R** and **F** pips saying the same thing one face at a
time.

**Focus lights the face, exactly as hover does.** Arrowing down this list is the
same question as running the pointer down it — which face is this row — and the
answer is on the part. Without it, the one way of reading the list that never
leaves the keyboard was the one that could not see what it was reading. The tick says _whether_ a face is in the reading and reads `mixed` for a
split claim, which is honest and does not say which — and which is the question.

### Adding a face the reading does not cover

A reading could only ever **lose** faces here. Everything the list showed came
from the Engine, so a profile that stops one wall short of the pocket left
nothing to press — the fix was to draw a whole second reading over the top of
it, which is a worse document than the one being fixed.

A click on the part is how it is done — see above. The face joins the reading,
taken off whatever held it like any other claim.

An added face is **marked `added`** in the list. An unmarked row would read as
the Engine's own answer, which is the one thing it is not. Unticking hands it
back, and the reading is its own again.

**A handed face is painted like any other face it cuts.** The viewer colours a
feature by expanding its tag to the faces the Engine reported — one too many for
a reading that gave one up, one too few for a reading that was handed one — so
only a reading cutting _exactly_ its own can be named by tag. Both halves matter
and only the first was ever checked: a wall handed two faces still cut all three
of its own, passed the "gave nothing up" test, was painted by tag, and left its
two added faces grey on a part that listed them as mapped.

**A given face lists the reading it was given to, everywhere** — not only inside
the editor. The viewer answers "what owns this face" from the Engine's
`regionIdxs`, so a face moved into a wall vanished from that wall's point of
view the moment the editor closed: clicking it again listed every reading the
Engine reported and not the one actually **cutting** it. The row carries the
same `added` mark, because an unmarked row would claim the Engine put it there.

That is the same mistake in two places, and both come from asking `regionIdxs` a
question the plan is now the answer to — the third and fourth time that shape
has appeared (F51, F58, F62, the direction wash).

**The reading being edited is one of that face's readings**, and its row says
`this one`. This is not decoration: the Engine's own list of a face's readings is
`regionIdxs`, and an added face is by definition not in it — so opening an added
face showed a list that did not contain the reading the face had just been added
to. A wall the Engine sees only from −Y, handed to the +Y group, showed a single
row saying −Y with its passes off, and pressing anything there enabled the face
in the Engine's direction. Which is the opposite of what adding it meant.

It is held on the **assignment**, not by rewriting `regionIdxs` —
`Assignment.also`, per pass, the exact mirror of `without` (§10). The reading
stays the Engine's and the plan stays ours, so a re-run reporting something
different is a change in one place rather than a merge.

### One highlighted row

Cut rows once carried a fill of their own, and on a reading whose faces are all
cut — which is most of them — that is **every line in the list lit the moment it
opens**. A highlight on everything points at nothing, and it left the current row
competing with eleven others for the same signal.

The **tick** already says whether the reading cuts the face, in the row,
unambiguously, and the **part** says which faces those are in green and red. So
the fill is free to mean the third thing, the one neither can show: **which face
is being worked on**. One row, filled, with a rail on the left.

Three channels, one question each — the tick is _whether_, the part is _which
faces_, the fill is _which row_. See F62.

### What R, F and Both say once a claim can be part-cut

Dashed means **held here, but not on all of this reading** — and it is a thing
to say about a pass, not about the pair:

| Button   | Lit                   | Dashed                                      | Off                            |
| -------- | --------------------- | ------------------------------------------- | ------------------------------ |
| R, F     | Held, on every face   | Held, on some of its faces                  | Not held in this pass          |
| **Both** | Both held, both whole | Both held, one of them on some of its faces | Anything less — one pass alone |

Pressing a dashed button **takes the rest back**; pressing a lit one lets go.
**Both, pressed on a face already cut in both passes, lets go of both** — the
same rule a whole reading follows. It did nothing at all: the press hands down
an empty pass list, the fold over it returned the plan untouched, and the button
went on reporting the state correctly while having no effect.
Two presses, each with a visible result, where before the only gesture that
could repair a split claim was the one that destroyed it.

### The editor behaves like a standing offer

Once it is open it owns the part and its own rows, the same way an offer does —
a panel that owns the part has to own clicks on it, or the two disagree about
what a click meant.

| Gesture                             | What it does                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| A **row** under a face              | Reads it, and nothing else. The face stays lit; the part draws that reading's way up       |
| **Left click** on one of its faces  | Finds it in the list: opens its row, scrolls to it, and shows what else could cut it       |
| **Left click** anywhere else        | An ordinary pick — the editor is about one reading, and clicking off it asks about another |
| **Right click** on one of its faces | The same — right is the safe button everywhere, and here left changes nothing either       |

**R, F and Both under a face move that face, and only that face.** These rows
are the readings of one face, so a press here says "cut this face from there" —
whatever else that reading already cuts, and whatever every other reading cuts,
is left exactly as it was. Cut once still holds for the face itself: it comes
off whoever had it.

That makes them a yes or a no, not the three states a row carries: the dash
means "held, but not on all of this reading", and a face is not a reading. The
buttons ask **does this reading cut _this face_**.

The distinction is worth stating because it was wrong first. A face-level claim
went through the same path a row does, which claims every face the reading
covers — so moving one face of a profile unassigned a wall holding a _different_
face of it, a face the press had nothing to do with. `cutOnce` takes the faces
it is given now, and a face-level press gives it one.

The rows carry no doorway of their own: you are already inside a feature's
editor, and they are alternatives for one of its faces rather than places to go.

**One face is open at a time** — the last opened, or the one named from the
part. Several could once show their readings at once, with a separate piece of
state remembering which was current, and it made a list of twelve faces into a
wall of readings with nothing to say which mattered. Opening a face is saying
"this one", and saying it twice about two faces is not a thing anybody means, so
one value does both jobs and they cannot disagree.

Two things to say about a face, and two ways to say them: the **fill** is
whether this reading cuts it, the **rail on the left** is whether it is the
current one. A second fill would have to compete with the first, and "cut" and
"current" are not the same question. It stays lit on the part after the pointer
moves away, because somebody has to be able to reach for a button without the
thing they are deciding about going dark.

Right is still the safe button — it changes nothing. What differs is what it
**names**: everywhere else it names a _reading_, and here the list is about
faces, so a face is what it names.

**The reading being read owns the arrow, while the editor is open.** Everywhere
else a held way up wins — it is a filter somebody set, and it survives looking
at readings within it. But every row here is a different way up, so the arrow is
the answer to the question the list is asking, and an older filter sitting on top
of it makes walking the rows change nothing anybody can see.

**The lit face follows the row under the pointer**, cleared when it leaves that
row rather than when it leaves the panel — otherwise the last row touched stays
lit while the pointer works out on the part, which reads as a face that has
selected itself. A click on the part clears it outright: nothing in the list is
being pointed at, so nothing there should look like it is.

### What the part shows

**It opens on Plain.** The editor paints its own faces, and a direction or
difficulty wash underneath is a second opinion about the same surfaces. The mode
is borrowed, not taken — closing the editor gives back whatever was set.

**The face being worked on, and little else.** This once painted every face the
reading covered — green for cut, red for not — and on a twelve-face profile that
is the whole part lit at once, which points at nothing. The list already answers
"is this one in", in the only place the question is asked and with a tick that
cannot be misread as a colour. So the part answers the other question: **which
face is this row**.

Faces the reading covers but is **not** cutting still show, faintly, in red:
"covered but not cut" is the state somebody opens the panel to find, and a face
left entirely unpainted says nothing about whether it was ever a candidate. Red
is free — the viewer's palette reserves it for sharp corners, a layer
deliberately never built — so nothing else on the part can be mistaken for it.

**Faces, never features, while the editor is open.** Every feature-level layer
is off. The selection layer had to go because painting the feature lights the
faces it has _given up_, which is the one distinction the editor exists to draw;
the **hover** layer had to go for a blunter reason — it paints over everything,
faces included, so an open feature type in the summary covered the whole list.

**The picked layer holds the face being worked on and the row under the
pointer**, and nothing else. It paints above the face layer, so faces picked
earlier by clicking the part sat on top of the editor wearing the wrong colour,
which reads as those faces not being in it at all.

### A part-cut reading is painted by face, everywhere

The viewer paints a feature by expanding its tag to **every region it covers**,
which was the whole truth until a claim could take one face and leave the rest.
So a reading that has given faces up is painted region by region instead, in the
colour its tag would have worn — selection, hover and the direction wash alike
(`paintByCut`, `cutRegionsByDirection`). Whole readings keep their tag, which is
cheaper and is still what almost every reading is.

Without it, selecting a reading that gave three faces away lights all twelve,
and the three it no longer cuts say the plan still holds them.

---

## 12. Making a reading the Engine did not report

**Experimental — `paul/partial-readings`.** A fourth thing the Map features
panel can be doing, beside By face, By direction and Unmapped — and the only one
that **adds** to the part rather than reading it. Drawing replaces the lists
rather than sitting beside them: both at once would be two questions in one
panel.

The Engine recognises features per direction, and on most parts that is
everything a plan needs. Where it is not — four faces a shop intends to run as
one operation, which no reported feature covers exactly — this is how they say
so.

Three questions, in the order they can actually be answered — the type is
**last**, because it is the one the app can guess and it cannot guess before
there are faces to look at:

|     |                         | Why it is here                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Which way up**        | Press its arrow on the part, or pick it in the panel. **The faces stay** when it changes — what a set _reads as_ depends on the way up, which is why the guess re-runs, and the faces themselves do not. Once one is chosen **only that arrow is drawn**: the others are alternatives to a decision already made, and they are clickable |
| 2   | **Which faces**         | Clicked on the part, and clicked again to take one off, with a **running list** of what is chosen. Four faces chosen is not something anybody can check against the part — the far side is not on screen, and a face behind another cannot be counted at all                                                                             |
| 3   | **What it is**          | Guessed from the faces, and it keeps guessing as they change: a type filled in from three faces should not stick once there are five. Naming one stops it, which is the reason the field is editable                                                                                                                                     |
|     | **Already on the part** | Every reading that covers **all** the chosen faces                                                                                                                                                                                                                                                                                       |

While drawing, **every click on the part is one of its faces**, and the panel
that owns the part owns clicks on it — the same precedence a standing offer has.
Nothing is being read, so the datasheet stands down: it describes one of the
Engine's readings, and this mode is about faces that do not belong to one yet.

**The four modes are one exclusive choice.** Naming any of them leaves the one
you are in; a mode you can only leave by pressing the button you entered it with
is a mode people get stuck in.

The last step is the useful half. Most of the time the Engine has already reported what
somebody is about to draw, and mapping the reported one is better than making a
second reading of the same geometry — so those are offered first, and **the list
going empty is the signal that this really is new**.

Supersets count, not just exact matches: a reading covering these four faces and
two more may still be the operation somebody means.

### What the faces read as

Once nothing covers all of them, the question becomes "what am I drawing" — and
the Engine has already answered it for the pieces. Every reading **from the
chosen direction** that touches a chosen face votes for its own type, weighted
by how many of those faces it covers, and the panel offers the winners.

Deliberately not geometry. The app has no face normals — a region carries a
shape kind and an area and nothing else — so a classifier here would be guessing
where the Engine has already looked. Reading its answer also means a made
feature is described in the same vocabulary as every reported one.

Offered, never applied: the whole reason to draw one is that the Engine's answer
was not the one somebody wanted.

### It is marked, everywhere

`isMade`, off a flag in the datasheet, and the tag is prefixed `made-` so it is
recognisable in a log or a bug report with no plan to hand. Every list that
draws a reading draws the mark.

**A plan is a document a shop is asked to trust, and "the Engine found this" and
"somebody drew this" are not the same claim.**

Otherwise it is an ordinary reading: it merges into the part, so every list, the
plan, coverage and the paint take it without knowing. Merged rather than carried
beside — the one place that forgot would quietly leave a made reading out of the
plan it is part of.

### Clicking one opens its datasheet

It used to jump straight to its faces, on the grounds that there was nothing in
a datasheet for one — no measurements, no verdict, nothing the Engine measured.
That stopped being true when readings could be merged (§13): a merged one
carries the worst of its sources' numbers and the names of the sources, which is
exactly what a datasheet is for.

The datasheet already carries the three controls a made reading needs — Delete,
which only a made reading gets, **Edit Feature**, which is the way to its faces,
and Close.

The reason it went elsewhere in the first place was not really a design
decision: the panel looked its reading up in the **report**, and a made reading
is not in the report — that is what makes it made. It found nothing and showed
its empty state. It looks in the part now.

### And then it is mapped

A reading is only half of a decision — the other half is which way up cuts it,
and somebody who has just drawn one is about to say so. So the panel holds on to
it and offers the same three presses every other reading has, rather than
sending them off to find it in another list to press the same buttons. **Draw
another** starts a fresh one; **Done** leaves.

### Cut from somewhere else

Drawing one is **two** decisions — which faces, and from where — and the second
is the one somebody changes their mind about: the faces are a fact about the
part, the way up is a choice about the setup. Redrawing the faces to change it
is asking for the half that was right to be done again.

So a made reading carries a **Cut from** row, both on the screen it is made on
and in its face editor, listing every candidate direction with the one it holds
pressed. Pressing another moves it:

- **The type is re-derived**, because it was never a property of the faces. A
  set that reads as a pocket from above reads as a wall from the side, and
  carrying the old word over would leave the reading describing itself the way
  it _was_ cut. Where the new way up has nothing to say, the old type stands —
  a name somebody chose beats no name.
- **The passes go with it.** The assignment named a setup for the way up it was
  cut from, and leaving it behind would have the plan claim a direction cuts
  work that is no longer there. Changing where a thing is cut is not a decision
  to stop cutting it.

**Only a made reading.** A reported one is the Engine's answer to "what is
cuttable from here", and pointing it elsewhere would be inventing an answer it
never gave.

### Drawing over work already mapped

"Nothing covers all of these — this is new" answers a question about the
**shape**: whether the Engine already describes what is being drawn. It says
nothing about the **plan**, and those are different questions. A face already
being cut from somewhere is one this reading is about to take, because cut once
means the press that maps it takes it off whatever holds it now.

So the panel counts them and names the ways up they are cut from, before the
reading is drawn rather than after — finding out from a coverage figure that
dropped is finding out too late.

**Not built:** persistence (it lives as long as the page), and the rules do not
judge one — a made reading has no measurements for them to read, so it scores
nothing and shows no band.

---

## 13. Where the merge went

**Removed.** Machining several readings as one was built, used, and turned out
to be redundant: mapping them to the same way up already says they are cut
together, and the merged reading's own numbers were arithmetic standing in for
an Engine answer nobody had asked for yet.

What it left behind is worth keeping and is still here: `worst-case.ts` does the
same arithmetic for a reading **handed a face** (§11), and `withEngineDatasheet`
is still where a real analysis would land.

Recover it with `git show` — the model is `merge.ts` and the panel is
`merge-features.tsx`, both of them small and both fully tested at the time.

---

---

## 14. From the rules asks which ways up you will hold

**It used to guess.** `byBestReading` buys a direction at a time on an estimate
of what each one unlocks, and `generate.ts` has recorded what that costs since
it was written: on a part that forces three ways up and is fully cut by them, it
reaches **95% across five** — while pressing _Required only_ then _Fill from
current_ reaches **100% in three**.

The buying loop was the part that was wrong. The allocator was not. So the
question is asked instead:

| Column       | Says                                                   |
| ------------ | ------------------------------------------------------ |
| **required** | Something is reachable from here and nowhere else      |
| _n_ readings | What the Engine reported from this way up              |
| _n_% of part | The area those readings cover, as a share of the whole |

Forced ones first, then by reach. **Required ones start ticked** — the geometry
forces them, so starting them off makes the common case a chore — and they can
still be turned off, because a shop that would rather leave an undercut to a
second operation may say so.

**What the choice costs is shown while it is still a choice:** "12% of what
could be reached is not reachable from these". Finding that out from a coverage
bar afterwards means undoing the decision to change it. Ground no direction
reports a reading for is not counted against the choice — nothing can reach it,
so no choice here is responsible for it.

### Roughing and finishing may use different ways up

Every assignment the generator has ever written named **one setup for both
passes**, so a plan where a face is roughed one way up and finished another —
which the plan has modelled from the start — was not something it could say.

Off (the default) they are decided together, as before. On, each pass is decided
**on its own** — and both on the **best reading**, because the best reading of a
face is the best reading of it whichever pass is cutting.

**Not chained.** Handing the roughing plan to the finishing run marks every face
it claimed as somebody else's decision, untouchable — so the finishing run had
nothing left to decide and wrote nothing at all, which is exactly what "it is
just not mapping finishing" looked like.

**So today the two runs agree**, and the option changes the _shape_ of the plan
rather than its content: the passes are decided separately, so they can be
edited and re-run separately, and they diverge the moment anything
distinguishes them — a per-pass rule, or a band floor that only finishing has to
clear. Roughing was briefly given a raised operation cost so it would
consolidate while finishing chased quality, and that is a real distinction, but
it is not one the rules make: inventing it here would be the app holding an
opinion the shop never expressed.

### Splitting a feature between ways up

**On by default**, and the answer to the complaint §15 measures.

A face belongs to five to eight readings and only one of them can cut it — but
the rest are still the right answer for their _other_ faces. Without this, a
reading is taken whole or not at all: one contested face costs it every face it
covers, and they go to whatever smaller readings come after it. That is how a
wall scoring 5 ends up holding a face a filleted pocket scores 77 on, from a way
up the plan already holds.

On, each face goes to the best-scoring reading of it among the ways up held, and
every reading keeps whatever it won — written as `Assignment.without`, the note
the plan has carried since the face editor and the allocator had never written.

**The trade is fragmentation.** Per-face allocation can hand one face to a
one-face reading and leave an operation running for it, which is exactly what
`operationCost` exists to argue against. The swap pass still does that arguing;
this only changes what may be picked up in the first place. §15 is how to tell
whether the trade came out right.

**The part draws the choice.** The arrows show exactly the ways up ticked, and
follow every tick — a column of checkboxes against an unchanged part is a
decision made blind, and the question being asked is precisely _which of these
do I want_, which is a question about geometry. They are borrowed, so leaving
the chooser gives back whatever was set.

### Or let the rules choose

The old behaviour is one press away, and says what it costs. On a part nobody
knows yet, _show me what you would do_ is the first question, and being made to
answer a harder one before seeing anything is worse than a plan that spends a
setup too many.

### `fill from current` may improve a plan a generator made

It treats an existing plan as somebody's **decision** — every claimed face is
"not ours to improve on" — which is right for a plan built by hand and wrong for
one the same file wrote a moment ago. Unseeded, it had nothing it was allowed to
touch after `from the rules` had filled the part, and appeared to do nothing at
all.

**Any hand edit hands the plan back.** Once somebody has pressed a pass or moved
a face, the whole of it is theirs: telling their choices apart from the
generator's would need provenance on every assignment, and guessing wrong
overwrites a decision.

**Still not exposed, and next:** a band floor (never cut something the rules
refuse), and a reason carried on each assignment saying why that reading was
chosen.

---

## 15. Where the plan disagrees with the rules

**Coverage says how much of the part is cut and nothing about how well.** A plan
can reach 100% across exactly the right ways up and still cut half of it the way
the rules like least — and until this existed no number said so. The complaint
arrived as screenshots of one face at a time.

Every row is a face cut by a worse reading than one available **from a way up
the plan already holds**:

```
Face 41   Wall +Y  5   →   Filleted open pocket +X  77    0.325 in²
          blocked by face 12 (Boss +X), face 19 (Face +X)
```

That qualification is the whole point. A better reading from a direction nobody
holds is an argument for another **setup**, which is a different question and
the one the chooser asks. This one is about the allocator.

Ranked by the score gap **weighted by area**, for the reason the allocator
weights by area: a 70-point gap on a 2 mm² fillet and a 5-point gap on a
3,000 mm² floor are not in the same conversation.

### `blocked by` is the evidence

The allocator may only take a reading **whole** — `wouldTake` returns nothing if
any one of its faces is held — so a twelve-face reading loses all twelve to a
contested thirteenth, and those faces go to whatever smaller readings come after
it. That is the mechanism behind a wall scoring 5 holding a face a pocket scores
77 on, from a way up already held.

`blocked by` names the ground the better reading would also have had to win. It
excludes the face being reported and its current holder: "the pocket could not
take face 0 because the wall has face 0" is the finding restated, not a cause.

**An empty list means nothing was in its way** — which points at the second
mechanism instead: a swap priced over whole readings, where taking two faces off
a twelve-face reading is charged for all twelve.

### Measured from outside

Computed from the finished plan rather than inside the allocator. It is
arithmetic over what is on screen, so it carries no risk to the thing being
measured and works on a plan built by hand exactly as well as on a generated
one.

**Both mechanisms were correct** when a reading was genuinely all-or-nothing —
one reading, one operation, cut whole or not at all. They stopped being correct
when the face editor gave the plan `Assignment.without`: a reading can cut nine
of its ten faces and say so, and the allocator has never learned it. Every
assignment it writes is whole-reading, and a filter near the end drops any
reading not holding all of its faces.

So the generator is solving an exact cover the plan no longer requires. **This
panel is the measurement that will say whether teaching it partial claims is the
whole fix or most of it.**

---

## 15b. Two questions, not six buttons

The generators were a row of six that answered **two different questions**, and
reading them as one list is why the sequence that actually works — `Required
only`, then `Fill from current` — was folklore rather than the obvious path.

| Question                                   | Offers                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Which ways up do I hold?                   | From the rules · Required, filled · Required only · From Toolpath |
| Given those, what is the best arrangement? | Fill from current                                                 |

**`By hand` is gone.** It returned an empty plan: a _mode_ sitting in a row of
offers, and a button whose whole behaviour is "do nothing so you can do it
yourself" is a button explaining the app rather than doing something. Working by
hand is pressing R, F or Both on a reading, which is what somebody would do
anyway.

**Only the first half folds.** Once a way up is held — by an offer or by hand —
_which ways up_ has been answered, and four offers that would each replace that
answer are no longer the question in front of anybody. The summary says how many
are held and reopens them, because starting over is a thing people do.

Folding both halves was tried first and was plainly wrong: `Fill from current`
is the one offer that **only** means something once ways up are held, so hiding
it at the moment it becomes useful is exactly backwards. The end-to-end tests
caught it, which is the one case where they caught a design mistake rather than
a code one.

## 16. The plan is judged by rules, like everything else

**Nine knobs, three questions.** The knobs were the implementation; the
questions were invisible. Several of them priced the _same_ trade at different
scales in three different currencies — points, average-faces-by-area, and
average-faces-by-area-times-score — which is why moving any one seemed to do
nothing. You were moving one leg of a tripod.

There is no plan panel any more. Everything is in the rules list, under **The
plan itself**, above **Every feature**:

| What                                             | Kind      | Reads                       |
| ------------------------------------------------ | --------- | --------------------------- |
| **Setups the plan runs**                         | threshold | a count — 2 easy, 5 rats    |
| **May the plan split a feature?**                | a choice  | yes by default              |
| **What is a no-go feature for op-planning?**     | a refusal | a band — `no go` by default |
| **Rank a reading by its band, or by its score?** | a choice  | —                           |

All four wear the same row: a chevron, a name, and what it is set to on the
right. The threshold is a rule in every sense the rest are — four limits and an
optional refusal, a weight, a note, on and off, in the same editor. A part rule
names its metric instead of choosing from a list of hole diameters, and its
audience selector is replaced by _"judged once, over the whole plan"_; a control
that changes nothing reads as a broken app.

The other three are not scales, so they are not thresholds. Four thresholds
would be four ways to write down a yes or no.

### How a small split might say it is small

**Not shipped, and the third attempt at this question.** The first two priced it
inside the allocator — in score points, then in per cent of the part — where
nothing else in the app could see the answer or argue with it.

Paul's third framing is better than either: an ordinary feature rule over an
ordinary measurement, **faces in the feature**, `lower is harder`. A one-face
reading is a whole operation for one face — a tool change, a lead in and a lead
out, for almost nothing. It needs no plan machinery: the measurement lands in
the feature's score, which is what the allocator already ranks by, so a one-face
outer fillet scores below a profile covering forty and the profile wins the
shared face without anything having to know why.

**The metric ships; the rule does not.** `faceCount` is in the Reads dropdown
and decides nothing — a metric is inert until a rule asks it — so the rule can
be written again without touching the code. It was pulled to keep the effect of
the other changes legible, which is the whole reason the plan rules were cut
back to four.

The count is carried on `MetricContext` rather than read off the datasheet: the
Engine describes the shape, and how many regions it was cut into is the report's
own answer on `PartFeature.regionIdxs`. Same reason `partTopZ` lives there.

### May the plan split a feature?

A face belongs to several readings and only one may cut it — but the rest of
those readings are still the right answer for their _other_ faces. Splitting
sends each face to whatever cuts it best, with the reading it came from still
cutting the rest. Off, a reading is taken whole or not at all, so one contested
face costs it every face it covers.

**This replaced a scale** over how much work an operation should do, which had
already replaced three prices. Each of them was asking a version of _is this
operation worth starting_ — in points, then in average faces, then in per cent
of the part — and none of them was a thing a shop could picture. The question
underneath was always a yes or no.

Deleting it took the points threshold on taking a face, the sliver sweep that
unmade small operations, and the operation term inside a swap's arithmetic.

**The rule reaches every generator.** `partial` undefined now means "whatever
the rules say", so _Required, filled_ and _Fill from current_ honour it too —
they were effectively hard-coded to whole-or-nothing before. The chooser's tick
seeds from the rule and still overrides for one run: a generator press is a
question about _this_ plan, and the rule is the shop's usual answer.

### Setups the plan runs

`BAND_PRICE` turns a band into a multiplier: `easy` ×1 through `rats` ×8, `no
go` refused outright, over one fixed base — 2% of the part. A shop tunes **where
the bands fall**, and the ladder turns that into an argument the arrangement can
have with itself. Buying the third setup on a scale that calls three `alright`
costs twice what the second did.

The base was not invented: 2% is what `newDirectionGain` was set to.

### Units, which were wrong

A plan rule needs its own metric entry or the editor formats its thresholds with
the shipped default — and **wrote `mm²` beside a number of setups**. `setups` is
a `count`; it reads nothing off a datasheet and says so.

### Off is off

A rule switched off charges **nothing** — not "easy at any count", which would
still charge the base. Switching it off is a shop saying it does not care, and
charging anyway is the app disagreeing quietly.

A set saved before part rules existed carries `maxDirections`, which meant "and
not one more". It becomes a wall with nothing charged below it, so an old set
keeps its ceiling and gains no prices it never asked for.

### What a shop has already said it will not cut

The band floor defaults to **`no go`**. It was off, on the reasoning that a
refusal applied unasked would quietly leave ground uncut — and the second half
of that is wrong, which is what made the first half look prudent. **A refused
reading may still cut a face nothing else reaches**, because leaving it uncut is
not an improvement. It only loses the right to take a face off a reading above
the floor, and it is offered last.

So the honest default is the thing the shop already said. `no go` is not a band
the arrangement inferred — it is the shop's own rules saying they do not want
this cut, and letting it win a face anyway by averaging well across everything
else is the app quietly overruling them.

### And it says whether it did anything

The allocator keeps a ledger (`whatBit`) of decisions that went **differently
because of a limit** — a way up it refused, a face it kept from a refused
reading. Never times it was consulted: a price checked four hundred times that
blocked nothing did nothing.

A part rule's card says **"judged over the plan"** rather than "nothing to
measure". The latter is right for a rule aimed at a feature type this part lacks
and exactly wrong here — it reads as a rule that failed to fire, when this one
was never going to be asked about a feature at all.
