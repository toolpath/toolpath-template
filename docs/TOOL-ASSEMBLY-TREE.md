# The tool assembly tree

_The shape of the page, as of `paul/interactions`. Behind the `assemblyTree`
flag from 2026-09-07; the flag came out on 2026-09-08 and this is the only
shape there is._

The page asked one question — **which tool cuts this feature** — and hung the
rest of the answer off it. A holder was a dropdown in a column on the tool's own
row; a collet was a second dropdown that stayed empty until the first was
answered; and a feature that needs two tools had no way to say so at all.

Four things came out of that, and they are Paul's four goals:

1. **Filtering for a specific holder or collet was not possible.** The four
   holder filters that existed — taper, contact, clamping, series — narrowed a
   dropdown, and neither a brand nor a family was among them.
2. **A holder was a line of text.** "Which of my BT30 chucks is shortest" was a
   question with nowhere to be asked.
3. **The order was fixed.** Pick a tool, then be offered holders for it — which
   is backwards for a shop that owns four holders and buys cutters to suit them.
4. **One feature, one tool.** A pocket is a rougher and a finisher; a threaded
   hole is a drill and a tap.

The tree is those four answered at once: **the unit of an answer is an
assembly, not a tool.**

---

## 1. The shape

```
(the three presses were here)       │      (the part)       │  ASSEMBLY
────────────────────────────────────┼───────────────────────┼───────────
 ⌀8 Through Hole                    │                       │  TOOL   …
 8.00 mm · 25.4 deep                │                       │  HOLDER …
 ─── TOOL ASSEMBLIES ───────────    │                       │  COLLET …
 ▾ TAP                              │                       │
   ● TAP    M8×1.25                 │                       │  [drawing]
   ○ HOLDER   —                     │                       │
   ○ COLLET   —                     │                       │  [the
   ○ DRILL    —                     │                       │   vendor's
     ○ HOLDER   —                   │                       │   fields]
     ○ COLLET   —                   │                       │
  [Add to order list]               │                       │
 + Add assembly                     │                       │
 › Order list  2   ← folded while the panel is open         │
────────────────────────────────────┴───────────────────────┤
TOOL / HOLDER / COLLET TABLE                                │
Catalog no │ Vendor │ Type │ …                              │
[ the rows for the open slot ]                              │
```

The three presses — _+ Feature_, _+ Group_, _+ Tool Assembly_ — are not drawn
while a stack is being built: the box has their place at the top of the viewer
(Paul, 2026-09-10). With nothing being asked, the same column is the presses and
the order list under them, and a face merely **previewed** keeps both, because
the presses are what turns a preview into a row. `pressesShown` in
`app/shared/part-chrome.ts` is the rule; `docs/FEATURE-LIST.md` § 5 is the spec
for the column.

- **The feature list is unchanged.** It still shows a row per thing asked about
  and each row's answers beneath it — `docs/FEATURE-LIST.md` is still the spec
  for it. What a row's answers _are_ has not changed either: they are lines on
  the setup sheet.
- **One editable tree**, in the feature panel, for whichever row is selected
  (Paul, 2026-09-07: "moving the tool tree to the feature panel"). It stood in
  the table's own scroll area, which put the stack being built at the bottom of
  the page and the feature it answers at the top; it now sits under the reading
  that asked for it, above the table it drives. There is deliberately no second
  copy inside the feature list: two trees kept in step is a divergence with a
  delay on it.
- **The feature panel opens under the three presses**, in the same column as the
  order list, which folds away under it while it is open (Paul, 2026-09-10). It
  was a second column beside the list — before that it wrapped beneath a short
  one — and two columns of chrome is the part covered on a laptop. See
  `docs/FEATURE-LIST.md` § 5 for the fold and the button that brings the rows
  back.
- **The table is whichever list the open slot asks for** — tools, holders or
  collets — with the same sorting, the same column picker, the same column
  order and filters asked the same way: on the heading of the column that shows
  the value (2026-09-08). A holder list has no filter buttons at all, because
  every question about a holder — its brand, taper, clamping, series, contact,
  family, and each of its nine lengths — is a question about one of its columns.
- **Three buttons in the table's chrome say which list it is**, dressed like the
  buttons beside them, the open one lit (Paul, 2026-09-07: "I want the
  table tabs for tools, holders, and collets back, just as buttons like the
  filters button. The one that is active should be highlighted"). They went
  through a full-width tab row and then through being removed altogether — what
  was wanted is the switch the table needs and an indicator of what is on screen,
  not a second navigation. **They are the tree's slots**: pressing one opens that
  slot on the open stack, so the buttons and the tree cannot disagree about what
  the rows below are for. **With no stack open they are three catalogs** (Paul,
  2026-09-07: "the buttons need to be shown and usable when not editing a feature
  as well"): the heading says `Every holder in the crib` rather than `Holders for
this assembly`, because a rack is narrowed to what fits a stack only while
  there is one, and a row clicked is a **look-up** the panel on the right reads
  out — it has no slot to fill.
- **Each button counts its own list, and the counts move** (Paul, 2026-09-07:
  "the count is always showing the tool count. This should be unique to the
  component … it needs to live update when a feature is selected, or as tool
  assembly components are selected"). One number beside the heading counted tools
  whichever of the three was on screen, so a rack of three holders was headed by
  a nine. They are the lengths of the three lists the render already derived, so
  they follow the feature, the filters and the stack: pick a holder and the
  collet count is the collets that close on it. A dash while the matching is
  still running, because three zeroes beside a spinner reads as "nothing fits".
- **Picking a row does not walk you to the next slot** (Paul, 2026-09-07: "it is
  still automatically moving me to holders when I select a tool as a row … I
  shouldn't be moved to the next component automatically — I should click on its
  row to see the table for it"). The open slot is derived — whatever was clicked,
  or else the tree's first _unanswered_ slot — so filling the tool made the
  holder the first unanswered one and the list under the mouse became holders
  mid-click. `fillSlot` pins the node it filled, and what opens next is a press
  in the tree.
- **A change shows on the row it is a change to** (Paul, 2026-09-07: "when I
  make changes, they should show in the respective component rows (like tool x
  -> tool y)"). A slot holding something other than what the order list has for
  this stack reads `TDMX0800 → TDMX0500`, the old one struck through. The button
  says the change in a sentence, which is the right place for _what pressing it
  does_ and the wrong place to find out which of three slots moved. An em dash
  stands for a slot the line has nothing in; a stack that is not on the order
  list at all says nothing on any row, because "not on the list yet" is the
  stack's own state.
- **One button per assembly, under the components it is about** (Paul,
  2026-09-07: "I should just have an 'add to order list' button (or update,
  context aware), at the top level of each tool assembly"). It writes the whole
  assembly — tool, holder and collet are one line on the sheet and one thing a
  shop orders — and its label is the change: _Add to order list_, _Change holder
  from A to B_, _Remove from order list_. **A threaded hole is one press, not
  two** (Paul, 2026-09-08: "there should only be one 'add to order list' button
  for the full assembly"): the drill hangs under the tap, so the tap, its
  holding, the drill and the drill's holding go on the list together. A tap
  orderable on its own is a thread with no hole under it to cut. A sentence per
  stack that moved, the first on the button and the rest under it, each naming
  the stack it is about — `TAP: Change holder from A to B`.
- **The press that orders closes the box** (Paul, 2026-09-10: "clicking 'Add to
  Order List' should close the feature, group, or tool assembly dialog"). The
  decision is written the moment it is pressed, and what stood on screen
  afterwards was a form somebody had finished with, over the part, with the
  order list folded behind it. The same for _Change holder from A to B_ and the
  rest of the writing presses — `isOrdering` in `assembly-actions.ts` is the
  list — and **not** for _Remove from order list_ or _Cancel_: a feature with a
  second stack in it is still being worked on, and where the row is emptied it
  is already put down. The way back in is the row on the order list.
- **Enter is that button**, from wherever the last click left the focus (Paul,
  2026-09-10: "clicking enter once any components are selected in one of these
  dialogs should act like I clicked add to order list — confirm the currently
  selected tools and close the dialog"). A tool is picked _in_ the table, so the
  table is where the focus is; the key is read ahead of the guard that holds the
  arrow keys and Space back from it, and a field still owns its own Enter.
  `orderingPress` is which press it stands for — never _Remove_ and never
  _Cancel_, and nothing at all while the press is greyed.
- **A filter open over the box takes that press first** (Paul, 2026-09-10: "when
  a filter dialog is active underneath a feature/group/tool assembly, hitting
  enter should confirm the filter and close the filter dialog before it closes
  the feature/group/tool assembly"). A column filter is opened from a header
  _inside_ the box, so it is the newest thing on the screen and one press is one
  step out of it — the rule Escape already walks. The menu and the page are both
  listening on the document and the page's listener is always the older of the
  two, so the page stands down for a named layer rather than waiting to be
  pre-empted: `useKeyLayer` and `LAYER_COLUMN_FILTER` in `shared/use-escape.ts`.
  The press after it, with nothing over the box, orders.
- **Enter is the dialog's, never a control's** (Paul, 2026-09-10: "the keyboard
  focus is staying on the checkbox I used most recently in the drop down filters
  — enter should never check or uncheck, it only works at the dialog level").
  The kit's `Checkbox` is a `<button role="checkbox">`: the focus sits on the
  last value clicked, and the press somebody meant as _done_ unticked it. So the
  menu hears Enter on the way **down** — the control never sees it — while
  Escape stays on the way up, where a kit popover marks its own press handled.
  The × is a click away, as it always was; there is one rule now rather than a
  rule and an exception, because the exception is what caused this.
- **The page defers to a filter being open, not to a filter being newest.** It
  counts them (`columnFilterOpen`): making the page's standing down conditional
  on nothing else having mounted since is how the box closes on somebody anyway,
  and nothing above a filter answers Enter, so the worst a deferral costs is a
  press that does nothing.
- **A filter menu is as tall as the screen leaves it** (Paul, 2026-09-10: "the
  filter dialog for type also needs to be scrollable — right now it just runs off
  the screen"). Type lists every phrase the trade has for a tool, under a header
  that sits low once the box is open, and a `fixed` box is not on anything that
  scrolls — so the rows past the bottom edge could not be reached at all. The
  menu measures the room under the funnel and scrolls inside it; where what is
  left under the header is a strip it opens upwards instead, anchored by its
  bottom. Its own header — the tick and the × — is held out of the scrolling
  half, because that is what somebody reaches for once the list is long.
- **The panel on the right is the component being read**, and nothing else. It
  had the buttons, a table away from the stack they described; it does **not**
  list the stack either, because one component list on each side of the table
  meant the same fact had two places to be read from and two to be clicked
  (Paul, 2026-09-07: "I don't need to see the component list in both the tree and
  right hand panel").
- **A tick per component was tried and dropped** (Paul, 2026-09-07, the same
  afternoon). It said whether each component was on the feature and never what
  pressing it would change, and the change is the thing that needs saying:
  "I need to see the context aware changes I'm making, or I just need one button
  to confirm what is selected in the tool assembly."
- **One drawing, whichever slot is open.** `<ToolDetails>` owns the sheet and
  its Tool / Tool + holder switch; selecting a holder or a collet changes only
  the column underneath it, through that panel's `details` prop. A second
  drawing for the holder is what this replaces — it came out lying on its side,
  because `orientationFor` reads the box it is given, and it took the switch
  away the moment somebody looked at a holder.

**And an assembly need not answer a feature at all** (Paul, 2026-09-08). _+
Tool Assembly_, over the top-left of the part, makes a row of its own that holds
no features: the same tree, the same three slots, the same table under it and the
same one press onto the order list — with the catalog rather than a feature's
matched list in it, because there is nothing to judge a tool against.
`docs/FEATURE-LIST.md` § 1 is the model, and the bill says _no feature_ where it
would otherwise name what the tool machines.

## 2. What a feature starts with

`defaultAssemblies` in `app/shared/assembly-tree.ts`.

| Feature         | Stacks                                                |
| --------------- | ----------------------------------------------------- |
| anything        | one — `TOOL`, `HOLDER`, `COLLET`                      |
| a threaded hole | two — `TAP` + holding, and `DRILL` + holding under it |

**The tap comes first and the drill hangs off it** (Paul, 2026-09-07: "the
drill is dependent on the tap, but both the drill and the tap may have their
own holder and collet"). Drawn as stacks of equal rank they read as two answers
to one question; the thread is the decision, and the hole under it follows from
which tap was chosen. `treeRows` is the nesting and the drawing order:

```
● TAP        A0101001.5037
  │ ○ HOLDER   —
  │ ○ COLLET   —
  ┌─────────────────────┐
  │ ○ DRILL     —       │
  │   │ ○ HOLDER  —     │
  │   │ ○ COLLET  —     │
  └─────────────────────┘
  [ Add to order list ]
```

**The drill is a slot of the tap, not a card beside it** (Paul, 2026-09-08).
Both were drawn as bordered cards with a heading and a press each, which reads
as two answers of equal rank to one question. There is one card, one heading,
and one button under all six rows.

**And the three levels are told apart** (Paul, 2026-09-08: "it needs to be clear
that the tap holder and tap collet go with the tap, and the drill is separate
from them and has sublevels"). Six rows at one indent read as six things of
equal rank, so a tap's holder sat the same distance from the left as the drill.
Three things say the levels now: the holding is indented under the tool it holds
behind a rule, the tool row that heads a stack wears the brighter label, and the
drill's branch is boxed — because everything inside it is the drill's rather
than the tap's, which one more indent on its own did not say. `StackRows` draws
the tap and the drill alike, so the two can never be indented differently, and
`components/assembly-tree-panel.test.tsx` holds the levels apart by requiring
every row of the drill to be inside its branch and no row of the tap's to be.

Every other stack is a root of its own, in the order it was added, so a pocket's
rougher and finisher stay siblings — and two roots are two assemblies with a
press each. `treeGroups` is the gathering, and `stacksOf` what one press writes.

**And the roles follow the thread, not the storage.** A tree is kept in the
browser and the thread a hole is read for is not, so a tap stack outlived the
reading that asked for it: the table opened on the taps for a hole the panel
above it called plain (Paul, 2026-09-07: "new hole selections should be treated
as new and default to plain"). `forThread` reconciles the two on every read —
and never touches a stack somebody has put a component in, because that is work
rather than an opening position.

The tap/drill **tabs are gone**. A stack's `role` is what says
which list its tool slot opens, so the two stacks _are_ the two tabs and there
is no second control that can disagree with the tree.

`+ Add assembly` adds an ordinary stack on the end. That is the whole of the
"multiple tools for one feature" answer: a pocket gets a rougher and a finisher
by pressing it once.

## 2a. Before the row exists

**A feature being created has a tree** (Paul, 2026-09-07). Waiting for the row
left the bottom of the page empty during the one moment somebody is actually
deciding — while the tools for the draft were already listed beside it, which
read as broken rather than as not-yet.

"Being created" is wider than the group editor's `draft`: a plain click on a
face previews a reading and offers the two ways in without opening a draft at
all, and that is the commonest way a feature gets made. So the rule is
**anything being asked that has no row of its own** — `asked()`'s preview row
and the group editor alike — and its stacks are kept under `DRAFT_TREE`.

**A stack is selected, not chosen** (Paul, 2026-09-07: "it should also no longer
autoselect the tool component row that I click on"). Clicking a row in any of
the three tables puts that component into the stack on screen and nowhere else —
nothing reaches the list or the order list until the stack's own button is
pressed. The tree says so while it is unconfirmed: _not on the list yet_.

**One press does both.** Where the feature is not a row yet, the stack's button
is still **Add to order list**, and the note under it says it adds the feature to
the list as well. There is no order in which you confirm the feature and then
confirm its tools: they are one decision, and splitting them left a built stack
with no button to press at all. `carryDraftTree` moves the stacks onto the id the
row is given.

**And where the stack is empty, that press keeps the feature on its own** (Paul,
2026-09-10: "I should be able to create a feature or group without adding a
tool"). It reads **Add feature to list** — **Add group to list** for a group —
and it orders nothing: the row goes onto the list marked incomplete, dashed, with
whatever is standing in the stack carried onto it. The moment a component is
picked it becomes **Add to order list** again, in the same place, so choosing a
tool changes what the button will do rather than where it is. A **part-level tool
assembly** is the one subject with no such press: it _is_ its order, so an empty
one is a row about nothing (Paul, 2026-09-08), and its button stays greyed.

**Making the row writes no lines of its own.** `billFor` returns without writing
a line, so what reaches the order list is the assembly whose button was
pressed and no other — the fall-through that gave a new feature the head of the
tool table is gone, and so is the version of it that wrote every stack with a
tool in it because the row was confirmed around them.

**Each unconfirmed question keeps its own scratch stack**, keyed by its tags
(`draftKeyFor`) — the preview and the feature draft alike. One shared key meant a
holder picked while reading one face was still standing after clicking another —
components selected for a feature that was never confirmed. **Only the group
editor** keeps the plain `DRAFT_TREE` key, because its tags change under the
mouse as faces are toggled and a key that moved with them would reset the tree
mid-build. A feature draft was taking that key too, and the key is kept in the
browser: the tap and drill stacks built for one hole were still standing the next
time anybody pressed _Add feature_ (Paul, 2026-09-07). Cancelling a draft drops
them.

## 3. Choosing in any order

`app/shared/assembly-narrowing.ts` — pure, and tested there.

| Chosen | Tools narrow to     | Holders narrow to        | Collets narrow to          |
| ------ | ------------------- | ------------------------ | -------------------------- |
| tool   | —                   | those that could take it | those closing on its shank |
| holder | those it could take | —                        | those of its series        |
| collet | those it closes on  | those of its series      | —                          |

Every rule is symmetric, which is the point: **a CAT40 Kennametal chuck picked
first leaves only the tools it holds and only the collets that fit it.**

**"Could take it" is not "can grip it today"** (Paul, 2026-09-09: "we should
show any holder, even if there is not a collet in the library that works"). A
collet chuck is offered when the shank is inside the size its series is named
for — `holderMayTake` in `@toolpath/catalog-data` — whether or not the crib
stocks a collet that closes on it. The rack was narrowed to the collet drawer
before, so a chuck missing for want of an ER20-6 was indistinguishable from a
chuck that cannot hold the tool at all, and a shop that owns four chucks and
buys collets to suit them was being shown the wrong list. The series name stays
as a loose bound — an ER11 is never an answer for a 25 mm shank — because the
real capacity table is the vendor's and inventing one would be a clamping claim
made up on the spot.

**The tool list follows the same rule** (`holdable` in
`app/shared/holder-choice.ts`). A tool nothing in the crib can hold is counted
rather than offered — Paul's rule from 2026-08-29 — and left strict it undid
this one: the tool never appeared, so the rack it would have led to was
unreachable. It asks `holderMayTake` too, and keeps its geometry half whole.

**Every widened row says why it cannot be built** (`colletGap`), as a `no collet`
badge on the row carrying the reason, in two kinds: _the crib stocks no ER11
collet_ is a drawer nobody has bought, and _no ER20 collet in the crib closes on
this shank_ is one collet to order. `holderCanTake` — the strict claim that a
stack grips — is untouched, and nothing may present a widened row as though it
answered it. Choosing such a chuck leaves the collet slot empty, and that slot
names what to buy rather than asking for the choice to be undone.

**A press in the chrome decides which rack is on screen** (Paul, 2026-09-10:
"can I actually get a button to 'show holders with no collet' in the holder
table?", and "by default, the holders with no collet should be hidden"). The
list opens on what the crib can build this afternoon — every chuck a stocked
collet closes on — and `Show n with no collet` puts the rest on it, each with
its badge. `components/no-collet-toggle.tsx` is the press; it stands left of
`Clear n filters`, or left of the pencil when nothing is set, in
`ToolTableToolbar`'s `before` slot.

It is **not a filter**: it puts rows on the list rather than taking them off, so
it is not counted in `Clear n filters` and clearing a taper does not undo it.
`holdersToOffer` returns both lists — `shown` and `stocked` — rather than taking
a flag, because whichever one the table draws, the press over it has to count
the other, and a flag makes that count a second question that can disagree with
the rows. With the press off, an empty rack says how many holders it is keeping
back (`whyEmpty`), since the narrower rack is the one the page opens on and
"nothing fits" and "something is hidden" read the same on screen.

**The tool list is not behind the press.** `holdable` keeps the wide rule, so a
cutter whose only chucks need a collet nobody has bought is still listed; its
rack opens narrow, with the press above it counting what it is holding back.

**Only the holders that can be drawn are offered** (`holdersToOffer`). A holder
is drawable when it has a measured profile or a published nose diameter, and
under the record seam that means _measured_: a `HolderRecord` carries no
geometry, so on a machine where nobody has run
`pnpm --filter @toolpath/catalog-data profiles` the rack is empty. The panel
beside the table draws the stack as it is assembled, so a holder with no
silhouette puts a blank sheet under a row somebody has just clicked.

What that hides is **counted, never silently dropped** — `N more fit but have no
model to draw` sits beside the heading. An empty list that fits and an empty
list that was filtered read the same on screen and mean opposite things. The
shape rule applies after the fit, so a holder that could not hold the tool is
not counted as one the drawing hid.

Two lists per component, and the difference matters:

- the **pool** is what can hold what is already in the stack;
- the **rows** are the pool narrowed by the filters somebody set.

The column headers offer values off the **pool**. Offering them off the rows
would take every other brand off the list the moment one brand was picked — a
filter that can be set and never unset from the panel that set it.

**An empty list says which choice emptied it** (`whyEmpty`). "Nothing in the
catalog fits" and "what you already picked ruled everything out" read the same
on screen and mean opposite things; only the second is a step somebody can take
back.

## 4. Filtering and reading a holder

`app/shared/component-columns.ts` and `app/shared/component-query.ts`.

Four columns say which one a row is, as on the tool table: **catalog number,
vendor, type, family**. A holder's type is the words a shop uses — `BT30 ER16
collet chuck`. A family has no record in the toolholding data, so the id is
shown as words rather than under a name this repository invented for it. All
four are in the column picker with the rest (2026-09-08): nothing is drawn
outside the column set, so any of them can be hidden or dragged.

Toggleable columns are the vendor's own nine numbers: gauge length, projection,
nose Ø and length, body Ø and length, flange Ø, bore Ø, collet protrusion, plus
taper, clamping, series and contact. A collet's are series, grip range and grip
length.

Every one of them is asked on the heading of the column that shows it
(2026-09-08); a holder list has no filter buttons of its own, because every
question about a holder is a question about one of its columns.

Filters are three kinds and they are different questions:

- **text**, on the catalog number and the vendor together — `REGO` means the
  maker and `2600` means the chuck, and neither is worth a second box. A rack
  is a list somebody often arrives at already knowing the answer to (Paul,
  2026-09-08).
- **terms**, on words — type, brand, taper, clamping, series, contact, family.
  Several values on an axis are an _or_; several axes are an _and_.
- **bounds**, on numbers — gauge length at most 80 mm. Millimetres, whatever the
  box was typed in.

**Type is a list, and it is the shortcut through three columns** (Paul,
2026-09-08: "I should be able to filter by holder type as a list … same with
collet type"). `BT30 ER11 collet chuck` is one line of it, and taper, clamping
and collet series still ask for themselves underneath: one press for every BT30
in the rack, or one for every BT30 ER11 collet chuck in it.

A record that states nothing on a constrained axis is **refused**, not passed:
a series filter must not match a shrink-fit chuck, and a gauge-length bound must
not match a holder that publishes none. That is `matchesFilters`' rule, applied
to this catalog's own axes.

## 4a. The length below the holder

`belowHolder`, `app/shared/drawn-assembly.ts`.

**The tool list's _Length below holder_ column is about the stack, not about
the tool** (Paul, 2026-09-08: "we can plainly see that more of the tool is
beneath the holder"). It printed `geometry.LBH`, which `stickout.ts` defines as
that same function asked with **no holder and no feature** — 0.625 in on a ⌀0.25
end mill — while the panel beside it drew the very same tool 2.125 in out to
reach the bottom of a 2.066 in pocket. Two numbers for one length, on one
screen.

Nothing was wrong with the machinery; the tree walked away from it. The column
asked `Holding.requiredStickout`, which reads a holder picked **in a dropdown on
the row** — and those dropdowns came out with the flag on 2026-09-08, so nothing
has set that holder since and every row fell back to the tool's own figure.

A holder is the assembly's now, so the question is asked of the assembly once
per row: the least the stack has to stand out to clear the part by the shop's
margins (0.020 in up and 0.020 in sideways by default), floored by flute length

- diameter and landed on the shop's increment. That is `drawnAssembly`'s
  stickout and nothing else, so **the row, the drawing and the panel's `LBH` are
  one derivation** — which is the whole reason `stickout.ts` exists. A tool too
  short to be set that far out says both lengths instead: `needs 70 mm out, holds
45 mm`.

With no holder in the stack the column falls back to the tool's own setup
length, which is the honest answer while nothing holds it.

The verdict under the drawing names that length too — `at 2.125 in below the
holder · tightest: …` — because a stack clears at one stickout and fouls at
another, and a verdict with no length on it is a verdict about nothing in
particular (Paul, 2026-09-08: "it's not clear what length below holder this
applies to").

## 5. What reaches the bill

Nothing changed about the bill. It is still one sheet,
`tool-catalog.setup.<partId>`, keyed by feature tag, holding
`{ toolGuid, holderGuid?, colletGuid? }` lines — `FEATURE-LIST.md` §9.

What changed is where a line comes from:

- **The tree is the working stack.** A holder can stand in it with no tool yet,
  which is what makes starting from a holder possible at all. That state has
  nowhere to live on the sheet, so the tree is kept per part in `localStorage`
  under `tool-catalog.trees.<partId>`, `useFeatureList`'s twin.
- **A stack is the line's identity, not its tool** (Paul, 2026-09-07: "when
  editing an already active assembly, a tool not in the order list should say
  'replace' in the active assembly. Right now it is adding a new assembly to the
  feature"). A line on the sheet is keyed by its tool, so a stack that swapped
  cutters looked up nothing and read as never ordered — and its button offered to
  add a _second_ assembly to a feature that has one. `orderedTool` on the stack
  is the link back: what the sheet holds for this stack, written by the press
  that put it there, carried onto the row when a draft is confirmed, and read off
  the bill by `treeFromLines`. `savedFor` looks up that first and the tool
  standing in the stack only as a fallback, so a swap offers **Replace TDMX0800
  with TDMX1200** — one press that takes the old line off and puts the new one
  on, with whatever holding moved with it said underneath.
- **The stack's own button is where it is confirmed, and it is on screen from
  the start.** `assemblyActions` decides which of **Add to order list** (row or
  no row), **Replace A with B**, the update and **Remove from order list**
  apply. A stack with nothing in it to order and a row already on the list gets
  the same **Add to order list** in the same place, **greyed** (Paul,
  2026-09-09: "Add to order list should be shown by default but greyed out until
  a component is selected. Right now it is hidden by default") — a button that
  appears the moment a table row is clicked says nothing about what the table is
  for. An empty stack with **no row yet** gets **Add feature to list** instead,
  enabled, because that is the one thing an empty stack can do (Paul,
  2026-09-10). Both are `nothingYet` in `assembly-actions.ts` — the same states
  `tool-actions` distinguishes for one tool,
  asked of a stack. The update appears only when the holding differs from what is
  saved. Named for the page the press is _for_: "Add to feature" named the row it
  wrote against, and the order list is what a shop reads.
- **A stack nobody has ordered adopts no line** (Paul, 2026-09-10: "when I
  select the same tool as a second assembly for a feature, it autofills
  everything and does some odd stuff — secondary assemblies added to a feature or
  group should be treated as unique, new assemblies"). `savedFor` fell back to
  the tool standing in the stack, so a second assembly given the first's cutter
  found the first's line and _became_ it: its empty holder slot drew the other
  stack's holder struck through to a dash, and the press under it offered to take
  that holder off. `orderedTool` is now the whole of the link — every stack
  genuinely on the bill carries it, and the field already documented its own
  absence as _not on the order list_.

  **The double-up is said where it is made**, too (Paul, 2026-09-10: "would it be
  possible to flag duplicates when they are added, even if an assembly has not
  been added to the list yet? Show a (×2, used in Assembly 1) in the feature
  dialog"). Every slot holding a component another stack of the tree holds wears
  `×2, used in Assembly 1` — `sharedWith` / `sharedPhrase` in
  `app/shared/assembly-tree.ts`, read across _every_ slot rather than the same
  one, because a collet bought twice is two collets whichever row it sits on. The
  table's own mark is about the order list; this is about the tree in hand.

  **And two of one assembly are counted rather than collapsed** (Paul,
  2026-09-10: "duplicates are now showing up as separate line items — in either
  order list view … that should show 2 assemblies and a count of two of each
  component"). The sheet keys a line by its tool, so a row cannot hold the same
  cutter on two lines — what it holds is `Choice.total`, how many of that
  assembly, which `componentTotals` has always multiplied every component by.
  Nothing was writing it: `applyStacks` in `routes/part.tsx` now counts the
  stacks of the row standing as that cutter and writes it, the part page's line
  wears the `×2`, and taking one of two off leaves the line with a one on it
  rather than removing it.

  **What is still keyed by the tool is the line itself.** A row holding one
  cutter in two stacks _with different holding_ — the same end mill at two
  stickouts — cannot keep both: the second overwrites the first. Counting fixes
  the identical case, which is the one a shop hits; the general case needs a line
  keyed by the stack that ordered it rather than by the tool in it.

- **Enter is about the box; the button is about the assembly** (Paul,
  2026-09-10: "when I create two tool assemblies on a group and click enter, it
  only adds the first to the list. It should add everything that is currently in
  the dialog"). A pocket's rougher and its finisher each carry a press, because
  each is a thing a shop orders on its own — but the key that stands for
  _finishing the box_ means all of them. `orderPress` in `routes/part.tsx`
  folds every group with an ordering press to make; the write itself is
  `applyStacks`, one function for the button and the key, because a loop over
  the buttons would have each of them computing from the state before the last:
  the second line would undo the first, and the row would be made twice.
- **_Add assembly_ opens the new stack on its tool** (Paul, 2026-09-10: "focus
  shouldn't go immediately to renaming a tool assembly when a new one is added —
  it should start at the default name and focus should go to the tool component
  selection for it. We can always rename later"). It used to open the name field
  on the stack it made, on the 2026-09-08 rule that a stack is named when it is
  made; the press is for _another cutter_, so what it put on screen was a text
  box over an empty stack and the next thing to do was dismiss it. The pencil
  beside the card is still there whenever a better name turns up.
- **The update button says what pressing it changes**, naming both components:
  _Change holder from BT30-ER16-100DT to BT30-ER11-60_ (Paul, 2026-09-07). With
  the stack drawn once and the button under it, the one sentence left to say is
  what is different about it, and "Update assembly" said nothing.
  `holdingChanges` is the diff, holder first; a name the route cannot resolve
  degrades the sentence to _Change the holder_ rather than printing a guid.
- **A change can be backed out of.** Cancel appears exactly when the update
  does — they are the two answers to the same question — and names what it would
  keep: _Cancel — keep BT30-ER16-100DT_. It puts the stack back to the bill's
  line (`restoreAssembly`, every slot at once) and touches the sheet not at all,
  because the change was never written. Without it, backing out of a swap meant
  remembering what had been there and finding it again in a table of two hundred
  (Paul, 2026-09-07).
- **And it floats to the top of the rack** (Paul, 2026-09-07: "can we float
  confirmed tool assembly components to the top of the table lists?"). The tool
  list has had that rule since 2026-08-31 (`keptFirst`); `firstBy` in
  `shared/tool-order.ts` is the same partition asked of a holder or a collet, so
  the row wearing **on the feature** is the row somebody lands on. A partition
  rather than a sort: a column somebody sorted by still decides everything else.
- **And it says what is already being bought, and for what** (Paul, 2026-09-07:
  "holders and collets should show if they are already in use the same way that
  tools do (float to the top and badge) … it should note which feature and
  assembly they are used in in the badge"). `shared/component-usage.ts` walks the
  list once and answers, per guid, which rows and which stacks hold it — the
  stack found by what it was _ordered_ as, so a swapped cutter still points at
  its own line. The badge names the first in full and counts the rest, with all
  of them in its tooltip; anything on the order list floats up the rack, under
  the one this feature holds.
- **The list marks what the feature already has.** The row on the bill for the
  open slot wears **on the feature**; a component standing in one of this
  feature's other stacks wears **in Assembly 2** / **in TAP**, naming which
  rather than saying "in this tree" (Paul, 2026-09-07). `assemblyName` is the one
  place a stack is named, so the tree's heading and the badge cannot disagree —
  including when the stack has been given a name of its own, below.
- **What else the press moves is flagged under it.** `setSlot` clears the collet
  whenever the holder changes — a collet is an interface to one holder's series —
  so a second changed slot becomes a line under the button saying so. A button
  that silently drops a collet somebody chose is what that line prevents.
- **A row's tags all get the line.** A bolt circle of eight identical holes is
  one row and eight tags; the sheet is keyed by tag, so one press writes eight.
- **A tree read back off the bill.** A part answered before this shape existed
  has lines and no tree; `treeFromLines` opens on those, so nothing answered
  under the old panel reads as work lost.

**A stack can be named** (Paul, 2026-09-08: "I need to be able to name tool
assemblies — when they are created, through any mechanism"). `Assembly 1` and
`Assembly 2` are positions rather than names, and a pocket's rougher and its
finisher are the case where which is which is the whole decision.

- The card's heading is the way in: press it, and the field replaces it.
  `+ Add assembly` opens the field on the stack it makes — **a stack is named
  when it is made**, because a name asked for later is a name most stacks will
  not get. The id is arithmetic (`nextAssemblyId`), so the press knows which
  stack it is about before the tree carrying it comes back.
- `TreeAssembly.name` is optional and stays optional; `assemblyName` falls back
  to `defaultAssemblyName`, which is the number or the role — and that default
  is the field's placeholder, so naming never hides what the stack is called
  now. `renameAssembly` trims what is typed and treats an empty name as no name,
  which is the way back.
- **A part-level assembly's tree has no add press at all** — it answers no
  feature, so the second stack it would make is another _+ Tool Assembly_ row
  instead. `onAdd` is optional on the panel for exactly that, and the route
  withholds it while the tree is the part's rather than a feature's.
- It is the same control the feature list names a part-level assembly with —
  `components/name-field.tsx`, `docs/FEATURE-LIST.md` § _Naming a tool assembly_
  for what Enter, Escape and a click elsewhere each mean.
- A name is somebody's words, so the heading stops shouting it: the upper-case
  treatment is the number's, not the name's.

**A holder on its own is not orderable**, and the panel says so rather than
offering a button that would write half a line.

## 5a. Overruling the rules, one column at a time

**The filters are the last word** (Paul, 2026-09-08: "I need the ability to
override the geometric filters created by the geometry — for example, I may
want to use a larger tool than required. When I change the filter, it currently
shows me 'no tools match'").

Two things narrow the tool list and they come from the same place. `rules.csv`
judges each tool against the feature, and `suggest-filters.ts` writes the `must`
bounds of those same rules into the filter controls as ranges. So widening one
of those ranges asks for precisely the tools the rules go on to remove, and the
answer was an empty table with the reason two panels away.

**The press is in the column's own dialog, not in the chrome** (Paul,
2026-09-08: "the override the rules button should be in the filter dialog rather
than always shown, and should only override for that specific rule … it should
recognize if I enter something to override the rules and warn me to confirm
it"). A control over the whole list would forgive rules nobody looked at; the
Diameter dialog forgives the diameter rows and nothing else.

What happens, in order:

1. **A number of somebody's own raises the note.** `OverrideNotice`
   (`app/components/column-filter.tsx`) appears once the column holds a bound
   that is not simply the suggestion left untouched — including one typed on a
   column the sheet never bounded, because that is the same act and gating on a
   suggestion left such a column unoverridable while its rules held tools off
   the list. It says what the geometry asked for —
   in the unit being read in, through `sayBound` in `shared/column-filters.ts`.
   Quiet, in the page's ordinary text colour (Paul, 2026-09-08: "the colouring
   on the messaging should be less dramatic and not yellow"): running a larger
   cutter than the geometry needs is an ordinary thing to do, and an alarm
   around it said it was a mistake.
2. **A press confirms it** — `OverrideToggle`, one small chip in the dialog's
   chrome beside the tick, saying _Override rules_ and nothing else (Paul,
   2026-09-08). A full-width button under the boxes read as the dialog's main
   action, which is the number above it. The count is
   `overridableTally` (`app/shared/tool-fit.ts`), measured over the whole
   removed set in the worker, and counts only the tools this column **alone**
   is holding back: one turned down on both its diameter and its flute length
   is not brought back by forgiving either, so promising it under both would
   promise a row that never appears.
3. **The matcher answers the narrower question.** `MatchContext.overrides` names
   the forgiven columns; `overridableTools` returns the removed verdicts the
   filters admit **whose every reason belongs to a forgiven column**. A tool
   removed for being the wrong kind of tool has no column at all — `columnOfRule`
   in `shared/tool-marks.ts` answers `null` — so no filter can forgive it.
   `matchKey` leaves the overrides out of a recommendation batch, the way it
   already leaves the display unit out: a one-each pick is never drawn from the
   removed set.
4. **The rows appear under the ones that fit**, with the same red marks on the
   same columns; the chrome says a note, not a control — and says how many were
   left out where the cap bites. The cap is the table's own row cap, not a
   smaller one: at 200 it was nearest-first, so asking a 38,000-tool catalog for
   `diameter at most 0.500 in` against a pocket wanting 0.400 in filled every
   slot with ⌀12 mm cutters and never reached the 663 half-inch ones the filter
   had been typed to find (Paul, 2026-09-08). A cap that hides the end of the
   range somebody widened _to_ is worse than no override at all.
5. **The stack records it.** `TreeAssembly.overrides` names the slots filled with
   something the rules removed, and `assembly-tree-panel` draws a caution glyph
   on those rows with the rule's own sentence behind it (`overrideNote`). Kept
   rather than derived: a verdict exists only while the tool is in an answer,
   and clearing the range that admitted the cutter would take the warning with
   it. Filling that slot with something that fits, clearing it, or backing the
   stack out to the bill's line all take the mark off.
6. **The number and the forgiveness are one decision, both ways.** Backing the
   bound out to the geometry's own ends the override, and turning the override
   off puts that bound back — cleared, where the geometry asked for nothing,
   which is equally its answer (Paul, 2026-09-08: "if override rules is off, it
   should go back to the filter defined by the geometry"). Dropping only the
   forgiveness left the widened bound standing over a list the rules then
   emptied: the dead end this control exists to remove, reached by pressing the
   control. A different feature drops all of them.

**A row is an override by its verdict, not by which list drew it.** The nearest
misses stand in when nothing fits and they are removed tools too, so picking one
of those is the same decision and gets the same mark.

**And every filter now closes on a tick** (Paul, 2026-09-08: "I should have a
check box icon to confirm filters on every filter, which just closes it saved at
the current state"). A filter commits as it is typed, so the tick saves nothing
— what was missing was somewhere to say _done_ other than a click on the page,
which is the one gesture indistinguishable from a misclick. It is on
`FilterMenu`, so all three lists have it.

Not built: the bill says nothing about it. A line on the setup sheet carries a
tool, not why it was picked, so a tree read back off the bill by `treeFromLines`
comes back with nothing overridden. The tree itself is kept in the browser and
does carry it.

## 5b. Asking for a tool the list is not showing

**A column can only offer what the list is holding, and that is not always the
whole question** (Paul, 2026-09-08: "there is no way to show end mills if I
can't find a drill … End mills are technically a valid tool to predrill for the
tap, just usually not the first choice. I should always have a '...' row at the
bottom of the recommended filter options to expand any filter to show what it's
hiding from the list in any filter that is limited contextually").

A term column offers the values the answer holds, counted over the rows the
matcher returned. With a feature on screen that list is already narrow, so a
threaded hole's Type column offered `Drill` and nothing else — the values a shop
might want to _ask_ for were exactly the ones it could not see. Three separate
things were hiding the end mills, and it is worth naming all three because
fixing one alone changes nothing:

1. **The `form` filter.** Choosing a thread writes `THREADED_FORMS` — the drill
   and the taps — and `prepareMatch` judges only what the terms admit, so no end
   mill was ever judged.
2. **The type table.** `feature-defaults.csv` gives a feature its forms and
   `judge.ts` removes anything else before a rule reads it. A blind hole
   considers end mills; a `Thread`, a T-slot or a tapered hole does not.
3. **The drills-only list.** A threaded hole's tool list was `drill` plus the two
   forms the predrill press writes, so a mill could be judged, fit, and still be
   dropped on its way to the screen.

What the page does now:

- **The `…` row.** Under the values a list holds, `TermFilter`
  (`components/column-filter.tsx`) draws one row saying how many more the axis
  has. Pressing it lists them, greyed at nought, tickable — the filter panel's
  own rule since 2026-09-01, that a value which could return something stays
  pressable, reaching the values a contextual list never offered at all. The
  search box reaches behind the row too, so `end mill` is one word rather than a
  scroll. The values come from the whole catalog (`hiddenOn` in `routes/part.tsx`
  against `TOOL_TERM_AXES`), because what is behind the row is what exists.
- **A type ticked is a form asked for.** The Type column narrows on a phrase and
  the phrase is not what decides whether a tool is judged, so ticking
  `Flat end mill` on a threaded hole narrowed a list of drills to nothing.
  `formOfTypeLabel` reads the phrase back to its form — `typeLabel`'s own
  inverse, in the same file so the two cannot drift — and `formsAsking` folds it
  into the `form` filter: the geometry's own forms are never taken away, an
  untick gives back only what that tick added, and anything else in the filter
  (the predrill press's additions) stands.
- **The type table stands down for a form the filter asks for**, and only the
  type table — `JudgeOptions.asked`, fed from `context.query.terms.form`. Every
  rule still reads the tool and every filter still narrows it: an end mill too
  wide for the bore is removed by name, by the end-mill diameter row, and comes
  back through the Diameter column's own override or not at all. **This is not
  an override** (Paul: "this is not really an override, it is just the ability to
  add a potentially compatible group of tool types to the list").
- **The drill list shows what the filter asks for**, `predrillFormsOf` in
  `shared/hole-mode.ts`: drills, and any other cutter named in the `form` filter.
  Taps stay out of it — they are the other half of the same feature and have a
  list of their own. `drillsFirst` still leads with the drills, which is the shop
  rule the press was written for.

Because the state is the `form` filter and nothing else, there is no second
control to disagree with the predrill press, no context field, no cache key and
no per-question reset: a new feature rewrites that filter the way it always did.

Its end-to-end coverage is `offers what the Type column is not showing, and asks
for it` in `tests/on-the-part.spec.ts`: on the cube, the crib's drills are
exactly what a face's list does not hold.

### What a group costs to answer

Asking for a type the list did not hold made an existing cost visible (Paul,
2026-09-08: "they are taking a bit to come in … this is a 42 tool group. We
should optimize for up to 150 or so"). Judging is proportional to the catalog,
and `fittingTools` ran **one full pass per feature in the group** — 42 passes
over some 9,000 tools, holding every pass's verdicts to fold at the end. A
150-hole group did not merely crawl: it exhausted the worker's heap.

Two rules now, both in `app/shared/tool-fit.ts`:

- **A group asks as many questions as it has distinct ones.** `judgeTools` reads
  a feature through exactly two things — its `featureType` and its `sheetOf`
  reading — so two features equal in both cannot be told apart by any rule, and
  the second is arithmetic already done. A bolt circle is one question;
  `distinctQuestions` is the rule and a group built by hand out of genuinely
  different features still judges each of them.
- **The fold happens as it judges, not after.** A tool removed by one question is
  removed, so the next question is only asked of the tools still standing —
  `foldOnto` in `judge.ts` folds one tool at a time. Nothing holds a verdict per
  tool per feature any more, which is what the heap failure was.

What it costs, measured against the scraped 38,114-tool catalog and its 555
holders, for the screenshot's `#4-40` hole:

| group               | before         | after  |
| ------------------- | -------------- | ------ |
| ×4 identical holes  | 435 ms         | 123 ms |
| ×42 identical holes | ~4.6 s         | 114 ms |
| ×42 distinct holes  | ~4.6 s         | 244 ms |
| ×150 distinct holes | heap exhausted | 343 ms |

A third of a second went with them: the Type column's own phrase — `typeLabel`,
read for all 38,114 tools whenever that axis is filtered or counted — is worked
out once per form name rather than once per tool (`WORDS` in
`shared/tool-type.ts`), which took `prepareMatch` from 110 ms back to 30 ms.

The trade is stated where it is made: a tool the first question removes carries
that question's reasons and not the rest of the group's. `ruleTally` and the
panel already read only the first, and a near miss is measured against the
feature that turned it down — which is the feature somebody is looking at.

Not covered: the holder and collet racks. Their options are narrowed by
geometry — the tool's shank, the reach curve — rather than by a count over a
list, so a `…` row there would offer values that still cannot appear. Widening
that is the incompatible-components path, not this one.

## 6. The flag, and its removal

It shipped behind `assemblyTree` on 2026-09-07 — on by default, one press in the
header to go back — because it replaces enough of the page at once that "put it
back the way it was" had to be cheaper than a revert.

**It came out on 2026-09-08** (Paul: "things are working well with the Tool Tree
flag enabled … the flag should now be removed"). `app/shared/flags.ts`, its test,
the **Tool tree** chip and the `assemblyTree` props on `AppHeader` are gone,
every branch was taken on its tree side, and the panel it replaced went with it:
no `holding` dropdowns on a tool row, no tap/drill tabs, no count badge beside
the list heading, and `Use this tool` became `Add this feature` — which came off
in turn on 2026-09-09, along with the group editor's confirm and both Cancels:
the press under the stack makes the row and orders the assembly in one go, and
an **X** in the top right of the box is the way out of all three. See
`docs/FEATURE-LIST.md` § _The X in the corner_.

What went with it that had no home under the tree: the **Show compatible end
mills** press, which lived inside the drill tab and so had already been
unreachable whenever the flag was on. The filter it pressed —
`formsWithMills` — is untouched and still reachable from the type filter.

`openCube` no longer takes flags: there is one shape, so a spec says nothing and
gets it.

## 7. Where the rules live

| Rule                                              | File                                             |
| ------------------------------------------------- | ------------------------------------------------ |
| what a tree holds, its slots, its storage         | `app/shared/assembly-tree.ts`                    |
| what a threaded hole starts with                  | `defaultAssemblies`, same file                   |
| the stacks following the thread on the hole read  | `forThread`, same file                           |
| how the stacks nest, and their drawing order      | `treeRows`, same file                            |
| what narrows what                                 | `app/shared/assembly-narrowing.ts`               |
| whether a chuck is worth offering with no collet  | `holderMayTake`, `@toolpath/catalog-data`        |
| why an offered chuck cannot be built today        | `colletGap`, `app/shared/assembly-narrowing.ts`  |
| whether the rack shows them, and how many         | `holdersToOffer` `shown` / `stocked`, same file  |
| the press that decides, and its words             | `app/components/no-collet-toggle.tsx`            |
| what a stack offers, and its button's words       | `app/shared/assembly-actions.ts`                 |
| which press orders, and which Enter stands for    | `isOrdering` / `orderingPress`, same file        |
| which layer one press of Enter or Escape reaches  | `useKeyLayer`, `app/shared/use-escape.ts`        |
| whether the page stands down for an open filter   | `columnFilterOpen`, same file                    |
| how tall a filter menu is, and which way it opens | `place`, `components/column-filter.tsx`          |
| what overruling the rules offers                  | `overridableTools`, `app/shared/tool-fit.ts`     |
| what an axis has that the list is not showing     | `hiddenOn`, `app/routes/part.tsx`                |
| the `…` row that offers it                        | `TermFilter`, `components/column-filter.tsx`     |
| the form behind a Type phrase                     | `formOfTypeLabel`, `app/shared/tool-type.ts`     |
| what a tick on Type asks the form filter          | `formsAsking`, same file                         |
| the forms the type table stands down for          | `asked`, `app/shared/judge.ts`                   |
| how many questions a group actually asks          | `distinctQuestions`, `app/shared/tool-fit.ts`    |
| folding one tool's verdicts as they are judged    | `foldOnto`, `app/shared/judge.ts`                |
| what a threaded hole's drill list may show        | `predrillFormsOf`, `app/shared/hole-mode.ts`     |
| how many each column alone holds back             | `overridableTally`, same file                    |
| which column a rule is about                      | `columnOfRule`, `app/shared/tool-marks.ts`       |
| the note a changed filter raises                  | `OverrideNotice`, `components/column-filter.tsx` |
| the press that confirms it                        | `OverrideToggle`, same file                      |
| `at most` meaning at most across a unit change    | `BOUND_SLACK`, `app/shared/filter.ts`            |
| which slots were filled against the rules         | `overrides`, `assembly-tree.ts`                  |
| the words a warning says                          | `overrideNote`, `app/shared/tool-marks.ts`       |
| what a whole assembly offers, over all its stacks | `groupActions`, same file                        |
| which stacks make up one assembly                 | `treeGroups` / `stacksOf`, `assembly-tree.ts`    |
| what the bill already holds for a stack           | `savedFor`, same file                            |
| putting a stack back to the bill's line           | `restoreAssembly`, `assembly-tree.ts`            |
| what a stack is called, and where a part stands   | `assemblyName` / `heldIn`, same file             |
| the name somebody gave a stack, and clearing it   | `renameAssembly`, same file                      |
| the field a name is typed in, in both places      | `app/components/name-field.tsx`                  |
| the length below the holder a stack needs         | `belowHolder`, `app/shared/drawn-assembly.ts`    |
| the words the clearance verdict is said in        | `verdictNote`, `components/catalog-drawing.tsx`  |
| the columns a holder and a collet are read on     | `app/shared/component-columns.ts`                |
| narrowing a rack by brand, type, family, a number | `app/shared/component-query.ts`                  |
| which of the three lists the table is             | `listKind` / `chooseList`, `routes/part.tsx`     |
| the tree on screen                                | `app/components/assembly-tree-panel.tsx`         |
| the holder and collet tables                      | `app/components/component-table.tsx`             |
| their filters                                     | `app/components/component-filters.tsx`           |
| the component being read                          | `app/components/assembly-panel.tsx`              |
| everything wired together                         | `app/routes/part.tsx`                            |

Each pure module owns its tests. The tree's own end-to-end coverage is the
`the tool assembly tree` block in `tests/on-the-part.spec.ts`, against the cube
fixture — three holders and five collets, so it is a small claim about a small
crib, which is the claim.

## 8. Not built

- **A stickout is not a slot.** It is a number on a line rather than a component
  to pick, and it is still set where it was.
- **The drill has no trash of its own.** The one on the assembly's heading takes
  the tap and the drill together, because a tap removed on its own leaves a
  drill hanging under nothing — which the next read makes a stack of its own: a
  hole drilled for a thread nobody is cutting.
- **The tree does not reorder.** Stacks stay in the order they were added, the
  way the feature list does — the one exception is a threaded hole read back off
  a bill, where `treeFromLines` puts the tap first however the lines are ordered,
  because a drill labelled `TAP` opens the tap list on a drill.
- **`ComponentTable` is a sibling of `PartToolTable`, not a generalisation.**
  That table carries the rules' marks, the holding comboboxes and the bill's
  badge, all of which are about a _tool_; threading a row type through them would
  have put every one behind a conditional to gain a shared shell. If a third
  kind of component ever wants a table, extract then.
- **The tool table is handed no `holding`**, deliberately: the holder is a slot
  of the stack with a table of its own, and a second way to set it from a
  dropdown on the tool row is the defect the tree exists to remove. The prop is
  still on `PartToolTable` — the component's own tests cover it — and the part
  page passes it from nowhere.
