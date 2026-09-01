import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { judgeTools } from './judge'
import { marksFor, testedCodes } from './tool-marks'

const tool = (
  catalogNumber: string,
  geometry: Record<string, number>,
  form = 'flat end mill',
): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    brand: 'Kennametal',
    vendor: 'Kennametal',
    form,
    toolType: 'endmill',
    unitSystem: 'metric',
    geometry: { SFDM: geometry.DC ?? 6, OAL: 80, ...geometry },
    materialGroups: [],
    productLink: null,
    provenance: {},
  }) as unknown as CatalogTool

/** A pocket 12 deep whose tightest corner admits a ⌀10. */
const pocket: PartFeature = {
  featureTag: 'pocket-1',
  featureType: 'Pocket',
  machiningDirection: { x: 0, y: 0, z: 1 },
  regionIdxs: [1],
  datasheet: {
    zMin: -12,
    zMax: 0,
    extendedZMax: 0,
    facts: { kind: 'Pocket', filletRadius: 0, cd: { ignore: { min: 10, max: 14 } } },
  },
} as unknown as PartFeature

const marks = (each: CatalogTool) =>
  marksFor(judgeTools([each], pocket, [pocket])[0]!, testedCodes(pocket, [pocket]))

describe('what the matching says, column by column', () => {
  /**
   * The columns the rules read are a property of the feature, and every tool
   * in the list was judged against the same ones.
   */
  it('names the columns this feature’s rules read', () => {
    const codes = testedCodes(pocket, [pocket])

    expect(codes.has('DC')).toBe(true)
    expect(codes.has('LCF')).toBe(true)
    // Nothing in the sheet reads a pocket's shank diameter.
    expect(codes.has('SFDM')).toBe(false)
  })

  it('ticks a column the rules read and the tool passed', () => {
    expect(marks(tool('FITS', { DC: 9, LCF: 20, LD: 2 })).DC).toEqual({ ok: true })
  })

  /** Two words, and the rule's own sentence behind them. */
  it('says which way a column is wrong', () => {
    const wide = marks(tool('WIDE', { DC: 12, LCF: 20, LD: 2 })).DC

    expect(wide?.ok).toBe(false)
    expect(wide?.ok === false && wide.level).toBe('must')
    expect(wide?.ok === false && wide.why).toBe('too large')
    expect(wide?.ok === false && wide.detail).toContain('largest tool diameter')
  })

  /**
   * A tool of exactly the size the corner admits passes "no wider than the
   * tightest corner" and only trips "stay 5 % under it" — a preference the
   * ranking acts on, not a fault. It reads as a tool that fits, because it is
   * one (Paul, 2026-08-31: "if the tool is equal to or smaller than the
   * largest tool diameter for the pocket, it fits").
   */
  it('marks nothing on a tool at the very limit', () => {
    expect(marks(tool('EXACT', { DC: 10, LCF: 20, LD: 2 })).DC).toEqual({ ok: true })
  })

  it('says when there is not enough of it', () => {
    const short = marks(tool('SHORT', { DC: 9, LCF: 6, LD: 2 })).LCF

    expect(short?.ok === false && short.why).toBe('too small')
  })

  /** A tick on a number nobody checked would be a claim the sheet never made. */
  it('says nothing about a column no rule read', () => {
    expect(marks(tool('FITS', { DC: 9, LCF: 20, LD: 2 })).SFDM).toBeUndefined()
  })
})

describe('a bull nose on a floor the model draws sharp', () => {
  const sharp: PartFeature = {
    featureTag: 'pocket-2',
    featureType: 'Pocket',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: {
      zMin: -12,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Pocket', filletRadius: 0, cd: { ignore: { min: 10, max: 14 } } },
    },
  } as unknown as PartFeature

  /**
   * The sheet cautions rather than refuses — a bull nose standing in for a
   * flat end leaves its radius on the floor. So the corner radius column is
   * flagged, in the colour of a caution, and the tool stays on the list. It is
   * the only caution the table prints: every other `should` is a preference
   * about a tool that fits.
   */
  it('flags the corner radius as a caution, not a refusal', () => {
    const bull = tool('BULL', { DC: 9, RE: 0.5, LCF: 20, LD: 2 }, 'bull nose end mill')
    const marks = marksFor(judgeTools([bull], sharp, [sharp])[0]!, testedCodes(sharp, [sharp]))

    expect(marks.RE?.ok).toBe(false)
    expect(marks.RE?.ok === false && marks.RE.level).toBe('should')
    expect(marks.RE?.ok === false && marks.RE.detail).toContain('finishing radius limit')
  })

  /**
   * And it says what it leaves, not that the tool is tight — a bull nose in a
   * pocket with no floor radius is a floor that comes out with 0.5 in it, and
   * that is the number somebody decides on (Paul, 2026-08-31: "tight isn't
   * the wording … it's 'leaves tool corner radius floor radius'").
   */
  it('says the radius the tool leaves on the floor', () => {
    const bull = tool('BULL', { DC: 9, RE: 0.5, LCF: 20, LD: 2 }, 'bull nose end mill')
    const marks = marksFor(judgeTools([bull], sharp, [sharp])[0]!, testedCodes(sharp, [sharp]), {
      format: (value) => `${value.toFixed(2)} mm`,
    })

    expect(marks.RE?.ok === false && marks.RE.why).toBe('leaves 0.50 mm floor radius')
  })

  /**
   * And it says it **instead of** the value, because the value is the number
   * it just said, in the column that holds it (Paul, 2026-08-31, seeing
   * "leaves 0.010 in floor radius 0.010 in").
   */
  it('replaces the number rather than sitting beside it', () => {
    const bull = tool('BULL', { DC: 9, RE: 0.5, LCF: 20, LD: 2 }, 'bull nose end mill')
    const marks = marksFor(judgeTools([bull], sharp, [sharp])[0]!, testedCodes(sharp, [sharp]))

    expect(marks.RE?.ok === false && marks.RE.instead).toBe(true)
  })

  /**
   * Turn the floor radius allowance up and the same tool passes — but it
   * still leaves that radius, so the tick is orange and says what it leaves
   * (Paul, 2026-08-31: "corner radius should be an orange check if it's
   * within the floor radius allowed in the filters").
   */
  it('ticks an allowed radius in the colour of a caution', () => {
    const bull = tool('BULL', { DC: 9, RE: 0.5, LCF: 20, LD: 2 }, 'bull nose end mill')
    const allowed = judgeTools([bull], sharp, [sharp], {
      knobs: [{ name: 'finishing radius limit', value: 1, unit: 'mm', note: '' }],
    })[0]!
    const marks = marksFor(allowed, testedCodes(sharp, [sharp]), {
      format: (value) => `${value.toFixed(2)} mm`,
      cautionedForms: ['bull nose end mill'],
    })

    expect(marks.RE?.ok).toBe(true)
    expect(marks.RE?.ok === true && marks.RE.caution).toBe(
      'leaves 0.50 mm on the floor, which is allowed',
    )
  })

  /** A sharp tool trips nothing, so nothing is worded either way. */
  it('leaves a flat end mill corner radius ticked', () => {
    const flat = tool('FLAT', { DC: 9, RE: 0, LCF: 20, LD: 2 })
    const marks = marksFor(judgeTools([flat], sharp, [sharp])[0]!, testedCodes(sharp, [sharp]))

    expect(marks.RE).toEqual({ ok: true })
  })
})

describe('a drill against the hole it is for', () => {
  /** A 12 mm hole, pointed, as the sheet's drill rules read it. */
  const hole: PartFeature = {
    featureTag: 'hole-1',
    featureType: 'BlindHole',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [2],
    datasheet: {
      zMin: -20,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Hole', diameter: 12, hasPointedBottom: true, fullConeDeg: 140 },
    },
  } as unknown as PartFeature

  const noteFor = (each: CatalogTool) => {
    const mark = marksFor(judgeTools([each], hole, [hole])[0]!, testedCodes(hole, [hole]), {
      format: (value) => `${value.toFixed(2)} mm`,
      holeDiameter: 12,
    }).DC
    return mark?.ok === true ? mark.note : 'not ok'
  }

  /**
   * How far off the hole a drill is decides it, and that distance is neither
   * on the tool nor on the feature — it is between them (Paul, 2026-08-31).
   */
  it('says how far off the hole it is, as a fact rather than a fault', () => {
    expect(noteFor(tool('U', { DC: 11.95, LCF: 40, LD: 3, SIG: 140 }, 'drill'))).toBe('−0.05 mm')
    expect(noteFor(tool('E', { DC: 12, LCF: 40, LD: 3, SIG: 140 }, 'drill'))).toBe('±0.00 mm')
  })

  /**
   * **An oversized drill is a drill.** The diameter cap used to be one row
   * over every tool, so a drill wider than the bore was refused before its own
   * rows were reached and `drill oversize` could only ever narrow the band.
   * Since 2026-08-31 the cap is written `not drill` with a drill row beside
   * it, and raising the deviation widens the band as it says it does (Paul:
   * "drill oversize can and should widen the band").
   */
  it('notes an oversized drill inside the deviation, rather than refusing it', () => {
    expect(noteFor(tool('O', { DC: 12.05, LCF: 40, LD: 3, SIG: 140 }, 'drill'))).toBe('+0.05 mm')
  })

  /** Past the knob it is still refused: the band is a band. */
  it('still refuses a drill past the deviation', () => {
    expect(noteFor(tool('WIDE', { DC: 12.5, LCF: 40, LD: 3, SIG: 140 }, 'drill'))).toBe('not ok')
  })

  /**
   * A drill point against the bottom it cuts.
   *
   * The sheet cautions both ways and the table said nothing at all, because
   * the only wording it had was "tight" (Paul, 2026-08-31: "this should warn
   * about tip angle mismatch").
   */
  it('warns how far the point is from the bottom, and which way', () => {
    const sayFor = (drill: CatalogTool) => {
      const mark = marksFor(judgeTools([drill], hole, [hole])[0]!, testedCodes(hole, [hole]), {
        format: (value, kind) => (kind === 'deg' ? `${value.toFixed(0)}°` : String(value)),
        tipAngle: 118,
      }).SIG
      if (mark?.ok === true) {
        return mark.caution ?? 'matched'
      }
      return mark?.ok === false ? mark.why : 'no mark'
    }

    // Within the sheet's 35° tolerance, so not a fault — but still a cone
    // this drill will not leave sharp, which is worth saying.
    expect(sayFor(tool('SHALLOW', { DC: 12, LCF: 40, LD: 3, SIG: 140 }, 'drill'))).toBe(
      '22° shallower than the bottom',
    )
    expect(sayFor(tool('SHARP', { DC: 12, LCF: 40, LD: 3, SIG: 100 }, 'drill'))).toBe(
      '18° sharper than the bottom',
    )
    expect(sayFor(tool('MATCHED', { DC: 12, LCF: 40, LD: 3, SIG: 118 }, 'drill'))).toBe('matched')
  })

  /** An end mill in the same hole is not chosen on that distance. */
  it('says nothing of the sort about a tool that is not a drill', () => {
    const mill = tool('M', { DC: 10, LCF: 40, LD: 3 })
    const marks = marksFor(judgeTools([mill], hole, [hole])[0]!, testedCodes(hole, [hole]), {
      holeDiameter: 12,
    })

    expect(marks.DC?.ok === true && marks.DC.note).toBeUndefined()
  })
})

describe('a filleted floor', () => {
  /** A pocket the model draws with a 1 mm radius in the floor. */
  const filleted: PartFeature = {
    featureTag: 'pocket-2',
    featureType: 'Pocket',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [3],
    datasheet: {
      zMin: -12,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Pocket', filletRadius: 1, cd: { ignore: { min: 10, max: 14 } } },
    },
  } as unknown as PartFeature

  const markFor = (each: CatalogTool) =>
    marksFor(judgeTools([each], filleted, [filleted])[0]!, testedCodes(filleted, [filleted]), {
      format: (value) => `${value.toFixed(2)} mm`,
      floorFillet: 1,
    }).RE

  /**
   * Exact is green; under leaves a step and is ticked in the colour of a
   * caution; over is a refusal — a bigger nose cannot sit in the fillet
   * (Paul, 2026-08-31).
   */
  it('is green only on an exact match', () => {
    expect(markFor(tool('EXACT', { DC: 9, RE: 1, LCF: 20, LD: 2 }, 'bull nose end mill'))).toEqual({
      ok: true,
    })
  })

  it('cautions a tool under the fillet, and says by how much', () => {
    const mark = markFor(tool('UNDER', { DC: 9, RE: 0.5, LCF: 20, LD: 2 }, 'bull nose end mill'))

    expect(mark?.ok).toBe(true)
    expect(mark?.ok === true && mark.caution).toBe('0.50 mm under the 1.00 mm fillet')
  })

  it('refuses a tool over it', () => {
    const mark = markFor(tool('OVER', { DC: 9, RE: 2, LCF: 20, LD: 2 }, 'bull nose end mill'))

    expect(mark?.ok).toBe(false)
    expect(mark?.ok === false && mark.level).toBe('must')
  })
})
