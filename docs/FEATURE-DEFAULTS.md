# Feature defaults — the datasheet

**The file:** `apps/catalog/app/shared/feature-defaults.csv`. Open it in a
spreadsheet or a text editor; one row per kind of feature. It says, for each
kind, what the panel shows about the feature, which of those numbers become
filters on the tool list, which kinds of tool to offer first, and what the
other filters default to. Nothing in it is code.

Save the file and reload the page. `pnpm --filter @toolpath/catalog test`
checks it: a misspelt field or tool type fails a test that names the line.

## Columns

| Column       | What goes in it                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature`    | A kernel feature type — `ThroughHole`, `FilletedOpenPocket`, … Capitals and underscores do not matter.                                                                                                                     |
| `when`       | A condition (below). The **first** row for a feature whose condition holds wins, so put conditional rows first. Blank means always.                                                                                        |
| `show`       | Fields to show about the feature, most important first, separated by `;`. Showing only: what filters the tool list is the rules sheet's `must` rows (`docs/RULES.md`).                                                     |
| `tool types` | The tool types the feature considers at all — the engine's type table — separated by `;`. Clicking the feature turns exactly these tiles on, as one set; which of them is best is the rules sheet's job (`docs/RULES.md`). |
| `flutes`     | `by material` (aluminium ≤ 3, steels ≥ 4), or a bound: `>= 4`, `<= 3`, `= 2`. Blank for no default.                                                                                                                        |
| `brand`      | Brands to prefer, most preferred first, separated by `;`. Blank for any.                                                                                                                                                   |
| `holder`     | A spindle taper — `BT30`, `HSK63A`. Blank for any.                                                                                                                                                                         |
| `collet`     | A collet series — `ER16`, `ER32`. Blank for any.                                                                                                                                                                           |
| `notes`      | Anything for the next person editing the row.                                                                                                                                                                              |

Cells must not contain commas. Lists use `;`.

## Fields

These are the only names `show` and a `when` comparison may use. Each is
read straight off the feature's datasheet.

| Field                    | What it is                                                                      | Filters the tool list by                           |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| `depth below top`        | From the top of the part to the bottom of the feature                           | — (reach is the holder's question, not the tool's) |
| `feature depth`          | The feature's own depth, top to bottom                                          |
| `largest tool diameter`  | The widest cutter that still reaches the tightest corner; a sink's outer circle | diameter ≤                                         |
| `largest drill diameter` | The widest drill the hole admits                                                | diameter ≤                                         |
| `smallest tool diameter` | A sink's pilot circle                                                           | —                                                  |
| `hole diameter`          | What the hole is drilled to                                                     | —                                                  |
| `corner radius`          | Half the largest tool diameter: the tightest inside radius                      | —                                                  |
| `L/D`                    | Depth below top over the largest tool diameter (a hole: over its bore)          | L/D ≥                                              |
| `tip angle`              | Full apex angle at a hole's bottom, degrees; 180 is flat                        | —                                                  |
| `floor fillet radius`    | The radius where wall meets floor                                               | corner radius ≤                                    |
| `chamfer angle`          | Between the bevel and the tool axis, degrees                                    | —                                                  |
| `slant length`           | How far the bevel runs along its slope                                          | flute length ≥                                     |
| `entry width`            | The opening a T-slot cutter has to get in through                               | diameter ≤                                         |
| `undercut depth`         | How far the undercut runs back                                                  | —                                                  |
| `taper angle`            | A dovetail's wall angle from the tool axis                                      | —                                                  |
| `stepdown`               | The deepest cut a surface takes in one pass                                     | —                                                  |
| `thread`                 | The thread a hole is to receive                                                 | —                                                  |

## Conditions

For `when`: `filleted`, `not filleted`, `flat bottom` (tip angle is 180°),
`pointed bottom`, `threaded`, `counterbore`, `ball only` (a surface the
kernel says only a ball can finish), or a comparison on any numeric
field — `tip angle = 180`, `feature depth > 25`, `L/D >= 4`. Join several
with `and`.

## Tool types

`ball end mill`, `bull nose end mill`, `flat end mill`, `face mill`,
`tapered mill`, `radius mill`, `chamfer mill`, `dovetail mill`,
`lollipop mill`, `slot mill`, `thread mill`, `circle segment barrel`,
`circle segment lens`, `circle segment oval`, `circle segment taper`,
`boring bar`, `counter bore`, `drill`, `center drill`, `spot drill`,
`reamer`, `counter sink`, `tap left hand`, `tap right hand`.

## What is a suggestion, and what stays

Everything the sheet fills in is written into the filter panel, where it can
be changed. A value the sheet set is replaced when the next feature is
clicked; a value somebody typed or pressed themselves is left alone.

Clicking a tool type or brand tile repeatedly walks its priority — first,
second, third, off — and the badge on the tile says which. The list is sorted
by that order.
