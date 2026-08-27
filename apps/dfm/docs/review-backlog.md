# Review backlog

Three defects found in the code review of `paul/directions-mapping` (2026-08-27)
that were **deliberately not fixed on that branch**.

All three are **pre-existing on `main`**. The branch's own server diff is brace
reformatting and nothing else — `git diff main...HEAD -- apps/dfm/server/` shows
only the braces the new lint rule added. So none of these is a regression the
branch introduced, and none of them was in scope for the four findings it did
fix (the e2e flake, a stale comment, the tab code-split, and the panel
re-render coupling — commit `4c4ce08`).

Two of the three are in `apps/dfm/server/`, which is the API-key boundary. That
is a good reason to do them in a change that is only about the server, rather
than inside a 40k-line client branch where a server edit is invisible.

| #   | What                                         | Where                          | Severity      |
| --- | -------------------------------------------- | ------------------------------ | ------------- |
| 5   | Mesh retry drops a `Response` unconsumed     | `server/routes/mesh.ts:29-32`  | Low           |
| 6   | Datasheet enrichment is serial and unbounded | `server/engine.ts:151-162`     | Low–Medium    |
| 7   | `@toolpath/ui` is a git-tracked tarball      | `vendor/toolpath-ui-0.1.0.tgz` | Informational |

---

## 5. Mesh retry discards a `Response` without consuming its body

**Where:** `apps/dfm/server/routes/mesh.ts:29-32`

```ts
let artifact = await load()
if (!artifact.ok) {
  artifact = await load()
}
```

**Evidence.** The first `Response` is overwritten by the retry. Its body is
never read and never cancelled, so undici keeps the underlying socket alive
until the object is garbage collected rather than releasing it back to the pool
at once.

**Impact.** A slow leak of sockets on the mesh path, proportional to how often
the first artifact fetch fails. The 15-minute presigned artifact URL expiring is
exactly the case the retry exists for, so this is not a rare branch — it is the
branch that runs whenever somebody leaves a part open and comes back to it.

**Fix.**

```ts
let artifact = await load()
if (!artifact.ok) {
  await artifact.body?.cancel()
  artifact = await load()
}
```

Worth a note in the code that the retry is for an expired URL, since that is
what justifies re-fetching the whole report rather than just re-fetching the
same URL.

**Test.** `server/app.test.ts` already stubs `fetch`; a case that returns a
failing response first and asserts its body was cancelled would pin this.

---

## 6. Datasheet enrichment is serial and scales with part size

**Where:** `apps/dfm/server/engine.ts:151-162`, in `getWholePartReport`

```ts
for (let index = 0; index < missingIds.length; index += DATASHEET_BATCH_SIZE) {
  const ids = missingIds.slice(index, index + DATASHEET_BATCH_SIZE)
  const datasheets = await requireData(
    engine.features.getPartFeatures({ id: partId, ids: ids.join(',') }),
    'get feature datasheets',
  )
  // …
}
```

**Evidence.** `DATASHEET_BATCH_SIZE` is 50 and every batch is awaited before the
next one starts. A 2,000-feature part is 40 sequential Engine round trips.

**Impact.** This runs inside the SSE handler, from `readAnalysis`, on the
`succeeded` event — so the stream is held open and the browser sits on
"Analyzing geometry…" for the whole serial walk, after the analysis itself has
already finished. The time is entirely latency, not work: 40 round trips at
100 ms is four seconds of nothing.

**Fix.** Bounded concurrency — roughly four batches in flight, not all of them
(the point of batching is to stay inside a URL-length limit, and firing 40
concurrent requests at the Engine trades one problem for another). Something
like a small worker pool over the batch list, or chunking the batches into
groups of four and `Promise.all`-ing each group.

**Watch for.** `datasheetsByTag` is keyed by `featureTag` and written from every
batch. Any concurrent version must keep that map write safe — it is fine as-is
because each batch writes distinct tags, but that is worth an explicit comment
if the loop stops being sequential.

**Test.** Assert the number of in-flight calls never exceeds the cap, and that
every returned datasheet still lands on its feature.

---

## 7. `@toolpath/ui` is a git-tracked binary tarball

**Where:** `vendor/toolpath-ui-0.1.0.tgz` (116 KB), referenced from
`apps/dfm/package.json` as `"@toolpath/ui": "file:../../vendor/toolpath-ui-0.1.0.tgz"`

**Evidence.** `git ls-files vendor/` tracks the tarball. `pnpm-lock.yaml:1077`
carries an integrity hash for it, so builds _are_ reproducible.

**Why it is here.** Commit `2d1d784` — "take @toolpath/ui from a vendored build
with the click fix". It was vendored to get a fix that was not released yet.

**Impact.**

- It cannot receive upstream fixes, including security ones. The version is
  frozen at whatever was built into that file.
- `pnpm audit` cannot see inside it, so a vulnerability in its dependency tree
  is invisible to the gate that exists to find exactly that.
- The tarball is opaque in review — a diff to it is unreadable.

**Status.** This is a half-finished migration, not a decision. Commit `001985f`
already took `@toolpath/viewer` back to npm (`0.4.0`) after the same treatment.
`@toolpath/ui` is the remaining half.

**Fix.** Once the click fix ships in a published `@toolpath/ui`, move the
dependency to that version and delete `vendor/`. If it is going to stay vendored
for a while, say so in `AGENTS.md` with the reason and the release that will end
it — otherwise the next person reads it as normal practice and vendors the next
thing too.

---

## Not on this list, and why

Things the review checked and found clean, recorded so they are not re-checked
from scratch:

- **Report redaction is complete.** `toPublicInspectionReport`
  (`app/shared/contracts.ts:28`) strips `meshGlbUrl`, `meshStlUrl` and
  `thumbnailUrl`. Checking the SDK models, `PartResponse` and
  `CreatePartResponse` are the only types that carry URLs at all — `Region` and
  `PartFeature` carry none. So the redaction covers everything, not just the
  fields somebody remembered.
- **The browser calls only app-owned endpoints.** The single external fetch is
  the presigned `PUT` at `app/client/api.ts:45`, which is the documented direct
  upload. No Toolpath host appears anywhere under `app/`.
- **The API key never leaves the server.** HttpOnly, Secure, SameSite=Lax
  `A256GCM` JWE cookie, HKDF domain-separated from `APP_SESSION_SECRET`. Engine
  failures log status and operation, never the key or the artifact URL.
- **`banana.glb` is not a bundle problem.** 763 KB, but it is a `public/` asset,
  off by default, and deliberately not preloaded (`app/components/banana.tsx:149`).
- **No coverage script exists.** The repo has no configured coverage tooling.
  That is a gap in what can be measured, not a failing check — do not substitute
  a different tool and report it as coverage.
