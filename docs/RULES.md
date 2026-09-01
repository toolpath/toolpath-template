# The rules sheet — the guide

**The files:** `apps/catalog/app/shared/rules.csv` and
`apps/catalog/app/shared/knobs.csv`. Open them in a spreadsheet or a text
editor. The first says, one row per rule, what happens to a tool for a
feature; the second holds every number a rule names, once, with where it
came from. Nothing in either is code.

Save a file and reload the page. `pnpm --filter @toolpath/catalog test`
checks both: a misspelt field, knob or tool type fails a test that names the
line.

The rules were seeded from Toolpath's engine — `docs/ENGINE-TOOL-MATCHING.md`
says which rule came from where — and `docs/RULES-PLAN.md` is the plan they
belong to. `feature-defaults.csv` keeps its own job: what to show about a
feature, and which tool types to offer first.

## What a row does

A tool is judged in this order, and the first station that removes it is the
last it reaches:

1. **Type** — the `tool types` column: a rule only applies to the forms it
   names.
2. **must** — the tool cannot cut the feature. It leaves the list, and the
   list can say which rule and by how much.
3. **should** — a person may override. The tool stays, marked.
4. **prefer** — the tool would cut, but something else is preferred. It stays,
   sorted after everything that passes.
5. **rank** — an order, not a test. Rank rows are read top to bottom; the
   first that separates two tools decides. A rank row written for the
   feature is read before a `*` row.
6. **holder** — rows with `holder` in the `for` column judge the stack once a
   tool is chosen, the same way.

## Columns of `rules.csv`

| Column       | What goes in it                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature`    | A kernel feature type — `BlindHole`, `FilletedPocket` — or a pattern: `*Hole`, `Through*`, `*` for every feature.                                                                                             |
| `when`       | A condition, the same ones `feature-defaults.csv` uses: `filleted`, `flat bottom`, `pointed bottom`, `L/D >= 4`… Blank is always.                                                                             |
| `tool types` | The forms the rule applies to, separated by `;`. `*` is every form; `*end mill` is every end mill; `not drill` is every form except a drill; `full shank` / `reduced shank` take a tool by its shank instead. |
| `for`        | Blank for a rule about the tool. `holder` for a rule about the stack.                                                                                                                                         |
| `rule`       | One of the three shapes below.                                                                                                                                                                                |
| `level`      | `must`, `should`, `prefer`, or `rank`.                                                                                                                                                                        |
| `note`       | Why. Read by nobody but the next editor — and by whoever asks where a number came from.                                                                                                                       |

Cells must not contain commas. Lists use `;`.

### Writing a rule that holds for all but one kind of tool

Put `not` in front of a pattern and it takes every tool the pattern does not:
`not drill`, `not *end mill`. It exists for rules that hold for everything
except one kind, which could otherwise only be written by naming every other
kind.

The diameter cap is the reason it exists. Row 1 caps every tool at the largest
diameter the feature admits — for a hole, the bore itself — and that is right
for a cutter that has to finish inside the walls. A drill _is_ the hole, and
the shop's own tolerance for how far off it may be is the `drill oversize` and
`drill undersize` knobs. While the cap was written `*` it ran first and refused
an oversized drill before its own rows were reached, so raising the deviation
knob could never widen the band. It is now two rows:

```
*,,not drill,,diameter <= largest tool diameter,must,…
*,,drill,,diameter <= largest tool diameter + drill oversize,must,…
```

A pair like that also changes what the **filter panel** suggests. A suggested
range may only say what is true of every form the feature considers, so it is
worked out one form at a time and the loosest of them wins: on a hole that is
the drill's bore-plus-oversize, not the end mill's tighter helix limit.

## The three shapes of rule

**A bound** — a tool field, an operator, and what it is held against:

```
diameter <= largest tool diameter
flute length past the corner >= feature depth + through overcut
diameter <= largest tool diameter - corner clearance
tip angle = 180
L/D <= best L/D + L/D band
```

The right side is a feature field, a knob, or a number, with at most one
`+` or `-` adjustment that is a knob or a number. A knob in `%` is a share
of the feature's value; so is a bare `5 %`. `best L/D` is the best value
among the tools that passed every `must` — that is how a rule can be
relative to what is available.

**An is** — a word about the tool:

```
form is drill
form is not flat end mill
shank is reduced
brand is Kennametal
```

A shank is `reduced` when there is a real relief: a section immediately
above the flutes that is a smaller diameter than the flute diameter _and has
a length_ — Paul's definition (2026-08-30) — and `full` otherwise. The
vendors state it as a shoulder diameter and length; 74 Kennametal end mills
in the data have one. 171 Destiny end mills state a shoulder under the cut
whose length equals the flute length — no section — and are not called
reduced until that data is settled with the scraper. (A relief that is under
the shank but not under the cut is drawn and swept at its own diameter, a
shade apart from the shank, but is not called reduced either.)
The catalog names it ("Reduced shank bull nose end mill") and offers it as a
filter of its own; the sheet no longer prefers one or the other, by Paul's
call.

**A rank** — an order:

```
L/D smallest
gauge length longest
corner radius closest to floor fillet radius
diameter closest to 90 % of largest tool diameter
form in order chamfer mill; ball end mill; flat end mill
brand priority
```

`smallest` / `shortest` and `largest` / `longest` mean the same thing. `closest
to` may aim at an adjusted field or a share of one: `diameter closest to
largest tool diameter - corner clearance` puts the tool 5 % under the tightest
corner first and the nearest under it next — Paul's rule; `closest to 90 % of
largest tool diameter` aims at nine tenths. `form in order …` ranks tool types the way the engine does for that
feature — listed first is best, anything unlisted comes last; there is no
tool-type ranking anywhere else, by Paul's call. `brand priority` is the
order on the brand tiles.

## What the quick filters do with it

Nothing is filtered until a feature is clicked. Then the tool-type tiles are
set to the feature's type table (the defaults sheet's `tool types`, as one
set — no numbers on the tiles), and every `must` bound whose `tool types` is
`*` becomes a range on the matching quick filter or column: `diameter <=
widest tool diameter` sets the diameter's most, `flute length >= feature
depth` the flute length's least. A rule for one kind of tool — a drill's
window, a bull nose's corner — is not turned into a filter over every tool;
the judge applies it where it belongs. Brand tiles keep their order, which
is what `brand priority` reads.

## Fields

**Feature fields** worth knowing apart: `largest tool diameter` is the widest
tool of **any** kind the feature admits — for a hole, the bore. `largest end
mill diameter` is the widest _end mill_, which for a hole is smaller, because
an end mill has to helix down inside it; the Engine states the two
separately. A rule that caps every tool type wants the first, and only the
end mill's own row wants the second. Reading the second as the first threw
the right-sized drill out of every hole (2026-08-31).

**Tool fields** (numbers off the catalog): `diameter`, `flute length`,
`flute length past the corner`, `length below holder`, `reach at full
stickout`, `overall length`, `L/D`, `corner radius`, `flutes`, `tip angle`,
`shank diameter`, `shoulder length`, `shoulder diameter`. Words: `form`,
`shank`, `brand`.

`length below holder` and `reach at full stickout` are two ends of the same
tool. A tool **starts** at its own head length — tip to the neck-or-shank
transition — which is what Toolpath's own tool editor tells you to use when
the stickout is unknown, and what the `length below holder` column shows; the
`L/D` beside it is that stickout over the diameter, so it is the ratio the
tool would really run at. `reach at full stickout` is how far it can be
**pulled out**: the overall length less the shank the shop's minimum clamping
length keeps in the holder, capped by the shank the tool actually has. Reach
rules want the second one — a tool that gets there by standing further out is
eligible — and anything about how the tool will run wants the first.

`flute length past the corner` is the flute length less the corner radius,
and it is what a cut with nothing under it wants: a through cut is taken past
the bottom, and what has to clear the far side is the tool's **corner**, not
its tip. A flat end has no corner and reads its whole flute length, so the
rule means the same for one as it always did; a bull nose is short by its
radius. It is a field rather than a second term on the rule because a bound
takes one adjustment — and because "how much flute is below the corner" is
the length somebody is actually measuring.

**Conditions** for `when` are the defaults sheet's — `no floor`, `has floor`,
`filleted`, `not filleted`, `flat bottom`, `pointed bottom`, `threaded`,
`counterbore`, `ball
only` (a surface the kernel says only a ball can finish), or a comparison on
a feature field — joined with `and`.

**Feature fields** (read off the datasheet) are the ones
`docs/FEATURE-DEFAULTS.md` lists — `largest tool diameter`, `feature depth`,
`floor fillet radius`, `hole diameter`, `tip angle`, `chamfer angle`,
`entry width`… — plus `widest tool diameter`: the widest tool that fits
anywhere in the feature, as against the largest that reaches every corner.
A rule that names a field the feature's datasheet does not report **stands
down**: it neither passes nor fails the tool.

**Holder fields** (for `holder` rows): `stickout`, `gauge length`, `held
share` (of the overall length in the holder, in %), `radial clearance`,
`axial clearance`, `collet series`, `nose diameter`.

## `knobs.csv`

| Column  | What goes in it                                   |
| ------- | ------------------------------------------------- |
| `knob`  | The name a rule uses. Lower case, spaces allowed. |
| `value` | A number.                                         |
| `unit`  | `mm`, `deg`, `%`, or `ratio`.                     |
| `note`  | Where the number came from.                       |

Every knob must be named by at least one rule, or be one of the holder
stage's settings below; a test says so. Changing a knob changes every rule
that names it.

**The stickout's settings** are knobs the holder stage reads by name rather
than rule rows. `good hold` is the stickout's ceiling: a tool may stand out
from its flute length up to what leaves that share in the holder — two
thirds out, at 33 %. The default stickout is what the holder needs to clear
the part, no shorter than `least stickout` (half an inch: nobody sets a tool
up a quarter inch out), landed on `stickout step` for an inch tool or
`metric stickout step` for a metric one — the step nearest what is needed
and never under it — and capped by the ceiling. The range beside it is the
flutes up to the ceiling. `radial holder clearance` and `axial holder
clearance` are the room the reach-curve sweep keeps — the holder's, and the
judge's own sweep of the tool's shank and neck, which sit where they sit at
every stickout: a tool whose shank rubs the wall above the flutes is removed
outright, like a type the feature does not consider, and the reason says to
find longer flutes or a reduced shank. That sweep is built in rather than a
row, because no row can read the curve at each tool's own shank offset. The
clearances entered on the drawing card replace the knobs for the session.

## Worked example

"For a filleted pocket an exact corner-radius match is best; smaller radii
are usable" is two rows:

```
*, filleted, bull nose end mill, , corner radius <= floor fillet radius,       must, a bigger nose cannot sit in the fillet
*, filleted, *,                  , corner radius closest to floor fillet radius, rank, exact match first, then the least under
```

"The best tool is 5 % under the tightest corner; an exact-size tool loads up
in the corner" is a rank row, a should row, and one knob:

```
*, , *end mill, , diameter <= largest tool diameter - corner clearance, should, within 5 % of the corner: warned
*, , *,         , diameter closest to largest tool diameter - corner clearance, rank, 5 % under first, then the nearest under
corner clearance, 5, %, Paul's 5 %
```

Change `should` to `must` and those tools leave the list instead of being
warned.
