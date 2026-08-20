# Part viewer documentation

What this app does with a report once the Engine has produced one: the part on
screen, every reading of every face, the shop's own rules over the top, and —
when [`docs/directions-plan.md`](../../../docs/directions-plan.md) lands — a
plan for how it gets held.

| Page                                                                       | Covers                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [interactions.md](interactions.md)                                         | Every state, every input, and what each one does — **as built here** |
| [highlighting.md](highlighting.md)                                         | Every colour on the part: modes, layers, what overrides what         |
| [../../../docs/directions-plan.md](../../../docs/directions-plan.md)       | Building the Directions page, in eleven PRs                          |
| [../../../docs/viewer-parity-plan.md](../../../docs/viewer-parity-plan.md) | How `packages/viewer` got here                                       |
| [../../../docs/rules-plan.md](../../../docs/rules-plan.md)                 | Bringing the DFM rules across                                        |

## Where these specs came from

`tp-ui@pc-feature-picker` is the reference implementation, and
`apps/feature-picker/docs/` is its written spec — some 3,500 lines of it,
including the two pages this folder adapts. The parity plan recommended they
come across rather than stay in the other repo, because a spec that lives beside
a different codebase gets read as "how that app does it" instead of "how this
one must".

**These two pages are about this app.** Where the behaviour here differs from
the picker's, they say so and say why, rather than describing the picker and
leaving the reader to diff it. The picker's own pages remain the deeper source
on the parts that have not been built here yet:

| For                                                         | Read there                 |
| ----------------------------------------------------------- | -------------------------- |
| Why one click is ambiguous — the feature-per-direction fact | `docs/feature-model.md`    |
| The Directions page in full, and its stage ladder           | `docs/build/directions.md` |
| The offer lifecycle: infer, prune, re-cover, accept         | `docs/inference.md`        |
| Rules, bands, scoring, the editor                           | `docs/rules.md`            |
| Decisions taken and reversed, with reasons                  | `docs/decisions.md`        |

## The one fact everything follows from

> The Engine reports a feature **per direction**. The same physical wall is a
> `wall` from −Y, a `face` from +Z, and part of a `profile` from three more
> directions. A single face is owned by five to eight features.

Every hard problem in this app is downstream of that: what a click means, why a
face can only ever show one colour, why "what was clicked" and "what is being
read" are separate pieces of state, and why the panel beside the part carries
what the part cannot.

## Where the behaviour lives

| File                                | What it decides                                                 |
| ----------------------------------- | --------------------------------------------------------------- |
| `app/shared/selection.ts`           | What a click does to what is held and what is being read        |
| `app/shared/picks.ts`               | Holding several faces, and the readings they share              |
| `app/shared/escape.ts`              | What Escape takes off, and in what order                        |
| `app/shared/paint.ts`               | The standing wash: Plain, Directions, Difficulty                |
| `app/shared/bands.ts`               | Band → colour, and which band wins a shared face                |
| `app/shared/selection-colors.ts`    | The blue triad: picked, highlight, hover                        |
| `app/shared/arrows.ts`              | Which arrows are drawn, and when one appears on its own         |
| `app/shared/highlighting.ts`        | Which list gets to light the part when three of them want to    |
| `app/shared/list-keys.ts`           | Walking a list with the keyboard                                |
| `app/components/part-inspector.tsx` | The page: the state above, wired together                       |
| `packages/viewer`                   | Painting, picking, arrows, camera, cube, section — app-agnostic |

## Testing

`pnpm --filter @toolpath/part-viewer test` — vitest, no network.
`pnpm --filter @toolpath/part-viewer test:e2e` — Playwright, which is the only
place the shader-based highlighting can actually be observed working.
