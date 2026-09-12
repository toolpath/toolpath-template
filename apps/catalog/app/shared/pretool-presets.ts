/**
 * The small, browser-safe part of PreTool's Excel preset generator that the
 * catalog needs at export time.  It deliberately stays here instead of
 * importing the legacy checkout: a deployed catalog must not depend on a
 * developer's `~/dev/toolpath_ui` directory.
 *
 * The constants and equations below are taken from PreTool's
 * `default_datasheets.ts` and `make_preset.ts` (GrayPaulModelExcel path).  The
 * catalog has only vendor geometry, so this module is the one place where the
 * shop-selected material and spindle ceiling turn that geometry into CAM
 * starting values.
 *
 * ## Nothing calls this, on purpose
 *
 * The Fusion export moved to `@toolpath/tool-support/export/fusion`, which
 * writes `defaultPreset` from `shared/fusion-input.ts` on every tool — a
 * placeholder whose every number is 1, there because a tool carrying no preset
 * is one Fusion refuses to load. This is kept because it is the whole model of
 * what those numbers should actually be, and re-deriving it is the expensive
 * part; the way back is the same argument the placeholder already travels on,
 * `ToolRequest.presets`.
 *
 * **Three things to fix before wiring it back**, each found by measuring what
 * this emits against the five preset shapes that package pins from Autodesk's
 * schema:
 *
 *   * `holePreset` serves spot and centre drills as well as drills, and a
 *     `spotting` preset requires five feedrates a `drilling` one does not —
 *     `v_f`, `v_f_leadIn`, `v_f_leadOut`, `v_f_ramp`, `v_f_transition`. Those
 *     presets are refused today and would be silently short otherwise.
 *   * A tap is fed by its own pitch, so a `tapping` preset models no feedrate at
 *     all. The `f_n`, `v_f_plunge`, `v_f_retract` and `use-feed-per-revolution`
 *     this writes onto one are dropped, because Fusion would never show them.
 *   * Everything here is computed in millimetres, and the export now states each
 *     record in the unit system the vendor published in. That package converts
 *     geometry and deliberately does not convert feeds and speeds — which unit a
 *     preset field uses differs per field — so an inch tool needs inch feeds
 *     from here, or its record carries two unit systems at once.
 */

export const PRETOOL_MATERIALS = ['AluWrought', 'LowCSteel', 'StainlessSteel'] as const

export type PretoolMaterial = (typeof PRETOOL_MATERIALS)[number]

export interface PresetTool {
  readonly form: string
  readonly diameter: number
  readonly fluteLength: number
  readonly flutes: number
  readonly cornerRadius: number
  readonly unit: 'millimeters'
}

export interface FusionPreset {
  readonly guid: string
  readonly name: string
  readonly material: {
    readonly category: 'all'
    readonly query: ''
    readonly 'use-hardness': false
  }
  readonly n: number
  readonly n_ramp?: number
  readonly v_c: number
  readonly v_f?: number
  readonly v_f_leadIn?: number
  readonly v_f_leadOut?: number
  readonly v_f_transition?: number
  readonly v_f_ramp?: number
  readonly v_f_plunge?: number
  readonly v_f_retract?: number
  readonly f_n?: number
  readonly 'ramp-angle'?: number
  readonly 'tool-coolant': 'flood'
  readonly 'use-stepdown'?: boolean
  readonly stepdown?: number
  readonly 'use-stepover'?: boolean
  readonly stepover?: number
  readonly 'use-feed-per-revolution'?: boolean
}

interface Sheet {
  readonly sfm: number
  readonly roughChip: number
  readonly finishChip: number
  readonly roughWoc: number
  readonly finishWoc: number
  readonly roughDoc: number
  readonly finishDoc: number
  readonly slotChip: number
}

/** The same material families and representative FF Excel rows PreTool ships. */
const SHEETS: Readonly<Record<PretoolMaterial, Sheet>> = {
  AluWrought: {
    sfm: 1000,
    roughChip: 0.0015,
    finishChip: 0.00075,
    roughWoc: 0.35,
    finishWoc: 0.03,
    roughDoc: 1,
    finishDoc: 1,
    slotChip: 0.001,
  },
  LowCSteel: {
    sfm: 600,
    roughChip: 0.001,
    finishChip: 0.00065,
    roughWoc: 0.3,
    finishWoc: 0.03,
    roughDoc: 0.75,
    finishDoc: 0.75,
    slotChip: 0.00075,
  },
  StainlessSteel: {
    sfm: 200,
    roughChip: 0.0006,
    finishChip: 0.00045,
    roughWoc: 0.2,
    finishWoc: 0.02,
    roughDoc: 0.5,
    finishDoc: 0.65,
    slotChip: 0.00045,
  },
}

const isMilling = (form: string): boolean =>
  [
    'flat end mill',
    'ball end mill',
    'bull nose end mill',
    'face mill',
    'chamfer mill',
    'radius mill',
    'slot mill',
    'thread mill',
  ].includes(form)

const rpmFor = (diameter: number, sfm: number, maxRpm: number): number =>
  Math.min(maxRpm, (sfm * 304.8) / (Math.PI * diameter))

const surfaceSpeed = (diameter: number, rpm: number): number => (diameter * Math.PI * rpm) / 1000

const material = { category: 'all', query: '', 'use-hardness': false } as const

const millingPreset = (
  name: string,
  tool: PresetTool,
  rpm: number,
  chip: number,
  stepover: number,
  stepdown: number,
  guid: string,
): FusionPreset => {
  const feed = chip * tool.diameter * rpm * tool.flutes
  return {
    guid,
    name,
    material,
    n: rpm,
    n_ramp: rpm,
    v_c: surfaceSpeed(tool.diameter, rpm),
    v_f: feed,
    v_f_leadIn: feed,
    v_f_leadOut: feed,
    v_f_transition: feed,
    v_f_ramp: feed,
    v_f_plunge: Math.min(feed * 0.3, 1524),
    f_n: feed / (rpm * tool.flutes),
    'ramp-angle': 2,
    'tool-coolant': 'flood',
    'use-stepdown': true,
    stepdown,
    'use-stepover': true,
    stepover,
  }
}

const holePreset = (
  name: string,
  tool: PresetTool,
  rpm: number,
  feedPerRev: number,
  guid: string,
): FusionPreset => ({
  guid,
  name,
  material,
  n: rpm,
  v_c: surfaceSpeed(tool.diameter, rpm),
  v_f_plunge: feedPerRev * rpm,
  v_f_retract: feedPerRev * rpm * 3,
  f_n: feedPerRev,
  'tool-coolant': 'flood',
  'use-feed-per-revolution': false,
})

/**
 * Generate the standard roughing/finishing set PreTool puts on an imported
 * tool.  The caller supplies ids because UUID creation belongs at the browser
 * boundary, not in otherwise deterministic calculation code.
 */
export const pretoolPresets = (
  tool: PresetTool,
  materialName: PretoolMaterial,
  maxRpm: number,
  nextGuid: () => string,
): Array<FusionPreset> => {
  const sheet = SHEETS[materialName]
  const rpm = rpmFor(tool.diameter, sheet.sfm, maxRpm)
  if (tool.form === 'drill' || tool.form === 'center drill' || tool.form === 'spot drill') {
    return [
      holePreset(
        `${materialName}_Drill`,
        tool,
        rpm,
        Math.max(tool.diameter * 0.01, 0.025),
        nextGuid(),
      ),
    ]
  }
  if (tool.form === 'tap left hand' || tool.form === 'tap right hand') {
    return [
      holePreset(
        `${materialName}_Tap`,
        tool,
        rpm,
        Math.max(tool.diameter * 0.01, 0.025),
        nextGuid(),
      ),
    ]
  }
  if (!isMilling(tool.form)) {
    return []
  }
  const prefix = materialName
  const rough = millingPreset(
    `${prefix}_Adaptive_Rough`,
    tool,
    rpm,
    sheet.roughChip,
    tool.diameter * sheet.roughWoc,
    tool.fluteLength * sheet.roughDoc,
    nextGuid(),
  )
  const finish = millingPreset(
    `${prefix}_Wall_Finish`,
    tool,
    rpm,
    sheet.finishChip,
    tool.diameter * sheet.finishWoc,
    tool.fluteLength * sheet.finishDoc,
    nextGuid(),
  )
  const slot = millingPreset(
    `${prefix}_Slot`,
    tool,
    rpm,
    sheet.slotChip,
    tool.diameter,
    tool.diameter,
    nextGuid(),
  )
  return [rough, finish, slot]
}
