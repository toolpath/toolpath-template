import { DEFAULT_CLAMPING, type ClampingRule } from './clamping.js'
import {
  DEFAULT_STICKOUT_POLICY,
  stickoutRange,
  type StickoutPolicy,
  type StickoutRange,
} from './stickout.js'
import type { CatalogTool, Provenance } from './types.js'

/**
 * Holders, collets, and what stacks with what.
 *
 * **A tool is not ordered or held on its own.** It goes in a collet, the collet
 * goes in a holder, and the holder goes in the spindle — and the question a
 * shop actually asks is whether the *stack* reaches the feature, not whether
 * the cutter does. A 3 mm end mill that clears every rule in `fit.ts` is still
 * wrong if nothing in the crib grips a 3 mm shank.
 *
 * ## Why these types are declared here rather than mapped from a vendor CSV
 *
 * `@toolpath/tool-scraper` maps a vendor's rows into canonical `ToolRecord`s
 * for cutting tools, and **not for toolholding** — its registry binds record
 * mappers per brand for tools only, and REGO-FIX ships toolholding with no
 * mapper at all. So there is no canonical record to take a handoff at, the way
 * `ingest.ts` does for tools.
 *
 * That leaves the vendor's own column labels as the only thing on offer, and
 * reading those here would put vendor knowledge in the one place least able to
 * check it — the mistake `conventions.ts` warns about, arrived at from the
 * other direction. So this package declares what a holder *is*, and whoever
 * produces the handoff maps the vendor's columns onto it. The right long-term
 * home for that mapping is the scraper, beside the vendor knowledge it needs.
 */

/**
 * How a holder grips a shank.
 *
 * Four values, and three of them are one answer to the *fit* question: a bore,
 * a shrink-fit and a hydraulic chuck all grip the shank directly and are held
 * to the same rule, where a collet chuck needs a collet between them. They stay
 * apart because the distinction is one a buyer makes — a shrink-fit holder
 * needs an induction heater on the bench and a hydraulic chuck an actuation
 * screw — and because a vendor states which it published.
 *
 * `hydraulic` arrived with the scraper's toolholding records: MariTool's leaf
 * categories classify parts as hydraulic outright, and folding them into `bore`
 * here would be this package re-classifying a family the vendor already named.
 */
export type Clamping = 'bore' | 'collet' | 'shrink' | 'hydraulic'

/**
 * Which surfaces of the spindle interface touch: the taper alone, or the
 * taper and the flange face. REGO-FIX's `BT+` is the dual-contact form — a
 * fact about which machine the holder is for, so it is a filter axis.
 */
export type Contact = 'taper' | 'face'

/** What goes in the spindle. */
export interface Holder {
  readonly guid: string
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  readonly catalogNumber: string
  readonly materialNumber: string | null
  /** The spindle interface — `BT30`. A holder only fits the machine that takes it. */
  readonly taper: string
  /** Taper-only or face contact, where the vendor says; null where it does not. */
  readonly contact: Contact | null
  readonly clamping: Clamping
  /**
   * Spindle face to holder nose, in millimetres.
   *
   * Not the same as reach: what sticks out past the nose is the tool's, and
   * that is the number a feature depth is measured against.
   */
  readonly gaugeLength: number | null
  /** For a collet holder: which collet series it takes — `ER16`, `PG10`. */
  readonly colletSeries: string | null
  /** For a bore or shrink holder: the one shank diameter it takes, in mm. */
  readonly boreDiameter: number | null
  /** The nose, where a holder fouls the part before the tool runs out of reach. */
  readonly noseDiameter: number | null
  /**
   * The body behind the nose, step by step, where the vendor states it.
   *
   * REGO-FIX's DIN 4000 sheets give the nose's length, the body diameter and
   * length behind it, and the projection from the flange face; the flange
   * itself is the taper's (46 mm on a BT 30). With these a holder is a real
   * silhouette rather than one cylinder — see `outline.ts` and
   * `clearance.ts`. Each is `null` where unstated, and nothing is drawn or
   * swept for it then.
   */
  readonly noseLength: number | null
  readonly bodyDiameter: number | null
  readonly bodyLength: number | null
  /** Nose face to flange face, in millimetres. */
  readonly projection: number | null
  readonly flangeDiameter: number | null
  /**
   * How far the seated collet stands proud of the nose face, in millimetres.
   *
   * A powRgrip collet is pressed in and its front protrudes; the tool sees the
   * collet's own diameter for that much before the nose. Derived from the
   * holder's projection with and without it, where the vendor states both.
   */
  readonly colletProtrusion: number | null
  readonly productLink: string | null
  /** The vendor's own solid model, where one is published — a download, not a page. */
  readonly cadModelUrl: string | null
  readonly provenance: Readonly<Record<string, Provenance>>
}

/** What grips the shank inside a collet holder. */
export interface Collet {
  readonly guid: string
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  readonly catalogNumber: string
  readonly materialNumber: string | null
  /** `ER16`, `PG10` — must equal the holder's series exactly. */
  readonly series: string
  /** The shank diameters it grips, in millimetres. */
  readonly clampMin: number
  readonly clampMax: number
  /**
   * How much shank the collet actually holds, in millimetres.
   *
   * `null` where the vendor does not publish it, and that absence is load
   * bearing: without it there is no honest maximum stickout, so
   * {@link maxStickout} answers `null` rather than inventing a grip rule.
   */
  readonly clampLength: number | null
  readonly productLink: string | null
  readonly provenance: Readonly<Record<string, Provenance>>
}

/** A collet fits a holder when the holder takes collets of exactly its series. */
export const colletFitsHolder = (collet: Collet, holder: Holder): boolean =>
  holder.clamping === 'collet' && holder.colletSeries === collet.series

/** Whether a collet grips a given shank diameter, in millimetres. */
/**
 * A hair of tolerance, because 3/8" is 9.525 in the collet's sheet and
 * 9.524999999999999 in the tool's after a conversion: strict, 350 tools had no
 * collet in the crib (2026-08-30).
 */
const GRIP_TOLERANCE = 1e-6

export const gripsShank = (collet: Collet, shank: number): boolean =>
  shank >= collet.clampMin - GRIP_TOLERANCE && shank <= collet.clampMax + GRIP_TOLERANCE

/**
 * Whether a holder takes this tool's shank, with the collet if it needs one.
 *
 * A bore or shrink holder takes **one** nominal diameter, not a range: a
 * shrink-fit holder bored for 12 mm does not hold a 10 mm shank at all, and
 * treating it as an upper bound would put a tool in a holder that drops it.
 *
 * A tool whose shank the vendor does not state cannot be checked, and is
 * refused rather than assumed to fit — the one place this module differs from
 * `fit.ts`'s "what is not stated is not checked", because here the unchecked
 * case is a tool falling out of a spindle.
 */
export const holderTakesTool = (
  holder: Holder,
  collet: Collet | null,
  tool: CatalogTool,
): boolean => {
  const shank = tool.geometry.SFDM
  if (shank === undefined) {
    return false
  }

  if (holder.clamping === 'collet') {
    return collet !== null && colletFitsHolder(collet, holder) && gripsShank(collet, shank)
  }
  return collet === null && holder.boreDiameter === shank
}

/** A tool, what holds it, and how far it stands out of the holder. */
export interface Assembly {
  readonly holder: Holder
  /** Null for a bore or shrink holder, which grips the shank directly. */
  readonly collet: Collet | null
  readonly tool: CatalogTool
  /**
   * Tool tip to holder nose, in millimetres — the reach of the stack, as set.
   *
   * **A decision, with a default.** How far a tool stands out of its holder
   * is chosen at the machine, not published by anybody. The default is
   * `stickoutRange(tool, …).setup` — the flutes, or the neck on a necked tool,
   * out to whatever the feature needs, floored and stepped by the sheet and
   * held under {@link Assembly.maxStickout}. That is the same call that writes
   * `geometry.LBH`, so a tool alone and a tool in a holder cannot disagree
   * about the one number; `stickout.ts` has the four ways they used to.
   * `null` only when the tool states no flute length.
   */
  readonly stickout: number | null
  /**
   * The most the tool can stand out, in millimetres: overall length less the
   * length the collet has to grip.
   *
   * `null` when the collet does not publish a grip length, which REGO-FIX's
   * powRgrip line does not. **The assembly is still offered**, at its default
   * stickout: "this holder and this collet hold this tool, and nobody has said
   * how far out it can go" is a useful answer, and hiding it would say no such
   * assembly exists.
   */
  readonly maxStickout: number | null
}

/**
 * The furthest a tool can stand out of its holder, in millimetres.
 *
 * `overall length − the length that has to stay gripped`. Answers `null` when
 * either is unstated: a maximum stickout is exactly the number somebody would
 * use to decide a deep pocket is reachable, and a guessed one is worse than an
 * absent one.
 *
 * A bore or shrink holder's grip length is the holder's, not the collet's, and
 * this package does not carry it yet — so those answer `null` too, honestly,
 * until the contract gains it.
 */
export const maxStickout = (tool: CatalogTool, collet: Collet | null): number | null => {
  const overall = tool.geometry.OAL
  if (overall === undefined || collet === null || collet.clampLength === null) {
    return null
  }
  const stickout = overall - collet.clampLength
  return stickout > 0 ? stickout : null
}

export type HoldBand = 'good' | 'medium' | 'bad'

/**
 * How well the holder has hold of the tool at this stickout.
 *
 * By the share of the overall length left in the holder: at or above `good`
 * (a third, by the sheet) is good; between `least` (a quarter) and that is
 * possible but bad — "medium" in the list; below `least` is not compatible.
 * The thresholds are the catalog's knobs, handed in as fractions.
 */
export const holdBand = (
  tool: CatalogTool,
  stickout: number,
  thresholds: { readonly good: number; readonly least: number },
): HoldBand | null => {
  const { OAL } = tool.geometry
  if (OAL === undefined || OAL <= 0) {
    return null
  }
  const held = (OAL - stickout) / OAL
  return held >= thresholds.good - 1e-9
    ? 'good'
    : held >= thresholds.least - 1e-9
      ? 'medium'
      : 'bad'
}

/**
 * How far this tool may stand out of this holder — the collet-shaped way into
 * {@link stickoutRange}.
 *
 * **The arithmetic is not here any more** (2026-09-03). It was one of four
 * places that worked out a stickout, and the one that capped at a share of the
 * overall length while `clamping.ts` capped at a length of shank and neither
 * knew about the other. `stickout.ts` owns the quantity and combines the
 * sheet's two knobs in one place; this maps a collet onto the grip length that
 * module asks for, which is all a collet was ever contributing.
 */
export type StickoutLimits = StickoutRange

export const stickoutLimits = (
  tool: CatalogTool,
  collet: Collet | null,
  /** What the holder needs to clear the part, from the sweep: the setup stands out at least this far. */
  required: number | null = null,
  /** The sheet's hold share, least stickout and step. */
  policy: StickoutPolicy = DEFAULT_STICKOUT_POLICY,
  /** What the shop keeps clamped. The dataset's own by default. */
  rule: ClampingRule = DEFAULT_CLAMPING,
): StickoutLimits | null =>
  stickoutRange(tool, { grip: collet?.clampLength ?? null, required, policy, rule })

/**
 * The stickout an assembly starts at: the setup length for this tool, held
 * within what the grip allows. A tool whose setup outruns its grip is gripped
 * as short as the grip lets it and no shorter — rather than refused, because
 * the shop is the one who knows whether that is a problem.
 */
export const defaultStickout = (tool: CatalogTool, collet: Collet | null): number | null => {
  const limits = stickoutLimits(tool, collet)
  if (limits !== null) {
    return limits.setup
  }
  return maxStickout(tool, collet)
}

/**
 * The same assembly at a stickout somebody chose, held within what the tool
 * and the grip allow.
 */
export const withStickout = (assembly: Assembly, chosen: number): Assembly => {
  const limits = stickoutLimits(assembly.tool, assembly.collet)
  const least = limits?.min ?? 0
  const most = limits?.max ?? assembly.maxStickout ?? Number.POSITIVE_INFINITY
  const stickout = Math.min(Math.max(chosen, least), most)
  return { ...assembly, stickout }
}

/**
 * Every way this tool can be held, from the holders and collets given.
 *
 * Ordered by stickout, shortest first: the shortest stack that reaches is the
 * rigid one, and rigidity is what a shop gives up last.
 */
export const assembliesFor = (
  tool: CatalogTool,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  taper?: string,
): Array<Assembly> => {
  const assemblies: Array<Assembly> = []

  for (const holder of holders) {
    if (taper !== undefined && holder.taper !== taper) {
      continue
    }

    if (holder.clamping === 'collet') {
      for (const collet of collets) {
        if (!holderTakesTool(holder, collet, tool)) {
          continue
        }
        assemblies.push({
          holder,
          collet,
          tool,
          stickout: defaultStickout(tool, collet),
          maxStickout: stickoutLimits(tool, collet)?.max ?? maxStickout(tool, collet),
        })
      }
      continue
    }

    if (holderTakesTool(holder, null, tool)) {
      // A bore holder's grip length is unstated, so the most the tool can
      // stand out is whatever the clamping rule and the hold share allow —
      // the same two caps as a collet with no published grip. `maxStickout`
      // refuses to guess on its own, which is why this reads the range.
      const overall = tool.geometry.OAL
      if (overall === undefined) {
        continue
      }
      // The same setup length the collet branch above uses. It read
      // `minStickout` until 2026-09-03, which made a bore assembly stand out
      // to the bare flutes where an otherwise identical collet assembly stood
      // out to the sheet's floor and step — a fifth reading of the one number.
      const limits = stickoutLimits(tool, null)
      assemblies.push({
        holder,
        collet: null,
        tool,
        stickout: limits?.setup ?? overall,
        maxStickout: limits?.max ?? overall,
      })
    }
  }

  // Shortest known stickout first, then the firmer grip — the shorter reach —
  // where they tie; the ones nobody has stated go last, because an unknown
  // reach cannot be compared with a known one.
  return assemblies.sort((a, b) => {
    if (a.stickout === null) {
      return b.stickout === null ? 0 : 1
    }
    if (b.stickout === null) {
      return -1
    }
    return (
      a.stickout - b.stickout ||
      (a.maxStickout ?? Number.POSITIVE_INFINITY) - (b.maxStickout ?? Number.POSITIVE_INFINITY)
    )
  })
}

/**
 * The shank diameters a crib can grip, given what it is asked to hold with.
 *
 * Every rule above reduces to one number — the shank — so the question "can
 * anything here hold this tool" is a question about a set of diameters. Working
 * that set out once and asking it per tool is what makes holding usable as a
 * filter: asked tool by tool it is holders × collets × tools, which on a real
 * catalog is tens of millions of comparisons per keystroke.
 *
 * `taper` narrows to one spindle interface, `colletSeries` to one collet
 * family; either left out means "any".
 */
export interface GripRanges {
  /** Closed intervals a collet grips, in millimetres. */
  readonly spans: ReadonlyArray<readonly [number, number]>
  /** Exact diameters a bore or shrink holder takes. */
  readonly bores: ReadonlyArray<number>
}

export const gripRanges = (
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  want: { readonly taper?: string | null; readonly colletSeries?: string | null } = {},
): GripRanges => {
  const spans: Array<readonly [number, number]> = []
  const bores: Array<number> = []

  for (const holder of holders) {
    if (want.taper && holder.taper !== want.taper) {
      continue
    }

    if (holder.clamping === 'collet') {
      for (const collet of collets) {
        if (want.colletSeries && collet.series !== want.colletSeries) {
          continue
        }
        if (!colletFitsHolder(collet, holder)) {
          continue
        }
        spans.push([collet.clampMin, collet.clampMax])
      }
      continue
    }

    // A bore or shrink holder takes one nominal diameter, so it can never
    // satisfy a request for a particular collet series.
    if (want.colletSeries) {
      continue
    }
    if (holder.boreDiameter !== null) {
      bores.push(holder.boreDiameter)
    }
  }

  return { spans, bores }
}

/** Whether anything in {@link gripRanges} holds this shank, in millimetres. */
export const gripsAnyShank = (ranges: GripRanges, shank: number): boolean =>
  ranges.spans.some(([min, max]) => shank >= min && shank <= max) || ranges.bores.includes(shank)

/**
 * Whether the crib can hold this tool at all.
 *
 * A tool whose shank the vendor does not state is refused, for the same reason
 * {@link holderTakesTool} refuses it: the unchecked case here is a cutter
 * falling out of a spindle.
 */
export const canHold = (ranges: GripRanges, tool: CatalogTool): boolean => {
  const shank = tool.geometry.SFDM
  return shank !== undefined && gripsAnyShank(ranges, shank)
}
