# Part viewer documentation

What this app does with a report once the Engine has produced one: the part on
screen, every reading of every face, the shop's own rules over the top, and a
plan for how the part gets held.

## Start here

| Page                                                           | Covers                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [interactions.md](interactions.md)                             | Every state, every input, and what each one does — **as built here**                    |
| [highlighting.md](highlighting.md)                             | Every colour on the part: modes, layers, what overrides what                            |
| [directions-replay.md](directions-replay.md)                   | **Rebuilding the directions work, in the right order.** Read this if you are doing it   |
| [directions-parity-plan.md](directions-parity-plan.md)         | What the Directions page _is_ — the interaction inventory, and what is built            |
| [directions-parity-findings.md](directions-parity-findings.md) | F1–F67: why each instruction in the replay exists, each one a bug or a wrong turn first |
| [migration.md](migration.md)                                   | **How this work got here, and what is still outstanding** — read this before the PR     |

The three `directions-*` pages are one set and are read in that order: the replay
says what to do, the plan says what the thing is, the findings say why. They live
here rather than in top-level `docs/`, because a cleanup of that folder took the
first version of all three (`441b7bc`, 855 lines, in a commit about something
else). Recover any of the originals with `git show 441b7bc^:docs/<name>`.

`migration.md` answers a different question: how this work moved out of the
sandbox and into this repository, what it cost, and what is left. Read it
**instead of** the replay — the replay rebuilds from scratch, and that is not
what happened here. It also carries the parity checklist — ticked against the
tests and then by hand on a real part, with what that turned up.

`staging.md` is referenced by the sandbox's own copy of this index and was
deliberately not ported: it aimed the work at `toolpath/apps/part-viewer`, a
directory PR #50 deleted. `migration.md` replaces it.

## Where these specs came from

> **None of the sources in this section are in this repository.** They live in
> Toolpath's internal `tp-ui` repository, on the `pc-feature-picker` branch, and
> a template user has no access to them. Everything needed to work on this app
> is in this folder. The pointers are kept for Toolpath engineers who do have
> that checkout; treat a gap here as a gap in these pages, not as a cue to go
> looking.

`tp-ui@pc-feature-picker` is the reference implementation, and
`apps/feature-picker/docs/` is its written spec — some 3,500 lines, including
the two pages this folder adapts.

**These pages are about this app.** Where the behaviour differs from the
picker's, they say so and say why, rather than describing the picker and leaving
the reader to diff it. For a Toolpath engineer with that checkout, the picker's
own pages remain the deeper source on what has not been built here:

| For                                                         | Read there (in `tp-ui`)    |
| ----------------------------------------------------------- | -------------------------- |
| Why one click is ambiguous — the feature-per-direction fact | `docs/feature-model.md`    |
| The Directions page in full, and its stage ladder           | `docs/build/directions.md` |
| The offer lifecycle: infer, prune, re-cover, accept         | `docs/inference.md`        |
| Rules, bands, scoring, the editor                           | `docs/rules.md`            |
| Decisions taken and reversed, with reasons                  | `docs/decisions.md`        |

`docs/inference.md` is the one to read whole before touching the offer. Every
rule in it is a reported bug and none is guessable from the code.

## The one fact everything follows from

> The Engine reports a feature **per direction**. The same physical wall is a
> `wall` from −Y, a `face` from +Z, and part of a `profile` from three more
> directions. A single face is owned by five to eight features.

Every hard problem in this app is downstream of that: what a click means, why a
face can only ever show one colour, why "what was clicked" and "what is being
read" are separate pieces of state, and why the panel beside the part carries
what the part cannot.

The second fact, which the plan is downstream of:

> A **region is cut once per pass.** Roughing and finishing are separate claims,
> either may be unset, and a part roughed everywhere and finished nowhere is a
> real half-planned state the app has to hold and report.

And a third, which everything past the parity plan is downstream of:

> **A reading is no longer cut whole.** It can give a face up to another way up
> and it can be handed one it does not cover, so `feature.regionIdxs` stopped
> being the answer to "what does this cut". `cutRegions` is, and every place
> that reads `regionIdxs` for that question is a plan claiming ground it is not
> cutting. Four bugs in the findings are exactly that mistake in four different
> layers (F51, F58, F62, and the direction wash).

## Where the behaviour lives

| File                                | What it decides                                                      |
| ----------------------------------- | -------------------------------------------------------------------- |
| `app/shared/selection.ts`           | What a click does to what is held and what is being read             |
| `app/shared/picks.ts`               | Holding several faces, and the readings they share or gather         |
| `app/shared/pick-mode.ts`           | Whether a click picks a face or paints one, decided before the click |
| `app/shared/escape.ts`              | What Escape takes off, and in what order                             |
| `app/shared/paint.ts`               | The standing wash: Plain, Directions, Difficulty                     |
| `app/shared/bands.ts`               | Band → colour, and which band wins a shared face                     |
| `app/shared/selection-colors.ts`    | The selection triad, warm or cool depending on the wash              |
| `app/shared/arrows.ts`              | Which arrows are drawn: All, Confirmed, Off                          |
| `app/shared/highlighting.ts`        | Which list gets to light the part when three of them want to         |
| `app/shared/list-keys.ts`           | Walking a list with the keyboard, and opening a group in it          |
| `app/shared/keys.ts`                | What R, F, A/B and X mean, wherever the keyboard is                  |
| **The plan**                        |                                                                      |
| `app/shared/setups.ts`              | The plan itself: setups, assignment per pass, cut-once, coverage     |
| `app/shared/plan-actions.ts`        | Assigning a reading to the way up it is read from                    |
| `app/shared/plan-summary.ts`        | Coverage, the confirmed list, and what nothing cuts                  |
| `app/shared/directions.ts`          | Direction geometry: axes, tilt, matching a candidate                 |
| `app/shared/map-features.ts`        | Readings grouped by way up, and what a held way up would cut         |
| `app/shared/hole-groups.ts`         | Which holes are the same hole, and which list may reach across       |
| `app/shared/generate.ts`            | `planFor` and the four cheap generators                              |
| `app/shared/best-reading.ts`        | `from the rules` and `fill from current` — all the remaining risk    |
| `app/shared/infer.ts`               | What else a way up could cut                                         |
| `app/shared/proposal.ts`            | The standing offer, held as a set of **faces**                       |
| `app/shared/faces.ts`               | One reading's faces, and moving one of them                          |
| `app/shared/make-feature.ts`        | Drawing a reading the Engine did not report                          |
| `app/shared/merge.ts`               | Machining several readings as one                                    |
| `app/shared/worst-case.ts`          | The numbers a merged or extended reading carries, and whose they are |
| **Wiring**                          |                                                                      |
| `app/components/part-inspector.tsx` | The page: all of the above, wired together                           |
| `app/components/map-features.tsx`   | Where the mapping is actually done                                   |
| `app/components/face-list.tsx`      | The face editor: one reading, face by face                           |
| `@toolpath/viewer`                  | Painting, picking, arrows, camera, cube, section — app-agnostic      |

Every path above is under `apps/dfm/`. The last row is the exception: the viewer
is a published package, vendored into this repository as a tarball and pinned in
`apps/dfm/package.json`. It has no source here, so a change to painting or
picking is a change to that package rather than an edit in this tree.

## Testing

Nothing here needs AWS, Docker or the database.

```sh
pnpm --filter @toolpath/dfm test          # unit tests, a few seconds — run this constantly
pnpm --filter @toolpath/dfm check-types   # types
pnpm --filter @toolpath/dfm test:e2e      # end-to-end, ~90 s — the only place the
                                          # shader highlighting can be observed working
```

Three rules about where a test goes, and the reasons are in
[directions-replay.md](directions-replay.md) § _Before anything_:

- **Pure logic goes in `app/shared/*.test.ts`.** That is the bulk of the value
  and the part that ports unchanged.
- **Component tests work, including for components using `@toolpath/ui`.** F45
  said otherwise — two Reacts on disk — and it no longer reproduces:
  `face-list.test.tsx` renders a component importing the kit. They are the
  cheapest coverage available for anything list-shaped.
- **Everything else is Playwright**, against a report built by hand with
  `tests/part-fixture.ts`. Never import captured Engine JSON: the data is this
  app's, and a foreign report tests another codebase's normalisation too.
- **Anything that begins with a click on the part goes in
  `tests/on-the-part.spec.ts`**, against `tests/cube-fixture.ts` — the one
  fixture that mounts geometry. Every hand-built report sets `hasMeshGlb: false`,
  so for a long time none of that stack was tested at all, and three of the bugs
  in the findings reached a user because nothing could catch them (F51).
