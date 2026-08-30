import type { Pass } from './mapping.js'
import type { CatalogTool } from './types.js'

/**
 * What a shop reaches for first.
 *
 * A catalog says what exists; preferences say what this shop actually uses. The
 * two are kept apart on purpose — nothing here changes a tool's data, and
 * nothing a vendor publishes changes a preference.
 *
 * **Preferences never exclude a fitting tool.** They order it. A shop that has
 * not nominated a tool for a job still wants to see what would work, and a
 * recommendation that quietly hides the alternatives is one nobody can check.
 * The single exception is material, below, and it is an exclusion the *vendor*
 * stated rather than one this package inferred.
 */

export interface Preferences {
  /**
   * The tools a shop reaches for, most preferred first, per pass.
   *
   * Guids, so a preference survives a catalog rebuild and dies honestly when a
   * tool leaves the catalog.
   */
  readonly rough: ReadonlyArray<string>
  readonly finish: ReadonlyArray<string>
}

export const NO_PREFERENCES: Preferences = { rough: [], finish: [] }

export const preferredFor = (preferences: Preferences, pass: Pass): ReadonlyArray<string> =>
  pass === 'rough' ? preferences.rough : preferences.finish

/** Add a tool to the front of a pass's list, or take it off. */
export const togglePreferred = (
  preferences: Preferences,
  pass: Pass,
  toolGuid: string,
): Preferences => {
  const current = preferredFor(preferences, pass)
  const next = current.includes(toolGuid)
    ? current.filter((each) => each !== toolGuid)
    : // Newest first: the tool somebody just nominated is the one they mean.
      [toolGuid, ...current]
  return pass === 'rough' ? { ...preferences, rough: next } : { ...preferences, finish: next }
}

/**
 * How a tool stands against the part's workpiece material.
 *
 * Three answers, not two, because "the vendor says this is for stainless" and
 * "the vendor indexes this tool under no material at all" are different facts.
 * A tap that Kennametal indexes under nothing is not thereby unsuitable for
 * every material — nobody has said anything about it.
 */
export type MaterialStanding = 'excluded' | 'stated' | 'unstated'

export const materialStanding = (
  tool: CatalogTool,
  materialGroup: string | null,
): MaterialStanding => {
  if (materialGroup === null || tool.materialGroups.length === 0) {
    return 'unstated'
  }
  return tool.materialGroups.includes(materialGroup) ? 'stated' : 'excluded'
}

/** A tool, ranked for one pass against one material. */
export interface Recommendation {
  readonly tool: CatalogTool
  readonly standing: MaterialStanding
  /** Its place in the shop's own list, or null when it is not on it. */
  readonly preferredAt: number | null
}

/**
 * The fitting tools, in the order this shop would look at them.
 *
 * Preferred tools first in the shop's own order, then everything the vendor
 * indexes for the material, then everything nobody has said anything about.
 * **A tool the vendor states is for other materials is dropped**, because that
 * is the vendor's own claim rather than an inference — and it is the one thing
 * here that removes an option, which is why it is the vendor's to make.
 *
 * Ties keep catalog order, so the same query gives the same answer twice.
 */
export const recommend = (
  tools: ReadonlyArray<CatalogTool>,
  preferences: Preferences,
  pass: Pass,
  materialGroup: string | null = null,
): Array<Recommendation> => {
  const preferred = preferredFor(preferences, pass)

  return tools
    .map((tool, index) => {
      const at = preferred.indexOf(tool.guid)
      return {
        tool,
        standing: materialStanding(tool, materialGroup),
        preferredAt: at === -1 ? null : at,
        index,
      }
    })
    .filter((each) => each.standing !== 'excluded')
    .sort((a, b) => {
      if (a.preferredAt !== b.preferredAt) {
        if (a.preferredAt === null) {
          return 1
        }
        if (b.preferredAt === null) {
          return -1
        }
        return a.preferredAt - b.preferredAt
      }
      if (a.standing !== b.standing) {
        return a.standing === 'stated' ? -1 : 1
      }
      return a.index - b.index
    })
    .map(({ tool, standing, preferredAt }) => ({ tool, standing, preferredAt }))
}

/**
 * The one tool a shop would reach for, if any.
 *
 * `null` rather than "the first thing that fits" when nothing is preferred and
 * nothing is indexed for the material: an arbitrary first row presented as a
 * recommendation is how a shop stops trusting the recommendations.
 */
export const recommended = (
  tools: ReadonlyArray<CatalogTool>,
  preferences: Preferences,
  pass: Pass,
  materialGroup: string | null = null,
): CatalogTool | null => {
  const ranked = recommend(tools, preferences, pass, materialGroup)
  const first = ranked[0]
  if (!first) {
    return null
  }
  return first.preferredAt !== null || first.standing === 'stated' ? first.tool : null
}
