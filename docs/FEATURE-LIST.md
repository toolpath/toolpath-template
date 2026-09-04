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

| Kind      | Holds                              | Extra                      |
| --------- | ---------------------------------- | -------------------------- |
| `feature` | one decision — usually one feature | —                          |
| `group`   | several, chosen together           | `results: 'all' \| 'each'` |

**Either kind can hold more than one tool.** A hole is a spot drill and a drill;
a pocket is a rougher and a finisher. The sheet has always kept a feature's
choices as a list, and the page treated it as one — which made the second tool
for a feature a thing nobody could add.

Both kinds carry **tags**, plural. A bolt circle of eight identical holes is one
decision and one row everywhere else on the page (`groupOf` in
`part-interaction`), so a `feature` item already holds eight tags. The
difference between the two kinds is not how many tags they hold — it is whether
somebody chose them together.

### Result options

The whole reason a group is a thing rather than a multiple selection:

- **`all` — one tool for all of them.** Only tools that can cut every feature in
  the group. Six holes of five sizes have one drill between them or they have
  none, and that is the answer worth knowing before a job is quoted.
- **`each` — the best tool for each.** A result per feature, whether or not one
  tool covers them all.

### Ids and names

- **Ids are arithmetic**, read off the list (`feature-3`, `group-5`). A clock or
  a random suffix makes a component test that renders twice fail differently
  each run.
- **Names are derived**, never typed: `4 × Through Hole`,
  `Pocket + 2 × Through Hole`, `Pocket + Through Hole + 2 more`. A name somebody
  has to invent for every group is a name most groups will not get.

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

A **draft with nothing in it yet is asking nothing** and falls through to 4: the
panel would otherwise have to answer "these no features", and what it answered
with was the whole catalog.

Two derived facts the page reads constantly:

- **`asking`** — anything at all is being asked (rows 1–3). Not "is a reading
  focused": a group picked out with the quick buttons focuses nothing, and a
  list gated on the focus fell back to the catalog while the page had a
  perfectly good question in front of it.
- **`perFeature`** — `asking` and results are `each`. There is no single list to
  show: the question is one per feature.

---

## 3. What a click on the part means

`app/shared/part-interaction.ts` — one pure reducer, tested there.

### An ordinary click

Opens the largest reading of the face, previews it, and offers the two ways in.
Clicking the same face again walks its readings. Clicking a **different** face
swaps the guess rather than piling up.

A click also **puts down whatever row was selected**. A selected row outranks
the face under the mouse, which is right until somebody clicks the part — at
which point the page went on answering the row and the click did nothing anybody
could see. A click on nothing (the whitespace) does the same.

### A click while a group is being built

A **toggle**, and nothing else:

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

Two buttons, always visible, never a menu between you and them.

### Add feature

- Pressed with **nothing being read**, it asks: _"Click a face on the part, then
  press Add feature."_ It is never disabled — greyed out, it read as broken
  rather than as waiting.
- Pressed with a face being read, the reading is what gets added.
- The confirm sits under what it is confirming: **Use this tool** / **Cancel**,
  below the reading in the feature box.

### Add group

Opens the group editor, seeded with whatever is already clicked.

- **Features are picked on the part**, with the mechanism that already exists.
- **Chips** show what is in, each with a way out. Capped at about four rows and
  scrolling — thirty holes is thirty chips, which is a form taller than the
  window.
- **Quick buttons** add every feature of a kind at once (`Wall 16`, `Face 4`,
  `Profile 4`), commonest first. Twelve holes clicked one at a time is twelve
  chances to miss one.
- **Results** is the radio pair above the confirm.
- The confirm reads **Create group and add tool** (or _…and add tools_ for
  `each`), because that is what pressing it does.

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
instead.

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

### Right-click

**Edit…** and **Remove**, fixed to the window at the click point. Positioned
inside the list it was clipped by the list's own scroll, so the menu for a row
near the bottom opened where nobody could reach it — the very thing the scroll
was supposed to make safe.

**Remove takes the row off the bill and off the part**, not just off the list.
An edit that drops features drops their lines too.

### Layout

- The list **fills the space it has, then scrolls**: `max-h-full` is the top of
  the tool table, because the overlay is floored to the viewer and the viewer
  stops where the table starts. The Add buttons and the reading below stay
  pinned.
- The **editor is a card of its own beside the list**, and decides where it goes
  by itself: a wrapping column stacks the two while the pair is shorter than the
  viewer, and moves the editor into a column to the right the moment it is not.
  No measurement, no threshold.
- While a draft is open the viewer stops clipping its overlay (`overlaySpills`),
  so a form with a confirm button under a growing list can always be finished.

---

## 6. The part

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
| a feature                | Cuts the _pocket_               | what fits it, then near misses |
| a group, `all`           | Cuts every feature in the group | what fits all of them          |
| a group or draft, `each` | One tool per feature            | the notice, not a list         |

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

---

## 10. Performance

Two defects, both from answering every row of the list:

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

| Rule                                     | File                                    |
| ---------------------------------------- | --------------------------------------- |
| what the list holds, names, ids, storage | `app/shared/feature-list.ts`            |
| what the bottom of the page is asked     | `asked()`, same file                    |
| a row's answer, and what opens           | `app/shared/recommendations.ts`         |
| what a click means                       | `app/shared/part-interaction.ts`        |
| the list on screen                       | `app/components/feature-list-panel.tsx` |
| building a group                         | `app/components/group-editor.tsx`       |
| the reading and its thread               | `app/components/selection-panel.tsx`    |
| the tool table and its marks             | `app/components/part-tool-table.tsx`    |
| everything wired together                | `app/routes/part.tsx`                   |

Each pure module owns its tests. `tests/on-the-part.spec.ts` walks the paths that
begin with a click on the part, against the cube fixture — the only fixture that
mounts geometry.

---

## 12. Not built

- **Threads on groups of holes.** Holes in a group should list as sets by
  diameter and depth, each set taking the thread picker exactly as an individual
  feature does. `threads` is keyed per feature tag today, and the group editor
  would need a set-per-diameter-and-depth view feeding it.
- **Stickout** is carried on a bill line but is not yet editable in the panel;
  _Update tool assembly_ is written to take it when it is.
