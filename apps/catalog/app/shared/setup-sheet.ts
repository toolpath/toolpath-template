import { useCallback, useEffect, useState } from 'react'

/**
 * The setup sheet: which tool, holder and collet were chosen for which
 * feature of a part, at what stickout.
 *
 * Taken from the DFM catalog's `setup.ts` (Justin Gray, 2026-08-10) and the
 * rule it obeys: **references live**. A choice stores guids and a number, and
 * resolves through the catalog on every render, so browser storage never
 * becomes a second source of truth for a diameter. A guid that stops resolving
 * shows as nothing chosen rather than being dropped — a sheet that quietly
 * lost a line would report a feature as tooled when it is not.
 *
 * Keyed by the part it belongs to. A feature tag is the kernel's, so two parts
 * can share one; a sheet read for the wrong part is simply an empty sheet.
 */
export interface Choice {
  readonly toolGuid: string
  readonly holderGuid?: string
  readonly colletGuid?: string
  /** In millimetres; absent is the application's default. */
  readonly stickout?: number
  /**
   * How many of each to buy, by component.
   *
   * **Per component, not per line.** A job wanting three of a cutter usually
   * wants one holder to put them in, and a order list that cannot say
   * so is a bill somebody rewrites by hand (Paul, 2026-08-31).
   *
   * Absent is one, and one is stored as nothing: writing 1 into every sheet
   * ever saved would be a migration for a number that means the same thing.
   */
  readonly quantities?: Readonly<Partial<Record<Component, number>>>
  /**
   * How many of the whole assembly, multiplying every component in it.
   *
   * Two of a setup wants two of everything in it; the per-component counts
   * stay what they are and this multiplies them, so "three cutters in one
   * holder, twice over" is six cutters and two holders without anybody doing
   * the arithmetic twice (Paul, 2026-08-31). Absent is one.
   */
  readonly total?: number
}

/** The three things a line can hold, each bought on its own. */
export type Component = 'tool' | 'holder' | 'collet'

/** How many of one component a line asks for: absent is one. */
export const quantityOf = (choice: Choice, component: Component): number => {
  const many = choice.quantities?.[component]
  return many === undefined || many < 1 ? 1 : Math.floor(many)
}

/** How many of the whole assembly: absent is one. */
export const totalOf = (choice: Choice): number =>
  choice.total === undefined || choice.total < 1 ? 1 : Math.floor(choice.total)

export interface SetupSheet {
  readonly partId: string
  /**
   * Feature tag → the assemblies kept for it, in the order they were kept.
   *
   * **A feature can take more than one tool** (Paul, 2026-08-31). Roughing
   * then finishing a pocket is two cutters for one feature, and a sheet that
   * held one silently replaced the first with the second.
   */
  readonly choices: Readonly<Record<string, ReadonlyArray<Choice>>>
}

export const emptySheet = (partId: string): SetupSheet => ({ partId, choices: {} })

/** What is kept for a feature, in the order it was kept. */
export const choicesFor = (sheet: SetupSheet, featureTag: string): ReadonlyArray<Choice> =>
  sheet.choices[featureTag] ?? []

/** The line for one tool under one feature, if there is one. */
export const chosenFor = (sheet: SetupSheet, featureTag: string, toolGuid: string): Choice | null =>
  choicesFor(sheet, featureTag).find((each) => each.toolGuid === toolGuid) ?? null

/**
 * Keep an assembly for a feature.
 *
 * A tool already kept for that feature is replaced where it stands rather than
 * added twice: choosing a different holder for the same cutter is a correction,
 * not a second line.
 */
export const addChoice = (sheet: SetupSheet, featureTag: string, choice: Choice): SetupSheet => {
  const kept = choicesFor(sheet, featureTag)
  const at = kept.findIndex((each) => each.toolGuid === choice.toolGuid)
  const next =
    at === -1 ? [...kept, choice] : kept.map((each, index) => (index === at ? choice : each))
  return { ...sheet, choices: { ...sheet.choices, [featureTag]: next } }
}

/** One line changed in place, by the tool it is for. */
const withChoice = (
  sheet: SetupSheet,
  featureTag: string,
  toolGuid: string,
  change: (choice: Choice) => Choice,
): SetupSheet => {
  const had = chosenFor(sheet, featureTag, toolGuid)
  return had === null ? sheet : addChoice(sheet, featureTag, change(had))
}

/**
 * How many of the whole assembly, keeping everything else about the line.
 *
 * One is stored as nothing, for the same reason a component's one is.
 */
export const setTotal = (
  sheet: SetupSheet,
  featureTag: string,
  toolGuid: string,
  total: number,
): SetupSheet =>
  withChoice(sheet, featureTag, toolGuid, (choice) => {
    const wanted = Math.max(1, Math.floor(total))
    const { total: _was, ...rest } = choice
    return wanted === 1 ? rest : { ...rest, total: wanted }
  })

/**
 * How many of one component, keeping everything else about the line.
 *
 * One is the default and is stored as nothing, so a sheet does not grow a
 * field for saying what it already said.
 */
export const setQuantity = (
  sheet: SetupSheet,
  featureTag: string,
  toolGuid: string,
  component: Component,
  quantity: number,
): SetupSheet =>
  withChoice(sheet, featureTag, toolGuid, (choice) => {
    const wanted = Math.max(1, Math.floor(quantity))
    const quantities = { ...choice.quantities }
    if (wanted === 1) {
      delete quantities[component]
    } else {
      quantities[component] = wanted
    }
    const { quantities: _was, ...rest } = choice
    return Object.keys(quantities).length === 0 ? rest : { ...rest, quantities }
  })

/**
 * Un-choose everything kept for a feature. The key is removed rather than set
 * to nothing, so a cleared feature leaves no trace to be miscounted.
 */
export const clearChoice = (sheet: SetupSheet, featureTag: string): SetupSheet => {
  if (!(featureTag in sheet.choices)) {
    return sheet
  }
  const choices = { ...sheet.choices }
  delete choices[featureTag]
  return { ...sheet, choices }
}

/**
 * Where a tool is already kept, if it is kept anywhere.
 *
 * One cutter often does more than one feature, and a tool already decided on
 * — holder, collet and all — should be addable to the next feature without
 * being chosen again from scratch (Paul, 2026-08-31). The first line found is
 * the one to copy: they are all the same tool, and the earliest is the one
 * whose holder was thought about first.
 */
export const anywhereKept = (
  sheet: SetupSheet,
  toolGuid: string,
): { readonly featureTag: string; readonly choice: Choice } | null => {
  for (const [featureTag, kept] of Object.entries(sheet.choices)) {
    const choice = kept.find((each) => each.toolGuid === toolGuid)
    if (choice) {
      return { featureTag, choice }
    }
  }
  return null
}

/** Un-choose one tool, leaving the others kept for that feature. */
export const removeChoice = (
  sheet: SetupSheet,
  featureTag: string,
  toolGuid: string,
): SetupSheet => {
  const kept = choicesFor(sheet, featureTag).filter((each) => each.toolGuid !== toolGuid)
  if (kept.length === choicesFor(sheet, featureTag).length) {
    return sheet
  }
  return kept.length === 0
    ? clearChoice(sheet, featureTag)
    : { ...sheet, choices: { ...sheet.choices, [featureTag]: kept } }
}

const KEY = (partId: string) => `tool-catalog.setup.${partId}`

const isChoice = (value: unknown): value is Choice =>
  typeof value === 'object' && value !== null && typeof (value as Choice).toolGuid === 'string'

/** Read the sheet for this part, or an empty one when what is stored is another part's or unreadable. */
export const readSheet = (storage: Pick<Storage, 'getItem'> | null, partId: string): SetupSheet => {
  const raw = storage?.getItem(KEY(partId))
  if (!raw) {
    return emptySheet(partId)
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as SetupSheet).partId !== partId ||
      typeof (parsed as SetupSheet).choices !== 'object'
    ) {
      return emptySheet(partId)
    }
    const choices: Record<string, ReadonlyArray<Choice>> = {}
    // A sheet saved before a feature could hold more than one tool stored the
    // choice itself; it is read as the one-line list it always was.
    for (const [tag, kept] of Object.entries((parsed as SetupSheet).choices)) {
      const lines = (Array.isArray(kept) ? kept : [kept]).filter(isChoice)
      if (lines.length > 0) {
        choices[tag] = lines
      }
    }
    return { partId, choices }
  } catch {
    return emptySheet(partId)
  }
}

export const writeSheet = (storage: Pick<Storage, 'setItem'> | null, sheet: SetupSheet): void => {
  storage?.setItem(KEY(sheet.partId), JSON.stringify(sheet))
}

/** The sheet for one part, kept in this browser. */
export const useSetupSheet = (partId: string) => {
  const [sheet, setSheet] = useState<SetupSheet>(() => emptySheet(partId))

  useEffect(() => {
    setSheet(readSheet(globalThis.localStorage ?? null, partId))
  }, [partId])

  const commit = useCallback((next: SetupSheet) => {
    setSheet(next)
    writeSheet(globalThis.localStorage ?? null, next)
  }, [])

  return { sheet, commit }
}
