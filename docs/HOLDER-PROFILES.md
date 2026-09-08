# Measured holder profiles

A holder drawn from nine numbers a vendor publishes is a stylised holder. A
holder drawn from its own CAD model is the V-flange groove, the thread relief
and the nose lip a machinist actually looks for. This is the second thing, how
it gets here, and what is deliberately not finished.

## Where each half comes from

|                   | The published holder                      | The measured holder                                             |
| ----------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Source            | the vendor's table                        | the vendor's STEP model, measured by the Toolpath Engine API    |
| Shape             | `Holder` — nose, body, projection, flange | `HolderProfile` — a `[z, r]` silhouette on the gage line        |
| Lives in          | the catalog document                      | its own document, read lazily                                   |
| Decides clearance | **yes**                                   | fills the numbers it decides from, where the vendor states none |

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

**Production carries the holder routes now** (2026-09-07). `api.toolpath.com`
answers Engine API 1.3.3 and serves `/v1/holders`, `/v1/holders/{id}` and the
Fusion pair, so a measuring run needs a key and nothing else. It was 1.1.0 with
no holder route at all when this document was written, which is why the pipeline
and this page both used to insist on a local stack; `TOOLPATH_API_URL` is now an
override for local or staging rather than a requirement.

The key is read from the environment only, never a flag — a key in a shell
history is a key in a CI log. A gitignored `packages/catalog-data/.env` is the
way that keeps it out of both, and the `profiles` script loads it:

```
# packages/catalog-data/.env
TOOLPATH_API_KEY=...

pnpm --filter @toolpath/catalog-data profiles
```

Point it somewhere else with `TOOLPATH_API_URL=http://localhost:4000` for the
local services stack, whose key comes from `pnpm dev:api-key` there. A run takes
about a second per holder.

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

**Clearance still sweeps a parametric holder — but no longer an empty one.**
`clearance()` builds its silhouette from the published nose, body and flange,
and teaching it to sweep a `[z, r]` polyline is still the change worth making on
its own (Justin, 2026-09-02): it touches a dozen callers that draw nothing.

What changed on 2026-09-07 is that the parametric holder it sweeps is no longer
_blank_. Under the record seam a `HolderRecord` publishes none of those numbers,
so the sweep checked the tool's shank and nothing else, answered "clears the
part" for every holder in the rack, and returned `requiredStickout: null` —
which meant nothing told a stack to stand out at all. A tool for a pocket two
inches deep was set up at its half-inch flute length with the holder drawn well
inside the part (Paul, with a screenshot of exactly that).

`dimensionsFromProfile` reduces a measurement to the three layers the sweep
reads, and `withMeasuredDimensions` fills **only** the fields the vendor left
null — a published number is that vendor's claim and stays. `app/shared/catalog.ts`
applies it once, where `holders` is exported, so the grading, the stickout, the
drawing and the verdict all read the same holder. On `BT30-ER11-110DT` against a
2.066 in wall, `requiredStickout` goes from `null` to 53 mm and `checked` from
`["shank"]` to the whole silhouette.

**The reduction is conservative on purpose.** Three bands cannot describe forty
steps, so each band takes the _widest_ radius in it: it may claim a holder is
fatter than it is, never thinner. Thinner is what puts a holder through a wall
and calls it clear. The band boundaries land on the real risers — the flange,
and the shoulder behind the collet nut — rather than on the chamfer off the
nut's own face, which is a tenth of a millimetre above the tip and would
otherwise make the band above it the entire holder.

It is still a reduction, and the polyline sweep would beat it.
`catalog-drawing.tsx` takes a `measured` prop so a consumer can compare the two
pictures when investigating a disagreement.

**The record seam is taken, and it is what makes the measurement compulsory.**
`scrape:holding` drives `@toolpath/tool-scraper` 2.3.0's `HolderRecord` through
`boundToolholding`/`toHolding`, and a scrape on 2026-09-07 produced 555 holders
and 181 collets — MariTool 522, REGO-FIX 21, Kennametal 12.

A record states no nose, so **not one of those 555 could be drawn
parametrically**: `parametricSegments` in `@toolpath/tool-drawing` returns no
segments at all when `noseDiameter` is null, and that is every holder from the
seam. The 21 REGO-FIX records that carry _some_ published dimension carry no
nose either. A measured profile is therefore not the better of two pictures any
more — it is the only one, and a rack nobody has run `profiles` over shows no
holders at all.

379 of the 555 publish a `cadModelUrl` to measure. The remaining 176 have no
silhouette from any source; `drawable` in `apps/catalog/app/shared/holder-choice.ts`
is what keeps them out of the holder dropdown, checked against the real
`assemblyOutline` in `holder-drawable.test.ts` rather than restating the
package's gate.

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
