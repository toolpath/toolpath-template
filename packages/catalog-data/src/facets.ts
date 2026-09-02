import { shankOf } from './forms.js'
import {
  GEOMETRY_FIELDS,
  type CatalogTool,
  type Facets,
  type RangeAxis,
  type TermAxis,
} from './types.js'

/** The discrete axes a tool is picked on, in the order a shop asks about them. */
const TERM_AXES: ReadonlyArray<{
  key: string
  label: string
  of: (tool: CatalogTool) => string | null
}> = [
  { key: 'form', label: 'Tool', of: (tool) => tool.form },
  { key: 'shank', label: 'Shank', of: shankOf },
  { key: 'toolType', label: 'Tool type', of: (tool) => tool.toolType },
  { key: 'brand', label: 'Brand', of: (tool) => tool.brand },
  { key: 'unitSystem', label: 'Published in', of: (tool) => tool.unitSystem },
  { key: 'familyId', label: 'Family', of: (tool) => tool.familyId },
  // A line spans families — the same `KenCut™ FF` is square and ball nose,
  // metric and inch — so it is the axis a shop asks "the rest of that line"
  // on, which `familyId` cannot. A tool whose vendor names none carries no
  // value and counts under nothing, the `materialGroups` rule.
  { key: 'productLine', label: 'Product line', of: (tool) => tool.productLine ?? null },
  {
    key: 'NOF',
    label: 'Flutes',
    of: (tool) => {
      const flutes = tool.geometry.NOF
      return flutes === undefined ? null : String(flutes)
    },
  },
]

/**
 * The continuous axes, which are geometry codes and nothing else.
 *
 * A range is offered only where the catalog states one — a catalog with no
 * corner radius anywhere gets no corner-radius slider, rather than a slider
 * from zero to zero that filters nothing and reads as broken.
 */
const RANGE_CODES = ['DC', 'LBH', 'LCF', 'LD', 'OAL', 'RE', 'SFDM'] as const

/**
 * The axes where one tool carries several values at once.
 *
 * A tool indexed under P and M counts toward both, which is what makes the
 * counts add to more than the catalog — correct, and worth knowing before
 * somebody reads a facet total as a tool total.
 */
const LIST_AXES: ReadonlyArray<{
  key: string
  label: string
  of: (tool: CatalogTool) => ReadonlyArray<string>
}> = [
  {
    key: 'materialGroups',
    label: 'Workpiece material',
    // A tool nobody rated contributes to no value, exactly as one the vendor
    // rates for nothing does. The two are told apart where a person reads a
    // tool — `tool-sheet.tsx` — and not in a count, because a facet counts
    // tools *under a value* and neither of them is under one.
    of: (tool) => tool.materialGroups ?? [],
  },
]

const countLists = (
  tools: ReadonlyArray<CatalogTool>,
  of: (tool: CatalogTool) => ReadonlyArray<string>,
): ReadonlyArray<{ value: string; count: number }> => {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    for (const value of of(tool)) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([value, count]) => ({ value, count }))
}

const countValues = (
  tools: ReadonlyArray<CatalogTool>,
  of: (tool: CatalogTool) => string | null,
): ReadonlyArray<{ value: string; count: number }> => {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const value = of(tool)
    if (value === null) {
      continue
    }
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([value, count]) => ({ value, count }))
}

const rangeFor = (tools: ReadonlyArray<CatalogTool>, code: string): RangeAxis | null => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const tool of tools) {
    const value = tool.geometry[code]
    if (value === undefined || !Number.isFinite(value)) {
      continue
    }
    min = Math.min(min, value)
    max = Math.max(max, value)
  }

  if (min > max) {
    return null
  }
  return { key: code, label: GEOMETRY_FIELDS[code]?.label ?? code, min, max }
}

/**
 * The catalog-wide filter vocabulary, computed once at build time.
 *
 * Precomputed because the alternative is every browser recomputing the same
 * index over every tool on first paint, and because a control that offers a
 * value no tool has is worse than a missing control.
 */
export const facetsFor = (tools: ReadonlyArray<CatalogTool>): Facets => {
  const terms: Array<TermAxis> = []
  for (const axis of TERM_AXES) {
    const values = countValues(tools, axis.of)
    if (values.length === 0) {
      continue
    }
    terms.push({ key: axis.key, label: axis.label, values })
  }

  for (const axis of LIST_AXES) {
    const values = countLists(tools, axis.of)
    if (values.length === 0) {
      continue
    }
    terms.push({ key: axis.key, label: axis.label, values })
  }

  const ranges: Array<RangeAxis> = []
  for (const code of RANGE_CODES) {
    const range = rangeFor(tools, code)
    if (range !== null) {
      ranges.push(range)
    }
  }

  return { terms, ranges }
}
