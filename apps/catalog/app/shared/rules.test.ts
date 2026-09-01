import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { SHEET } from './feature-defaults'
import { SETTING_KNOBS } from './holder-choice'
import {
  HOLDER_NUMBERS,
  KNOBS,
  RULES,
  TOOL_NUMBERS,
  featureMatches,
  knobValue,
  knobsNamed,
  knobsWith,
  parseKnobs,
  parseRules,
  parseTest,
  ruleCovers,
  rulesFor,
  patternCovers,
  toolTypeMatches,
} from './rules'
import { shankOf } from '@toolpath/catalog-data'

const KNOB_HEADER = 'knob,value,unit,note'
const RULE_HEADER = 'feature,when,tool types,for,rule,level,note'

const knobs = parseKnobs(
  [KNOB_HEADER, 'corner clearance,5,%,', 'through overcut,0.127,mm,', 'L/D band,2,ratio,'].join(
    '\n',
  ),
).knobs

const feature = (featureType: string, facts: Record<string, unknown> = {}): PartFeature =>
  ({
    tag: 'f1',
    featureType,
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [],
    datasheet: { zMin: -10, zMax: 0, extendedZMax: 0, facts: { kind: 'Pocket', ...facts } },
  }) as unknown as PartFeature

const tool = (form: string, geometry: Record<string, number>): CatalogTool =>
  ({ guid: 't', form, brand: 'Kennametal', geometry, provenance: {} }) as unknown as CatalogTool

describe('the committed sheets', () => {
  it('parse with nothing to report', () => {
    expect(KNOBS.problems).toEqual([])
    expect(RULES.problems).toEqual([])
    expect(RULES.rules.length).toBeGreaterThan(20)
  })

  /** A knob nobody names is a number nobody can find the effect of. */
  /** A knob is read by a rule row or, for the holder stage's settings, by name in `holder-choice.ts`; nothing else. */
  it('name every knob in at least one rule, or in the holder stage’s settings', () => {
    const named = new Set([...RULES.rules.flatMap(knobsNamed), ...Object.values(SETTING_KNOBS)])
    const unused = KNOBS.knobs.map((knob) => knob.name).filter((name) => !named.has(name))
    expect(unused).toEqual([])
    const missing = Object.values(SETTING_KNOBS).filter((name) => knobValue(name) === null)
    expect(missing).toEqual([])
  })

  /** A feature pattern that matches nothing in the defaults sheet is a row about a feature the kernel does not report. */
  it('name only features the defaults sheet knows', () => {
    const known = SHEET.rows.map((row) => row.feature)
    const orphans = RULES.rules
      .map((rule) => rule.feature)
      .filter((pattern) => !known.some((name) => featureMatches(pattern, name)))
    expect(orphans).toEqual([])
  })

  /** Paul's call, 2026-08-29: the engine's type preferences, not a ranking of tiles. */
  it('rank tool types the engine\u2019s way, and never by a tile order', () => {
    const named = RULES.rules.flatMap((rule) =>
      rule.test.kind === 'rank' && 'named' in rule.test ? [rule.test.named] : [],
    )
    expect(named).not.toContain('type priority')
    const orders = RULES.rules.filter(
      (rule) =>
        rule.test.kind === 'rank' && 'direction' in rule.test && rule.test.direction === 'order',
    )
    expect(orders.map((rule) => rule.feature)).toEqual(
      expect.arrayContaining(['Chamfer', '*Hole', 'Wall']),
    )
  })

  it('have a must on diameter and one on flute length that every feature inherits', () => {
    const musts = RULES.rules.filter((rule) => rule.level === 'must' && rule.feature === '*')
    const fields = musts.map((rule) => (rule.test.kind === 'bound' ? rule.test.field : ''))
    expect(fields).toContain('diameter')
    expect(fields).toContain('flute length')
  })

  it('carry the holder band Paul set: a quarter is the least, a third is good', () => {
    expect(knobValue('least hold')).toBe(25)
    expect(knobValue('good hold')).toBe(33)
    const held = RULES.rules.filter(
      (rule) =>
        rule.stage === 'holder' && rule.test.kind === 'bound' && rule.test.field === 'held share',
    )
    expect(held.map((rule) => rule.level)).toEqual(['must', 'prefer'])
    // The holder length rows are parked, by Paul's call: order among holders that work is still holdersFor's.
    expect(
      RULES.rules.some(
        (rule) =>
          rule.stage === 'holder' &&
          rule.test.kind === 'rank' &&
          'field' in rule.test &&
          rule.test.field === 'gauge length',
      ),
    ).toBe(false)
  })
})

describe('reading knobs', () => {
  it('reads a name, a number, and a unit, and names the line of a mistake', () => {
    const { knobs: read, problems } = parseKnobs(
      [
        KNOB_HEADER,
        'Corner Clearance,5,%,why',
        'bad,five,mm,',
        'odd,1,furlongs,',
        'corner clearance,1,mm,',
      ].join('\n'),
    )
    expect(read).toEqual([{ name: 'corner clearance', value: 5, unit: '%', note: 'why' }])
    expect(problems.map((problem) => problem.line)).toEqual([3, 4, 5])
    expect(problems[2]?.message).toContain('twice')
  })

  it('refuses a sheet whose header has lost a column', () => {
    expect(parseKnobs('knob,value\ncorner clearance,5').problems[0]?.line).toBe(1)
  })
})

describe('the three shapes of rule', () => {
  it('reads a bound against a feature field, with an adjustment', () => {
    expect(
      parseTest('diameter <= largest tool diameter - corner clearance', 'tool', knobs),
    ).toEqual({
      test: {
        kind: 'bound',
        field: 'diameter',
        operator: '<=',
        base: { kind: 'feature', name: 'largest tool diameter' },
        adjust: { sign: -1, term: { kind: 'knob', name: 'corner clearance' } },
      },
    })
  })

  it('reads a bound against a number, a percentage, and the best of the set', () => {
    expect(parseTest('tip angle = 180', 'tool', knobs)).toMatchObject({
      test: { kind: 'bound', operator: '=', base: { kind: 'number', value: 180 }, adjust: null },
    })
    expect(parseTest('diameter <= hole diameter - 2 %', 'tool', knobs)).toMatchObject({
      test: { adjust: { sign: -1, term: { kind: 'number', value: 2, percent: true } } },
    })
    expect(parseTest('L/D <= best L/D + L/D band', 'tool', knobs)).toMatchObject({
      test: {
        base: { kind: 'best', field: 'L/D' },
        adjust: { sign: 1, term: { kind: 'knob', name: 'l/d band' } },
      },
    })
  })

  it('reads an is, and knows what a shank can be', () => {
    expect(parseTest('form is not drill', 'tool', knobs)).toEqual({
      test: { kind: 'is', field: 'form', not: true, value: 'drill' },
    })
    expect(parseTest('shank is reduced', 'tool', knobs)).toMatchObject({
      test: { value: 'reduced' },
    })
    expect(parseTest('shank is thin', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('reduced'),
    })
    expect(parseTest('form is hammer', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('not a tool type'),
    })
  })

  it('reads a rank, with a cap and a closest-to', () => {
    expect(parseTest('L/D smallest', 'tool', knobs)).toEqual({
      test: { kind: 'rank', field: 'L/D', direction: 'smallest', capPercent: null, capOf: null },
    })
    expect(
      parseTest('diameter largest up to 90 % of largest tool diameter', 'tool', knobs),
    ).toMatchObject({
      test: { direction: 'largest', capPercent: 90, capOf: 'largest tool diameter' },
    })
    expect(parseTest('gauge length longest', 'holder', knobs)).toMatchObject({
      test: { field: 'gauge length', direction: 'largest' },
    })
    expect(parseTest('corner radius closest to floor fillet radius', 'tool', knobs)).toEqual({
      test: {
        kind: 'rank',
        field: 'corner radius',
        direction: 'closest',
        to: 'floor fillet radius',
        toPercent: 100,
        adjust: null,
      },
    })
    expect(
      parseTest('diameter closest to 90 % of largest tool diameter', 'tool', knobs),
    ).toMatchObject({
      test: { direction: 'closest', to: 'largest tool diameter', toPercent: 90, adjust: null },
    })
    expect(
      parseTest('diameter closest to largest tool diameter - corner clearance', 'tool', knobs),
    ).toMatchObject({
      test: {
        direction: 'closest',
        to: 'largest tool diameter',
        adjust: { sign: -1, term: { kind: 'knob', name: 'corner clearance' } },
      },
    })
    expect(parseTest('form in order chamfer mill; ball end mill', 'tool', knobs)).toEqual({
      test: {
        kind: 'rank',
        field: 'form',
        direction: 'order',
        order: ['chamfer mill', 'ball end mill'],
      },
    })
    expect(parseTest('form in order chamfer mill; hammer', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('hammer'),
    })
  })

  it('says what it could not read, naming the vocabulary', () => {
    expect(parseTest('girth <= largest tool diameter', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('not a tool field'),
    })
    expect(parseTest('diameter <= widest bit', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('not a feature field'),
    })
    expect(parseTest('diameter <= hole diameter + fudge', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('fudge'),
    })
    expect(parseTest('stickout shortest', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('not a tool field'),
    })
    expect(parseTest('form is drill', 'holder', knobs)).toMatchObject({
      error: expect.stringContaining('holder'),
    })
    expect(parseTest('just vibes', 'tool', knobs)).toMatchObject({
      error: expect.stringContaining('not a rule'),
    })
  })
})

describe('reading the rules sheet', () => {
  it('names the line and the mistake, and drops the row', () => {
    const { rules, problems } = parseRules(
      [
        RULE_HEADER,
        '*,,*,,diameter <= largest tool diameter,must,fine',
        ',,*,,diameter <= largest tool diameter,must,no feature',
        '*,,,,diameter <= largest tool diameter,must,no types',
        '*,,hammer,,diameter <= largest tool diameter,must,bad type',
        '*,,*,spindle,diameter <= largest tool diameter,must,bad stage',
        '*,,*,,diameter <= largest tool diameter,maybe,bad level',
        '*,,*,,L/D smallest,must,rank rule at the wrong level',
        '*,,*,,diameter <= largest tool diameter,rank,bound at the rank level',
        '*,sometimes,*,,diameter <= largest tool diameter,must,bad condition',
      ].join('\n'),
      knobs,
    )
    expect(rules).toHaveLength(1)
    expect(problems.map((problem) => problem.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('keeps the row as written for the report: feature pattern, types, stage, level, text', () => {
    const { rules } = parseRules(
      [RULE_HEADER, '*Hole,pointed bottom,drill; *end mill,holder,stickout shortest,rank,why'].join(
        '\n',
      ),
      knobs,
    )
    expect(rules[0]).toMatchObject({
      line: 2,
      feature: '*Hole',
      when: 'pointed bottom',
      toolTypes: ['drill', '*end mill'],
      stage: 'holder',
      level: 'rank',
      text: 'stickout shortest',
      note: 'why',
    })
  })
})

describe('matching', () => {
  it('matches a feature by pattern, however the name is written', () => {
    expect(featureMatches('*Hole', 'blind_hole')).toBe(true)
    expect(featureMatches('*Hole', 'ThreadedThroughHole')).toBe(true)
    expect(featureMatches('Through*', 'ThroughPocket')).toBe(true)
    expect(featureMatches('Pocket', 'FilletedPocket')).toBe(false)
    expect(featureMatches('*', 'anything')).toBe(true)
  })

  /** A `tool types` cell may name the shank instead of the form; a tool with no shoulder stated is taken by neither. */
  it('takes a tool by its shank where the row says so', () => {
    const { rules } = parseRules(
      [
        RULE_HEADER,
        '*,,full shank,,flute length >= feature depth,must,',
        '*,,reduced shank; drill,,flute length >= feature depth,must,',
      ].join('\n'),
      knobs,
    )
    expect(rules).toHaveLength(2)
    const full = tool('bull nose end mill', { DC: 6, 'shoulder-diameter': 6 })
    const reduced = tool('bull nose end mill', {
      DC: 6,
      LCF: 12,
      'shoulder-diameter': 5.5,
      'shoulder-length': 20,
    })
    const unknown = tool('bull nose end mill', { DC: 6 })
    expect(ruleCovers(rules[0]!, full)).toBe(true)
    expect(ruleCovers(rules[0]!, reduced)).toBe(false)
    expect(ruleCovers(rules[0]!, unknown)).toBe(false)
    expect(ruleCovers(rules[1]!, reduced)).toBe(true)
    expect(ruleCovers(rules[1]!, tool('drill', { DC: 6 }))).toBe(true)
    expect(
      parseRules(
        [RULE_HEADER, '*,,short shank,,flute length >= feature depth,must,'].join('\n'),
        knobs,
      ).problems,
    ).toHaveLength(1)
  })

  it('matches a tool type by pattern', () => {
    expect(toolTypeMatches('*end mill', 'bull nose end mill')).toBe(true)
    expect(toolTypeMatches('*end mill', 'drill')).toBe(false)
    expect(toolTypeMatches('drill', 'spot drill')).toBe(false)
    // The first row is the diameter cap, which every tool obeys **except** a
    // drill — its band is the bore plus the oversize knob, on the row below.
    expect(ruleCovers(RULES.rules[0]!, tool('flat end mill', {}))).toBe(true)
    expect(ruleCovers(RULES.rules[0]!, tool('drill', {}))).toBe(false)
  })

  /**
   * `not <pattern>` takes every tool the pattern does not.
   *
   * Written for the diameter cap, which holds for everything but a drill and
   * could otherwise only be written by naming every other kind of tool (Paul,
   * 2026-08-31: "drill oversize can and should widen the band").
   */
  it('reads a negated tool type', () => {
    expect(patternCovers('not drill', tool('drill', {}))).toBe(false)
    expect(patternCovers('not drill', tool('flat end mill', {}))).toBe(true)
    expect(patternCovers('not *end mill', tool('bull nose end mill', {}))).toBe(false)
    expect(patternCovers('not *end mill', tool('drill', {}))).toBe(true)
  })

  /** A shoulder narrower than the cut is a neck; the GOPR4RA0300N004 in the data reads 2.82 behind a 3 mm cut. */
  it('tells a reduced shank from a full one, and says nothing without a shoulder', () => {
    expect(
      shankOf(
        tool('flat end mill', { DC: 3, LCF: 4, 'shoulder-diameter': 2.82, 'shoulder-length': 7 }),
      ),
    ).toBe('reduced')
    expect(shankOf(tool('flat end mill', { DC: 6, 'shoulder-diameter': 6 }))).toBe('full')
    // Destiny's data: a shoulder under the cut with no length past the flutes is no relief — Paul's "real reduced shank" needs a section.
    expect(
      shankOf(
        tool('flat end mill', {
          DC: 6.35,
          LCF: 9.525,
          'shoulder-diameter': 5.969,
          'shoulder-length': 9.525,
        }),
      ),
    ).toBe('full')
    expect(shankOf(tool('drill', { DC: 6 }))).toBeNull()
  })
})

describe('what a feature gets', () => {
  const rules = parseRules(
    [
      RULE_HEADER,
      '*,,*,,diameter <= largest tool diameter,must,',
      '*,filleted,bull nose end mill,,corner radius <= floor fillet radius,must,',
      '*,,*,,L/D smallest,rank,general',
      'FilletedPocket,,*,,corner radius closest to floor fillet radius,rank,specific',
      'BlindHole,,drill,,tip angle = 180,must,',
    ].join('\n'),
    knobs,
  ).rules

  it('takes the rows whose feature and condition hold, in sheet order', () => {
    const plain = rulesFor(feature('Pocket'), [], rules)
    expect(plain.map((rule) => rule.line)).toEqual([2, 4])
    const filleted = rulesFor(feature('Pocket', { filletRadius: 1.5 }), [], rules)
    expect(filleted.map((rule) => rule.line)).toEqual([2, 3, 4])
  })

  it('puts a feature’s own rank rows before the general ones', () => {
    const rows = rulesFor(feature('FilletedPocket', { filletRadius: 1.5 }), [], rules)
    expect(rows.map((rule) => rule.note)).toEqual(['', '', 'specific', 'general'])
  })
})

describe('the vocabulary', () => {
  it('reads every tool number off the geometry the catalog carries', () => {
    const t = tool('flat end mill', {
      DC: 6,
      LCF: 12,
      LBH: 18,
      OAL: 60,
      LD: 3,
      RE: 0,
      NOF: 4,
      SFDM: 6,
    })
    expect(TOOL_NUMBERS['diameter']?.read(t)).toBe(6)
    expect(TOOL_NUMBERS['L/D']?.read(t)).toBe(3)
    expect(TOOL_NUMBERS['tip angle']?.read(t)).toBeNull()
    for (const name of Object.keys(TOOL_NUMBERS)) {
      expect(typeof TOOL_NUMBERS[name]?.read).toBe('function')
    }
  })

  it('names the holder fields the stack stage will read', () => {
    expect(Object.keys(HOLDER_NUMBERS)).toEqual(
      expect.arrayContaining([
        'stickout',
        'gauge length',
        'held share',
        'radial clearance',
        'axial clearance',
      ]),
    )
  })
})

describe('knobsWith', () => {
  /** The card's entered clearance replaces the sheet's; a name the sheet lacks is not invented. */
  it('replaces the named values and keeps the rest', () => {
    const knobs = knobsWith({ 'Radial Holder Clearance': 1.2, 'no such knob': 3 })
    expect(knobValue('radial holder clearance', knobs)).toBe(1.2)
    expect(knobValue('axial holder clearance', knobs)).toBe(knobValue('axial holder clearance'))
    expect(knobs).toHaveLength(KNOBS.knobs.length)
    expect(knobValue('radial holder clearance')).not.toBe(1.2)
  })
})
