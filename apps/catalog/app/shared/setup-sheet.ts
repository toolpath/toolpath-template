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
}

export interface SetupSheet {
  readonly partId: string
  /** Feature tag → choice. */
  readonly choices: Readonly<Record<string, Choice>>
}

export const emptySheet = (partId: string): SetupSheet => ({ partId, choices: {} })

/** Choose for a feature, replacing whatever was there. */
export const setChoice = (sheet: SetupSheet, featureTag: string, choice: Choice): SetupSheet => ({
  ...sheet,
  choices: { ...sheet.choices, [featureTag]: choice },
})

/**
 * Un-choose. The key is removed rather than set to nothing, so a cleared
 * feature leaves no trace to be miscounted as a choice.
 */
export const clearChoice = (sheet: SetupSheet, featureTag: string): SetupSheet => {
  if (!(featureTag in sheet.choices)) {
    return sheet
  }
  const choices = { ...sheet.choices }
  delete choices[featureTag]
  return { ...sheet, choices }
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
    const choices: Record<string, Choice> = {}
    for (const [tag, choice] of Object.entries((parsed as SetupSheet).choices)) {
      if (isChoice(choice)) {
        choices[tag] = choice
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
