import { isReachCurve, type PartFeature, type ReachCurve } from '@toolpath/part-contracts'
import { asNumber, asRecord } from '@toolpath/part-contracts/datasheet'
import { partTop } from '@toolpath/part-contracts/measurements'
import { TOOL_FORMS, isToolForm, type ToolForm } from '@toolpath/catalog-data'
import sheet from './feature-defaults.csv?raw'

/**
 * The datasheet that says, per kind of feature, what to show and what to
 * filter by — read from `feature-defaults.csv`, which sits beside this file
 * and is meant to be edited by hand.
 *
 * **The sheet is the source; this file only reads it.** The vocabulary the
 * sheet may use — field names, tool forms, conditions — is declared here, and
 * `feature-defaults.test.ts` checks the committed sheet against it, so a typo
 * in the sheet fails the gate rather than silently showing nothing.
 * `docs/FEATURE-DEFAULTS.md` is the guide to filling it in.
 *
 * Columns, in the sheet's order:
 *
 * - `feature` — a kernel `FeatureType`, matched case- and separator-insensitively.
 * - `when` — a condition; the first matching row for a feature wins, so put
 *   conditional rows before the plain one. Blank means always.
 * - `show` — fields to show in the feature strip, in priority order, separated
 *   by `;`. Showing only: what filters the tools is the rules sheet's.
 * - `tool types` — tool forms in priority order, separated by `;`. The first is
 *   what the list is sorted to first.
 * - `flutes` — `by material`, or a bound like `>= 4`, `<= 3`, `= 2`.
 * - `brand`, `holder`, `collet` — defaults, or blank for any.
 * - `notes` — free text, read by nobody but the next editor.
 */

export type Unit = 'mm' | 'deg' | 'ratio' | 'text'

/** What is read from the datasheet: the raw facts and the frame the numbers sit in. */
export interface Sheet {
  readonly facts: Record<string, unknown> | null
  readonly zMin: number | null
  readonly zMax: number | null
  readonly top: number | null
  /** The material around the feature, by offset from the cut — Engine API 1.0.4's reach curve. */
  readonly curve: ReachCurve | null
  /**
   * Whether anything stands under the cut.
   *
   * False for a cut taken clean through — a through hole, and a wall or a
   * profile with nothing below it. The tool then runs past the bottom, and
   * the overshoot is the tool's own to clear. Unstated is read as a floor,
   * so a datasheet that does not say adds no rule.
   */
  readonly hasFloor: boolean
}

export const sheetOf = (feature: PartFeature, partFeatures: ReadonlyArray<PartFeature>): Sheet => {
  // Kernel 0.3.0 said `minDepth`/`maxDepth` for what later reports call
  // `zMin`/`zMax`: the same numbers by older names.
  const raw = (feature.datasheet ?? {}) as Record<string, unknown>
  const variation = asRecord(raw.depthVariation)
  const curve =
    raw.reachCurve ??
    (variation ? { horizontalOffset: variation.deltaX, verticalOffset: variation.deltaY } : null)
  return {
    facts: asRecord(feature.datasheet?.facts),
    zMin: asNumber(feature.datasheet?.zMin) ?? asNumber(raw.minDepth),
    zMax: asNumber(feature.datasheet?.zMax) ?? asNumber(raw.maxDepth),
    top: partTop(partFeatures, feature),
    curve: isReachCurve(curve) ? curve : null,
    hasFloor: raw.hasFloor !== false,
  }
}

const number = (record: Record<string, unknown> | null, ...path: Array<string>): number | null => {
  let cursor: unknown = record
  for (const key of path) {
    const next = asRecord(cursor)
    if (!next) {
      return null
    }
    cursor = next[key]
  }
  return asNumber(cursor)
}

const positive = (value: number | null): number | null =>
  value !== null && value > 0 ? value : null

/** The widest cutter the shape admits: the bottom of the clearance band, or a sink's outer circle. */
const widestCutter = ({ facts }: Sheet): number | null => {
  const kind = facts?.kind
  if (kind === 'Chamfer') {
    const outer = number(facts, 'bevel', 'countersink', 'outerRadius')
    if (outer !== null) {
      return positive(outer * 2)
    }
    return positive(number(facts, 'three', 'cd', 'ignore', 'min'))
  }
  if (kind === 'Hole') {
    // **The bore, not the helix limit.** The widest *end mill* a hole admits
    // is smaller than the hole — it has to helix down inside it — and reading
    // that as "the largest tool" ruled out the drill that matches the bore,
    // by a rule written for every tool type. A hole ⌀8 with a 7.2 endmill
    // limit led with a ⌀6 end mill and no drill at all (Paul, 2026-08-31:
    // "it's undersizing tools"). The helix limit is its own field, and the
    // rule that wants it says so.
    return positive(
      number(facts, 'maxDrillDiameter') ??
        number(facts, 'diameter') ??
        number(facts, 'cd', 'ignore', 'min'),
    )
  }
  return positive(number(facts, 'cd', 'ignore', 'min'))
}

export interface Field {
  readonly unit: Unit
  /** Which `MeasurementIcon` draws it. */
  readonly icon: string
  readonly read: (sheet: Sheet) => number | string | null
}

/**
 * Every field a sheet may name, by the name the sheet uses.
 *
 * Read straight off the datasheet, in the datasheet's own terms, so a value
 * here is a value the DFM application's details panel would agree with.
 */
export const FIELDS: Readonly<Record<string, Field>> = {
  'depth below top': {
    unit: 'mm',
    icon: 'depthBelowTop',
    read: ({ top, zMin }) => (top !== null && zMin !== null && top > zMin ? top - zMin : null),
  },
  'feature depth': {
    unit: 'mm',
    icon: 'featureDepth',
    read: ({ zMax, zMin }) => (zMax !== null && zMin !== null && zMax > zMin ? zMax - zMin : null),
  },
  'largest tool diameter': {
    unit: 'mm',
    icon: 'maxTool',
    read: widestCutter,
  },
  'widest tool diameter': {
    unit: 'mm',
    icon: 'maxTool',
    // The top of the clearance band: the widest tool that fits *somewhere*
    // in the feature, as against the largest that reaches every corner. A
    // tool between the two can rough but cannot finish; one past this cannot
    // get in at all — the engine's practical-diameter check.
    read: (sheet) => positive(number(sheet.facts, 'cd', 'ignore', 'max')) ?? widestCutter(sheet),
  },
  /**
   * The widest end mill the feature admits, which for a hole is **not** the
   * bore: an end mill has to helix down inside it, so the Engine states its
   * own number. Anything else falls back to the widest cutter that reaches
   * every corner, where the two are the same question.
   */
  'largest end mill diameter': {
    unit: 'mm',
    icon: 'maxTool',
    read: (sheet) => positive(number(sheet.facts, 'maxEndmillDiameter')) ?? widestCutter(sheet),
  },
  'largest drill diameter': {
    unit: 'mm',
    icon: 'maxDrill',
    read: ({ facts }) => positive(number(facts, 'maxDrillDiameter') ?? number(facts, 'diameter')),
  },
  'smallest tool diameter': {
    unit: 'mm',
    icon: 'minRadius',
    read: ({ facts }) => {
      const inner = number(facts, 'bevel', 'countersink', 'innerRadius')
      return inner === null ? null : positive(inner * 2)
    },
  },
  'hole diameter': {
    unit: 'mm',
    icon: 'diameter',
    read: ({ facts }) => positive(number(facts, 'diameter')),
  },
  /**
   * The radius the finishing pass has to leave in the tightest corner.
   *
   * The kernel's `cd.terminalCornerRadius`. **Zero is a sharp corner**, and a
   * milling cutter cannot leave one: every mill leaves its own radius, so a
   * corner drawn sharp is a corner no mill finishes (Paul, 2026-09-01).
   */
  'terminal corner radius': {
    unit: 'mm',
    icon: 'minRadius',
    read: ({ facts }) => number(facts, 'cd', 'terminalCornerRadius'),
  },
  'corner radius': {
    unit: 'mm',
    icon: 'minRadius',
    read: (sheet) => {
      const cutter = widestCutter(sheet)
      return cutter === null ? null : cutter / 2
    },
  },
  'L/D': {
    unit: 'ratio',
    icon: 'ld',
    // Reach over the widest tool the shape admits; a hole over its bore,
    // because nothing wider than the bore goes in it — the DFM's own rule.
    read: (sheet) => {
      const { top, zMin, facts } = sheet
      if (top === null || zMin === null || top <= zMin) {
        return null
      }
      const across =
        facts?.kind === 'Hole' ? positive(number(facts, 'diameter')) : widestCutter(sheet)
      return across === null ? null : (top - zMin) / across
    },
  },
  'tip angle': {
    unit: 'deg',
    icon: 'bevelAngle',
    // Full apex angle of the cone at the bottom: 180 is a flat bottom. Shown,
    // not filtered — a drill's point angle is a match, an endmill has none.
    read: ({ facts }) => number(facts, 'fullConeDeg'),
  },
  'floor fillet radius': {
    unit: 'mm',
    icon: 'floorFillet',
    read: ({ facts }) => positive(number(facts, 'filletRadius')),
  },
  'chamfer angle': {
    unit: 'deg',
    icon: 'bevelAngle',
    read: ({ facts }) => number(facts, 'bevel', 'angleDeg'),
  },
  'chamfer included angle': {
    unit: 'deg',
    icon: 'bevelAngle',
    // What a chamfer mill's point angle is compared with: the bevel is stated
    // from the tool axis, the tool's angle is the whole cone.
    read: ({ facts }) => {
      const angle = number(facts, 'bevel', 'angleDeg')
      return angle === null ? null : angle * 2
    },
  },
  'slant length': {
    unit: 'mm',
    icon: 'featureDepth',
    // The length of cutting edge a tool needs to span the bevel in one pass.
    read: ({ facts }) => positive(number(facts, 'bevel', 'slant')),
  },
  'entry width': {
    unit: 'mm',
    icon: 'entryCutter',
    read: ({ facts }) => positive(number(facts, 'maxEntryCd')),
  },
  'undercut depth': {
    unit: 'mm',
    icon: 'featureDepth',
    read: ({ facts }) => positive(number(facts, 'undercutDepth')),
  },
  'taper angle': {
    unit: 'deg',
    icon: 'bevelAngle',
    read: ({ facts }) => number(facts, 'taperDeg'),
  },
  stepdown: {
    unit: 'mm',
    icon: 'featureDepth',
    read: ({ facts }) => positive(number(facts, 'maxStepdown')),
  },
  thread: {
    unit: 'text',
    icon: 'diameter',
    read: ({ facts }) => {
      const threading = asRecord(facts?.threading)
      if (!threading) {
        return null
      }
      const named = ['designation', 'size', 'name', 'pitch']
        .map((key) => threading[key])
        .filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
      return named.length > 0 ? named.join(' · ') : 'threaded'
    },
  },
}

/**
 * A condition a sheet row may carry.
 *
 * Named ones read the facts directly; a comparison names any numeric field
 * above. Several may be joined with `and`.
 */
const NAMED: Readonly<Record<string, (sheet: Sheet) => boolean>> = {
  filleted: ({ facts }) => (positive(number(facts, 'filletRadius')) ?? 0) > 0,
  'not filleted': ({ facts }) => (positive(number(facts, 'filletRadius')) ?? 0) === 0,
  'flat bottom': ({ facts }) => (number(facts, 'fullConeDeg') ?? 0) >= 180,
  'pointed bottom': (sheet) => {
    const cone = number(sheet.facts, 'fullConeDeg')
    return cone !== null && cone < 180
  },
  threaded: ({ facts }) => asRecord(facts?.threading) !== null,
  counterbore: ({ facts }) => facts?.isCounterbore === true,
  // A surface the kernel says only a ball can finish without a cusp.
  'ball only': ({ facts }) => facts?.useOnlyBallToolsForFinish === true,
  // Nothing under the cut: the tool is taken past the bottom, so the
  // overshoot is its own to clear — a through hole, or a wall or profile with
  // no floor. Unstated is read as a floor.
  'no floor': ({ hasFloor }) => !hasFloor,
  'has floor': ({ hasFloor }) => hasFloor,
}

const COMPARISON = /^(.+?)\s*(<=|>=|=|<|>)\s*(-?\d+(?:\.\d+)?)$/

export type Condition = (sheet: Sheet) => boolean

/** Parses one `when` cell, or explains why it cannot. */
export const parseCondition = (raw: string): { condition: Condition } | { error: string } => {
  const text = raw.trim()
  if (text === '') {
    return { condition: () => true }
  }
  const parts: Array<Condition> = []
  for (const clause of text.split(/\s+and\s+/i)) {
    const named = NAMED[clause.toLowerCase()]
    if (named) {
      parts.push(named)
      continue
    }
    const match = COMPARISON.exec(clause)
    const field = match ? FIELDS[match[1]!.trim()] : undefined
    if (!match || !field || field.unit === 'text') {
      return {
        error: `"${clause}" is not a condition. Use one of ${Object.keys(NAMED).join(', ')}, or "<field> <= number".`,
      }
    }
    const operator = match[2]!
    const threshold = Number(match[3])
    parts.push((sheet) => {
      const value = field.read(sheet)
      if (typeof value !== 'number') {
        return false
      }
      switch (operator) {
        case '<':
          return value < threshold
        case '<=':
          return value <= threshold
        case '>':
          return value > threshold
        case '>=':
          return value >= threshold
        default:
          return Math.abs(value - threshold) < 1e-6
      }
    })
  }
  return { condition: (sheet) => parts.every((part) => part(sheet)) }
}

export interface FeatureDefaults {
  readonly feature: string
  readonly when: string
  readonly condition: Condition
  readonly show: ReadonlyArray<string>
  readonly toolTypes: ReadonlyArray<ToolForm>
  /** `by material`, a bound, or nothing. */
  readonly flutes: string
  readonly brand: ReadonlyArray<string>
  readonly holder: string
  readonly collet: string
  readonly notes: string
}

export interface SheetProblem {
  readonly line: number
  readonly message: string
}

/** `FilletedOpenPocket`, `filleted_open_pocket` and `Filleted Open Pocket` are one name. */
export const featureKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const cells = (line: string): Array<string> => {
  const out: Array<string> = []
  let cell = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      out.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  out.push(cell.trim())
  return out
}

const list = (cell: string): Array<string> =>
  cell
    .split(';')
    .map((each) => each.trim())
    .filter(Boolean)

const FLUTES = /^(by material|(<=|>=|=)\s*\d+)$/

/**
 * The sheet, parsed and checked.
 *
 * Every problem is reported with its line, and a row with a problem is
 * dropped rather than half-applied: a filter from a mistyped field is a filter
 * somebody cannot see.
 */
export const parseSheet = (
  csv: string,
): { rows: Array<FeatureDefaults>; problems: Array<SheetProblem> } => {
  const rows: Array<FeatureDefaults> = []
  const problems: Array<SheetProblem> = []
  const lines = csv.split(/\r?\n/)
  const header = cells(lines[0] ?? '').map((each) => each.toLowerCase())
  const column = (name: string) => header.indexOf(name)
  const expected = [
    'feature',
    'when',
    'show',
    'tool types',
    'flutes',
    'brand',
    'holder',
    'collet',
    'notes',
  ]
  for (const name of expected) {
    if (column(name) === -1) {
      problems.push({ line: 1, message: `The header is missing a "${name}" column.` })
    }
  }
  if (problems.length > 0) {
    return { rows, problems }
  }

  lines.slice(1).forEach((line, index) => {
    const at = index + 2
    if (line.trim() === '') {
      return
    }
    const row = cells(line)
    const cell = (name: string) => row[column(name)] ?? ''
    const feature = cell('feature')
    if (feature === '') {
      problems.push({ line: at, message: 'No feature named.' })
      return
    }

    const parsed = parseCondition(cell('when'))
    if ('error' in parsed) {
      problems.push({ line: at, message: parsed.error })
      return
    }

    const show = list(cell('show'))
    const unknownField = show.find((name) => !(name in FIELDS))
    if (unknownField) {
      problems.push({
        line: at,
        message: `"${unknownField}" is not a field. Known fields: ${Object.keys(FIELDS).join(', ')}.`,
      })
      return
    }

    const toolTypes = list(cell('tool types'))
    const unknownForm = toolTypes.find((name) => !isToolForm(name))
    if (unknownForm) {
      problems.push({
        line: at,
        message: `"${unknownForm}" is not a tool type. Known types: ${TOOL_FORMS.map((each) => each.value).join(', ')}.`,
      })
      return
    }

    const flutes = cell('flutes')
    if (flutes !== '' && !FLUTES.test(flutes)) {
      problems.push({
        line: at,
        message: `"${flutes}" is not a flutes rule. Use "by material", or a bound like ">= 4".`,
      })
      return
    }

    rows.push({
      feature,
      when: cell('when'),
      condition: parsed.condition,
      show,
      toolTypes: toolTypes.filter(isToolForm),
      flutes,
      brand: list(cell('brand')),
      holder: cell('holder'),
      collet: cell('collet'),
      notes: cell('notes'),
    })
  })

  return { rows, problems }
}

/** The committed sheet. Its problems are the test's to report, not the page's. */
export const SHEET = parseSheet(sheet)

/** The row that applies to this feature, on this part: the first whose condition holds. */
export const defaultsFor = (
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
  rows: ReadonlyArray<FeatureDefaults> = SHEET.rows,
): FeatureDefaults | null => {
  const key = featureKey(feature.featureType)
  const facts = sheetOf(feature, partFeatures)
  return rows.find((row) => featureKey(row.feature) === key && row.condition(facts)) ?? null
}

export interface Reading {
  readonly name: string
  readonly unit: Unit
  readonly icon: string
  readonly value: number | string
}

/** The sheet's fields for this feature, with their values, in the sheet's order. Fields with nothing to say are left out. */
export const readingsFor = (
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
  names: ReadonlyArray<string>,
): Array<Reading> => {
  const facts = sheetOf(feature, partFeatures)
  return names.flatMap((name) => {
    const field = FIELDS[name]
    const value = field?.read(facts) ?? null
    if (!field || value === null) {
      return []
    }
    return [{ name, unit: field.unit, icon: field.icon, value }]
  })
}

/**
 * Whether this feature has a corner no milling cutter can leave.
 *
 * The kernel states the radius the finishing pass has to produce; zero means
 * the model draws the corner sharp, and every mill leaves its own radius. So
 * the list says so once, plainly, rather than offering tools that all miss the
 * same corner by their own diameter (Paul, 2026-09-01).
 *
 * Only where there is a corner to speak of: a hole has none, and a feature
 * with no wall has nothing to turn.
 */
export const hasSharpCorner = (feature: PartFeature): boolean => {
  const sheet = sheetOf(feature, [feature])
  const facts = sheet.facts
  if (facts?.kind === 'Hole' || facts?.kind === 'Chamfer') {
    return false
  }
  // A wall is what has a corner: the datasheet says so, and a feature with
  // none has nothing to turn around.
  if ((feature.datasheet as Record<string, unknown> | undefined)?.hasWall !== true) {
    return false
  }
  const radius = FIELDS['terminal corner radius']?.read(sheet) ?? null
  return radius === 0
}
