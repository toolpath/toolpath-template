import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toPublicInspectionReport } from './contracts'
import type { PartReport } from './contracts'

/**
 * That the redaction covers the whole type, and not the three fields somebody
 * remembered.
 *
 * `toPublicInspectionReport` strips `meshGlbUrl`, `meshStlUrl` and
 * `thumbnailUrl` by naming them in a destructure. That is a **denylist**, and a
 * denylist is only ever correct about the version of the SDK it was written
 * against. Add a fourth URL to `PartResponse` upstream and:
 *
 * - nothing fails to compile — the new field rides through `...safeReport`, and
 *   `Omit<PartReport, 'meshGlbUrl' | 'meshStlUrl' | 'thumbnailUrl'>` keeps it;
 * - `contracts.test.ts` still passes — it only asserts the absence of the three
 *   URLs it put in its own fixture;
 * - a presigned artifact URL reaches the browser, which is the one failure the
 *   whole server layer exists to prevent.
 *
 * So the fixture is built from the SDK's own declaration rather than by hand,
 * and the second test watches the models the report *nests* — `Region` and
 * `PartFeature` declare no URL today, and one appearing there would sail past
 * the redaction entirely because it is not a top-level key.
 *
 * A failure here is not a broken test. It is an SDK that now hands out a URL
 * nobody has decided about yet.
 */

/**
 * The installed SDK's generated models.
 *
 * Walked up to rather than resolved by name: `@toolpath/api` exports only `.`,
 * so there is no specifier that reaches inside the package.
 */
const sdkModelsDir = (): string => {
  let at = import.meta.dirname

  while (dirname(at) !== at) {
    const candidate = join(at, 'node_modules/@toolpath/api/dist/generated/models')
    if (existsSync(candidate)) {
      return candidate
    }
    at = dirname(at)
  }

  throw new Error('Could not find the installed @toolpath/api generated models.')
}

const models = sdkModelsDir()

/** Every declared property whose name ends in `Url`, in source order. */
const urlFieldsIn = (declaration: string): Array<string> =>
  [...declaration.matchAll(/^\s+(\w*[Uu]rl)\??:/gm)].map((match) => match[1] ?? '')

const partResponse = readFileSync(join(models, 'PartResponse.d.ts'), 'utf8')
const partResponseBody = partResponse.slice(
  partResponse.indexOf('export interface PartResponse {'),
  partResponse.indexOf('\n}', partResponse.indexOf('export interface PartResponse {')),
)

const REPORT_URL_FIELDS = urlFieldsIn(partResponseBody)

/** A report with everything the redaction is not about, so only the URLs vary. */
const baseReport = {
  partId: 'part-1',
  reportId: 'report-1',
  jobId: 'job-1',
  kernelVersion: 'test',
  units: { length: 'mm', angle: 'deg' },
  regions: [],
  features: [],
  candidateDirections: [],
  directionZBounds: null,
  meshPointCount: 0,
  meshTriangleCount: 0,
  downloadMs: 1,
  recognitionMs: 1,
  enrichmentMs: 1,
  totalMs: 3,
}

describe('the report handed to the browser', () => {
  it('strips every URL the SDK declares on a part report, not the three we remember', () => {
    // If this ever reads zero the extraction has broken, and the test below it
    // would then be asserting nothing at all.
    expect(REPORT_URL_FIELDS.length).toBeGreaterThan(0)

    /*
     * Cast through `unknown` because the point of the fixture is that its URL
     * fields are decided at run time by the SDK's declaration. TypeScript cannot
     * know them, which is the same blind spot this test exists to cover.
     */
    const leaky = REPORT_URL_FIELDS.reduce<Record<string, unknown>>(
      (report, field) => ({ ...report, [field]: `https://engine.test/${field}?signature=secret` }),
      { ...baseReport },
    ) as unknown as PartReport

    const safe = toPublicInspectionReport(leaky)

    expect(Object.keys(safe).filter((key) => /url$/i.test(key))).toEqual([])
    expect(JSON.stringify(safe)).not.toContain('engine.test')
    expect(JSON.stringify(safe)).not.toContain('signature=secret')
  })

  it('keeps the SDK URL surface to the fields this app has already decided about', () => {
    const declared = readdirSync(models)
      .filter((file) => file.endsWith('.d.ts'))
      .flatMap((file) =>
        urlFieldsIn(readFileSync(join(models, file), 'utf8')).map(
          (field) => `${file.replace('.d.ts', '')}.${field}`,
        ),
      )

    /*
     * `uploadUrl` is the presigned PUT the browser is *meant* to receive — it is
     * the documented direct upload, and `routes/parts.ts` hands it over on
     * purpose. The other three are the ones the redaction strips.
     *
     * Anything else appearing here is a decision, not a merge: say which of the
     * two it is, and either add it to the strip in `contracts.ts` or add it here
     * with the reason it may be sent.
     */
    expect(declared.sort()).toEqual([
      'CreatePartResponse.uploadUrl',
      'PartResponse.meshGlbUrl',
      'PartResponse.meshStlUrl',
      'PartResponse.thumbnailUrl',
    ])
  })
})
