import {
  defaultStickout,
  holderTakesTool,
  maxStickout,
  stickoutLimits,
  type Clamping,
  type Collet as SharedCollet,
  type Holder as SharedHolder,
} from '@toolpath/tool-support'

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
export type { Clamping } from '@toolpath/tool-support'

/**
 * The holding arithmetic, which is `@toolpath/tool-support`'s.
 *
 * Re-exported under the names this package has always published, so nothing in
 * `apps/catalog` moved in lockstep. What stays below is what is genuinely this
 * catalog's: the *records* — a holder and a collet with a guid, a brand and a
 * catalog number on them — and the two functions that build an {@link Assembly}
 * out of a crib, which is a catalog document rather than a domain shape.
 */
export {
  canHold,
  colletFitsHolder,
  defaultStickout,
  gripRanges,
  gripsAnyShank,
  gripsShank,
  holdBand,
  holderTakesTool,
  maxStickout,
  stickoutLimits,
  type GripRanges,
  type HoldBand,
} from '@toolpath/tool-support'

/** What {@link stickoutLimits} answers, under the name this package published it as. */
export type StickoutLimits = StickoutRange

/**
 * Which surfaces of the spindle interface touch: the taper alone, or the
 * taper and the flange face. REGO-FIX's `BT+` is the dual-contact form — a
 * fact about which machine the holder is for, so it is a filter axis.
 */
export type Contact = 'taper' | 'face'

/**
 * What goes in the spindle, as this catalog holds one.
 *
 * **Extends `@toolpath/tool-support`'s `Holder`** rather than restating it: the
 * silhouette a drawing reads and the three facts a fit check reads are the
 * domain's, and what this adds is identity and commerce — a guid, a brand, a
 * catalog number, the vendor's own CAD download. Three shapes in two
 * repositories called themselves a holder and no two agreed on which fields
 * exist; this is the one that carries the extra.
 */
export interface Holder extends SharedHolder {
  readonly guid: string
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  readonly catalogNumber: string
  readonly materialNumber: string | null
  /**
   * Taper-only or face contact, where the vendor says; null where it does not.
   *
   * This catalog's, not the domain's: it is a filter axis rather than
   * something the arithmetic reads.
   */
  readonly contact: Contact | null
  /**
   * The three the domain leaves optional, stated outright.
   *
   * A drawing can be handed a holder that says nothing about how it grips —
   * `@toolpath/tool-support` allows that, and refuses to hold a tool when it
   * happens. A *catalog* holder always knows, because a scrape that could not
   * classify one would not have minted it.
   */
  readonly taper: string
  readonly clamping: Clamping
  readonly boreDiameter: number | null
  readonly productLink: string | null
  /** The vendor's own solid model, where one is published — a download, not a page. */
  readonly cadModelUrl: string | null
  readonly provenance: Readonly<Record<string, Provenance>>
}

/**
 * What grips the shank inside a collet holder.
 *
 * Extends the domain's {@link SharedCollet} for the reason {@link Holder}
 * does: the gripping is the domain's, the identity is this catalog's.
 */
export interface Collet extends SharedCollet {
  readonly guid: string
  readonly familyId: string
  readonly brand: string
  readonly vendor: string
  readonly catalogNumber: string
  readonly materialNumber: string | null
  readonly productLink: string | null
  readonly provenance: Readonly<Record<string, Provenance>>
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
