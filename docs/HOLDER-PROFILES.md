# Measured holder profiles

A holder drawn from nine numbers a vendor publishes is a stylised holder. A
holder drawn from its own CAD model is the V-flange groove, the thread relief
and the nose lip a machinist actually looks for. This is the second thing, how
it gets here, and what is deliberately not finished.

## Where each half comes from

|                   | The published holder                      | The measured holder                                          |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------ |
| Source            | the vendor's table                        | the vendor's STEP model, measured by the Toolpath Engine API |
| Shape             | `Holder` — nose, body, projection, flange | `HolderProfile` — a `[z, r]` silhouette on the gage line     |
| Lives in          | the catalog document                      | its own document, read lazily                                |
| Decides clearance | **yes**                                   | no                                                           |

They are alternatives, not a refinement of one by the other. Reducing a measured
silhouette to a nose and a body throws away the only reason to measure it, which
is why `@toolpath/tool-drawing` makes them a union (`isHolderProfile`) rather
than one shape with optional extras.

## The pipeline

Everything up to the profile document is `@toolpath/tool-scraper`'s, run as a
maintainer's command. Nothing in the product makes these calls.

```
toolpath-scrape kennametal <FAMILY_CODE> holders.csv   # the vendor's table
toolpath-scrape cad        holders.csv                 # add the CAD model URLs
toolpath-scrape mirror-cad holders.csv                 # download the STEP models
toolpath-scrape profiles   holders.csv                 # measure them
```

`profiles` writes one document per family under `<root>/<brand>/profiles` and
the merged `<root>/profiles.json`, keyed by the holder's guid.

**It reads `TOOLPATH_API_URL` and `TOOLPATH_API_KEY`, not the applications'
`TOOLPATH_API_BASE_URL`.** Three separate facts, and the reason is that
`node/holder-import.ts` is a batch command with a bearer token and a presigned
PUT, deliberately outside the app's server, which is where every _other_ API key
in this workspace is handled.

Point it at local services:

```
export TOOLPATH_API_URL=http://localhost:4000
export TOOLPATH_API_KEY=...        # services: pnpm dev:api-key
```

Production is Engine API 1.1.0 and has no `/v1/holders` route at all. Local
(1.3.0) and staging (1.3.1) do. A run takes about a second per holder.

## How it reaches the drawing

```
scrape-out/profiles.json ──┐
                           ├─ vite alias `catalog-profiles` ─ shared/catalog.ts ─ getProfile(guid)
sample-profiles.json ──────┘                                                        │
                                                                                    ▼
                                              tool-drawing-input.ts ─ toViewerHolderProfile
                                                                                    │
                                                                                    ▼
                                                             @toolpath/tool-drawing
```

The alias mirrors `catalog-dataset` exactly: the gitignored scrape where a
machine has one, the committed sample otherwise, `CATALOG_PROFILES` to override.
A dataset and a profiles document that disagree are not an error — `getProfile`
answers null for a holder nobody has measured, which is what a partially
measured catalog genuinely is.

### What the spindle swallows is not drawn

A profile is measured whole, and on a CAT40 about half of what comes back is the
7:24 cone and the retention knob — the part that is inside the spindle when the
holder is in the machine. Drawing it answers no question the picture is being
asked, and it costs the frame: the tool ends up a fraction of the height it
could be so that a taper nobody is looking at fits beside it.

So `belowGageLine` in `@toolpath/catalog-data` cuts a `gage-line` profile at
`z = 0`, and `toViewerHolderProfile` is the one caller. Where the polyline
crosses the face between two vertices the crossing point is interpolated, so the
cut is the spindle face rather than the nearest vertex to it; below it nothing
is touched. The published holder needs no equivalent — `parametricSegments`
draws its flange up to the gauge length and stops there by construction.

A `nose`-datumed profile is passed through whole: with no gauge plane solved
there is no line to cut on, and `z = 0` on one of those is the nose, so cutting
there would delete the holder. So would a profile measured entirely above the
gage line, which is bad data rather than a short holder — that one is passed
through whole too, so it stays visible.

**The committed sample is synthetic**, like the sample catalog beside it and for
the same reason: a real profile is measured off a vendor's model, the model is
the vendor's, and this repository is public. `scripts/build-sample-profiles.mjs`
generates three silhouettes with the features a holder has, and pushes them
through the same `ingestProfiles` a scrape does, so a fixture the pipeline could
not have produced cannot be committed by accident.

## What is not done

**Clearance is still reasoned from the published dimensions.** `clearance()` in
`@toolpath/catalog-data` sweeps the parametric nose and body, so a measured
drawing and the verdict under it are answering from different geometry. Deferred
on purpose (Justin, 2026-09-02): teaching `clearance.ts` to sweep a `[z, r]`
polyline touches a dozen callers that draw nothing at all, and it is a change
worth making on its own. `catalog-drawing.tsx` takes a `measured` prop so a
consumer can compare the two pictures when investigating a disagreement.

**The record seam is not taken yet.** `@toolpath/tool-scraper` 2.1.0 mints
`HolderRecord` and `ColletRecord` and binds mappers for Kennametal, WIDIA,
REGO-FIX and MariTool — the upstream half of `TOOL-SCRAPER-REFACTOR.md` § step 6
is done. This repository has not moved onto it: `packages/catalog-data/src/scrape.ts`
still scrapes cutting tools only, `scripts/scrape.mjs` still writes
`holders: []`, and the `src/vendors/` stopgap mappers still have no callers. So
the only holders in the application today are the sample's three. Taking the
seam is what makes a real scrape produce real holders, and it is the next step.

## Orientation, and the day it was fixed

**A defect in the Engine API's holder import, fixed 2026-09-02.**
`HolderResponse.layers` is contracted as a stack of cones _nose first_, and
`@toolpath/tool-drawing` reads the last vertex of a profile as the nose. For a
while 42 of the 169 measured MariTool CAT40 holders arrived spindle-end first
and drew with the 7:24 taper pointing at the workpiece. The orientation tracked
the vendor's own STEP axis direction, so holder import was not normalising it.

The fix landed in the services layer and the whole corpus was re-measured
against it on kernel 0.7.3. CAT40 is the only family with a before-and-after,
and it settles the question:

|                                          | before   | after       |
| ---------------------------------------- | -------- | ----------- |
| reversed                                 | 42 / 169 | **0 / 169** |
| solved a gauge plane (`gage-line` datum) | 3        | **144**     |
| mean vertices                            | 107.6    | 82.6        |

Every reversed holder moved to correct, none moved the other way, and no holder
that measured before stopped measuring. Zero reversed across all 374 holders in
the five families. The taper solve improved far more than the orientation did,
which was not how the change was described.

`flipProfile` and the former holder browser's **flip holder** chip were the
response to this while it stood — a viewing aid over bad data — and both are
deleted, along with the `flipped` prop on `<CatalogDrawing>`. Nothing in this
repository flips anything: `ingestProfiles` maps points one for one and
`toViewerHolderProfile` only cuts the spindle end off the near one, which is now
the whole story.

**What the re-measure left open.** Twenty-two holders, all ER collet chucks,
report a _negative_ shortfall — the model measures longer than the vendor
publishes, never shorter. The values are quantised: ER16, ER32 and ER40 are all
exactly 3.17 mm, which is 1/8 inch, and ER20 splits between 2.67 and 2.41 mm. A
clean 1/8 inch across three collet series reads as a datum-definition
difference rather than noise, most likely the solve measuring to the far end of
the model where the vendor publishes to the nose face. It also makes `complete`
false for holders that do not fall short at all. Three holders fail import
outright on Parasolid errors: `BT30-ER32-52D` and `BT30-ER32-60D` on
`PK_ERROR_negative_body`, and `CAT40-ER25-4.0M` on
`PK_ERROR_failed_to_make_outline`.

**A trap for anyone re-checking this.** `complete` is vacuously true on a
`nose`-datum holder — `noseProfile` in `scrape.ts` sets it deliberately, since
with no gauge plane there is nothing to compare against. So a _rising_ solve
rate _lowers_ the complete count, and CAT40 going from 167 to 148 complete was
the metric becoming meaningful, not a regression.

**The standalone holder browser was removed on 2026-09-03.** The active part
workflow still draws measured holder profiles where an assembly is selected.
