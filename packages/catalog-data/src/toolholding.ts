import { hasNeck } from './forms.js'
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
   * is chosen at the machine, not published by anybody. The default is the
   * tool's length below holder (`LBH`: flute length plus a diameter, with a
   * third of the tool kept in the holder) — the least it can stand out with
   * the flutes clear of the collet — capped at {@link Assembly.maxStickout}
   * where the grip is known. `null` only when the tool states nothing at all.
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

/**
 * The least a tool can stand out: its flutes, or its neck where it has one.
 *
 * Paul's rule (2026-08-29): the default stickout is the flute length plus
 * whatever the holder needs, so the least is the flute length — the collet
 * face at the end of the flutes — and a stated neck, which a collet must not
 * close on, pushes it to the shoulder. The length below holder stays the
 * tool's own number for L/D; it is no longer the floor of the stickout.
 */
export const minStickout = (tool: CatalogTool): number | null => {
  const { LCF } = tool.geometry
  if (LCF === undefined) {
    return null
  }
  const shoulder = tool.geometry['shoulder-length']
  return hasNeck(tool) && shoulder !== undefined ? shoulder : LCF
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
 * The share of a tool's overall length a holder must always have hold of.
 *
 * A third. **This application's figure, not a vendor's** — no vendor in this
 * catalog publishes a minimum engagement — which is why it is named here and
 * the control says whose it is. It is one rule read twice: the length below
 * holder is capped so that at least this much stays in (`build.ts`), and a
 * stickout may never leave less than this much in. Deliberately a share of
 * the length and not a multiple of the shank diameter: how much of a tool a
 * collet needs is about the tool's leverage, not its shank.
 */
export const HELD_SHARE = 1 / 3

/**
 * How the default stickout is set, from the catalog's sheet.
 *
 * Paul's rule (2026-08-30): nobody sets a tool up 6 mm out, so the default
 * stands out at least `least` (half an inch) where the tool's length allows,
 * and lands on a round number — the `step` for the tool's unit system (an
 * eighth of an inch, or 3 mm) nearest what the holder needs, never under it.
 * The range shown beside it is still the flutes up to `heldShare` held.
 */
export interface StickoutPolicy {
  /** Share of the overall length that must stay in the holder. */
  readonly heldShare: number
  /**
   * The shank that must stay clamped, in diameters of **shank** — ISO 13399's
   * **LSCN**, *clamping length minimum*, stated against `DMM`.
   *
   * The manufacturers publish it per tool and this catalog has none of it:
   * Seco's 410050R050 wants 36 mm of a ⌀6 shank clamped, which is 6×D against
   * the 3×D rule of thumb everybody quotes. A shop that knows its own answer
   * states it here, and it caps the stickout ahead of {@link heldShare} —
   * which is the same rule read as a share of the tool rather than as a length
   * of shank. Zero for none.
   */
  readonly clampedPerDiameter?: number
  /** The shortest stickout worth setting up, mm; zero for none. */
  readonly least: number
  /** The increment the default lands on, mm, by the tool's unit system; zero for none. */
  readonly step: { readonly inch: number; readonly metric: number }
}

/** A third held, no floor, no rounding: the bounds alone. */
export const DEFAULT_STICKOUT_POLICY: StickoutPolicy = {
  heldShare: HELD_SHARE,
  least: 0,
  step: { inch: 0, metric: 0 },
}

/** A hair, so a rounded stickout a femtometre under what is needed is not stepped up. */
const STICKOUT_TOLERANCE = 1e-6

/**
 * The default stickout: what is needed, no shorter than the policy's least,
 * on the policy's step for this tool — the nearest step, or the one above it
 * where the nearest falls short of what is needed.
 */
const defaultOf = (tool: CatalogTool, needed: number, policy: StickoutPolicy): number => {
  const step = tool.unitSystem === 'metric' ? policy.step.metric : policy.step.inch
  const preferred = Math.max(needed, policy.least)
  if (step <= 0) {
    return preferred
  }
  const nearest = Math.round(preferred / step) * step
  return nearest + STICKOUT_TOLERANCE < needed ? nearest + step : nearest
}

export interface StickoutLimits {
  /** Shortest, mm: the flutes out of the collet, or the neck where there is one. */
  readonly min: number
  /**
   * Longest, mm: what still leaves the holder enough to grip. The stricter of
   * the collet's own grip, where stated, and {@link HELD_SHARE} of the overall
   * length. Null when neither can be worked out — an unbounded range, not a
   * bound of nothing.
   */
  readonly max: number | null
  /** Where the stickout starts: the flutes plus what the holder needs to clear the part. */
  readonly default: number
  /** The parallel shank behind the length below holder, mm: all a holder can ever grip. */
  readonly grip: number | null
  /** How much grip the rule asks for, mm. */
  readonly wantedGrip: number | null
  /**
   * True when the rule cannot be met at any depth: the range collapses onto
   * the shortest stickout, and the control should say why rather than refuse.
   */
  readonly gripShort: boolean
}

/**
 * How far this tool may stand out of this holder.
 *
 * **Both bounds come off the tool, and that is a statement about the data.**
 * The shortest is the tool's length below holder; the longest is what still
 * leaves enough of the tool in the grip — the collet's published grip length
 * where there is one, and a third of the overall length as the shop rule
 * either way. Nothing in this catalog measures how deep a holder's bore goes,
 * so a holder may refuse the deepest of these for a reason nothing here
 * records.
 *
 * When a tool has less shank behind its flutes than the rule wants — a
 * vendor-stated length below holder past two thirds of the tool — nothing is
 * wrong with the tool; the rule simply cannot be met, the physical bound wins,
 * and `gripShort` says so.
 */
export const stickoutLimits = (
  tool: CatalogTool,
  collet: Collet | null,
  /** What the holder needs to clear the part, from the sweep: the default stands out at least this far. */
  required: number | null = null,
  /** The sheet's hold share, least stickout and step; the bounds alone by default. */
  policy: StickoutPolicy = DEFAULT_STICKOUT_POLICY,
): StickoutLimits | null => {
  const min = minStickout(tool)
  if (min === null) {
    return null
  }
  const { OAL, DC } = tool.geometry
  const grip = OAL === undefined ? null : Math.max(0, OAL - min)
  /**
   * What must stay in the holder: the shop's own clamping length where it has
   * one, and otherwise the share of the tool this package falls back to.
   */
  // Of the **shank**: `LSCN` is stated against `DMM`, and the holder grips the
  // shank rather than the cut (Paul, 2026-09-01).
  const shank = tool.geometry.SFDM ?? DC
  const clamped =
    policy.clampedPerDiameter !== undefined && policy.clampedPerDiameter > 0 && shank !== undefined
      ? shank * policy.clampedPerDiameter
      : null
  const wantedGrip = clamped !== null ? clamped : OAL === undefined ? null : OAL * policy.heldShare

  const caps: Array<number> = []
  const byGrip = maxStickout(tool, collet)
  if (byGrip !== null) {
    caps.push(byGrip)
  }
  if (OAL !== undefined && wantedGrip !== null) {
    caps.push(OAL - wantedGrip)
  }
  const most = caps.length === 0 ? null : Math.min(...caps)
  const gripShort = most !== null && most < min

  const max = most === null ? null : gripShort ? min : most
  const wanted = defaultOf(tool, Math.max(min, required ?? min), policy)
  return {
    min,
    max,
    // Flutes plus what the holder needs — the length to set the tool up at —
    // on the sheet's step, held within what the tool allows.
    default: max === null ? wanted : Math.min(wanted, max),
    grip,
    wantedGrip,
    gripShort,
  }
}

/**
 * The stickout an assembly starts at: the least the tool allows, within what
 * the grip allows. A tool whose length below holder outruns its grip is
 * gripped as short as the grip lets it and no shorter — rather than refused,
 * because the shop is the one who knows whether that is a problem.
 */
export const defaultStickout = (tool: CatalogTool, collet: Collet | null): number | null => {
  const limits = stickoutLimits(tool, collet)
  if (limits !== null) {
    return limits.default
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
      // stand out is what leaves a third of it held — the same rule as a
      // collet with no published grip. `maxStickout` refuses to guess on its
      // own, which is why this reads the limits rather than it.
      const overall = tool.geometry.OAL
      if (overall === undefined) {
        continue
      }
      assemblies.push({
        holder,
        collet: null,
        tool,
        stickout: minStickout(tool) ?? overall,
        maxStickout: stickoutLimits(tool, null)?.max ?? overall,
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
