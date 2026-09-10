# The feature list

_The spec for how the part page behaves, as of `paul/interactions`, 2026-09-02._

The selection used to be invisible. Clicking a face put its hole group into the
interaction reducer's `kept`, the tool list was quietly judged against
everything in it, and nothing on screen said what "everything" was — so a page
showing one pocket could be answering a question about four holes and a slot.

The feature list is that set made explicit, and it is now the thing that drives
everything else: what the part paints, what the tool table is for, and what
lands on the bill.

> **The list drives everything.** Anything on the setup sheet is there because a
> row put it there, and goes when that row goes. There is no second place to add
> a tool and no second place to take one off.

---

## 1. The model

`app/shared/feature-list.ts` — pure, and tested there.

### Items

A list holds **items**, in the order they were added. New items go on the end;
an edit lands where the row already was, so the list never jumps under a
right-click.

| Kind       | Holds                              | Extra                      |
| ---------- | ---------------------------------- | -------------------------- |
| `feature`  | one decision — usually one feature | —                          |
| `group`    | several, chosen together           | `results: 'all' \| 'each'` |
| `assembly` | **no feature at all**              | —                          |

**A part-level assembly is the third kind** (Paul, 2026-09-08: "the tool
assembly will not be tied to a specific feature or group, it will just exist at
the part level"). A shop buys tools for reasons the part cannot state — a facing
mill for the first op, a spare collet — and every way onto the order list ran
through a feature. It holds no tags, so it is never painted on the part and asks
the tool table nothing; it is built in the same tree, with the same three slots,
the same tables and the same one press onto the bill.

**Its lines are keyed by its own id**, `sheetKeysOf` — the sheet is keyed by
feature tag and it has none, so it stands for itself. `isAssemblyKey` is what
lets the order list say _no feature_ rather than print a row id at somebody
buying tools.

**Either kind can hold more than one tool.** A hole is a spot drill and a drill;
a pocket is a rougher and a finisher. The sheet has always kept a feature's
choices as a list, and the page treated it as one — which made the second tool
for a feature a thing nobody could add.

Both kinds carry **tags**, plural. The difference between them is not how many
tags they hold — it is whether somebody chose them together.

**Identical holes group in a group, and nowhere else** (Paul, 2026-09-09: "the
current hole grouping should only be applied in GROUP. In Add Feature, I should
be able to select a single hole"). A bolt circle of eight was one decision on
every path: `groupOf` in `part-interaction` expanded a hole into its siblings
whatever was being asked, so a click on one of them made a `feature` holding all
eight and a single hole could not be asked about at all. The expansion is now
gated on `Interaction.collecting`, which only a group turns on — so a `feature`
made by clicking a hole holds one tag, and one made from a group holds as many
as were picked.

What replaced the silent grouping is an **offer**: a hole with siblings raises a
notice in the reading panel saying how many others are identical, with _Add all
39 as a group_ and _Just this hole_. `shared/group-offer.ts` is the rule for
when it is made, and it is four sentences:

- never for a hole with nothing like it, and never while a group or a part-level
  assembly is being built;
- never about a group row — a group is what the offer makes;
- **on a feature row as well as on a bare reading**, and there it _changes that
  row into a group_ rather than opening a second one beside it. A group beside
  the feature it came from is two rows for one decision;
- and only while the decision is open: a feature with tools on the order list is
  one somebody is buying against, so the offer stands down — unless that row is
  the one open in the editor, which is exactly the moment for changing one's
  mind (Paul, 2026-09-09: "when I'm editing the feature … always").

**_Just this hole_ lasts as long as that reading is held**, and no longer (Paul,
2026-09-09: "if I choose 'just this hole' but then exit without adding a tool
assembly to the order list, clicking the same hole again does not show the group
again. It should"). It quiets the notice while somebody works on the hole in
front of them; it is not an answer about the part, so putting the hole down and
clicking it again asks afresh.

**A row changed into a group keeps its id and its lines.** The tree is keyed by
row id, so the stack built on the feature comes with it; the sheet is keyed by
feature tag and the row's key is its first tag, so `confirmDraft` writes what
the feature had ordered across the group's tags — where confirming a stack
writes them. Nothing infers a row's kind from its id, and `nextId` reads id
prefixes, so a group that began as `feature-3` keeps that id and nothing else is
ever minted onto it. § 3 has where the offer appears.

### Result options

The whole reason a group is a thing rather than a multiple selection:

- **`all` — one tool for all of them.** Only tools that can cut every feature in
  the group. Six holes of five sizes have one drill between them or they have
  none, and that is the answer worth knowing before a job is quoted.
- **`each` — the best tool for each.** A result per feature, whether or not one
  tool covers them all. **Parked, 2026-09-07** (Paul: take it off groups for the
  time being), and on **2026-09-08** the result options came off the editor
  altogether: with one question left there was nothing to choose between, so the
  box states it in its note instead. Everything behind it stands: `Results`
  still has `each`, a group already saved as one still answers per feature and
  still opens, and `routes/part.tsx` still runs the per-feature recommendations.
  Restoring the option is putting the fieldset and its choices back, with
  `group-editor.test.tsx` and the skipped `a group answers per its result
option` in `tests/on-the-part.spec.ts` as the pair to turn back over.

### Ids and names

- **Ids are arithmetic**, read off the list (`feature-3`, `group-5`). A clock or
  a random suffix makes a component test that renders twice fail differently
  each run.
- **Names are derived**, never typed: `4 × Through Hole`,
  `Pocket + 2 × Through Hole`, `Pocket + Through Hole + 2 more`. A part-level
  assembly is `Tool assembly 2`, off its own id: there is nothing else to name
  it after until it has a tool in it. A name somebody
  has to invent for every group is a name most groups will not get.
- **Except a part-level assembly, which can be given one** (Paul, 2026-09-08:
  "I need to be able to name tool assemblies — when they are created, and
  through the right-click menu in the list"). It is the one row kind that
  answers no feature, so `Tool assembly 2` is a number rather than a name, and
  the stack in it is exactly the thing whose reason nothing else on the page can
  state. `AssemblyItem.name` is optional and stays optional; `labelOf` falls
  back to the number, `defaultLabelOf` is that number on its own — the
  placeholder a name is typed _over_ — and `renameItem` trims what is typed and
  treats an empty name as no name, which is the way back. Only an assembly: a
  feature and a group are named by what they hold.
- **A thread is part of the name** (Paul, 2026-09-08: "once a thread is applied
  to a hole, the feature should be named '<thread spec> <type of hole> Hole'").
  `Blind Hole` becomes `M8×1.25 Blind Hole` the moment a spec is chosen on the
  reading, and `42 × M8×1.25 Blind Hole` for the row that holds forty-two of
  them. The kernel's own word for the hole is kept and the spec goes in front of
  it, so the row still says what kind of hole it is. `threadedName` in
  `app/shared/threads.ts` is the rule; the route's `kindOf` is the kernel's kind
  on its own, which is what the icon is picked by — a thread in front of it is a
  word `BY_KIND` has never heard of.
- **And it is the name everywhere the feature is named** (Paul, 2026-09-08:
  "once a thread is selected, anywhere that feature is used should show the new
  name"). The list named a row through the route's `nameOf` while the panel over
  it named the same hole off `featureRow`, so a row reading `#4-40 UNC Blind
Hole` sat under a heading reading `Blind Hole`. `SelectionPanel` and
  `FeatureDetails` take the name from the route now — the thread is kept there
  and nowhere else, so nothing downstream can work it out — and each falls back
  to the kernel's own kind where a caller has no threads to report. The table's
  heading and the order dialog under it read `Cuts the #4-40 UNC blind hole`
  through `namedInline`, which lowercases the kind and leaves the spec alone:
  `#4-40 unc` is not how a shop writes it.
- **And the thread is what is selected's** (Paul, 2026-09-09: "only what's
  selected — but I should be able to apply threads to the full group in the
  Group dialog if desired"). It was written across `groupOf(focused)` — every
  identical hole on the part — which was the same thing while a hole stood for
  its siblings, and is a thread on thirty-eight holes nobody chose it for now
  that one can be asked about alone. `writeThread` in `routes/part.tsx` is the
  scope: the row or draft being asked about where the hole is part of one, the
  hole alone where it is not, and in both cases only the holes of that bore —
  `holesAt` in `shared/hole-mode.ts`, because a choice written across everything
  selected named a group's pocket `M6×1 Pocket`. `PredrillChoice` writes through
  the same rule, having written to the focused hole alone until then.
- **A group is threaded in the group editor.** The editor stands where the
  reading panel would be, so a bolt circle picked out there had to be taken
  apart again to say it was tapped. It carries a `ThreadPicker` of its own where
  every feature in the group is a hole of one bore — `sharedHoleDiameter` in
  `shared/group-geometry.ts` — and where they are holes that disagree it says
  so, because a tap has one nominal size and a control that quietly vanished
  when a second diameter joined would read as a bug.

### Persistence

Kept per part in `localStorage` under `tool-catalog.features.<partId>`, the twin
of the setup sheet's `tool-catalog.setup.<partId>`. The sheet had been kept per
part since 2026-08-10 and the list was not, so a refresh — and, on a dev server,
every hot update — threw away everything somebody had picked out while the tools
they had chosen for it stayed on the bill and grey on the part.

Unreadable, half-written, or another part's storage reads as an empty list. A
group with no result option is dropped: it is not a question this application
can answer.

---

## 2. What the bottom of the page is being asked

Four things can be true at once, and the order they win in is the whole rule.
`asked()` decides it, and everything downstream reads its answer.

| #   | When                               | Judged against   | Results     | Panel below                      |
| --- | ---------------------------------- | ---------------- | ----------- | -------------------------------- |
| 1   | a group draft with something in it | the draft's tags | the draft's | tools, or the per-feature notice |
| 2   | a row selected in the list         | the item's tags  | the item's  | tools, or the per-feature notice |
| 3   | a face previewed on the part       | its hole group   | `all`       | tools that cut it                |
| 4   | none of the above                  | nothing          | `all`       | every tool in the catalog        |

A **part-level assembly row asks nothing** and falls to row 4 on purpose: it has
no features, so there is nothing to judge a tool against — the table under it is
the catalog, the two racks are the crib, and the tree beside it is what is being
decided. It is the one case where a row is selected and `asking` is false, so
`treeKey` names it explicitly.

A **draft with nothing in it yet is asking nothing** and falls through to 4: the
panel would otherwise have to answer "these no features", and what it answered
with was the whole catalog.

Two derived facts the page reads constantly:

- **`asking`** — anything at all is being asked (rows 1–3). Not "is a reading
  focused": a group can focus nothing — the quick buttons used to leave it that
  way, and an edited group still does — and a list gated on the focus fell back
  to the catalog while the page had a perfectly good question in front of it.
- **`perFeature`** — `asking` and results are `each`. There is no single list to
  show: the question is one per feature.

---

## 3. What a click on the part means

`app/shared/part-interaction.ts` — one pure reducer, tested there.

### An ordinary click

Opens the largest reading of the face, previews it, and offers the two ways in.
Clicking the same face again walks its readings. Clicking a **different** face
swaps the guess rather than piling up.

**It keeps the one reading, not its identical siblings** (Paul, 2026-09-09).
Outside a group a hole stands for itself; where it has siblings, the panel
offers the group instead of taking it — see § 1 — and the offer is made for any
hole being read rather than only inside the dialog, because a plain click
followed by _+ Feature_ adds a feature just as the dialog does. It is withheld
once a row is selected, or while a group or a part-level assembly is being
built, where there is nothing left to offer.

A click also **puts down whatever row was selected**. A selected row outranks
the face under the mouse, which is right until somebody clicks the part — at
which point the page went on answering the row and the click did nothing anybody
could see. A click on nothing (the whitespace) does the same.

### A click while a group is being built

**Identical holes group from here.** `{ type: 'group' }` is what turns
`collecting` on, and it also **grows what is already kept** into whole hole
groups — so _+ Group_ pressed over a previewed hole, and the offer beside that
hole, both arrive at the same thirty-nine. The flag is in the state rather than
on the action because `click`, `read`, `arm`, `step` and `toggle` all expand and
all have to agree: with it on `click` alone, choosing a direction mid-group
re-read the face without its group and left the rest of it in `kept` as orphans.

A click itself is a **toggle**, and nothing else:

- a face not in the group goes in;
- a face already in comes out;
- pressing the **same** face again takes it out, asked the way `pickFace` asks
  it — by the region held, not by which readings the click resolved to. A
  reading can own several faces, so comparing readings made the second feature
  of a group read as the first being pressed twice.

**The arrows choose the reading.** `arm` swaps what the click guessed, which is
the "after I select the direction, if applicable" half.

### Escape and misses

Unchanged and outward, one thing per press: the reading first, then the kept
set. `reset` puts everything down at once and is what confirming a draft uses —
what was being picked has become a row, and leaving it selected as well would
have the page answering the same question twice.

---

## 4. Adding

Three buttons, always visible, never a menu between you and them —
`app/components/add-bar.tsx`, and **over the top-left of the part** rather than
in the list (Paul, 2026-09-08: "move the add feature, add group, and add tool
assembly buttons so they are always at the top left of the part viewer"). They
were the last thing inside the Features card, which is the one place they cannot
be relied on to be: the list fills the space it has and then scrolls, so on a
long list all three were below the fold. They are named for what they make —
**+ Feature**, **+ Group**, **+ Tool Assembly** — because the `+` is the verb.

The row is as wide as its buttons and only they take the pointer: an invisible
box over the canvas carrying `pointer-events: auto` is a curtain, which is what
`tests/on-the-part.spec.ts` § _at a laptop width_ exists for.

### + Feature

- Pressed with **nothing being read**, it asks: _"Click a face on the part, then
  press + Feature."_ It is never disabled — greyed out, it read as broken rather
  than as waiting.
- Pressed with a face being read, the reading is what gets added — **and the
  box closes behind the press** (Paul, 2026-09-10: "when I click a feature first
  then + Feature, it should automatically add the 'empty' (no tool) feature to
  the list and close the feature dialog. Right now it removes the button and
  adds to the list but keeps the dialog open, which is confusing"). A click on
  the part has already opened the box on that reading, so a press that made the
  row and left it open changed nothing on screen but its own three buttons
  disappearing. It is the same press as **Add feature to list** under an empty
  stack — § 6 `nothingYet` — and it ends the same way: the row is on the list,
  the reading is put down, and the presses are back. Choosing a tool for that
  row is a click on it away, and a stack built over the preview still becomes
  the row in one press of the button under it.
- **The box has no confirm of its own** (Paul, 2026-09-09: "I no longer need
  these cancel or create group and add tool buttons — the group is created and
  added when a tool assembly is created and added to the order list. Same with
  add this feature"). _Add this feature_ and the **Cancel** beside it were a
  second press for one decision: the press under the stack — **Add to order
  list** — already makes the row and writes the assembly in one go. The way out
  of the box is the **X in its top right**, which is the same press in all
  three (see _The X in the corner_).

### + Tool Assembly

Opens an empty `TOOL` / `HOLDER` / `COLLET` tree with the catalog under it, and
puts down whatever was being read — a face left selected under a stack for the
whole part would have the page answering a question the stack is not about.

**It is a draft until it is ordered** (Paul, 2026-09-08: "if I don't add anything
to the order list when creating a tool assembly, the command was cancelled and
the empty tool assembly row should not show"). It was a part-level assembly's
rule alone; since 2026-09-09 it is every row's — see _What the list holds_.

- The press under the stack — **Add to order list**, the `confirm` action
  `assembly-actions` already offers a question that is not a row yet — makes the
  row and writes the lines in one go, under the id `pendingAssemblyId` minted
  before the row exists so the two cannot disagree about where they wrote.
- **There is no _+ Add assembly_ under it** (Paul, 2026-09-08). A part-level
  assembly answers no feature, so nothing about it could need a second stack:
  another stack the part needs is another _+ Tool Assembly_, a row with a name
  of its own rather than an unnamed `Assembly 2` inside this one.
- **The X in the corner** drops the stacks and the draft and leaves nothing
  behind — and so does **Escape** (Paul, 2026-09-08: "escape key should also get
  me out of tool assembly dialog"). It is the newest thing on the page and it
  answers no feature, so there is nothing underneath for the press to walk out
  to; `escapeRef` in `routes/part.tsx` takes it before the reducer's own
  outward step. The **Cancel** that used to sit under the tree came off with the
  other confirms on 2026-09-09.
- **Remove from order list** takes the row with it, for the same reason: the
  assembly is the order.
- **And the row is named as it is made.** The press that makes it opens the name
  field on it (`renamingId` in `routes/part.tsx`), because the moment the row
  appears is the one moment somebody knows what the stack is for — a name asked
  for later is a name most rows will not get.

### + Group

Opens the group editor, seeded with whatever is already clicked.

- **Features are picked on the part**, with the mechanism that already exists.
- **Chips** show what is in, each with a way out. Capped at about four rows and
  scrolling — thirty holes is thirty chips, which is a form taller than the
  window.
- **The note** says what a group is for: select a feature on the part to add it,
  and the catalog finds tools compatible with all of them. **The quick buttons
  and the result options are gone** (Paul, 2026-09-08) — every group asks the
  one question, so the box states it rather than spending two controls on it.
  `typeButtons` in `shared/feature-list.ts` is the rule the quick buttons used
  and is kept, unused, for the same reason `each` is.
- **The worst case**, once there is something in it: every field the group's
  features are shown by, folded to the hardest of their readings (Paul,
  2026-09-08). One tool for all of them is a question about the hardest of
  them — the deepest reach, the tightest corner — and neither of those is
  readable off the feature boxes one at a time. The strip is drawn the way the
  feature box draws its own readings, off the same sheet.
  - Which end is hard is the field's own to say: `GroupBound` in
    `app/shared/feature-defaults.ts`. A **ceiling** is a limit on the tool, so
    the smallest in the group binds; a **floor** is a demand on it, so the
    largest does.
  - A field with no hard end — two holes of different diameters — says
    **differs** rather than picking one of them and hiding the other. It has no
    worst case; it has no one drill.
  - **Which feature a number came from is not on screen** (Paul, 2026-09-08).
    It was named beside every number, and the chips above already say what is in
    the group. It stays in the tooltip — every number carries the features it
    was folded from, deduplicated, so a group of thirty-nine identical holes
    says its line once — and `featureTag` on the fold's answer still says it for
    anything that wants to.
- **There is no confirm on the box** (Paul, 2026-09-09). _Create group and add
  tool_ and the **Cancel** beside it are gone: the group is created and put on
  the order list by the press under the stack that answers it, in one press.
  What is left where they stood is the sentence saying which condition is not
  met yet — _Pick a tool from the list below, then add the assembly to the order
  list._
- **Saving an edit is the exception.** Changing which features a row already on
  the list holds is not an order, so nothing under the stack commits it; the
  route draws **Save group** / **Save this feature** under the box while
  `draft.editing` is set, and nowhere else.

### The X in the corner

**One way out, the same in all three** (Paul, 2026-09-09: "I would like to add an
'X' in the top right of the dialog to close the dialog as well. This should be
consistent across +feature, +group, and +tool assembly"). It is drawn by
`routes/part.tsx` at the top of the box rather than by any of the three panels
inside it, which is what makes it the same press in each.

- With a draft open it is `cancelDraft`: the draft and its scratch stacks go,
  and nothing was ever written to undo. **Escape** does the same.
- With no draft — the box open over a row that already exists — it is
  `selectRow(null)`: there is nothing to cancel, so closing it is putting that
  row down.

### Confirming is what writes the bill

**Choosing the tool is what adds it.** Nothing else does.

This is the **first** tool. Every one after it is added from the panel beside the
table — see §8.

- For a feature or an `all` group: the tool the list has **highlighted** — the
  table opens with its first row highlighted and the panel beside it assembling
  that very tool, so the button takes it without a second click. Near misses
  count: on a feature nothing in the crib fits, the highlighted row is the
  closest miss.
- For an `each` group: **nothing is asked.** The rules have already answered
  every one of its features on the rows, and asking for a seventh tool to stand
  for six questions is the thing that mode exists to avoid. The panel below says
  so rather than listing tools:

  > Tools will automatically be selected for each feature. After creating the
  > group, click on a feature in the list to see all compatible tools.

- One line per **distinct** feature — identical holes counting as one. Four faces
  cut by one end mill is four operations with one tool.
- The line carries the **holder, collet and stickout** picked for that tool, if
  any.
- **The new row stays selected.** It used to put everything down, which left
  nothing active — and with nothing active the panel has nothing to add a second
  tool to. The row somebody has just made is the row they are working on.

---

## 5. The list on screen

`app/components/feature-list-panel.tsx`.

### A row

Glyph, name, and — for a group — what it wants back (`one for all` / `one each`)
and how many features it stands for (`×16`). A feature row shows its way up
instead, and a part-level assembly says **no feature**, because a stack answering
nothing looks exactly like one answering a feature nobody can see any more.

**The heading over it says _Order list_** (Paul, 2026-09-08). Every row on it is
a thing being ordered, and nothing reaches the bill except because a row here put
it there; the page in the header is the same list read the other way round.

### What the list holds

**Every row, answered or not** (Paul, 2026-09-10: "I should be able to create a
feature or group without adding a tool … shown in the order list with an
'incomplete' icon and a dashed border, indicating that it is a feature or group
that I flagged to do something with but haven't added a tool assembly to yet").

This reverses the rule of 2026-09-09 — _only what has been ordered_ — and it
matters what that rule was actually about. A row with nothing on it was being
**answered with the rules' own recommendation**, which reads exactly like an
order and is not one, so the part page showed a tool the order-list page had
never heard of. Dropping the row made that impossible. So does saying what the
row is, and that is what happens now:

- The row is drawn with a **dashed border** and a **dashed-circle mark** beside
  its name — `isIncomplete` in `app/shared/order-list.ts` is the rule, and
  `incompleteIds` is what the panel is handed.
- **One face is one row.** _+ Feature_ over a reading that is already on the list
  goes back to that row rather than making a second — `rowFor` in
  `app/shared/feature-list.ts`, and the same for a group holding exactly the same
  features. Two rows for one reading are one line on the sheet seen twice, since
  the sheet is keyed by feature tag: a tool ordered on one appears under both and
  comes off both together. It was reachable before and healed itself, because an
  unordered row was pruned as soon as it stopped being the one in hand.
- It is **answered with nothing at all**. `recommendationInputs` in
  `routes/part.tsx` sends the matcher no demand for a row nobody has ordered
  for, so a recommendation can never stand where an order goes. The one caller
  that still asks is the group being built for _one tool each_, where the rules'
  answers are the decisions the mode exists to make rather than a suggestion
  under a row.

A row goes when somebody takes it off: right-click → _Remove_. Taking the last
assembly off leaves the row behind, marked — the press is named for the order it
removes, not for the feature.

A **part-level tool assembly** is the one kind that cannot be empty. It _is_ its
order, so "Tool assembly 3" with nothing in it is a row about nothing (Paul,
2026-09-08) — the press under its stack stays greyed until something is in it,
and no row is made until it is pressed.

### Assemblies, or components

**Two icons beside the heading** (Paul, 2026-09-09). The list is read two ways:

- **Assemblies** — the rows and the stacks under them, which is the list above.
- **Components** — every tool, holder and collet on the order list once, with
  how many to buy. One collet in six stacks is one collet to order, and a list
  that says so six times is a list somebody adds up by hand.

`componentTotals` in `app/shared/order-list.ts` is the rollup and
`components/component-tally.tsx` draws it. It is read-only here and editable on
the order-list page (Paul, 2026-09-09), where **the whole order is one number**:
"we don't need individual quantity edits per assembly … the assemblies are just
for reference in this view". The sheet keeps a quantity per assembly, so the
change lands on the first of them and the rest stay as the assembly view left
them — `setComponentCount`, tested beside the rollup. Every assembly keeps at
least one, so taking a component in three stacks below three is removing it from
a stack, which is the assembly view's press and not a number.

### One list, two places

**The parts-page list and the order-list page show the same tools** (Paul,
2026-09-09: "regardless, they should be linked and show the same information").
They were two readings of one store and neither read it the way it was written:

- A row's lines are kept under **every** key it stands for — a bolt circle of
  eight holes is eight keys. The part page read the first key and the bill read
  them all, so a line that reached only some of them showed on one and not the
  other.
- Taking a row off cleared one key per _distinct_ feature, which for a bolt
  circle is one key out of eight; the bill went on showing the assembly.
- A key no row stands for was a bill line about nothing.

`app/shared/order-list.ts` is the one reading now. Both pages build their rows
from `orderAssemblies`, reads union across `sheetKeysOf`, writes fan out over the
same keys, and `clearKeys` clears all of them.

### The answers under it

**One line per tool the row is answered with**, each with what it is held in
beneath the catalog number. Pressing one asks that row's question in full — the
tool table below fills with everything that fits — and opens _that_ tool in the
panel beside the table, which is where it is removed or re-held. Without that
press there is no way to reach the second tool of a feature, and no way to take
it off.

**The decision where there is one, the recommendation where there is not.** Once
a tool is on the bill for a feature, that — with its holder and collet — is the
answer to the row; the rules' own pick stands in only until somebody has made
one.

- An `all` group shows one answer.
- An `each` group shows `3 tools, one per feature` while closed, and a row per
  feature with its own answer when open. Where every feature landed on the same
  tool it says the tool, because "3 tools" about one drill is a worse answer than
  the drill.
- A row with no answer says which question failed: `nothing fits` for a feature,
  `no one tool cuts all of these` for a group.
- **A line names the vendor and says what the tool is**: `WIDIA TDMX1200 - Bull
nose end mill`, with the diameter at the right (Paul, 2026-09-09: "I'd like to
  add the tool type and vendor into the order list … it should say 'Emuge
  2810.0250 - Flat End Mill'"). A catalog number on its own says neither who
  makes it nor what it cuts. The words are the tool table's own — `brand` is the
  Vendor column and `typeLabel` in `shared/tool-type.ts` is the one place a form
  becomes a phrase — so a line says what the table beside it says about the same
  tool. The phrase takes the ellipsis before the number does: what a shop orders
  by keeps its width.
- **A line wears the name of the stack it stands for**, over the catalog number,
  where the shop called that stack anything (Paul, 2026-09-08: "it still isn't
  showing the name in the order list in the parts page"). The bill holds tools
  and the tree holds names, so the route matches a line to a stack by what the
  stack was _ordered_ as — `assemblyOf` in `routes/part.tsx` — and a swapped
  cutter still points at its own stack. Nothing is drawn for the stacks nobody
  named, which is most of them.

### Right-click

**Edit…** and **Remove**, fixed to the window at the click point. A part-level
assembly is offered **Rename…** and **Remove**: it holds no features, so there
is nothing an editor could ask about — what it does have is a name, which is the
second way in after the one the press that made it opened. Positioned
inside the list it was clipped by the list's own scroll, so the menu for a row
near the bottom opened where nobody could reach it — the very thing the scroll
was supposed to make safe.

**Remove takes the row off the bill and off the part**, not just off the list.
An edit that drops features drops their lines too.

### Naming a tool assembly

Minimal, and in place (Paul, 2026-09-08: "the UI should be minimal — enter the
text where the placeholder is shown then click a small check mark or hit enter
on the keyboard to confirm"). `components/name-field.tsx` is the one control,
shared with the tree's cards so the two cannot answer _does Escape cancel_
differently:

- The field replaces the row's label, and carries a width floor of its own
  (Paul, 2026-09-08: "this text entry box needs to be wider so I can see what
  I'm typing"). The list stands on the part and is only as wide as its rows, so
  a field taking its width from the row it is in got the width of a caret — and
  the placeholder saying what the row is called now was invisible with it.
- **The placeholder is what it is called now** — `Tool assembly 2` — rather than
  a prompt, so the field never hides the one thing needed to decide whether to
  bother naming it.
- **It opens where naming is the work** — right-click → _Rename…_ on a row, the
  card's heading in the tree, and the card the tree's _+ Add assembly_ makes.
  Never over a row a press has just ordered.
- **Enter or the tick keeps it**; **Escape leaves it alone**; a click elsewhere
  keeps what was typed, because a field that throws a name away on a misclick is
  worse than one that keeps a name somebody can retype.
- **Nothing typed keeps the default** (Paul, 2026-09-08: "the name needs to add
  the default if I don't enter one") — the row goes on being `Tool assembly 2`.
  That is also how a name is taken off again; there is no un-name control.

### Layout

- **It never scrolls sideways** (Paul, 2026-09-08: "I should never have to
  horizontally scroll in the feature list — long names should …"). The column is
  a fixed 320px over the part and every name in a row already carried
  `truncate`, and it still scrolled: a `@toolpath/ui` `Button` puts the
  `className` it is given on the box _inside_ it, so the `<button>` keeps
  `min-width: auto` — the whole unbroken name — and that box takes its width
  from its own contents. Three things together are the fix, and none of them
  works alone: `[&>button]:min-w-0` on the row, `w-full` on what reaches the
  inner box, and `[&>div]:flex` where the children have to lay out in a line
  (`FITS` / `STACKS` in `components/feature-list-panel.tsx`). The tree's cards
  carry the same treatment for the same reason.
  `tests/on-the-part.spec.ts` § "never scrolls sideways" is the sensor: nothing
  overflows, and a long name is clipped rather than the row grown.
- **And a `<button>` needs `full`.** A button sizes to fit its contents even as a
  flex container, so the row's name button takes the width of the whole unbroken
  name unless the kit is told `full` — the one prop that reaches the `<button>`
  rather than the box inside it. The name button and the answer lines both carry
  it.
- **The caret is the gutter, not a control beside it** (Paul, 2026-09-08: "the
  arrow is so big, then the text is so short … the arrow should be to the left
  of other rows — this is not indented"). Stretching every button in a row to
  fill it stretched the caret too, and a group row became half chevron and half
  ellipsis. Only the name is a flex item that grows: the caret is exactly the
  width of the spacer every other row keeps in its place, so a group's name
  starts where a feature's name starts.
  `tests/on-the-part.spec.ts` § "opens a group from a caret the width of the
  gutter" measures both.
- **The rows stand on the part, not in a box** (Paul, 2026-09-08: "make the list
  rows sit on top of the 3d viewer rather than in the box"). The card around
  them was a solid panel the width of the list whether the list was one row or
  twelve, covering the part with its own ground to say nothing. Each row carries
  just enough ground of its own to be read; the column they stand in takes no
  pointer at all, and the `<ul>` takes it for its own rows.
- The list **fills the space it has, then scrolls**: `max-h-full` is the top of
  the tool table, because the overlay is floored to the viewer and the viewer
  stops where the table starts.
- The **editor opens directly under the press that opened it** (Paul,
  2026-09-10: "the current placement of the feature, group, or tool assembly
  dialogs block the part on a small screen too often — move all these dialogs to
  directly below the + Feature, + Group, and + Tool Assembly buttons"). The
  overlay is **one column**: the three presses, the card, the fold, the rows.
  It was a row of two — the presses and rows in one column, the card in a second
  beside it — which is two columns of chrome over a part on any screen a
  laptop's width or under, and the card is the answer to a press three pixels
  above it. The column is `w-80`, and `w-[26rem]` while the group editor is
  open, because the card is what asks for the width now that it is inside it.
- **An open editor folds the rows away**, and one button under it brings them
  back (Paul, 2026-09-10: "when a dialog is active, fold up the order list.
  Provide a button to be able to expand it underneath the open feature, group,
  or tool assembly dialog if desired"). One column carrying both would otherwise
  cover the part from the top of the viewer to the bottom. The button says
  _Order list_ and the count, so a folded list still says how much is on it; it
  is the only thing that unfolds it, and pressing it again folds it back. The
  fold **comes back on its own when the card closes**, so the next thing asked
  starts the way the last one did rather than inheriting a press.
  `listUnderDialog` in `routes/part.tsx` is the state and `dialogOpen` the
  condition; with the rows unfolded the card takes what it can and the rows keep
  a floor of `min-h-28`, because a fold button that opens onto nothing is a lie.
  `tests/on-the-part.spec.ts` § "draws the tree under the add presses, over the
  list and above the table" measures the column, and `orderList` in
  `tests/cube-fixture.ts` is how every other test presses the fold open.
- **The three presses go with the rows** (Paul, 2026-09-10: "we should hide the
  - buttons while the dialog is active as well — the dialog is the action, and
    having the + floating there encourages people to click it"). A box open over
    the part is one question being answered, and three presses hovering above it
    are three ways to walk off it by accident. `pressesShown` is the rule, and it
    keeps them in the one state that looks the same and is not: a **preview**, a
    face somebody has clicked and not kept, where _+ Feature_ takes the reading
    and _+ Group_ seeds a group with it — hiding them there would leave a clicked
    face with no way to become a group at all. They also stay while _+ Feature_ is
    waiting for a face, since the prompt under them names the button it would be
    hiding. `tests/on-the-part.spec.ts` § "hides the three presses while something
    is being built" walks the four states. Two of the three are pressable in
    every state they are drawn in; _+ Tool Assembly_ is greyed over a preview,
    which is `assemblyPressEnabled` beside `pressesShown` in the same file.
- **The press that orders is the way out** (Paul, 2026-09-10), and **Enter is
  that press**. Both are rules of the stack rather than of the list —
  `docs/TOOL-ASSEMBLY-TREE.md` § 3 states them, `isOrdering` and `orderingPress`
  own them — and they are here because they are what closes this box: an order
  written is a form finished with, and the row on the list is the way back in.
- While a draft is open the viewer stops clipping its overlay (`overlaySpills`),
  so a form with a confirm button under a growing list can always be finished.

---

## 6. The part

**The part is framed beside the questions, not behind them** (Paul, 2026-09-10:
"the viewer should really be only to the right of the left hand panel — so the
part centers next to the list rather than behind it on small screens. I would,
however, still like to be able to see the part behind the list and keep the
layers that work now").

Both halves of that at once, which is what makes it a camera rule rather than a
layout one. **The canvas keeps every pixel it has** — it runs the full width of
the panel, under the column, so the part still shows through the translucent
rows, the overlay's layers and pointer rules are untouched, and a click on the
empty space down the column still reaches the part. What changes is the
**projection**: `shared/frame-inset.ts` turns the width of that column into a
`three` view offset, so the camera frames into the strip the column leaves.

- It is a projection and not a pan, so it holds under any orbit and any zoom.
  World-space padding would stop being screen-left the moment the part turned.
- It costs the part size — the free slot is what it is fitted to — so
  `MOST_OF_IT` caps how much of the canvas a panel may take before the part
  stops being the point of the screen.
- The inset **follows the drawn content, not the column** (Paul, 2026-09-10:
  "have it follow the drawn content"). The column is a fixed width and the full
  height of the viewer whatever is in it, so insetting by it pushed the part
  aside for three buttons in the corner over an empty list. `spokenFor` measures
  every `data-over-part` box — the presses, the box being filled in, the fold,
  the rows, the components table — and counts only those reaching the **middle
  third** of the canvas, which is where a fitted part stands.

  So a short list leaves the part in the middle and sits over the sky above it,
  and the part moves aside once a box is in front of it. That is a step rather
  than a slide, and it is the honest one: there is no half-way state where the
  part is half behind a row. Opening the box on a clicked face moves the part
  once, which is the same step seen from the other side.

  A box that forgets `data-over-part` simply does not move the part — the safe
  way for this to be wrong. `Card` does not pass a `data-*` through to the DOM,
  so the dialog's marker is on the box **inside** it.

- The page says what it measured on `data-part-inset`, which is also what
  `onThePart` clicks by: one answer, read back, rather than a second derivation
  of the same geometry in the tests.
- Picking is unaffected: a raycast unprojects through the same matrix.
- `tests/on-the-part.spec.ts` § "frames the part beside the boxes drawn over it"
  walks the three states, and § "at a laptop width" pins the layers — the canvas
  is what the pointer finds at the part _and_ in the empty space down the
  column. `onThePart` in `tests/cube-fixture.ts` is why every click in the suite
  is a fraction of the free slot rather than of the whole canvas.
- **The first measurement has to come from inside the canvas.** `<FrameInset>`
  measures on R3F's own size, because measured from outside on mount the answer
  was taken before the panel group had sized the viewer — a short canvas whose
  middle the presses crossed, so an empty list shoved the part aside and nothing
  measured again (2026-09-10).

What the part paints is **everything the question is about** — `asked().tags`,
not the working set. Selecting a group of thirty-nine holes lights all
thirty-nine; a preview or a draft is the working set, so those cases are
unchanged.

Separately, every feature with a tool on the bill wears the grey `tooled` paint.
That is read straight off the setup sheet, so it goes when the row goes.

---

## 7. The tool table

**On by default**, showing every tool in the catalog narrowed by the filters. It
was hidden until a tool was pressed, which left half the page empty on a part
nobody had asked anything about yet.

| What is asked            | Heading                         | Contents                       |
| ------------------------ | ------------------------------- | ------------------------------ |
| nothing                  | Every tool in the catalog       | the filtered catalog           |
| a part-level assembly    | Tool assembly 2 — no feature    | the filtered catalog           |
| one being built          | New tool assembly — no feature  | the filtered catalog           |
| a feature                | Cuts the _pocket_               | what fits it, then near misses |
| a group, `all`           | Cuts every feature in the group | what fits all of them          |
| a group or draft, `each` | One tool per feature            | the notice, not a list         |

**It opens eight tools tall** (Paul, 2026-09-10: "the default height of the
table should be whatever showing 8 tool rows is"). It used to open at 45% of the
height of the page, which is a different number of tools on every screen —
seven at 800px, a dozen at 1200 — and a list is read in rows rather than in
percentages. `TABLE_OPENS_AT` in `components/part-tool-table.tsx` is the height:
the toolbar, the column headings, the card's own border, and eight rows. The
part panel above states no size of its own and takes what is left, down to its
floor of 260px — on a window short enough to hit that floor, the part's minimum
wins and the list opens on fewer.

The row height is a **copy of a number `@toolpath/ui` does not export**, so
`tests/on-the-part.spec.ts` § "opens with eight tools on screen" measures the
room the rows actually have and is what keeps the two in step.

A threaded hole keeps its two tabs — **Taps** and **Drills** — with the taps
first. The notes beside the heading (what the rules removed, what the filters
hid, what no holder clears) describe the list on show and are suppressed where
there is no list.

**Marks** are unchanged in meaning and changed in shape: the number wears its
mark's colour and one glyph beside it carries the sentence on hover — a red `x`
for the rule that took the tool off the list, amber for a caution, a grey `i`
for a figure worth reading, a green tick for a number the rules read and passed.
The two words used to sit on a second line, which made a failing row taller than
a passing one.

**The filters outrank the rules, on request, one column at a time.** The
suggested ranges are written from the same `must` rows that judge the tools, so
widening one asks for exactly what the rules then remove and the table came back
empty. Changing a number the geometry set raises a warning **in that column's own
filter dialog**, with a press that forgives that column's rules and no other; the
tools it puts back are listed with their marks, and a row picked from them is
recorded on the stack it goes into. Every filter dialog also closes on a tick.
`docs/TOOL-ASSEMBLY-TREE.md` § 5a is the rule.

---

## 8. The panel beside the table

It always says **what the tool is on the list for** — the features it is
cutting, by name.

What it offers depends on what is being asked about and whether this tool is one
of its tools. With more than one tool allowed, "what does this button do" stops
being obvious and becomes four questions, so the answer is a rule
(`app/shared/tool-actions.ts`) rather than a shape of JSX.

| What is asked                                | Buttons                                     |
| -------------------------------------------- | ------------------------------------------- |
| nothing                                      | none — nothing to add it to                 |
| a feature or group with **no tools yet**     | **Add tool**                                |
| this tool is **one of its** tools            | **Update tool assembly**\*, **Remove tool** |
| it has tools and this is **not** one of them | **Replace _B976Z02500_**, **Add this tool** |

\* only when the holder or collet in the panel differs from what was saved. A
button that saves what is already saved is one somebody presses to find out
whether it did anything.

- **Add tool** — the first tool. On a draft this confirms it, so the row and its
  tool arrive together.
- **Update tool assembly** — writes the holder and collet onto every feature this
  tool is cutting.
- **Remove tool** — takes this tool off every feature being asked about, **and
  takes the row off the list if it has no tools left**.
- **Replace …** — clears what is mapped and puts this in its place, in one
  commit. It names the tool it drops, because with several mapped there is
  otherwise no telling which one goes; where several go, it says
  _Replace all tools_ instead of naming one.
- **Add this tool** — adds it beside the ones already there. This is what makes a
  feature hold a spot drill and a drill.

---

## 9. The bill

One sheet, `tool-catalog.setup.<partId>`, keyed by feature tag.

- **The key is the hole group's own tag**, not whichever sibling was under the
  mouse. Keyed by the click, the panel wrote a second line beside the one the
  feature list had already put there.
- A feature holds **a list of lines**, not one. A line is
  `{ toolGuid, holderGuid?, colletGuid?, stickout? }`; tool-only lines are legal
  and are what confirming without a holder writes.
- `addChoice` replaces by tool guid, so adding a holder to a tool already on the
  list updates that line.
- **A part-level assembly's lines are keyed by its row id**, which the order
  list reads back through `isAssemblyKey` — and the note under such a row is
  **for _its name_** rather than **machines _a feature_** (Paul, 2026-09-08:
  "it should show the name of the assembly in the order list as well"). Unnamed
  it still reads _for no feature_, which is what a stack nobody's geometry asked
  for is. `routes/order-list.tsx` reads the list out of the browser to resolve
  the name; nothing on that page edits it.

---

## 10. Performance

**Superseded 2026-09-04.** Matching now runs in a web worker with a cache in
front of it — `app/shared/catalog-matcher.ts` is the one matching truth, and
`app/client/catalog-matcher.worker.ts` keeps it off the UI thread.
`docs/CATALOG-MATCHING-PERFORMANCE-PLAN.md` is the plan and the reasoning.

The two defects below were the first pass at the same problem, and are still
true of the work the worker does:

- **Narrowed before it is judged, not after.** Every row costs a pass, and a
  group of thirty-nine holes is a dozen distinct sizes — a dozen passes over
  seventeen thousand tools, then a filter that threw most of the results away.
  The filters do not depend on the rules, so they run first; a threaded hole's
  list is drills, which is a few hundred.
- **A set of features is asked once**, however many rows ask it. The cache is
  rebuilt whenever `topFor` is — whenever the filters, the threads, the crib or
  the knobs move — so it can never answer with a stale verdict.

---

## 11. Where the rules live

| Rule                                        | File                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| what the list holds, names, ids, storage    | `app/shared/feature-list.ts`                          |
| the name a shop gave an assembly row        | `renameItem` / `defaultLabelOf`, same file            |
| the field that name is typed in             | `app/components/name-field.tsx`                       |
| what the bottom of the page is asked        | `asked()`, same file                                  |
| which key a row's lines are kept under      | `sheetKeysOf`, same file                              |
| reading, writing and clearing those keys    | `app/shared/order-list.ts`                            |
| whether a row has anything ordered for it   | `isIncomplete`, same file                             |
| the order list both pages show              | `orderAssemblies`, same file                          |
| what to buy, once each, and how many        | `componentTotals`, same file                          |
| setting a component's whole order           | `setComponentCount`, same file                        |
| the components view on the part             | `app/components/component-tally.tsx`                  |
| the three presses that grow the list        | `app/components/add-bar.tsx`                          |
| whether the rows are folded under the box   | `rowsShown`, `app/shared/part-chrome.ts`              |
| whether the three presses are on screen     | `pressesShown`, same file                             |
| where the part is framed, beside the column | `app/shared/frame-inset.ts`                           |
| how tall the tool list opens                | `TABLE_OPENS_AT`, `components/part-tool-table.tsx`    |
| whether _+ Tool Assembly_ can be pressed    | `assemblyPressEnabled`, same file                     |
| the row a reading already has, if any       | `rowFor`, `app/shared/feature-list.ts`                |
| what _+ Feature_ does over a reading        | `keepReading`, `app/routes/part.tsx`                  |
| which press closes the box, and Enter's     | `isOrdering` / `orderingPress`, `assembly-actions.ts` |
| what Enter presses, over the whole box      | `orderPress` / `applyStacks`, `routes/part.tsx`       |
| a component standing in two stacks at once  | `sharedWith` / `sharedPhrase`, `assembly-tree.ts`     |
| how many of one assembly a row ordered      | `Choice.total`, `app/shared/setup-sheet.ts`           |
| a row's answer, and what opens              | `app/shared/recommendations.ts`                       |
| what a click means                          | `app/shared/part-interaction.ts`                      |
| the list on screen                          | `app/components/feature-list-panel.tsx`               |
| building a group                            | `app/components/group-editor.tsx`                     |
| a group's worst case, and whose it is       | `app/shared/group-geometry.ts`                        |
| the one bore a group shares                 | `sharedHoleDiameter`, same file                       |
| whether identical holes group               | `Interaction.collecting`, `part-interaction.ts`       |
| whether the offer to group them is made     | `app/shared/group-offer.ts`                           |
| the offer on screen, and both answers       | `identical`, `components/selection-panel.tsx`         |
| a feature row turned into a group           | `changeToGroup`, `app/routes/part.tsx`                |
| which key a reading's lines are kept under  | `choiceKey`, same file                                |
| which holes a thread choice is written to   | `writeThread` / `holesAt`, `shared/hole-mode.ts`      |
| the reading and its thread                  | `app/components/selection-panel.tsx`                  |
| what a threaded hole is called              | `threadedName`, `app/shared/threads.ts`               |
| what the panel and the ⓘ dialog call it     | `nameOf`, handed down by `part.tsx`                   |
| the tool table and its marks                | `app/components/part-tool-table.tsx`                  |
| what overruling the rules offers            | `overridableTools`, `shared/tool-fit.ts`              |
| the warning and its confirm                 | `OverrideNotice`, `components/column-filter.tsx`      |
| what a filter is not showing, and the `…`   | `TermFilter`, `components/column-filter.tsx`          |
| what a tick on Type asks of the forms       | `formsAsking`, `app/shared/tool-type.ts`              |
| which slots were filled against them        | `overrides`, `shared/assembly-tree.ts`                |
| everything wired together                   | `app/routes/part.tsx`                                 |

Each pure module owns its tests. `tests/on-the-part.spec.ts` walks the paths that
begin with a click on the part, against the cube fixture — the only fixture that
mounts geometry.

---

## 12. Working on this

**Read in this order.** The pure modules carry the rules and their reasons;
`routes/part.tsx` is wiring and is the last place to look, not the first.

1. `app/shared/feature-list.ts` — what the list is, and `asked()`, which decides
   what everything downstream answers.
2. `app/shared/part-interaction.ts` — what a click means.
3. `app/shared/recommendations.ts` and `app/shared/tool-actions.ts` — what a row
   answers with, and what the panel offers for it.
4. The components, then the route.

**Change the rule, not the route.** Almost every behaviour on this page is one
sentence in one of those four modules, each tested against literals. If a change
looks like it belongs in `part.tsx`, check first whether it is really a change to
`asked()`, to `toolActions()`, or to the reducer — it usually is, and there it
costs three assertions instead of a Playwright run.

**What the gates are.** `pnpm check` runs style, lint, build, types and the unit
suites; `pnpm test:e2e` runs both applications' Playwright suites. CI runs all of
it plus `pnpm format:check` on every pull request and every push to `main`. The
cube fixture carries nine tools, so most of its features answer "nothing fits" —
that is the fixture, not a defect, and a test that needs a tool to fit has to
pick one the nine can cut.

**Known engineering debts**, none of them behavioural:

- `routes/part.tsx` is past three thousand lines and carries several
  responsibilities. The pure rules have been pulled out of it steadily; the
  holder/collet picking and the bill writing are the next candidates.
- There is no coverage tooling (`@vitest/coverage-v8` is not installed), so
  "what is untested" is answered by reading rather than by measurement.
- `apps/catalog` has no `docker:build`, so unlike the DFM application its
  production image is not proven by CI.
- `main` has no branch protection, so CI is not a required check.

---

## 13. Not built

- **Threads on groups of holes.** Holes in a group should list as sets by
  diameter and depth, each set taking the thread picker exactly as an individual
  feature does. `threads` is keyed per feature tag today, and the group editor
  would need a set-per-diameter-and-depth view feeding it.
- **Stickout** is carried on a bill line but is not yet editable in the panel;
  _Update tool assembly_ is written to take it when it is.
