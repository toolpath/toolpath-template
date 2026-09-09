import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { pretoolPresets, type FusionPreset, type PretoolMaterial } from './pretool-presets'

/**
 * The order list as a current Fusion tool library. This module is deliberately
 * pure: the route resolves catalog ids, the dialog supplies shop inputs, and
 * this boundary reports every line Fusion cannot safely receive.
 */

interface Segment {
  readonly height: number
  readonly 'lower-diameter': number
  readonly 'upper-diameter': number
}

interface FusionHolder {
  readonly guid: string
  readonly type: 'holder'
  readonly unit: 'millimeters'
  readonly description: string
  readonly vendor: string
  readonly 'product-id': string
  readonly gaugeLength: number
  readonly segments: ReadonlyArray<Segment>
}

interface FusionTool {
  readonly BMC: 'unspecified'
  readonly guid: string
  readonly type: string
  readonly unit: 'millimeters'
  readonly vendor: string
  readonly 'product-id': string
  readonly 'product-link'?: string
  readonly description: string
  readonly geometry: Readonly<Record<string, number | boolean>>
  readonly holder?: FusionHolder
  readonly 'post-process': {
    readonly number: number
    readonly 'diameter-offset': number
    readonly 'length-offset': number
    readonly live: true
    readonly turret: 0
    readonly 'break-control': false
    readonly 'manual-tool-change': false
  }
  readonly 'start-values': { readonly presets: ReadonlyArray<FusionPreset> }
}

export interface FusionLibrary {
  readonly version: 33
  readonly data: ReadonlyArray<FusionTool>
}

/** One distinct stack on the order list, resolved through the current catalog. */
export interface LibraryLine {
  readonly key: string
  readonly tool: CatalogTool
  readonly holder?: Holder | undefined
  readonly collet?: Collet | undefined
  /** The setout selected for this stack; absent means the catalog's LBH setup value. */
  readonly stickout?: number | undefined
}

export interface FusionExportSettings {
  readonly material: PretoolMaterial
  readonly maxRpm: number
}

export interface FusionExportDiagnostic {
  readonly catalogNumber: string
  readonly reason: string
}

export interface FusionExport {
  readonly library: FusionLibrary
  readonly skipped: ReadonlyArray<FusionExportDiagnostic>
  readonly holderWarnings: ReadonlyArray<FusionExportDiagnostic>
}

export interface FusionLibraryOptions {
  /** Injected for deterministic tests; the browser passes crypto.randomUUID. */
  readonly nextGuid?: () => string
}

const required: Readonly<Record<string, ReadonlyArray<string>>> = {
  'flat end mill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM'],
  'ball end mill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM'],
  'bull nose end mill': ['DC', 'LCF', 'OAL', 'NOF', 'RE', 'SFDM'],
  'face mill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM'],
  'chamfer mill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'TA', 'tip-diameter'],
  'radius mill': ['DC', 'LCF', 'OAL', 'NOF', 'RE', 'SFDM'],
  'slot mill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM'],
  'thread mill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'TP'],
  drill: ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'SIG'],
  'center drill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'SIG'],
  'spot drill': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'SIG'],
  reamer: ['DC', 'LCF', 'OAL', 'NOF', 'SFDM'],
  'counter sink': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'SIG'],
  'tap left hand': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'TP'],
  'tap right hand': ['DC', 'LCF', 'OAL', 'NOF', 'SFDM', 'TP'],
}

const validNumber = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value) && value > 0

/** Fusion calls holder steps cylinders, written bottom-up. */
const segmentsOf = (holder: Holder): Array<Segment> => {
  const segments: Array<Segment> = []
  const step = (height: number | null, diameter: number | null) => {
    if (height !== null && height > 0 && diameter !== null && diameter > 0) {
      segments.push({ height, 'lower-diameter': diameter, 'upper-diameter': diameter })
    }
  }
  step(holder.noseLength, holder.noseDiameter)
  step(holder.bodyLength, holder.bodyDiameter)
  if (holder.projection !== null && holder.flangeDiameter !== null) {
    step(
      holder.projection - (holder.noseLength ?? 0) - (holder.bodyLength ?? 0),
      holder.flangeDiameter,
    )
  }
  return segments
}

const missingGeometry = (tool: CatalogTool): Array<string> => {
  const codes = required[tool.form]
  if (codes === undefined) {
    return [`Fusion does not support the catalog form “${tool.form}”`]
  }
  return codes.filter((code) => !validNumber(tool.geometry[code]))
}

const geometryOf = (line: LibraryLine): Record<string, number | boolean> => {
  const { tool } = line
  const setout = line.stickout ?? tool.geometry.LBH
  const geometry: Record<string, number | boolean> = {
    CSP: false,
    HAND: true,
    DC: tool.geometry.DC!,
    LCF: tool.geometry.LCF!,
    OAL: tool.geometry.OAL!,
    NOF: tool.geometry.NOF!,
    SFDM: tool.geometry.SFDM!,
    LB: setout!,
    'shoulder-length': tool.geometry['shoulder-length'] ?? tool.geometry.LCF!,
    'shoulder-diameter': tool.geometry['shoulder-diameter'] ?? tool.geometry.SFDM!,
    assemblyGaugeLength: setout! + (line.holder?.gaugeLength ?? 0),
  }
  for (const code of ['RE', 'SIG', 'TA', 'TP', 'TPX', 'TPN', 'NT', 'tip-diameter'] as const) {
    const value = tool.geometry[code]
    if (value !== undefined) {
      geometry[code] = value
    }
  }
  if (tool.form === 'face mill') {
    geometry['upper-radius'] = 0
  }
  return geometry
}

const holderOf = (holder: Holder, nextGuid: () => string): FusionHolder | null => {
  const segments = segmentsOf(holder)
  if (segments.length === 0 || !validNumber(holder.gaugeLength)) {
    return null
  }
  return {
    guid: nextGuid(),
    type: 'holder',
    unit: 'millimeters',
    description: `${holder.brand} ${holder.catalogNumber}`,
    vendor: holder.brand,
    'product-id': holder.catalogNumber,
    gaugeLength: holder.gaugeLength,
    segments,
  }
}

/**
 * Creates a schema-ready Fusion v33 document and tells its caller exactly why
 * an ordered stack could not land in it. It never makes up missing vendor
 * geometry: defaults are limited to Fusion's structural fields.
 */
export const fusionLibrary = (
  lines: ReadonlyArray<LibraryLine>,
  settings: FusionExportSettings,
  { nextGuid = () => globalThis.crypto.randomUUID() }: FusionLibraryOptions = {},
): FusionExport => {
  const skipped: Array<FusionExportDiagnostic> = []
  const holderWarnings: Array<FusionExportDiagnostic> = []
  const data: Array<FusionTool> = []
  if (!Number.isFinite(settings.maxRpm) || settings.maxRpm <= 0) {
    return {
      library: { version: 33, data },
      skipped: lines.map((line) => ({
        catalogNumber: line.tool.catalogNumber,
        reason: 'maximum spindle RPM must be greater than zero',
      })),
      holderWarnings,
    }
  }
  for (const line of lines) {
    const missing = missingGeometry(line.tool)
    const stickout = line.stickout ?? line.tool.geometry.LBH
    if (!validNumber(stickout)) {
      missing.push('LBH (selected stickout)')
    }
    if (missing.length > 0) {
      skipped.push({
        catalogNumber: line.tool.catalogNumber,
        reason: missing[0]!.startsWith('Fusion') ? missing[0]! : `missing ${missing.join(', ')}`,
      })
      continue
    }
    const holder = line.holder === undefined ? null : holderOf(line.holder, nextGuid)
    if (line.holder !== undefined && holder === null) {
      holderWarnings.push({
        catalogNumber: line.tool.catalogNumber,
        reason: `holder ${line.holder.catalogNumber} has no complete published Fusion shape`,
      })
    }
    const presets = pretoolPresets(
      {
        form: line.tool.form,
        diameter: line.tool.geometry.DC!,
        fluteLength: line.tool.geometry.LCF!,
        flutes: line.tool.geometry.NOF!,
        cornerRadius: line.tool.geometry.RE ?? 0,
        unit: 'millimeters',
      },
      settings.material,
      settings.maxRpm,
      nextGuid,
    )
    if (presets.length === 0) {
      skipped.push({
        catalogNumber: line.tool.catalogNumber,
        reason: `PreTool has no preset generator for ${line.tool.form}`,
      })
      continue
    }
    const at = data.length + 1
    data.push({
      BMC: 'unspecified',
      guid: nextGuid(),
      type: line.tool.form,
      unit: 'millimeters',
      vendor: line.tool.brand,
      'product-id': line.tool.catalogNumber,
      ...(line.tool.productLink === null ? {} : { 'product-link': line.tool.productLink }),
      description: `${line.tool.brand} ${line.tool.catalogNumber}`,
      geometry: geometryOf(line),
      ...(holder === null ? {} : { holder }),
      'post-process': {
        number: at,
        'diameter-offset': at,
        'length-offset': at,
        live: true,
        turret: 0,
        'break-control': false,
        'manual-tool-change': false,
      },
      'start-values': { presets },
    })
  }
  return { library: { version: 33, data }, skipped, holderWarnings }
}
