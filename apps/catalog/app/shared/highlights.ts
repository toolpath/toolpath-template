import type { CatalogTool, Gaps } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { FIELDS, sheetOf } from './feature-defaults'

/**
 * What a tool is **best for**, in a word.
 *
 * The list used to carry the rank rows' readings — the working of the sort,
 * one line per rule. Paul's call (2026-08-31): to confirm an assembly works
 * you want as little as possible, and what is worth saying about *why* is not
 * the arithmetic but what this tool is good at. So a row carries at most two
 * of these, and the numbers that confirm the fit sit beside them.
 *
 * Two kinds, and the difference matters:
 *
 * - A **superlative** is true only of the tools on screen — "the shortest of
 *   these", not "the shortest". It is awarded once, to one row, and only when
 *   it beats the next one by enough to be worth saying.
 * - A **match** is true of the tool on its own: its nose is the floor's
 *   radius, its diameter is the hole's. No comparison, no threshold.
 *
 * Adding one is an entry in {@link SUPERLATIVES} or {@link MATCHES}, never a
 * branch in the table.
 */

/** Read off one candidate: the tool, and the room the stack it sits in has. */
export interface Candidate {
  readonly tool: CatalogTool
  /** The stack's own numbers, where an assembly has been worked out for it. */
  readonly gaps?: Gaps | null
  /** How far the tool stands out of the holder, mm. */
  readonly stickout?: number | null
}

export interface Highlight {
  readonly key: string
  readonly label: string
  /** Why it is worth saying, for the title attribute. */
  readonly title: string
}

interface Superlative {
  readonly key: string
  readonly label: string
  readonly title: string
  /** Bigger wins. Null where this candidate cannot be read. */
  readonly read: (candidate: Candidate) => number | null
  /**
   * How much better than the runner-up is worth a word, as a share of the
   * runner-up. A one per cent edge is not a reason to pick a tool.
   */
  readonly margin: number
}

/**
 * Rigidity is **not** L/D.
 *
 * Deflection goes as L³/D⁴, so at the same L/D the wider tool is stiffer by
 * the ratio of the diameters — ranking on the ratio alone quietly favours
 * small tools. What is read here is the inverse of deflection, off the
 * **stickout** where there is one, because the length that bends is the
 * length out of the holder, not the tool's own.
 */
const stiffness = ({ tool, stickout }: Candidate): number | null => {
  const diameter = tool.geometry.DC
  const length = stickout ?? tool.geometry.LBH ?? tool.geometry.LCF
  if (diameter === undefined || length === undefined || length <= 0) {
    return null
  }
  return diameter ** 4 / length ** 3
}

export const SUPERLATIVES: ReadonlyArray<Superlative> = [
  {
    key: 'stiffest',
    label: 'stiffest',
    title: 'Least deflection of the assemblies here: diameter to the fourth over stickout cubed',
    read: stiffness,
    margin: 0.15,
  },
  {
    key: 'clearance',
    label: 'most clearance',
    title: 'The most room between the stack and the part, sideways, of the assemblies here',
    read: ({ gaps }) => gaps?.radial?.gap ?? null,
    margin: 0.25,
  },
  {
    key: 'biggest',
    label: 'biggest cut',
    title: 'The widest cutter here that still fits the feature',
    read: ({ tool }) => tool.geometry.DC ?? null,
    margin: 0.1,
  },
]

interface Match {
  readonly key: string
  readonly label: string
  readonly title: string
  readonly holds: (
    candidate: Candidate,
    feature: PartFeature,
    part: ReadonlyArray<PartFeature>,
  ) => boolean
}

/** Within a thousandth of a millimetre is the same number. */
const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3

const featureValue = (
  name: string,
  feature: PartFeature,
  part: ReadonlyArray<PartFeature>,
): number | null => {
  const read = FIELDS[name]?.read(sheetOf(feature, part))
  return typeof read === 'number' ? read : null
}

export const MATCHES: ReadonlyArray<Match> = [
  {
    key: 'fillet',
    label: 'matches the floor fillet',
    title: 'Its nose radius is the floor’s own: one pass finishes the floor and the corner',
    holds: ({ tool }, feature, part) => {
      const fillet = featureValue('floor fillet radius', feature, part)
      const nose = tool.geometry.RE
      return fillet !== null && fillet > 0 && nose !== undefined && same(nose, fillet)
    },
  },
  {
    key: 'on-size',
    label: 'on size',
    title: 'Its diameter is the widest the feature admits: nothing larger goes in',
    holds: ({ tool }, feature, part) => {
      const largest = featureValue('largest tool diameter', feature, part)
      const diameter = tool.geometry.DC
      return largest !== null && diameter !== undefined && same(diameter, largest)
    },
  },
]

/**
 * The gap between a tool and the widest the feature admits, in mm — negative
 * where it is under. Null where either is unstated.
 *
 * Not a highlight: a number the row shows either way, because "how much
 * smaller than it could be" is the first thing anybody asks of a tool that
 * was chosen for them.
 */
export const underBy = (
  tool: CatalogTool,
  feature: PartFeature,
  part: ReadonlyArray<PartFeature>,
): number | null => {
  const largest = featureValue('largest tool diameter', feature, part)
  const diameter = tool.geometry.DC
  return largest === null || diameter === undefined ? null : largest - diameter
}

/**
 * The highlights for every candidate, in the order they were given.
 *
 * A superlative goes to one row and only where it wins by its own margin;
 * matches are read per row. Two at most, superlative first — a row wearing
 * four badges says nothing.
 */
export const highlightsFor = (
  candidates: ReadonlyArray<Candidate>,
  feature: PartFeature | null,
  part: ReadonlyArray<PartFeature> = [],
): Array<Array<Highlight>> => {
  const found: Array<Array<Highlight>> = candidates.map(() => [])

  for (const superlative of SUPERLATIVES) {
    const read = candidates.map((candidate) => superlative.read(candidate))
    const ranked = read
      .map((value, index) => ({ value, index }))
      .filter((each): each is { value: number; index: number } => each.value !== null)
      .sort((a, b) => b.value - a.value)
    const best = ranked[0]
    const next = ranked[1]
    if (!best || best.value <= 0) {
      continue
    }
    // Alone, or clear of the next by enough to be worth a word.
    if (next && next.value > 0 && best.value < next.value * (1 + superlative.margin)) {
      continue
    }
    found[best.index]!.push({
      key: superlative.key,
      label: superlative.label,
      title: superlative.title,
    })
  }

  if (feature !== null) {
    candidates.forEach((candidate, index) => {
      for (const match of MATCHES) {
        if (match.holds(candidate, feature, part)) {
          found[index]!.push({ key: match.key, label: match.label, title: match.title })
        }
      }
    })
  }

  return found.map((each) => each.slice(0, 2))
}
