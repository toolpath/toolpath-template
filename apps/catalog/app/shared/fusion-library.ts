import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'

/**
 * The order list as a Fusion tool library.
 *
 * Fusion reads a `.json` library of tools, each with its geometry, its holder
 * as a stack of cylinders, and a tool number — which is most of what this
 * application already knows, so a shop that has decided what cuts a part
 * should not then type it into CAM (Paul, 2026-08-31).
 *
 * Two things make this cheap rather than a translation layer:
 *
 * - **The form vocabulary is already Fusion's.** `forms.ts` names a tool the
 *   way Fusion's library does, on purpose, so `type` is the form verbatim.
 * - **The geometry keys are the scraper's**, which are ISO's, which are the
 *   ones Fusion uses — `DC`, `LCF`, `OAL`, `SFDM`, `NOF`, `RE`, `SIG`.
 *
 * A tool the dataset could not name — form `other` — is **left out**, because
 * Fusion refuses a type it does not know and a library that fails to import
 * is worse than one that is short. The count comes back with the file.
 *
 * Everything here is pure, and every number is the dataset's own: nothing is
 * invented to fill a field Fusion has and this catalog does not.
 */

/** What Fusion calls a holder step: a cylinder, bottom-up. */
interface Segment {
  readonly height: number
  readonly 'lower-diameter': number
  readonly 'upper-diameter': number
}

interface FusionTool {
  readonly guid: string
  readonly type: string
  readonly unit: 'millimeters'
  readonly vendor: string
  readonly 'product-id': string
  readonly 'product-link'?: string
  readonly description: string
  readonly geometry: Readonly<Record<string, number>>
  readonly holder?: {
    readonly description: string
    readonly vendor: string
    readonly 'product-id': string
    readonly segments: ReadonlyArray<Segment>
  }
  readonly 'post-process': {
    readonly number: number
    readonly 'diameter-offset': number
    readonly 'length-offset': number
    readonly live: true
    readonly turret: 0
  }
  readonly 'start-values': { readonly presets: ReadonlyArray<never> }
}

export interface FusionLibrary {
  readonly version: 4
  readonly data: ReadonlyArray<FusionTool>
}

/** One line of the bill: what to cut with, and what holds it. */
export interface LibraryLine {
  readonly tool: CatalogTool
  readonly holder?: Holder | undefined
  readonly collet?: Collet | undefined
}

/** The geometry Fusion reads, with anything the vendor did not state left out. */
const geometryOf = (tool: CatalogTool): Record<string, number> => {
  const held: Record<string, number> = {}
  for (const code of ['DC', 'LCF', 'OAL', 'SFDM', 'NOF', 'RE', 'SIG'] as const) {
    const value = tool.geometry[code]
    if (value !== undefined) {
      held[code] = value
    }
  }
  // Fusion's `LB` is the length below the holder — the figure this dataset
  // derives as `LBH`, under the name Fusion reads it by.
  if (tool.geometry.LBH !== undefined) {
    held.LB = tool.geometry.LBH
  }
  for (const code of ['shoulder-length', 'shoulder-diameter'] as const) {
    const value = tool.geometry[code]
    if (value !== undefined) {
      held[code] = value
    }
  }
  return held
}

/**
 * The holder as cylinders, bottom-up, from what the vendor stated.
 *
 * The nose, then the body, then whatever is left up to the flange face — the
 * same three the drawing sweeps. A holder that states none of them gets no
 * segments rather than a made-up cylinder.
 */
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

/**
 * @returns the library, and how many lines Fusion could not have taken
 */
export const fusionLibrary = (
  lines: ReadonlyArray<LibraryLine>,
): { readonly library: FusionLibrary; readonly skipped: number } => {
  const named = lines.filter((line) => line.tool.form !== 'other')
  return {
    library: {
      version: 4,
      data: named.map((line, at) => {
        const { tool, holder } = line
        const segments = holder === undefined ? [] : segmentsOf(holder)
        return {
          guid: tool.guid,
          type: tool.form,
          unit: 'millimeters',
          vendor: tool.brand,
          'product-id': tool.catalogNumber,
          ...(tool.productLink === null ? {} : { 'product-link': tool.productLink }),
          description: `${tool.brand} ${tool.catalogNumber}`,
          geometry: geometryOf(tool),
          ...(holder === undefined || segments.length === 0
            ? {}
            : {
                holder: {
                  description: holder.catalogNumber,
                  vendor: holder.brand,
                  'product-id': holder.catalogNumber,
                  segments,
                },
              }),
          'post-process': {
            number: at + 1,
            'diameter-offset': at + 1,
            'length-offset': at + 1,
            live: true,
            turret: 0,
          },
          'start-values': { presets: [] },
        } satisfies FusionTool
      }),
    },
    skipped: lines.length - named.length,
  }
}
