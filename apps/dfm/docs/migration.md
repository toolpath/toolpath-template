# Migration: sandbox → viewer package → DFM template

Re-verified **26 Aug 2026** against `toolpath-template` `7d0c907`, `toolpath`
`ad65b43` (`origin/main`), and sandbox `a046945`. This copy lives in the target
repository and is written from the target's point of view: the migration has
**landed here**, and what follows is what arrived, what state it is in, and what
is still outstanding.

> **Where the branch has moved since.** Checked **27 Aug 2026** at `a84b1db`,
> five commits past the `7d0c907` this page was verified at. The suite is still
> green and larger: **940 unit tests in 61 files** and **135 e2e**, against the
> 830 / 53 and 114 recorded below. The four commits in between are style and
> layering work — the rules AGENTS.md already stated became gates in
> `eslint.config.js` — plus the shop-size judgement merged from
> `origin/paul/directions-mapping`. None of them touched the migration itself,
> so everything below still holds; only the counts are of their moment. Do not
> read the numbers in the table as current.

Earlier drafts (25 Aug, and the 26 Aug re-verification in the sandbox) described
the migration as work ahead. It is not. Those drafts also replaced `staging.md`,
which aimed the work at `toolpath/apps/part-viewer` — a directory PR #50 deleted.
`staging.md` was deliberately not ported.

Every claim here has the command that produced it. Nothing is from memory of the
work.

---

## Where this stands

**The port is complete and the suite is green.** Stage 3 landed as five commits
on `paul/directions-mapping`:

```bash
git log --oneline 25c4d78..HEAD
# 7d0c907 fix(dfm): settled work does not move, and the row says so before you press
# 96ca70a docs(dfm): say what the Directions tab is, now that it is something
# 4c8489d fix(dfm): colour a split reading by difficulty, not by nothing
# 44cf327 test(dfm): vendor the cube fixture, which lived in the viewer package
# f0d12ed feat(dfm): map features to directions, and plan the ways up
```

Completeness was checked rather than assumed — every tracked sandbox file has a
counterpart here, except the deliberately dropped `staging.md`:

```bash
cd ~/dev/toolpath-sandbox/apps/part-viewer
git ls-files | while read f; do t="$f"
  [ "$f" = tests/part-viewer.spec.ts ] && t=tests/dfm.spec.ts
  [ -f ~/dev/toolpath-template/apps/dfm/"$t" ] || echo "$f"; done
# docs/staging.md
```

**Parity has been walked**, not inferred — first against the test suite, then by
hand on a real uploaded part. It holds. The walk found one bug, in the lock, now
fixed with 18 tests; see [Parity checklist](#parity-checklist) and
[A lock that only the generators were reading](#a-lock-that-only-the-generators-were-reading).

### The numbers, and what they were predicted to be

The earlier drafts predicted the exact shape of the blockage. Both blockers are
now cleared locally (see next section), and the suite is green for the first
time:

|               | vs published `0.3.1` (predicted) | at `7d0c907`, local builds |
| ------------- | -------------------------------- | -------------------------- |
| `check-types` | 3 errors                         | **clean**                  |
| unit          | 800 / 802                        | **830 / 830** (53 files)   |
| e2e           | 111 / 114                        | **114 / 114**              |

A snapshot of 26 Aug, kept because the prediction is the point. For the current
counts see the note at the top of this page.

```bash
pnpm --filter @toolpath/dfm check-types    # clean
pnpm --filter @toolpath/dfm test           # 53 files, 830 tests
pnpm --filter @toolpath/dfm test:e2e       # 114 passed (47s)
```

830 rather than the 802 an earlier draft quoted is the four commits that landed
after the port, plus the eighteen written for the lock bug the parity walk found
(_A lock that only the generators were reading_, below). Higher is the safe
direction — the count is quoted precisely so that a **drop** would reveal a
dropped file.

Two e2e groups are worth naming because they were the blocked ones and now pass:
the three `on-the-part.spec.ts` cases that run through `onAdjacency` chaining,
and `mapping.spec.ts` → _a made reading can be deleted from its datasheet_,
which was never a viewer problem at all (see _The second package_, below).

---

## How it is green before the publish

Neither dependency has published. The template is pointed at locally built
tarballs through a root `pnpm.overrides` block, so the port can be verified
against what `0.4.0` and `0.1.1` will actually be:

```jsonc
// package.json (repository root) — LOCAL ONLY, must not reach the PR
"pnpm": {
  "overrides": {
    "@toolpath/viewer": "file:../.local-tarballs/toolpath-viewer-0.3.1.tgz",
    "@toolpath/ui": "file:../.local-tarballs/toolpath-ui-0.1.0.tgz"
  }
}
```

| Tarball  | Packed from                                    | Carries                         |
| -------- | ---------------------------------------------- | ------------------------------- |
| `viewer` | `toolpath` `main` @ `ad65b43` (PR #51 merged)  | adjacency, `zoomTo`, palette    |
| `ui`     | `toolpath` `paul/ui-button-clicks` @ `c02c8d4` | the `Button` click fix (PR #52) |

**Two different commits, deliberately.** `paul/ui-button-clicks` forks from
`63a1f29` and does not contain the viewer work — `git merge-base --is-ancestor
ad65b43 paul/ui-button-clicks` fails. Packing both from that one checkout would
silently revert the viewer to the old `0.3.1` source.

### Why tarballs rather than `link:`

`link:` symlinks straight into `~/dev/toolpath/packages/viewer`, and module
resolution then walks up from the **real** path and finds the monorepo's own
`react` and `three`. Two React instances and two `three` instances is exactly
what breaks react-three-fiber. A packed tarball installs as a genuine package in
pnpm's virtual store, so peers bind to this app's copies — the same resolution
semantics the registry will give after publish, which is the point of testing
against it.

### Refreshing after an upstream change

```bash
cd ~/dev/toolpath && pnpm --filter @toolpath/<pkg> build
cd packages/<pkg> && pnpm pack --pack-destination ~/dev/.local-tarballs
cd ~/dev/toolpath-template && pnpm install --force   # names are stable; --force is required
```

### This must not reach the PR

CI runs `pnpm install --frozen-lockfile`, and a `file:` path resolves on no other
machine. `package.json` and `pnpm-lock.yaml` are both modified while the
overrides are in place. Stage explicit app paths only — never `git add .`.

---

## What is left, and it is not code

```bash
npm view @toolpath/viewer version   # 0.3.1
npm view @toolpath/ui version       # 0.1.0
```

**The release pipeline is the blocker.** #51 merged, `release.yml` fired on
`main`, and failed:

```bash
gh run list --repo toolpath/toolpath --workflow=release.yml --limit 3
# failure  2026-08-26T14:35  ad65b431  Merge pull request #51 ...
# failure  2026-08-20T13:18  4a0f2f11  Merge pull request #46 ...
# success  2026-08-19T17:08  5944a924  Merge pull request #45 ...
```

It fails at `Create Toolpath release-bot token`:

```
Error: [@octokit/auth-app] appId option is required
```

That step passes `app-id: ${{ secrets.TOOLPATH_ACTIONS_BOT_APP_ID }}`, so the
secret is arriving empty. **Not a code regression** — `release.yml` is
byte-identical to the revision that published `0.3.1` on 19 Aug:

```bash
git diff f188e853:.github/workflows/release.yml origin/main:.github/workflows/release.yml   # no output
gh secret list --repo toolpath/toolpath                                                      # returns nothing
```

No `chore(release): version packages` PR was opened, so nothing published. This
needs someone with org or repo admin to restore `TOOLPATH_ACTIONS_BOT_APP_ID` and
`TOOLPATH_ACTIONS_BOT_PK`. Failing that, the version-and-publish steps can be run
by hand (`pnpm changeset version`, then `pnpm release:npm` with an npm token) —
a decision for whoever owns the npm credentials, not something to do quietly.

Note `nathan/ci-fix-release` (#49) is **closed** and addressed a different
problem; it is not the fix.

### What the publish will contain

```bash
git -C ~/dev/toolpath ls-tree --name-only origin/main .changeset/
# .changeset/faces-that-touch.md   '@toolpath/viewer': minor   ← ours (#51)
# .changeset/squared-view-cube.md  '@toolpath/viewer': minor   ← view cube, already on main
```

So `0.4.0` is **not ours alone** — our changeset stacks onto a release the view-cube
fix already claimed. `@toolpath/ui` goes to `0.1.1` (`button-eats-clicks.md`,
patch) once #52 lands.

### The remaining sequence

1. Restore the release-bot secrets — nothing publishes until this is done
2. Land **#52** (ui); independent of #51, either order
3. Land the auto-opened `chore(release): version packages` PR **for each** — the
   publish does not happen until that second PR merges
4. `npm view @toolpath/viewer version` → `0.4.0`; `@toolpath/ui` → `0.1.1`
5. Stage 4 below

---

## Stage 4 — the PR in this repository

- [ ] delete the whole `pnpm.overrides` block from the root `package.json`
- [ ] `apps/dfm/package.json` → `@toolpath/viewer: 0.4.0`, `@toolpath/ui: 0.1.1`
- [ ] `pnpm install`, lockfile committed **with** those two files, as one commit
- [ ] `pnpm --filter @toolpath/dfm check-types` clean
- [ ] `pnpm --filter @toolpath/dfm test` → 812
- [ ] `pnpm --filter @toolpath/dfm test:e2e` → 114
- [ ] `rule-editor.test.tsx` passes — the check on the one conflict that needed judgement
- [ ] no `.changeset/` file — this repository publishes nothing
- [ ] the app is called **Toolpath DFM** throughout, and wears the mark
- [ ] re-check the base before opening: this repository can move underneath the work

---

## What landed, for reference

### The port, measured

Against base `fdcff0e`, ours the sandbox, theirs the template:

```
sandbox-changed files that auto-merge with the template:  36
sandbox-changed files with conflicts:                      4   (one hunk each)
files new in the sandbox, no template counterpart:        68
```

This repository forked from `toolpath` `main` at **`4a0f2f1`** — the merge of
PR #46 — not at `fdcff0e`. So it carries app work the sandbox never saw
(`rule-editor.tsx` +259, `feature-viewer.tsx` +12, a new `rule-editor.test.tsx`),
and that is where the real conflicts came from, not from the standalone
adaptation.

### The four conflicts and how they were resolved

| File                 | The clash                                                                                      | Resolution                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `part-inspector.tsx` | Template renamed the `<h1>` to `DFM`; the sandbox rewrote the block to add `ToolpathIcon`      | Took the sandbox's — it already says `DFM` and wears the mark                                        |
| `home.tsx`           | Same clash, same block                                                                         | Took the sandbox's — same reason                                                                     |
| `feature-viewer.tsx` | Template restyled the arrows button; the sandbox made it tri-state (`off` / `all` / confirmed) | Took the sandbox's — it supersedes the restyle                                                       |
| `rule-editor.tsx`    | Import block only. Template added `MatchRule`; the sandbox added `PLAN_RULE_IDS`, `judgesPlan` | **Unioned the imports** — the template's `MatchRow` still needs `displayDecimals` and `formatMetric` |

`rule-editor.tsx` was the only one needing thought, and `rule-editor.test.tsx`
(template-only, 139 lines) is the guard on it. It passes 7/7.

### What was deliberately not carried over

The template's versions win for `app/client/api.ts`, `server/routes/parts.ts`,
`server/engine.ts`, `server/app.test.ts`, and the seven standalone-build files.
`POST /api/parts/:id/analyze` became `PATCH /api/parts/:id?featureDetails=...`
and the sandbox is still on the old contract; it never edited those files, so the
merge stayed clean — but only because what the sandbox _changed_ was ported,
rather than its tree being copied across.

### The one thing the plan missed entirely

`tests/cube-fixture.ts` read its report and mesh from `packages/viewer/fixtures/`
— a workspace-relative path out of the app. That resolves in the monorepo and
resolves to nothing here, and `@toolpath/viewer` publishes `dist` only. It is the
fixture that mounts real geometry, so it took the **whole** e2e suite down rather
than one spec. Both files are now vendored into `tests/fixtures/` (`44cf327`).

Worth generalising: a file-level three-way merge catches every conflict in
content and none in _resolution_. Paths that climbed out of `apps/part-viewer`
were invisible to it. That was the only one, and it was found only by running the
suite.

### The second package, which the plan never had

`mapping.spec.ts` → _a made reading can be deleted from its datasheet_ failed
with app source **byte-identical** between sandbox and template. The difference
was `@toolpath/ui`: the sandbox resolves it from its workspace, and that copy
carries an unpublished `Button` fix.

`Button`'s inner surface was a component declared _inside_ `Button`, so it was a
new component **type** on every render. React remounted the content subtree, and
a `click` only fires when `mousedown` and `mouseup` land on the same element —
so any render mid-press swallowed the click. A hover handler on an ancestor is
enough to cause that render, which is why it presented as intermittent.

The migration therefore depends on **two publishes, not one**. The original plan
had only the viewer, because the sandbox resolves both from its workspace and
never had to notice.

Note the fix's own test asserts node identity across a re-render rather than
clicking: jsdom does not synthesise a `click` from `mousedown`/`mouseup`, so a
click-based test passes either way. Any regression test for this belongs in
Playwright, not Vitest.

---

## Parity checklist

Ticked **26 Aug**, in two passes. First by mapping each behaviour to the tests
that actually run, so a tick carries evidence rather than an impression — then
by walking what that left over against a real uploaded part, which is the only
thing that could settle the last of it. Legend:

- **`E`** — end-to-end evidence, the behaviour is exercised through the UI
- **`U`** — unit evidence only: the logic is proven, the wiring to it is not
- **`H`** — checked by hand on a real part, 26 Aug; no automated cover
- **`—`** — nothing covers it here

The hand pass is worth more than its four ticks suggest: it is what found the
lock bug, which no amount of reading the test list would have.

**Mapping a part**

- [x] `E` By feature: click a face → every reading owning it, ranked — _a click lists every reading that owns the face_; _a first click opens the easiest reading_
- [x] `E` By direction: hold an arrow → paint faces → offers from that way up — _a face opens onto everything else that could cut it_; _what is left narrows to one way up_
- [x] `E` R / F / Both maps a reading; pressing again takes it back — _pressing the pass a feature already holds takes it off again_; _both passes land from one press_; _R, F and B act on the row under the keyboard_
- [x] `E` Cut-once, and giving a face up is recorded — _claiming a face leaves the rest of the reading it came from where it was_; _pressing the pass again takes back what the reading gave up_
- [x] `E` Hole groups: identical holes are one row, and the row opens — all six of `hole-groups.spec.ts`
- [x] `E`+`U` Not cut yet, biggest gap first, opening onto candidates — _everything nothing cuts is one press away_; ordering in `plan-summary.test.ts`
- [x] `E` Edit feature: the pencil opens a reading's faces; the part becomes the control — _in Edit Feature the part is the control_; _Edit Feature opens the row it was pressed on_
- [x] `E` Create: draw a reading the Engine never reported, and re-point it — _a reading can be drawn when the Engine reported none_; _a made reading can be cut from a different way up_
- [x] `E`+`H` Escape ladder and keyboard through every list are covered (_Escape runs all the way out_); focus surviving **orbit** is covered by test, surviving **pan** by hand only

**Choosing the ways up**

- [x] `H` `Pick directions` opens the chooser with nothing ticked — **works, and is still untested**; see _Gaps found_
- [x] `E`+`U` The other four offers, and Fill all beside them — _from the rules_, _required only_, _fill from current_ end-to-end; _required, filled_ and _from toolpath_ in `generate.test.ts`
- [x] `E`+`H` The chooser ticks to add in run order (_choosing a way up and confirming maps features to it_); the reorder arrows and the re-sort work, by hand only
- [x] `E` It previews — the part paints from the plan those ways up would produce — _the chooser paints what the choice would cut, and repaints as it changes_; _the chooser draws the ticked ways up on the part_
- [x] `E` Fill on a direction row; Fill all across everything held — _fill from current works the ways up already held_; _fill all is off until there is something to fill_
- [x] `E`+`U` A locked setup is left alone by generators (_a settled way up is left alone by an offer_), and no longer lets a manual press through — **this is where the hand pass found a bug**; fixed, 18 new tests

**Rules**

- [x] `E` Part-level rules, on the band scale — _the plan is judged by rules of its own, in the rules list_
- [ ] `U` No-go floor, judge-by-band vs by-score — unit-covered, no end-to-end press
- [x] `U`+`H` Sharp corners on `facts.cd.ignore.min ≤ 0.01"`; Milling L/D reports `Infinity` — **seen on a real part at last**, having been carried as unverified by every draft of this document
- [x] `U` The page judges only mapped features; nothing mapped says so — `rules-summary.test.ts`
- [x] `E` Band press opens onto the features in it, with the rules that cost them — _a band opens onto the features in it, with what cost them_
- [x] `E` Worst-of-it expands past six — _the worst of it can be read past, rather than stopping at six_

**The part**

- [x] `E` Direction wash, difficulty wash, plain — _paints the part by difficulty, and remembers that it was asked to_; _offers a directions view and a directions paint mode_
- [ ] `E`/`U` Rough / Finish counted separately is covered (_rough and finish are counted separately_); as a **paint sub-view level** it is `paint.test.ts` only
- [x] `E` Zoom to cursor or centre — _the wheel zooms to the cursor, or to the middle, and remembers which_
- [ ] `—` Double click re-frames — **no test in this app**; it is `recentreOnDoubleClick` in the viewer package, covered by the viewer's own suite
- [x] `E` Arrows: off / all / confirmed — _the arrows narrow from every way up, to the plan, to none_

### Gaps found

Six from the test-mapping pass. The hand pass then settled four of them, and
turned one into a bug.

1. **`Pick directions`** — the first of the five offers — **has no coverage at
   all**, and works. It shares a branch with `from the rules` at
   `part-inspector.tsx:1628`, differing only in what starts ticked: `from the
rules` pre-ticks the required offers, `pick directions` starts from none,
   "the press for somebody who already knows how they will hold the part." A
   one-line ternary with two meaningful arms and one of them tested.
2. **The chooser's reorder** — arrows to reorder, list re-sorts — works, and is
   untested. Run order is the whole point of `Pick directions`, so this and (1)
   are one soft spot.
3. **A locked setup could still be edited.** Not a coverage gap — a **bug**, and
   the one thing the hand pass found that nothing else would have. Fixed; see
   below.
4. **Focus surviving a pan** — checked by hand, works. Orbit has a test
   (_orbiting the part does not end a keyboard walk_); pan still has none.
5. **No-go floor and judge-by-band vs by-score** are unit-only, and unchecked by
   hand.
6. **Double-click re-frame** has no test here, by design — it belongs to the
   viewer package. Worth knowing it is not this app's suite that would catch a
   regression in it.

So parity holds. What is left is (1), (2) and (4) — behaviours that work and
have no automated guard — plus (5), which nobody has looked at. None blocks the
PR; (1) and (2) are the two worth closing first, being one feature and the one
offer somebody reaches for when they already know the answer.

### A lock that only the generators were reading

Found by hand on a real part: a face mapped and settled from `−Z`, with the
R/F/Both on **every other reading of that same face** still lit. Pressing them
did nothing.

The plan was never in danger — `setPassFor` refused correctly. The refusal and
the affordance were simply answering different questions:

|                                 | asked                               | knows about cut-once |
| ------------------------------- | ----------------------------------- | -------------------- |
| `setPassFor` → `disturbsLocked` | would this press move settled work? | yes                  |
| the row → `settledSetup`        | is **this** reading settled?        | no                   |

Those diverge wherever a face is read from more than one direction — which is
everywhere, given the feature-per-direction fact this app is built on. So every
sibling reading of a settled face kept a live-looking button that silently did
nothing.

That is the same failure `7d0c907` set out to kill one layer in, and its commit
message names it exactly: _"the press looks like it worked."_ It closed the
route through the plan and left the one through the eye.

**The fix**, in `plan-actions.ts`:

- `lockedClaims(plan, allFeatures)` — what the locks hold, gathered once per
  panel. Asked per row it is the list's own N+1 over every feature on the part,
  three times a row; `MapFeaturesPanel` memoises one pass and the rows read it.
- `blockedBy(claims, features, passes)` — returns the **setup**, not a boolean,
  so the inert control can name the lock to open.
- `disturbsLocked` now delegates to `blockedBy`. That is the part that matters:
  the two came apart because they were written twice, and a test asserts they
  agree press for press.

Asked **per press**, not once per row: a setup settled holding a face's rough
has not settled its finish, so shutting the whole row would be the lock claiming
ground it never took. `PassButtons` takes `blockedBy(passes)` in place of the
old `settled` string, and all four call sites in the panel now pass it — the
direction headers, hole rows, feature rows and the offer's own buttons, of which
only the feature rows were ever wired.

A second pass on the same report: with every refused button greyed alike, the
one reading that _was_ settled looked as empty as the four refused on its
behalf. State now decides the colour and the block decides only whether it
presses, so a settled reading keeps its lit R/F/Both — which is what somebody
opened the row to find out, and what the datasheet beside it was already saying.

**18 tests**, across the three layers, because the bug lived in the seam between
them: `plan-actions.test.ts` for the sibling case and the agreement check,
`pass-buttons.test.tsx` for per-pass inertness and the held colour,
`map-features.test.tsx` for **the wiring** — the layer that was actually wrong.
Each was checked against the old code first: restoring the old wiring fails
exactly the two that describe the reported bug, and restoring the old greying
fails the one about colour.

No e2e covers it. The component test is the right level for list-shaped
behaviour per `docs/README.md`, and a Playwright version would need a locked
setup plus a multi-reading face on the cube fixture.

---

## Risks still live

**Component coverage is thin.** `app/shared/` is well covered; `app/components/`
is 6 of 26. `part-inspector.tsx` — 2,462 lines, and the file every other change
threads through — has no unit tests and is covered only by the e2e. Those e2e are
the real safety net here.

**`reported-regions.test.ts` has an allow-list of file paths.** A source-scanning
guard over where `regionIdxs` may be read. Directory changes will make it fail,
and the fix is to update the list — not to delete the test. Its own comment calls
the `regionIdxs` / `cutRegions` / `coveredRegions` confusion "the most expensive
mistake in this app, four times over."

**`@toolpath/viewer` is three different packages.** `toolpath/packages/viewer` is
the published R3F one this app pins. `tp-ui/packages/viewer` is a private `0.0.0`
rewrite with a different export map (`./core` + `./api`, no R3F peer deps) —
**not drop-in compatible**. Same for `@toolpath/ui`, which exists three times. If
a search or an import resolution ever picks up the tp-ui one, nothing will make
sense.

**The sandbox has no remote.** Everything lives in one local clone plus
`~/dev/directions-patches/`. Now that the port has landed here, this repository is
the durable copy — but the sandbox is still the only home of its 141-commit
history.

---

## Corrections carried forward

Load-bearing claims that earlier drafts got wrong, kept because each was believed
long enough to act on:

1. **The template's base** is `4a0f2f1` (after PR #46) plus standalone adaptation
   — 17 files differ plus a rename — not `fdcff0e` with one line changed.
2. **The version bump.** `0.4.0` was already claimed by the pending view-cube
   changeset; ours stacks onto it rather than defining it.
3. **The changed-file count** is 40, not 101 — that figure counted every shared
   file, changed or not.
4. **What `render/part.ts` fixed.** An earlier draft described a `RedFormat` /
   `unpackAlignment` change fixing a crash on region counts not divisible by four.
   **No such change exists.** The real change is a dispose guard: a part rebuilt
   on the same geometry used to blank the new one, because the old part's
   `dispose` deleted the region attribute the new one had just set. That error
   reached the changeset, the commit message and the PR description on #51 before
   reading the diff caught it — a reminder that "every claim has the command that
   produced it" is a claim about a document, not a property of one.
5. **One publish, not two.** The `@toolpath/ui` `Button` dependency was invisible
   from the sandbox, which resolves the kit from its workspace.
