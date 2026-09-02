# The tool catalog, specified

_As of `paul/interactions`, 2026-09-02. Companion to `FEATURE-LIST.md`, which is
the part page in full detail; this is everything else, plus the open questions._

> **The whole application is one sentence.** As a user, I want to find the right
> tool or tools for a feature or a group of features, and save the tool assembly
> to a list. Everything below either serves that sentence or is in the way of it.

| §                                             | Open questions |
| --------------------------------------------- | -------------- |
| [How I use it](#as-a-user)                    | 1              |
| [The screen](#the-screen)                     | —              |
| [1 Tool filters](#1-tool-filters)             | 3              |
| [2 The feature list](#2-the-feature-list)     | 2              |
| [3 The tool table](#3-the-tool-table)         | 3              |
| [4 The 2D tool viewer](#4-the-2d-tool-viewer) | 2              |
| [5 The order list](#5-the-order-list)         | 4              |
| [6 Threaded holes](#6-threaded-holes)         | 4              |
| [7 Tool matching](#7-tool-matching)           | 3              |

---

## As a user

Seven walkthroughs, in the order a shop meets them. Button names are exactly
what is on screen.

### 1 · One feature, one tool

_The fast path, and the one most jobs are made of._

1. Upload the part and wait for the analysis.
2. Click a face. The table below fills with what cuts it, best first, and the
   panel on the right assembles the top row.
3. Don't like the top row? Click another. The panel follows.
4. Press **Add tool**. The feature appears on the list with that tool under it,
   and the tool is on the bill.

### 2 · A hole that turns out to be threaded

_Two tools, chosen on different numbers._

1. Click the hole. The panel offers the threads its diameter reads as, closest
   first.
2. Pick _M3×0.5_, then _Cut tap_. Each option shows the hole it starts from and
   how far the model is from it — red means no standard drill makes both.
3. The table splits into **Taps** and **Drills**. Taps first, because the thread
   is the decision.
4. Pick a tap, press **Add tool**.
5. Switch to **Drills** — already judged against the tap drill, not the hole as
   modelled. Pick one and press **Add this tool**.
6. The row now holds both, and the bill has two lines.

### 3 · One tool for a lot of features

_"Can one end mill do all of these?" — the question worth answering before
quoting._

1. Press **Add group**.
2. Click the faces on the part, or press a quick button — _Wall 16_ adds every
   wall at once. Click a face again to take it out.
3. Leave _One tool for all of them_ selected.
4. The table below is already showing only what cuts _every_ feature in the
   group. If it is empty, no single tool does it.
5. Press **Create group and add tool**.

### 4 · Let it choose, for a mixed group

_Six different features, six different answers, one press._

1. **Add group**, pick the features, then choose _The best tool for each_.
2. The table stops listing tools and says why: the question is one per feature.
3. Press **Create group and add tools**.
4. Open the folder in the list. Every feature has its own tool underneath it.
5. Press any of those tools to see the full offer for that one feature, if you
   want to overrule it.

### 5 · Changing your mind

_A second thought about a feature that already has a tool._

1. Press the tool under a row. It opens in the panel, which says what it is on
   the list for.
2. Click a different row in the table. The panel now offers two things:
3. **Replace B976Z02500** — swap it out, one tool where there was one.
4. **Add this tool** — keep both. This is how a hole gets a spot drill and a
   drill.
5. **Remove tool** takes one off. Removing the last one takes the row off the
   list too.

### 6 · Adding the holder later

_Deciding the cutter now and the holding when the job is real._

1. Open a tool that is already on the list.
2. Choose a holder, then a collet. Only holders that grip the shank and clear
   the part at the stickout this feature needs are offered.
3. The drawing updates, with the clearance around it.
4. Press **Update tool assembly**. Every feature that tool cuts gets the same
   holding.

### 7 · Taking it away

_What all of this was for._

1. Open the **Order list** tab.
2. Every component is its own row — tool, holder, collet — with its own quantity
   and its own way to the vendor's page.
3. Type the quantities.
4. Press **Fusion tool library** to save the whole bill as a file CAM can
   import.

> **Open question — there is no walkthrough for "I already know the tool".**
> Every path above starts from the part. A shop that wants to check whether a
> tool it already owns will cut a feature has to find it in the table by number
> and read the marks — which works, but nobody designed it.

---

## The screen

One page does nearly all of it: the part, the questions you ask about it, and
the tools that answer them.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Tool catalog  (17470)                     Part | Order list ⑤     mm/in │
├────────────────────────────────────────────────────┬─────────────────────┤
│ ┌────────┐ ┌──────────────┐ ┌───────────────┐      │  TDMX1200           │
│ │FILTERS │ │ FEATURES  ②  │ │ NEW GROUP     │      │  On the list for    │
│ │ vendor │ │ 4 × Through  │ │ [chips…]      │  ▟▙  │  Pocket             │
│ │ family │ │   B976Z02500 │ │ ( ) one/all   │ ▟███▙│  [ Remove tool ]    │
│ │ type ① │ │ Pocket       │ │ (•) one each  │ ▜███▛│  ┌───────────────┐  │
│ │ shank  │ │   TDMX1200   │ │ [Create group]│  ▜▛  │  │ holder/collet │  │
│ │ …      │ │ [+feature]   │ └───────────────┘      │  │  the drawing  │  │
│ │        │ │ [+group]     │   ← the part           │  │  + clearance ④│  │
│ │        │ │ M3×0.5    ⑥  │                        │  └───────────────┘  │
│ └────────┘ └──────────────┘                        │                     │
├────────────────────────────────────────────────────┤                     │
│ Cuts every feature in the group   9490 removed  ③  │                     │
│ CATALOG NO.  VENDOR   DIAMETER ▾  FLUTE LENGTH ▾   │                     │
│ TDMX1200     WIDIA    12.00 mm ✓  26.00 mm ✓       │  ⑦ rules + crib     │
│ TDMX0800     WIDIA     8.00 mm ✓  19.00 mm ✓       │     decide these    │
│ TDMX0500     WIDIA     5.00 mm ✓  13.00 mm ✓       │     rows            │
└────────────────────────────────────────────────────┴─────────────────────┘
```

| #   | Region        | Its job                                             | Reads                 | Writes                |
| --- | ------------- | --------------------------------------------------- | --------------------- | --------------------- |
| 1   | Filter rail   | Narrow the catalog to what a shop would buy         | the URL               | the URL               |
| 2   | Feature list  | Hold what has been asked about, and its answers     | the part, the sheet   | the list, the sheet   |
| 3   | Tool table    | Offer every tool that answers the current question  | rules, filters, crib  | nothing               |
| 4   | Tool panel    | Assemble a tool, and decide what happens to it      | the selected tool     | the sheet, the list   |
| 5   | Order list    | Show what has been decided, as a thing to buy       | the sheet             | quantities            |
| 6   | Thread picker | Say what a hole is threaded for, and how it is made | the hole's diameter   | the predrill, filters |
| 7   | Matching      | Decide which tools fit, and in what order           | three CSVs, datasheet | nothing               |

### How a click becomes a bill line

```
  a click            THE QUESTION           the tool table        the panel          the bill
  or a list  ─asks→  these features,  ─judged→  ranked,     ─picked→  add ·   ─writes→  one line
  row                all or each                marked               replace ·          each
                          ▲                        ▲                 remove                │
                          │                        │                                       │
                          └───────── and answers the row it came from ─────────────────────┘
                                     rules · filters · crib
```

The return path is what makes the list the source of truth: once a tool is on
the bill for a feature, that is what the row says — the decision, not the
recommendation.

### Everything, in one screen

- **Upload a part**, watch it analyse, and click a face to see what cuts it.
- **Build a list** of features and groups — the things you are asking about.
- **Narrow the catalog** by vendor, family, type, material, shank, and any
  number column.
- **Read the offer**: what fits, in the rules' order, with a mark on every
  number they read — and the near misses when nothing fits.
- **Assemble a tool** with a holder and a collet, and see it drawn with its
  clearance.
- **Save it to the list**: add, replace, add another, or remove. Removing the
  last one takes the row with it.
- **Say a hole is threaded**, pick cut or form tap, and get taps and drills as
  two tabs judged against the right predrill.
- **Take the bill away** as an order list, or as a Fusion tool library.

**Where it lives**

- `apps/catalog/app/routes/part.tsx` — the whole screen, wired together — the last place to look
- `apps/catalog/app/shared/` — the rules, each in its own module and tested there
- `apps/catalog/app/components/` — what draws them

Paths below are relative to `apps/catalog/` unless they say otherwise.

---

## 1 Tool filters

Filters narrow the catalog to the tools a shop could actually buy and hold. They
never decide whether a tool _fits_ — that is the rules' job — so a filter is
always somebody's preference, and always visible and reversible.

### What they are

- **One query object** — free text, discrete _terms_ (vendor, family, product
  line, type, material, shank, flutes), and continuous _ranges_ in millimetres.
  It is the only thing that decides which tools are on screen.
- **It lives in the URL.** A filtered view is a view you can send to a
  colleague; that only works if it round-trips through the query string without
  loss.
- **Free text is identity, never geometry** — catalog number, material number,
  brand, family, and the vendor's own product line (_GOdrill_, _Viper_). Nobody
  types "12.7" meaning a diameter into a search box.
- **Material is "any of".** A tool indexed for steel and stainless answers a
  question about either. A tool nobody rated carries no values and drops out of
  a filtered view — that is the vendor's silence, not a claim about the tool.

### How they follow each other

- **Every axis is counted against every other filter but its own.** Choosing one
  vendor narrows the family and product-line lists to that vendor's — but does
  not hide the other vendors, because then you could never change your mind.
- **An empty answer stays and is greyed**; another vendor's family or product
  line comes off the list entirely. The difference is "this exists and matches
  nothing" versus "this was never yours to pick".
- **A chosen feature fills the blanks** — the tool types the feature considers,
  and the `must` bounds that apply to every type. Written into the same controls
  somebody can change.
- **Suggested, never enforced.** Applying a new feature's suggestions replaces
  only what the _last_ feature suggested, so an answer somebody gave themselves
  stands.
- **Choosing a thread writes the type filter** — drills and taps — and "show
  compatible endmills" adds the two milling forms to the same place. The filter
  rail is the last word, so anything the app decides for you is somewhere you
  can undo it.

### Where they live — and where they should

- Today: a rail of **bubbles** down the left of the part, plus filters on four
  column headers (diameter, flute length, flutes, type) that _hand over_ to the
  rail rather than opening a second control for the same question.
- **Decided: the filters move into the tool table.** A filter is a question
  about a column, and a control that sits somewhere else has to name the thing
  it narrows; a control on the header is already pointing at it. This also gives
  the part back the space the rail takes.

> **Open questions**
>
> - **What happens to the axes with no column?** Vendor, family, product line,
>   part material, holder and collet do not correspond to a column. Do they
>   become a "more filters" control in the table's chrome, a much smaller rail,
>   or move somewhere else entirely?
> - **Does a feature's suggestion still announce itself?** The bubbles light up
>   when a feature fills them in, which is how somebody notices the app narrowed
>   their list. Column headers need an equivalent, or the narrowing becomes
>   invisible.
> - **Part material is a property of the part, not of the list.** It currently
>   sits with the filters. Should it move next to the part, where it is asked
>   once?

**Where it lives**

- `app/shared/filter.ts` — the query, what it matches, and the per-axis counts
- `app/components/filter-panel.tsx` — `QUICK_FILTERS` and `FACET_AXES` — every axis and its values
- `app/components/filter-rail.tsx` — the bubbles down the left of the part
- `app/components/column-filter.tsx` — the header filters, and the compare operators
- `app/shared/suggest-filters.ts` — what a chosen feature and material fill in
- `app/shared/saved-filters.ts` — named filter sets, kept in the browser
- `app/shared/holding.ts` — the crib axes — taper and collet series

---

## 2 The feature list

The list is what has been asked about, and it drives everything: what the part
paints, what the tool table is for, and what reaches the bill.
**`FEATURE-LIST.md` is the full spec**; this is the shape of it.

- **A feature** — one decision. Eight identical holes are one row.
- **A group** — several features chosen together, plus what it wants back: _one
  tool for all of them_, or _the best tool for each_.
- **Either can hold several tools.** A hole is a spot drill and a drill.
- Groups are named from their contents — _4 × Through Hole_ — never typed.
- **Add feature** — click a face, then confirm. **Add group** — click the faces
  (a click is a toggle while building; the arrows choose which reading you
  meant), or add every feature of a kind at once.
- **Confirming is what writes the bill**, one line per distinct feature.
- **Right-click a row** to edit or remove it. Removing takes its tools off the
  bill.

What it does to the tool table:

| Selected             | Table shows                                             |
| -------------------- | ------------------------------------------------------- |
| nothing              | the whole catalog, narrowed by the filters              |
| a feature            | what cuts it, then the near misses                      |
| a group, one-for-all | what cuts every feature in it                           |
| a group, one-each    | no list — the tools are chosen per feature              |
| a tool under a row   | that row's question in full, with the tool in the panel |

> **Open questions**
>
> - **Threads on groups of holes.** Holes in a group should list as sets by
>   diameter and depth, each set taking the thread picker as a single feature
>   does. The thread choice is stored per feature today, which is what stands in
>   the way. See §6.
> - **Ordering and operations.** The list is in the order things were added. A
>   shop reads a job as a sequence — spot, drill, tap — and nothing on the row
>   says which pass a tool is for. Does the list need an order, or is that the
>   order list's job?

**Where it lives**

- `app/shared/feature-list.ts` — what the list holds, its names, ids, storage — and `asked()`
- `app/shared/recommendations.ts` — a row's answers, and what opens
- `app/shared/part-interaction.ts` — what a click on the part means
- `app/components/feature-list-panel.tsx` — the list, its answers, its right-click
- `app/components/group-editor.tsx` — building a group
- `app/components/selection-panel.tsx` — the reading, its numbers and its thread
- `docs/FEATURE-LIST.md` — the full spec

---

## 3 The tool table

The offer. Every tool that could answer the question currently being asked, in
the order the rules rank them, with a mark on every number the rules read.

| What is asked      | Heading                         | Rows                  |
| ------------------ | ------------------------------- | --------------------- |
| Nothing            | Every tool in the catalog       | the filtered catalog  |
| A previewed face   | Cuts the _pocket_               | what fits it          |
| A selected feature | Cuts the _pocket_               | what fits it          |
| A group, all       | Cuts every feature in the group | what fits all of them |
| A group, each      | One tool per feature            | a notice, not a list  |
| A threaded hole    | Taps · Drills                   | two tabs, taps first  |

- **Nothing fits is never an empty table.** The closest misses are shown
  instead, each with the number that stopped it painted red.
- **The first row is always highlighted** and the panel is already assembling
  that tool, so confirming takes it without a second click.
- **Notes beside the heading** say what the rules removed, what the filters hid,
  and how many have no holder that clears — the difference between "no such
  tool" and "you filtered it out".

### Marks on the numbers

| Mark          | Means                                                   |
| ------------- | ------------------------------------------------------- |
| green tick    | the rules read this number and it passed                |
| grey `i`      | a figure worth reading, inside tolerance — hover for it |
| amber warning | a caution: allowed, and here is what you allowed        |
| red `✗`       | the rule that took the tool off the list                |
| nothing       | the rules never read this column                        |

### Filters in the table

- **Column headers filter their own column** — diameter, flute length, flutes as
  ranges; type as a checkbox list. See §1 for the decision to move the rest here.
- **The type checkboxes narrow, they do not widen.** They offer what the table
  currently holds; widening is the filter panel's job.
- **The catalog-number box** narrows on number and brand together.
- **Columns are yours** — hidden, shown and reordered per list; taps and drills
  keep separate sets.

> **Open questions**
>
> - **Where do the non-column filters go?** The blocker on moving the rail into
>   the table — see §1.
> - **Should a near miss be selectable?** Today it is: the first row is
>   highlighted even when nothing fits, so _Add tool_ will put a tool the rules
>   refused onto the bill. That may be right — shops overrule rules — but
>   nothing warns them.
> - **Sorting versus ranking.** Sorting by a column throws away the rules'
>   order, which is the app's actual recommendation.

**Where it lives**

- `app/components/tool-table.tsx` — the table, its columns, its header filters
- `app/shared/tool-marks.ts` — the tick, the `i`, the warning and the red `x`
- `app/shared/column-order.ts` — which columns are shown, and in what order
- `app/shared/tool-order.ts` — kept rows first, then the sheet's order
- `app/shared/geometry.ts` — how a geometry value is printed

---

## 4 The 2D tool viewer

The drawing of the tool, its holder and the clearance around it. The component
lives in `@toolpath/tool-drawing` and is Justin's; this catalog only wires it up
through `catalog-drawing.tsx`, with `tool-drawing-input.ts` as the whole adapter.
**The package draws the verdict; it does not decide it** — whether an assembly
clears a feature is answered in `@toolpath/catalog-data`. Do not write a second
drawing here.

What the panel around it offers is the part that matters:

| State                              | Buttons                                     |
| ---------------------------------- | ------------------------------------------- |
| Nothing selected                   | none — there is nothing to add it to        |
| Feature or group with no tools yet | **Add tool**                                |
| This tool is one of its tools      | **Update tool assembly**\*, **Remove tool** |
| It has tools, this is not one      | **Replace _B976Z02500_**, **Add this tool** |

\* Only when the holding has changed. A button that saves what is already saved
is one somebody presses to find out whether it did anything.

- **Replace names the tool it drops**, because with several mapped there is
  otherwise no telling which one goes. Where several go it says _Replace all
  tools_.
- **Remove takes the row with it** if that was its last tool.
- **The panel always says what the tool is on the list for.**

> **Open questions**
>
> - **Stickout is carried but not editable.** A bill line holds it and _Update
>   tool assembly_ is written to save it; there is no control yet.
> - **Should the drawing show the feature?** It draws the tool and its
>   clearance, not the hole or pocket it is being judged against. That is the
>   picture a machinist actually wants — Justin's to add, or ours to pass in?

**Where it lives**

- `app/components/tool-details.tsx` — the panel: the drawing, the holding, the buttons
- `app/shared/tool-actions.ts` — which buttons, given what is being asked
- `app/components/catalog-drawing.tsx` — the one file that wires the drawing package up
- `app/shared/tool-drawing-input.ts` — the whole adapter into its input contract
- `app/shared/holder-choice.ts` — which holders and collets are offered, and the stickout
- `packages/catalog-data/src/clearance.ts` — whether an assembly clears — the verdict the drawing draws
- `@toolpath/tool-drawing` — the component itself — another repository, Justin's

---

## 5 The order list

The setup sheet read the other way round: what has been decided for this part,
as a thing to buy. It stores guids and resolves them through the catalog on
every render, so it can never disagree with the catalog about a diameter.

- **A row is a component, not an assembly.** Three cutters usually go in one
  holder, so tool, holder and collet each get their own row, quantity and vendor
  link, with a heavier rule between assemblies.
- **A tool on its own is a legal line.** Deciding the cutter and leaving the
  holder for later is a real state of a job.
- **The vendor's page hangs off the catalog number**, not a column of its own.
- **Quantity is typed**, not spun.
- **A line whose tool has left the catalog shows as gone**, not as a stale
  number.
- **Fusion tool library** — the whole bill as a `.json` Fusion can import. The
  form vocabulary and the geometry keys are already Fusion's, so it is a copy
  rather than a translation. A tool the dataset cannot name is left out, and the
  count comes back with the file.

> **Open questions — this page has had the least attention**
>
> - **Do the vendor links actually work?** Unverified against real scraped data.
>   Worth checking before anyone demos it.
> - **It does not know about groups.** A bill that said "these four faces, one
>   end mill" would match how the work was decided.
> - **Nothing says what a tool is for.** A line does not name the feature it was
>   chosen for, so the reasoning is lost the moment you leave the part page.
> - **Fusion export is lowest priority** and unproven against Fusion itself.
>   Treat it as untested until somebody imports one.

**Where it lives**

- `app/routes/order-list.tsx` — the page
- `app/shared/setup-sheet.ts` — the sheet itself — lines, quantities, storage
- `app/shared/fusion-library.ts` — the bill as a Fusion library
- `app/shared/save-file.ts` — saving it from the browser

---

## 6 Threaded holes

A threaded hole is drawn as a hole. Which thread it is for is not in the model,
so the app guesses from the diameter and lets somebody say otherwise — and then
it is two tools, chosen on different numbers.

### Naming the thread

- **The guess says what it read.** A hole is usually modelled at the tap drill,
  sometimes at the minor diameter, occasionally at the nominal size; all three
  are tried, and the list is headed _Closest match to modeled diameter_.
- **The list ranks; it does not argue.** The order says which is closest; the
  words say only which diameter it matched.

### Cut tap or form tap

- **Each way of making it shows the hole it starts from.** A form tap wants a
  bigger hole than a cut tap — ⌀0.201 in against ⌀0.2244 in on a 1/4-20 —
  because it displaces metal rather than cutting it. Starting a form tap at a
  cut-tap size snaps the tap.
- **The drill sizes are the Engine's charts**, copied from `tap.jl`, with the
  Jarvis formula only where the published chart is silent.
- **Each row says how far the model is from that predrill**, in the tool table's
  three states — green tick exactly on it, grey `i` inside the shop's max drill
  deviation, red `✗` past it, meaning no standard drill makes both.
- **Choosing a mode writes the type filter**, where it can be seen and undone.

### The two tabs

- **Taps first.** The thread is the decision; the drill follows from it.
- **Drills are judged against the predrill**, not the modelled bore — and
  against the whole group of identical holes. The kernel's drill and end-mill
  limits move with it, or every drill between the model and the predrill comes
  back "too large".
- **Taps bypass the rules sheet.** A tap is wider than the hole it threads, so
  the sheet's hole rules would refuse every one on diameter. The two questions
  that matter are asked directly: does the threaded length reach the bottom, and
  does the tool clear the part on the way down — swept against the same reach
  curve a drill uses.
- **Taps go through the same holder question** as everything else.
- **When none reach**, the nearest misses are shown with the failing length in
  red rather than an empty list.
- **Show compatible endmills** adds the flat and bull-nose forms to the type
  filter, for interpolating the predrill. Drills always lead.
- **The tap list has its own columns**: `DC` is the thread's nominal diameter
  and `LCF` the threaded length, with no corner radius or point angle.

> **Open questions**
>
> - **This catalog holds no pitch.** A tap's nominal size is stated by every
>   vendor; the pitch is in the catalog number and the family name, differently
>   for every brand. So M8×1.25 and M8×1 are both offered for an M8 and the
>   panel says to check it. Fixing this is a scraper change, upstream.
> - **Threads on groups of holes** — the big one. Blocked on the thread choice
>   being stored per feature tag.
> - **Thread milling is coded but not offered.** One line away from coming back.
> - **Spot drills and chamfers are not modelled.** A threaded hole is really
>   three or four operations; the app knows about two.

**Where it lives**

- `app/shared/threads.ts` — the thread table, the Engine's tap-drill charts, reading a hole
- `app/shared/hole-mode.ts` — standing a hole in at its predrill; which taps reach
- `app/components/thread-picker.tsx` — the picker, and the deviation marks
- `app/shared/thread-panes.ts` — which tool leads each tab

---

## 7 Tool matching

What decides whether a tool is offered for a feature. This is the whole of it —
the Engine's wider rule set was read once for reference (`ENGINE-TOOL-MATCHING.md`)
and is **not** what runs here.

### Three sheets, meant to be edited by somebody who does not write code

All three sit beside the code that reads them, in `apps/catalog/app/shared/`.
**They are the files to change when the matching is wrong** — not the
TypeScript.

| File                              | Rows | What it says                                         | Guide                      |
| --------------------------------- | ---- | ---------------------------------------------------- | -------------------------- |
| `app/shared/rules.csv`            | 54   | feature · when · tool types · rule · level · note    | `docs/RULES.md`            |
| `app/shared/knobs.csv`            | 16   | the numbers the rules are written in terms of        | `docs/RULES.md`            |
| `app/shared/feature-defaults.csv` | 38   | per feature: what to show, and what filters the list | `docs/FEATURE-DEFAULTS.md` |

- **A rule is a sentence about a number** — _diameter <= largest tool
  diameter_, _flute length past the corner >= feature depth + through overcut_ —
  written in knob names, never in literals.
- **Rules are scoped** by feature (with wildcards: `*Hole`, `Through*`, `*`), by
  a condition, and by which tool types they apply to. A rule for one kind of
  tool is not a filter over all of them.
- **New fields, conditions and knobs are declared in the sheet**, never
  hard-coded into a panel. That is the whole reason the sheets exist. See
  `RULES.md` and `FEATURE-DEFAULTS.md`.

### Four levels, and what each does to a tool

| Level    | Count | Effect                                                           |
| -------- | ----- | ---------------------------------------------------------------- |
| `must`   | 28    | Removed. A fact about the geometry — the tool cannot cut it.     |
| `should` | 5     | Warned. Shown, marked amber, ranked below what fits.             |
| `prefer` | 4     | Demoted. A preference — a hole up to an inch is drilled.         |
| `rank`   | 17    | Orders what is left: closest to the bore, shortest that reaches. |

- **A warning outranks a demotion.** A `should` is a geometric fact somebody has
  to override; a `prefer` is a taste. Read the other way round for a day, and
  tools over the tightest corner sat among the merely unpreferred.
- **Removed tools are kept, not discarded.** "Nothing fits" is only actionable
  when it says which rule did the excluding and by how much.

### The sixteen knobs, and what they are today

Every number a rule is written in terms of. Four are also controls on screen,
marked **·** — a shop changes those without touching a file, and raising one
admits tools rather than hiding any.

| Knob                            | Value     | What it decides                                              |
| ------------------------------- | --------- | ------------------------------------------------------------ |
| drill oversize **·**            | 0.1016 mm | how far over the hole a drill may be — 0.004 in              |
| drill undersize **·**           | 0.1016 mm | and how far under; asked separately, because shops differ    |
| drill angle tolerance shallower | 35°       | how much shallower a drill point may be than a blind bottom  |
| drill angle tolerance sharper   | 0°        | and sharper — zero, because a sharper point leaves a step    |
| finishing radius limit **·**    | 0.025 mm  | the largest bull-nose radius allowed to stand in for a flat  |
| through overcut                 | 0.127 mm  | how far a through cut runs past the bottom                   |
| chamfer angle tolerance         | 0.15°     | how far a chamfer tool's angle may differ from the feature's |
| thread mill margin              | 2 %       | how far under the minor diameter a thread mill stays         |
| good hold                       | 33 %      | share of the overall length that stays in the holder         |
| least hold                      | 25 %      | below which an assembly is not offered at all                |
| radial holder clearance         | 0.508 mm  | room between the holder and the part, sideways               |
| axial holder clearance          | 0.508 mm  | room between the holder nose and the part top                |
| least stickout                  | 12.7 mm   | the shortest stickout worth setting a tool up at             |
| stickout step                   | 3.175 mm  | the increment a default stickout lands on, inch              |
| metric stickout step            | 3 mm      | and metric                                                   |
| minimum clamping length **·**   | 3 ×D      | shank kept in the holder where the maker does not say        |

### What a feature asks of a tool

- **Read straight off the kernel's datasheet**, never inferred: the widest
  cutter that reaches the tightest corner, a hole's drill and end-mill limits
  kept apart, depth below the part top, floor fillet, the cone at the bottom.
- **A measurement the kernel does not state is never checked.** An absent number
  must not become a demand of zero.
- **Several features fold into one verdict** — removed by any, warned by any,
  ranked by the first. That is what makes "one tool for all of them" a real
  question.

### The crib is the second half

- **A tool nothing can hold is not offered.** Every candidate is asked of the
  holders and collets: does one grip the shank, clear the part at the stickout
  this feature needs, and keep enough of the tool in the collet.
- **The stack is swept against the feature's reach curve**, the same question
  the drawing draws. A hole at the bottom of an open pocket has fresh air beside
  the shank, which a length-below-holder number cannot know.
- **Four knobs are the shop's, on screen**: floor radius allowed, max drill
  deviation (over and under, separately), minimum clamping length, and the
  holder clearances. Raising one admits tools rather than hiding any.

> **Open questions**
>
> - **There is no way to see why a tool is ranked where it is.** The marks say
>   what passed and what failed; nothing says "this is third because the two
>   above it are closer to the bore".
> - **Nobody can edit the sheets from the app.** They are files in the repo,
>   which means a shop's own preferences need a developer. Is a rules screen
>   wanted, or is a CSV a shop actually edits good enough?
> - **Coverage is uneven.** Twenty feature kinds have rules; the kernel emits
>   more. A feature with no rows falls back to the wildcards, which is safe but
>   silent — a feature nobody wrote rules for looks exactly like one that passed
>   them.

**Where it lives**

- `app/shared/rules.csv` · `knobs.csv` — the rules and their numbers; edit these, not the code
- `app/shared/feature-defaults.csv` — what each feature shows, and what filters its list
- `app/shared/rules.ts` — reads the sheets; where a new field or condition is declared
- `app/shared/feature-defaults.ts` — reads the datasheet sheet
- `app/shared/judge.ts` — verdicts, the four standings, folding several features into one
- `app/shared/tool-fit.ts` — the catalog judged against a selection
- `app/shared/holder-choice.ts` — whether anything can hold it, and at what stickout
- `app/shared/clamping-length.ts` — the minimum clamping length rule
- `packages/catalog-data/src/fit.ts` — what a feature demands, read off its datasheet
- `packages/catalog-data/src/clearance.ts` — whether a stack clears the part
- `app/components/floor-allowance.tsx` · `drill-deviation.tsx` · `clamping-length.tsx` — the knobs a shop can change on screen
- `docs/RULES.md` · `docs/FEATURE-DEFAULTS.md` — how to edit the sheets without writing code
- `docs/ENGINE-TOOL-MATCHING.md` — the Engine's wider rule set; reference only, not what runs
