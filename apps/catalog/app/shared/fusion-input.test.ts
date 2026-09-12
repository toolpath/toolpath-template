import { describe, expect, it } from 'vitest'
import type { CatalogTool, Holder, HolderProfile, ToolForm } from '@toolpath/catalog-data'
import {
  FUSION_TYPES,
  fusionLibrary,
  fusionLibraryJson,
} from '@toolpath/tool-support/export/fusion'
import { DEFAULT_PRESET_NAME, fusionInput, fusionReport, type OrderedStack } from './fusion-input'

/**
 * The seam between this catalog and `@toolpath/tool-support/export/fusion`.
 *
 * The exporter's own rules are tested where they live, against Autodesk's
 * schema. What is tested here is only what this application decides: which
 * field answers which, which guid a record gets, which arm of the holder union
 * travels, and how a note comes back as something a machinist can read.
 */

/** Every length in millimetres, as the catalog stores them whatever the vendor published. */
const endMill: CatalogTool = {
  guid: 'cat-tool-1',
  familyId: 'example_square_4fl',
  brand: 'Example',
  vendor: 'Example Tools Inc',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 6, SFDM: 6, OAL: 57, LCF: 18, NOF: 4, LBH: 24 },
  materialGroups: ['N'],
  productLine: null,
  threadMethod: null,
  productLink: 'https://example.test/TDMX0600',
  provenance: {},
}

const holder: Holder = {
  guid: 'cat-holder-1',
  familyId: 'example_bt40_er32',
  brand: 'ExampleHold',
  vendor: 'ExampleHold GmbH',
  catalogNumber: 'BT40-ER32-100',
  materialNumber: null,
  contact: 'taper',
  taper: 'BT40',
  clamping: 'collet',
  boreDiameter: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
  noseDiameter: 33,
  noseLength: 45,
  bodyDiameter: 45,
  bodyLength: 5,
  projection: 50,
  flangeDiameter: 63,
  gaugeLength: 50,
  colletSeries: 'ER32',
  colletProtrusion: null,
}

/** `[z, r]`, z running from the gage line toward the cutting end. */
const profile: HolderProfile = {
  guid: 'cat-holder-1',
  catalogNumber: 'BT40-ER32-100',
  datum: 'gage-line',
  points: [
    [-30, 22],
    [0, 31.5],
    [40, 22.5],
    [60, 16.5],
  ],
  complete: true,
  shortfallMm: null,
}

/** Deterministic guids, so a test can say which record is which. */
const counting = () => {
  let at = 0
  return () => {
    at += 1
    return `guid-${at}`
  }
}

const oneStack = (over: Partial<OrderedStack> = {}): Array<OrderedStack> => [
  { key: 'row-1', tool: endMill, ...over },
]

describe('the tool an order-list row becomes', () => {
  const [only] = fusionInput(oneStack(), counting())

  it('answers the catalog’s unitSystem to the exporter’s unit', () => {
    // The one rename ingestion makes that the exporter's input does not.
    expect(only?.request.tool.unit).toBe('millimeters')
  })

  it('states the vendor, the order number and the link the catalog holds', () => {
    expect(only?.request.tool.vendor).toBe('Example')
    expect(only?.request.tool.catalogNumber).toBe('TDMX0600')
    expect(only?.request.tool.productLink).toBe('https://example.test/TDMX0600')
    expect(only?.request.tool.description).toBe('Example TDMX0600')
  })

  it('turns a catalog null into an absent field, not an empty string', () => {
    // `null` is the vendor naming none; the exporter's input says that by
    // saying nothing, and `'null'` would be written into the file as a link.
    const [without] = fusionInput(oneStack({ tool: { ...endMill, productLink: null } }), counting())
    expect(without?.request.tool).not.toHaveProperty('productLink')
  })

  it('falls back to the catalog’s own LBH when no stickout was chosen', () => {
    expect(only?.request.assembly?.stickout).toBe(24)
  })

  it('prefers the stickout the stack was set up at', () => {
    const [chosen] = fusionInput(oneStack({ stickout: 31 }), counting())
    expect(chosen?.request.assembly?.stickout).toBe(31)
  })

  it('numbers the carousel by the row’s place on the list', () => {
    const two = fusionInput([...oneStack(), { key: 'row-2', tool: endMill }], counting())
    expect(two.map((each) => each.request.tool.number)).toEqual([1, 2])
  })
})

describe('identity is per stack, not per catalog tool', () => {
  it('gives one tool in two holders two Fusion records', () => {
    // The exporter mints no guid and would reuse the catalog's, under which
    // Fusion would hold the second assembly and forget the first. A machinist
    // sets these up separately, so they are two tools.
    const requests = fusionInput(
      [
        { key: 'row-1', tool: endMill, holder },
        { key: 'row-2', tool: endMill, holder },
      ],
      counting(),
    )
    const [first, second] = requests
    expect(first?.toolGuid).not.toBe(second?.toolGuid)
    expect(first?.request.tool.guid).toBe(first?.toolGuid)

    const { document } = fusionLibrary({ tools: requests.map((each) => each.request) })
    expect(new Set(document.data.map((record) => record.guid)).size).toBe(2)
  })

  it('gives the holder a guid of its own, and remembers whose it is', () => {
    const [only] = fusionInput(oneStack({ holder }), counting())
    expect(only?.holderGuid).not.toBe(only?.toolGuid)
    expect(only?.request.assembly?.holder?.guid).toBe(only?.holderGuid)
  })

  it('reports no holder guid for a stack held in nothing', () => {
    const [only] = fusionInput(oneStack(), counting())
    expect(only?.holderGuid).toBeNull()
  })
})

describe('which holder shape travels', () => {
  it('sends the measured silhouette when the model is complete', () => {
    const [only] = fusionInput(oneStack({ holder, profile }), counting())
    expect(only?.request.assembly?.holder?.holder).toHaveProperty('points')

    const { document } = fusionLibrary({ tools: [only!.request] })
    const written = document.data[0] as { holder?: { gaugeLength?: number } }
    // Everything above the gage line is the taper and the retention knob, which
    // Fusion does not want: the stack is the 60 mm below it.
    expect(written.holder?.gaugeLength).toBe(60)
  })

  it('carries the collet series and protrusion across from the holder record', () => {
    // The measurement record states neither, and the domain shape requires both.
    const [only] = fusionInput(oneStack({ holder, profile }), counting())
    expect(only?.request.assembly?.holder?.holder).toMatchObject({
      colletSeries: 'ER32',
      colletProtrusion: null,
    })
  })

  it('refuses an incomplete model and sends the published dimensions instead', () => {
    // A model that stops at the threaded nose is missing the collet nut — the
    // end that fouls the part. Exported, it would let Fusion clear material the
    // real holder runs into.
    const short = { ...profile, complete: false, shortfallMm: 12 }
    const [only] = fusionInput(oneStack({ holder, profile: short }), counting())
    expect(only?.request.assembly?.holder?.holder).not.toHaveProperty('points')
    expect(only?.request.assembly?.holder?.holder).toMatchObject({ noseDiameter: 33 })
  })

  it('sends the published dimensions when nothing was measured', () => {
    const [only] = fusionInput(oneStack({ holder, profile: null }), counting())
    expect(only?.request.assembly?.holder?.holder).not.toHaveProperty('points')
  })
})

describe('what the export has to say for itself', () => {
  it('counts what landed and says nothing where nothing went wrong', () => {
    const requests = fusionInput(oneStack({ holder }), counting())
    const { document, notes } = fusionLibrary({ tools: requests.map((each) => each.request) })
    const report = fusionReport(requests, document, notes)

    expect(report.exported).toBe(1)
    expect(report.skipped).toEqual([])
    expect(report.holderWarnings).toEqual([])
  })

  it('names the tool Fusion refused, by the number a machinist orders it under', () => {
    // A bull nose end mill with no stated corner radius is not a flat end mill,
    // so the exporter leaves it out rather than flattening it.
    const bullNose: CatalogTool = {
      ...endMill,
      catalogNumber: 'TDMX0800',
      form: 'bull nose end mill',
    }
    const requests = fusionInput([{ key: 'row-1', tool: bullNose }], counting())
    const { document, notes } = fusionLibrary({ tools: requests.map((each) => each.request) })
    const report = fusionReport(requests, document, notes)

    expect(report.exported).toBe(0)
    expect(report.skipped[0]?.catalogNumber).toBe('TDMX0800')
    expect(report.skipped[0]?.reason).toContain('RE')
  })

  it('passes on what the holder could not say, against the tool it was on', () => {
    const noGauge: Holder = { ...holder, gaugeLength: null }
    const requests = fusionInput(oneStack({ holder: noGauge }), counting())
    const { document, notes } = fusionLibrary({ tools: requests.map((each) => each.request) })
    const report = fusionReport(requests, document, notes)

    expect(report.exported).toBe(1)
    expect(report.holderWarnings[0]?.catalogNumber).toBe('TDMX0600')
    expect(report.holderWarnings[0]?.reason).toContain('gauge length')
  })

  it('does not surface what the exporter merely filled in', () => {
    // Every tool draws several `filled` notes — the hand, the coolant flag, the
    // shoulder read off the shank. They are the format's conventions, not
    // anything a shop has to act on.
    const requests = fusionInput(oneStack({ holder }), counting())
    const { document, notes } = fusionLibrary({ tools: requests.map((each) => each.request) })

    expect(notes.some((note) => note.kind === 'filled')).toBe(true)
    const report = fusionReport(requests, document, notes)
    expect(report.skipped.length + report.holderWarnings.length).toBe(0)
  })
})

describe('the file that comes out', () => {
  const requests = fusionInput(oneStack({ holder }), counting())
  const { document } = fusionLibrary({ tools: requests.map((each) => each.request) })
  const text = fusionLibraryJson(document)

  it('writes a preset, because a tool with none is one Fusion will not load', () => {
    // This went out as `presets: []` until 2026-09-11, on the reading that the
    // schema wants the key and not a preset in it. Autodesk's `minLength: 1` on
    // the array is a no-op — it is a string keyword — so nothing caught it, and
    // the libraries would not import.
    const written = JSON.parse(text).data[0]['start-values'].presets
    expect(written).toHaveLength(1)
    expect(written[0].name).toBe(DEFAULT_PRESET_NAME)
  })

  it('keeps the decimal point on a dimension that lands on a whole number', () => {
    // `JSON.stringify(24.0)` is `"24"`, which is the half of this the old
    // exporter got wrong: it wrote the document with `JSON.stringify`.
    expect(text).toContain('"LB": 24.0')
    expect(text).toContain('"NOF": 4')
    expect(text).not.toContain('"NOF": 4.0')
  })
})

describe('the preset every tool carries', () => {
  /**
   * The written record for a tool of this form.
   *
   * `geometry` is topped up per form because Fusion refuses a record short of a
   * measurement — a drill states its point angle, a tap its pitch — and a tool
   * the format refused would never reach the question this describe is asking.
   */
  const exportedTool = (form: ToolForm, geometry: Record<string, number> = {}) => {
    const tool = { ...endMill, form, geometry: { ...endMill.geometry, ...geometry } }
    const requests = fusionInput(oneStack({ tool, holder }), counting())
    const { document } = fusionLibrary({ tools: requests.map((each) => each.request) })
    return document.data.find((record) => record.guid === requests[0]?.toolGuid)
  }

  /** The one preset on that record, as a plain bag of fields. */
  const presetOn = (form: ToolForm, geometry: Record<string, number> = {}) => {
    const record = exportedTool(form, geometry) as {
      'start-values'?: { presets?: Array<unknown> }
    }
    const presets = record['start-values']?.presets ?? []
    expect(presets).toHaveLength(1)
    return presets[0] as Record<string, unknown>
  }

  it('puts exactly one on every request, under its own guid', () => {
    const requests = fusionInput(oneStack({ holder }), counting())
    const presets = requests[0]?.request.presets ?? []

    expect(presets).toHaveLength(1)
    expect(presets[0]?.name).toBe(DEFAULT_PRESET_NAME)
    // A preset's guid is Fusion's identity for it, so it is not the tool's and
    // not the holder's.
    expect(presets[0]?.guid).not.toBe(requests[0]?.toolGuid)
    expect(presets[0]?.guid).not.toBe(requests[0]?.holderGuid)
  })

  it('states every field Fusion requires of a milling preset', () => {
    // Measured against the exporter's own reduction of Autodesk's schema rather
    // than a list retyped here: a field added upstream fails this test.
    const preset = presetOn('flat end mill')
    for (const field of FUSION_TYPES['flat end mill'].presetRequired) {
      expect(preset[field]).toBeDefined()
    }
  })

  it('narrows to what a drill models, which is not what a mill models', () => {
    // One shape is written for all five, and `fusionPresets` drops what the type
    // does not model. A drill has no cutting feedrate at all.
    const preset = presetOn('drill', { SIG: 140 })
    for (const field of FUSION_TYPES.drill.presetRequired) {
      expect(preset[field]).toBeDefined()
    }
    expect(preset.v_f).toBeUndefined()
    // Autodesk's own `if`/`then`: the switch is set, so both fields it demands
    // have to have travelled.
    expect(preset['use-feed-per-revolution']).toBe(true)
    expect(preset.f_n).toBe(1)
    expect(preset.f_n_retract).toBe(1)
  })

  it('leaves a tap the six fields it models and nothing else', () => {
    const preset = presetOn('tap right hand', { TP: 1 })
    expect(Object.keys(preset).sort()).toEqual([...FUSION_TYPES['tap right hand'].presetRequired])
  })

  it('says nothing a shop has to act on', () => {
    // Narrowing the union draws a `dropped` note per field per tool. They are
    // the format's business, not a machinist's, so none of them may surface.
    const requests = fusionInput(oneStack({ holder }), counting())
    const { document, notes } = fusionLibrary({ tools: requests.map((each) => each.request) })
    const report = fusionReport(requests, document, notes)

    expect(report.skipped).toEqual([])
    expect(report.holderWarnings).toEqual([])
  })
})
