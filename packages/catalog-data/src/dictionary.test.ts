import { GEOMETRY_FIELDS as SCRAPER_FIELDS, ISO_MATERIAL_GROUPS } from '@toolpath/tool-scraper'
import { describe, expect, it } from 'vitest'

import { DROPPED } from './ingest.js'
import { GEOMETRY_FIELDS, MATERIAL_GROUPS } from './types.js'

/**
 * That this package's dictionary still covers the scraper's.
 *
 * `types.GEOMETRY_FIELDS` carries a label, a unit and a description for each
 * geometry code, and it names the ISO 13399 code beside it. Those last two —
 * the code and its ISO counterpart — are the **scraper's** facts, restated
 * here, and a restatement is only correct about the version it was written
 * against. A field added upstream would arrive in a catalog with no label, and
 * the detail page would show a vendor code nobody can read.
 *
 * ## Why a test and not an import
 *
 * `types.ts` is the root export, which `apps/catalog` imports in the browser.
 * The scraper's `GEOMETRY_FIELDS` is a runtime value in a module that also
 * holds its record factory and column checks, so importing it there to derive
 * these would put the scraper in the browser bundle to save restating ten
 * strings. A test file is not bundled, so the pin costs nothing at runtime and
 * still fails the build when the two disagree.
 *
 * This is the same shape as the DFM application's `redaction.test.ts`: a
 * denylist or a restatement is fine as long as something fails when the thing
 * it was written against moves.
 */

describe('every geometry code the scraper emits has a label here', () => {
  /**
   * Or is dropped on the way in, with its reason — the two lists are checked
   * against each other rather than each being right on its own. `TP` is the
   * only one today: the scraper defines thread pitch as being "in the tool's
   * own unit system", and an inch tap's pitch is conventionally threads per
   * inch, a reciprocal rather than a length, so carrying it would produce a
   * number that looks like a pitch and is wrong by a factor of its own value.
   *
   * Un-dropping it without giving it a label fails here, which is the case a
   * bare "every code has a label" test would have let through.
   */
  it('covers the scraper dictionary, or drops the code by name', () => {
    const unlabelled = Object.keys(SCRAPER_FIELDS).filter(
      (code) => GEOMETRY_FIELDS[code] === undefined && !DROPPED.has(code),
    )

    expect(unlabelled).toEqual([])
  })

  it('does not drop a code it also labels', () => {
    const both = [...DROPPED.keys()].filter((code) => GEOMETRY_FIELDS[code] !== undefined)

    expect(both).toEqual([])
  })

  it('agrees with the scraper on every ISO counterpart it states', () => {
    const disagreed = Object.entries(SCRAPER_FIELDS).flatMap(([code, field]) => {
      const here = GEOMETRY_FIELDS[code]
      if (here === undefined || here.iso === field.iso) {
        return []
      }
      return [`${code}: scraper says ${String(field.iso)}, this package says ${String(here.iso)}`]
    })

    expect(disagreed).toEqual([])
  })
})

describe('the codes this package adds to the scraper’s', () => {
  /**
   * Three, and each is a claim rather than an oversight — which is why they are
   * listed rather than merely allowed. `LBH` and `LD` are worked out in
   * `build.ts` and no vendor states them; `LSCN` is ISO 13399's own clamping
   * length, which no vendor in this catalog publishes yet and which the
   * application will read in preference to any rule of thumb the day one does.
   *
   * A fourth appearing here without a reason beside it fails, which is the
   * point: the catalog inventing geometry is exactly what this dictionary
   * exists to keep visible.
   */
  it('are the three that are derived or awaited, and no others', () => {
    const added = Object.keys(GEOMETRY_FIELDS).filter(
      (code) => SCRAPER_FIELDS[code as keyof typeof SCRAPER_FIELDS] === undefined,
    )

    expect(added.sort()).toEqual(['LBH', 'LD', 'LSCN'])
  })

  /*
   * "Keys every entry by its own code" used to be a test here. The dictionary
   * carried a `code` beside its key and the two could disagree; it comes from
   * `@toolpath/tool-support` now, which keys on the code and stores no copy of
   * it, so the disagreement has no way to be written down. An unrepresentable
   * state needs no check.
   */
})

describe('the workpiece-material groups', () => {
  /**
   * ISO 513's main groups, in the order everything must agree on. A facet
   * rendered from one order and a tool's own list from another have no way to
   * notice they disagree, and the scraper orders its records by its own copy.
   */
  it('are the scraper’s list, in the scraper’s order', () => {
    expect([...MATERIAL_GROUPS]).toEqual([...ISO_MATERIAL_GROUPS])
  })
})
