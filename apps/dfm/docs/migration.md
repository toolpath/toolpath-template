# Migration: sandbox → viewer package → DFM template

Re-verified **26 Aug 2026** against sandbox `009d893`, `toolpath` `63a1f29`, and
`toolpath-template` `25c4d78`. The first draft was written 25 Aug against sandbox
`3f5f4f4`; three of its load-bearing claims have changed and are corrected below —
see [What the 25 Aug draft got wrong](#what-the-25-aug-draft-got-wrong).

This replaces `staging.md`, which described a different migration shape — landing
the sandbox back into `toolpath/apps/part-viewer` — and is now wrong about the
target twice over, because that directory no longer exists.

Every claim here has the command that produced it. Nothing is from memory of the
work.

---

## What moved overnight

**Nathan's split landed.** PR #50 (`nathan/move-app`, merged 21 Aug) removed
`apps/` from `toolpath` entirely. The repo is now packages-only:

```bash
git -C ~/dev/toolpath ls-tree --name-only origin/main packages/
# packages/sdk-python  packages/sdk-typescript  packages/ui  packages/viewer
git -C ~/dev/toolpath ls-tree --name-only origin/main apps/      # empty
```

Two consequences. The template is no longer merely the better target — it is the
**only** target. And the reason `~/dev/toolpath` was given a broken push remote is
gone, so that block can be lifted (see [stage 2](#stage-2--the-pr-in-toolpath)).

**The template did not move.** Still eight commits, HEAD `25c4d78 Add skills`, same
as yesterday. Re-check again before opening the stage-4 PR:

```bash
gh api "repos/toolpath/toolpath-template/commits?per_page=40" \
  --jq '.[] | "\(.sha[0:8]) \(.commit.author.date[0:10]) \(.commit.message | split("\n")[0])"'
```

---

## The headline, corrected

The 25 Aug draft said the template's `apps/dfm` was `apps/part-viewer` at `fdcff0e`
**byte-identical but for one line**. That was extrapolated from three spot-checked
files. Diffing the whole tree says otherwise.

The template forked from `main` at **`4a0f2f1`** — the merge of PR #46,
_"square the view cube, and make rule numbers typable"_ — not from `fdcff0e`. So it
carries app changes the sandbox has never seen, and it has been adapted from a
workspace member into a standalone app.

```bash
git -C ~/dev/toolpath archive 4a0f2f1 apps/part-viewer | tar -x -C /tmp/pv46
diff -rq /tmp/pv46/apps/part-viewer ~/dev/toolpath-template/apps/dfm
```

**Against `4a0f2f1`: 17 files differ, plus one rename** (`part-viewer.spec.ts` →
`dfm.spec.ts`). All 17 are template adaptation, in three groups:

| Group                                                                                                                                                                                            | Files | Sandbox delta |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: | ------------- |
| **Standalone build** — `package.json` (`workspace:*` → pinned `0.3.1`/`0.2.3`/`0.1.0`), `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `Dockerfile`, `README.md` |     7 | none          |
| **Analyse endpoint** — `server/routes/parts.ts`, `app/client/api.ts`, `app/client/api.test.ts`, `server/app.test.ts`, `tests/viewport-reach.spec.ts`                                             |     5 | one file      |
| **Renamed to DFM** — `part-inspector.tsx`, `app/routes/home.tsx`, `docs/README.md`, `server/engine.ts`, `tool-button.test.tsx`                                                                   |     5 | three files   |

**Against `fdcff0e` — the sandbox's actual base — one more group appears**: PR #46's
own app work, which the template has and the sandbox forked before.
`rule-editor.tsx` (+259 lines), `feature-viewer.tsx` (12), and a new
`rule-editor.test.tsx` (139). **That is where the real conflicts come from**, not
from the adaptation.

**Even so, the correction barely costs anything.** The base shifted, but mostly
under files the sandbox never edited. Measured by three-way-merging every
sandbox-changed file — base `fdcff0e`, ours the sandbox, theirs the template:

```
sandbox-changed files that auto-merge with the template:  36
sandbox-changed files with conflicts:                      4   (one hunk each)
files new in the sandbox, no template counterpart:        68
```

That is the fact the whole migration now rests on, and unlike yesterday's headline
it was measured rather than inferred.

### Two things to know before porting anything

**The analyse endpoint changed.** `POST /api/parts/:id/analyze` became
`PATCH /api/parts/:id?featureDetails=true|false`, across `server/routes/parts.ts`,
`app/client/api.ts` and both their tests. The sandbox is still on the old contract.
It never edited those files, so the merge is clean — but that only holds if you port
_what the sandbox changed_ rather than copying its tree across. **Do not carry over**
`app/client/api.ts`, `server/routes/parts.ts`, `server/engine.ts`, `server/app.test.ts`,
or any of the seven build files. The template's versions win.
`tests/viewport-reach.spec.ts` is the one file both sides moved, and it auto-merges —
the sandbox's edits are elsewhere in it.

**`@toolpath/viewer` no longer resolves to source.** The sandbox's `tsconfig.json`
maps it to `../../packages/viewer/src/index.ts`; the template dropped that mapping
and type-checks against the published `.d.ts` instead. Anything in the ported app
that leans on a type the built entry point does not re-export will fail there and
passed here. `tsc --noEmit` in the template is the only place that shows up — which
is why it is in the after-every-step loop rather than at the end.

The template also added path aliases (`components/*`, `shared/*`, `client/*`,
`routes/*`, `server/*`). Exactly one file uses them so far, so relative imports in
the ported files are fine; do not rewrite them as part of this migration.

---

## The four stages

```
  1. viewer changes → toolpath/packages/viewer
         │
  2. PR + changeset → merge to main → release.yml publishes @toolpath/viewer 0.4.0
         │                                                        │
         ↓                                                        ↓
  3. app changes → toolpath-template/apps/dfm ──────────── bump dep to 0.4.0
         │
  4. PR in the template
```

**Only one thing in stage 3 is genuinely blocked on stage 2**: the single call that
needs `regionAdjacency`. All 68 new files and 40 changed ones compile against the
`0.3.1` the template already pins. Stage 3 can be built in parallel with Nathan's
review and only _finished_ after the publish — which matters, because stage 2 has a
human in it and stage 3 is by far the larger body of work.

---

## Stage 1 — the viewer package

### What changed

Ten files, +381 / −28. `git diff fdcff0e HEAD -- packages/viewer` in the sandbox.

| File                       | Δ lines | What                                                                                 |
| -------------------------- | ------: | ------------------------------------------------------------------------------------ |
| `src/render/adjacency.ts`  |     +94 | **new.** `regionAdjacency(model, geometry)` — which faces touch which, from the mesh |
| `src/index.ts`             |      +1 | `export { regionAdjacency } from './render/adjacency.js'`                            |
| `src/camera.tsx`           |     +19 | `zoomTo?: 'cursor' \| 'centre'` prop, sets `controls.dollyToCursor`                  |
| `src/viewer.tsx`           |     +75 | `zoomTo?`, `recentreOnDoubleClick?` props; double-click-to-reframe on the canvas     |
| `src/part-mesh.tsx`        |     +43 | `onAdjacency?` callback prop; computes adjacency once per mesh                       |
| `src/direction-arrows.tsx` |     +19 | `shownDirection` widened to `number \| readonly number[] \| null`                    |
| `src/render/part.ts`       |     +37 | `RedFormat` single-channel state texture; dispose guard for shared geometry          |
| `src/render/theme.ts`      |     +42 | `DIRECTION_COLORS` — five of nine hues retuned for perceptual separation             |
| `tests/adjacency.test.ts`  |     +52 | new                                                                                  |
| `tests/part.test.ts`       |     +27 | "leaves a newer part on the same geometry alone"                                     |

### It rebases onto the new `main` cleanly — verified, not assumed

`main` gained PR #46's view-cube work in `index.ts`, `viewer.tsx`,
`render/view-cube.ts` and a new `tests/view-cube.test.ts`. Two of those files are
ones we also touch, so this was checked for real rather than eyeballed:

```bash
cd ~/dev/toolpath-sandbox && git diff fdcff0e HEAD -- packages/viewer > /tmp/viewer.patch
cd ~/dev/toolpath && git worktree add --detach /tmp/wt origin/main
cd /tmp/wt && git apply --3way /tmp/viewer.patch      # exit 0, no conflict markers
```

Both feature sets survive: the merged `index.ts` exports `regionAdjacency` **and**
`squaredUp`; the merged `viewer.tsx` carries `zoomTo`, `recentreOnDoubleClick`
**and** the `squaredUp` calls in `frame`. No hand-editing needed.

### The version bump is 0.4.0 — but it is not ours alone

`main` already carries an unreleased `.changeset/squared-view-cube.md` marked
**minor**. So `0.4.0` is already claimed by the view-cube fix, and our changeset
stacks onto the same release rather than defining it. Say `minor`, not `0.4.0`, in
the PR — and expect the published `0.4.0` to contain both.

npm is still on `0.3.1` (`0.2.0`, `0.3.0`, `0.3.1`; last publish 19 Aug):

```bash
npm view @toolpath/viewer version
```

Our own surface change is purely additive, which is what makes `minor` right. Every
symbol the sandbox app imports is already in `0.3.1` **except** `regionAdjacency`.
No removals, no signature changes, no peer-dep changes: **one new export, three new
optional props, one widened prop type.**

Two caveats to raise in the PR rather than bury:

- **`DIRECTION_COLORS` values change.** Not an API break — same export, same length
  (9), same type — but any consumer that screenshot-tests the part or hard-codes a
  hex will see a difference. Worth a line in the changeset.
- **`render/part.ts` changes rendering behaviour.** The `RedFormat` switch fixed a
  real crash: a single-channel `DataTexture` needs `unpackAlignment = 1`, and
  without it every part whose region count is not a multiple of four failed to
  load. Our cube fixture's count happens to be a multiple of four, which is why it
  passed locally and broke on real parts. That story belongs in the PR description —
  it is the strongest argument for the change.

### The changeset is mandatory, and CI enforces it

`AGENTS.md` in `toolpath`: _"When changing a public package in a consumer-visible
way, always add a Changeset in the same pull request. Do this as part of the
implementation; do not ask a human to create it later."_

`.github/workflows/release-intent.yml` runs `scripts/check-release-intent.mjs`,
which maps `packages/viewer/src/` → `@toolpath/viewer` and **fails the PR** if a
matching changeset is not in the diff. Not optional, not a formality.

```markdown
---
'@toolpath/viewer': minor
---

Report which faces touch which, zoom to the cursor, and re-frame on a double click.
```

---

## Stage 2 — the PR in `toolpath`

### The push block can now be lifted

`~/dev/toolpath` still has its push remote pointed at a path that does not exist:

```bash
git -C ~/dev/toolpath remote -v
# push  /Users/paulclauss/dev/PUSH-BLOCKED-repo-split-use-toolpath-sandbox
```

That was set so nothing would land in `toolpath` while Nathan was splitting it. The
split has landed, so the reason is spent:

```bash
git -C ~/dev/toolpath remote set-url --push origin git@github.com:toolpath/toolpath.git
```

The clone is on `paul/directions-plan` at `fdcff0e`, one ahead of and seven behind
`origin/main`, alongside seventeen other stale `paul-*` branches. Branch off
`origin/main` directly — do not build on `paul/directions-plan`, whose one commit is
the plan doc that now lives in this sandbox anyway.

```bash
git -C ~/dev/toolpath fetch origin
git -C ~/dev/toolpath switch -c paul/viewer-adjacency origin/main
```

### How the publish actually happens

Not `npm publish`. The chain is:

1. PR merges to `main`
2. `.github/workflows/release.yml` fires — **path-filtered**, and
   `packages/viewer/src/**` is on the list
3. `changesets/action@v1` opens a `chore(release): version packages` PR
4. That PR is auto-merged (`gh pr merge --auto --squash`)
5. Merging it runs `pnpm release:npm` → `changeset publish` → npm

So after Nathan approves and merges, **there is a second PR that also has to land**
before anything is on npm. The version PR is automatic but not instant, and if
branch protection requires a review on it too, it needs a human. Worth asking Nathan
in the same conversation as the review.

### PR checklist

- [ ] branched from `origin/main`, push remote restored
- [ ] the ten files above, nothing else — no app changes in this PR
- [ ] `.changeset/*.md` naming `@toolpath/viewer: minor`
- [ ] `pnpm --filter @toolpath/viewer test` green
- [ ] `pnpm --filter @toolpath/viewer check-types` clean
- [ ] `pnpm --filter @toolpath/viewer build` clean (tsup, emits `dist/`)
- [ ] PR template's "Public package release" box ticked
- [ ] PR body explains the `unpackAlignment` crash and the palette change
- [ ] after merge: watch for the version PR, land it, confirm on npm

---

## Stage 3 — the app into `apps/dfm`

### What has to move

**68 new files, 40 changed files.** (The 25 Aug draft's "101 changed" counted every
file the two trees shared, changed or not.)

The 68 new, by area — `app/shared/` 41, `app/components/` 17, `tests/` 5, `docs/` 5:

```bash
cd ~/dev/toolpath-sandbox/apps/part-viewer
git ls-files | while read f; do t="$f"; [ "$f" = tests/part-viewer.spec.ts ] && t=tests/dfm.spec.ts
  [ -f ~/dev/toolpath-template/apps/dfm/"$t" ] || echo "$f"; done
```

### The four conflicts, in full

Each is a single hunk. Resolutions decided by reading both sides:

| File                 | The clash                                                                                                                                    | Resolution                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `part-inspector.tsx` | Template renamed the `<h1>` to `DFM`; the sandbox rewrote the block to add `ToolpathIcon`                                                    | **Take the sandbox's** — it already says `DFM` and wears the mark                                                       |
| `home.tsx`           | Same clash, same block                                                                                                                       | **Take the sandbox's** — same reason                                                                                    |
| `feature-viewer.tsx` | Template restyled the arrows button; the sandbox made it tri-state (`off` / `all` / confirmed)                                               | **Take the sandbox's** — it supersedes the restyle                                                                      |
| `rule-editor.tsx`    | Import block only. Template added `MatchRule`; the sandbox added `PLAN_RULE_IDS`, `judgesPlan` and dropped `displayDecimals`, `formatMetric` | **Union the imports.** Keep `MatchRule`, `displayDecimals`, `formatMetric` — the template's `MatchRow` still needs them |

`rule-editor.tsx` is the only one needing thought. PR #46 rewrote 259 lines of it,
adding a `MatchRow` editor the sandbox has never seen; the bodies auto-merge and
`MatchRow` survives, so only the imports need hand-resolving. **`rule-editor.test.tsx`
(139 lines, template-only) is the check that this went right — it must pass.**

`tests/part-viewer.spec.ts` is the template's `tests/dfm.spec.ts` renamed. Port our
content **into `dfm.spec.ts`**; do not add a second file.

### The one thing blocked on the publish

`regionAdjacency` is used in exactly one place, via the viewer's `onAdjacency` prop
(`feature-viewer.tsx` → `part-inspector.tsx`'s `setTouching`). It feeds
`make-feature.ts`'s chaining — drawing a reading by clicking one face and having it
follow the surface. Everything else compiles against `0.3.1`. So:

1. Land the 68 + 40 against `0.3.1`, adjacency wiring stubbed
2. When the release publishes: bump `apps/dfm/package.json`, unstub, done

### Landing order

The sandbox's history is 141 commits and about a third of them undo the other two
thirds — `directions-replay.md` says so explicitly. **Do not replay commit by
commit.** Land by dependency layer, running tests at each step:

1. **`app/shared/` plan layer, no UI** — `setups.ts` first (everything imports it),
   then `plan-actions`, `plan-summary`, `faces`, `map-features`, `hole-groups`,
   `worst-case`, `directions`, `direction-rows`, `pick-mode`, `keys`, `zoom-to`,
   `test-part`. All have tests; all pass with nothing rendering yet.
2. **Allocation** — `best-reading`, `generate`, `infer`, `proposal`, `setup-offers`,
   `make-feature`. `perf.test.ts` guards `byBestReading`.
3. **Changed shared modules** — `rules.ts`, `metrics.ts`, `paint.ts`,
   `rules-summary.ts`, `selection.ts`, `picks.ts`, `report.ts`, `rule-presets.ts`,
   `list-keys.ts`, `escape.ts`, `highlighting.ts`, `arrows.ts`, `contracts.ts`.
4. **Small components** — `panel-button`, `panel-icons`, `reading-row`, `face-count`,
   `pass-buttons`, `score-badge`, `heading`, `cut-from`.
5. **Big components** — `map-features.tsx` (1,483), `setups-panel.tsx` (733),
   `face-list.tsx` (972), `setup-chooser.tsx`, `create-feature.tsx`,
   `plan-choices.tsx`, and the conflicted `rule-editor` / `feature-viewer`.
6. **`part-inspector.tsx` last** — 2,462 lines, and the file every other change
   threads through. Landing it before its dependencies means a file that cannot
   compile for hours.
7. **E2E** — the spec files and fixtures, into `dfm.spec.ts`.

### After every step

```bash
cd apps/dfm && npx tsc --noEmit && npx vitest run
```

At the end: **790 unit** (52 files, green at `009d893`, re-run 26 Aug) and **114
e2e** (carried over from the 25 Aug draft — _not_ re-run today, so confirm it before
quoting it in a PR). If the unit number comes out lower, something was dropped —
that is the whole point of quoting it.

---

## Stage 4 — the PR in the template

- [ ] `apps/dfm/package.json` → `@toolpath/viewer: 0.4.0`
- [ ] `pnpm install`, lockfile committed
- [ ] `pnpm --filter @toolpath/dfm check-types` clean
- [ ] `pnpm --filter @toolpath/dfm test` → 790
- [ ] `pnpm --filter @toolpath/dfm test:e2e` → confirm the count
- [ ] `rule-editor.test.tsx` passes — the check on the one real conflict
- [ ] docs ported and true — `interactions.md` and `highlighting.md` both changed
      substantially and are the two a reader will actually open
- [ ] no `.changeset/` file — the template publishes nothing
- [ ] the app is called **Toolpath DFM** throughout, and wears the mark

The template's own toolchain is worth reading first: husky + lint-staged + prettier
and a `.claude/` skills directory, none of which the sandbox has. Formatting on
commit may reflow files as they land.

---

## Parity checklist

What "full feature parity" means, concretely. Each line is a behaviour built in the
sandbox and covered by tests; tick them against the migrated app rather than
trusting the file count.

**Mapping a part**

- [ ] By feature: click a face → every feature owning it, grouped by way up, ranked
- [ ] By direction: hold an arrow → paint faces → offers from that way up
- [ ] R / F / Both on any reading maps it; pressing again takes it back
- [ ] Cut-once: a face is cut by one reading per pass, and giving it up is recorded
- [ ] Hole groups: identical holes are one row, and the row opens
- [ ] Not cut yet: a list of **faces**, biggest gap first, opening onto candidates
- [ ] Edit feature: the pencil opens a reading's faces; the part becomes the control
- [ ] Create: draw a reading the Engine never reported, and re-point it
- [ ] Escape ladder; keyboard through every list; focus survives orbit and pan

**Choosing the ways up**

- [ ] Five offers: Pick directions, From the rules, Required filled, Required only,
      From Toolpath — and Fill all beside them
- [ ] The chooser: tick to add in run order, arrows to reorder, list re-sorts
- [ ] It previews — the part paints from the plan those ways up would produce
- [ ] Fill on a direction row; Fill all across everything held
- [ ] Lock a setup; a locked setup is left alone by generators and cannot be edited

**Rules**

- [ ] Part-level rules: setups the plan runs, on the band scale
- [ ] No-go floor, judge-by-band vs by-score
- [ ] Sharp corners on `facts.cd.ignore.min ≤ 0.01"`; Milling L/D reports `Infinity`
- [ ] The page judges **only mapped** features; nothing mapped says so
- [ ] Band press opens onto the features in it, with the rules that cost them
- [ ] Worst-of-it expands past six

**The part**

- [ ] Direction wash, difficulty wash (mapped only), plain
- [ ] Rough / Finish as a sub-view level
- [ ] Zoom to cursor or centre; double click re-frames
- [ ] Arrows: off / all / confirmed

**Three unverified against a real part** — carried over from `staging.md`, still
true: outer fillet radii, sharp corners at `≤ 0.01"`, and Milling L/D returning
`Infinity`. All three have unit tests; none has been seen on a real part.

---

## Risks

**`rule-editor.tsx` is the one place two people edited the same file.** The bodies
auto-merge, which is exactly when a semantic break slips through. `rule-editor.test.tsx`
is the guard; run it before anything else in stage 5 of the landing order.

**Do not copy the sandbox tree over the template.** Seven config files and the whole
analyse-endpoint change would be silently reverted. Port only what the sandbox
changed. The three-way merge above is the safe mechanism.

**`@toolpath/viewer` is three different packages.** `toolpath/packages/viewer` is the
published R3F one the template pins. `tp-ui/packages/viewer` is a _private_ `0.0.0`
rewrite with a different export map (`./core` + `./api`, no R3F peer deps) — **not
drop-in compatible**. If a search or an import resolution ever picks up the tp-ui
one, nothing will make sense. Same for `@toolpath/ui`, which exists three times.

**`reported-regions.test.ts` has an allow-list of file paths.** A source-scanning
guard over where `regionIdxs` may be read. Directory changes during the migration
will make it fail, and the fix is to update the list — not to delete the test. Its
own comment calls the `regionIdxs` / `cutRegions` / `coveredRegions` confusion "the
most expensive mistake in this app, four times over."

**Component coverage is thin.** `app/shared/` is well covered; `app/components/` is
6 of 26. `part-inspector.tsx` — the biggest file and the one everything threads
through — has no unit tests, and is covered only by the e2e. Those e2e are the real
safety net for stage 3. Run them often.

**The sandbox has no remote.** Everything lives in one local clone plus
`~/dev/directions-patches/`. Until stage 3 lands, this machine is the only copy.

**The template moves under us.** Check its HEAD before starting stage 3 and again
before opening the PR.

---

## What the 25 Aug draft got wrong

1. **The template's base.** It said `apps/dfm` was `fdcff0e`'s `apps/part-viewer`
   with one line changed. It is `4a0f2f1`'s — after PR #46 — plus standalone
   adaptation: **17 files differ plus a rename**, not one line. The draft generalised
   from three spot-checked files. The conclusion survives, because only four
   sandbox-changed files conflict, but the reasoning did not.
2. **The version bump.** `0.4.0` is already claimed by a pending view-cube
   changeset on `main`. Ours stacks onto that release; it does not define it.
3. **The changed-file count.** 101 was every shared file; **40** actually changed.
4. **The test count.** 786 was `3f5f4f4`; it is **790** at `009d893`.
5. **The push block.** The draft weighed a fresh clone against restoring the remote.
   The split has landed, so restoring the remote is simply correct now.

Its "What is known to be true, and what is not" section is still worth reading — the
three unverified rules above come from it.

---

## Next

1. Restore the push remote on `~/dev/toolpath`, branch `paul/viewer-adjacency` off
   `origin/main`
2. Carry the ten viewer files across, add the changeset, run the three checks,
   open the PR:

   ```bash
   git -C ~/dev/toolpath-sandbox diff fdcff0e HEAD -- packages/viewer > /tmp/viewer.patch
   cd ~/dev/toolpath && git apply --3way /tmp/viewer.patch
   ```

3. While Nathan reviews: start stage 3 against `0.3.1` in the template clone at
   `~/dev/toolpath-template`, beginning with `app/shared/setups.ts`
