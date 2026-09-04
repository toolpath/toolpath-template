import { useState } from 'react'
import { Button, Card, Combobox } from '@toolpath/ui'
import { colletsFor, isOnSize, type CatalogTool, type Collet } from '@toolpath/catalog-data'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { collets as allCollets } from 'shared/catalog'
import { describeGrade, type HolderOption } from 'shared/holder-choice'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { CatalogComboboxButton } from './catalog-combobox-button'

/**
 * Keeping a tool for a feature: what holds it, and what it is held in.
 *
 * Paul's flow (2026-08-31): the two questions that finish an assembly, then
 * confirm — as **a small box with a dropdown each**, not a page of radios. A
 * list of twenty holders read as a decision to be studied; two lines read as
 * a thing to answer and dismiss.
 *
 * **Neither is required, and neither is assumed.** A tool on its own is a
 * legitimate line on a order list, and a shop that has not decided how
 * it will hold something should not be blocked from writing the cutter down —
 * so "No holder" is the first option of the first list *and* what the box
 * opens on, unless the row it came from already had a holder chosen in its
 * own column (Paul, 2026-08-31: "default add to the order list should be no holder").
 *
 * Holders that cannot be used are listed rather than hidden, because "why is
 * my holder not here" is the question hiding them creates. What is wrong with
 * one is said on its own line: a stack that fouls the part is a **collision
 * with the geometry**, not a bad holder.
 */
export interface OrderDialogProps {
  readonly tool: CatalogTool
  /** Every holder in the crib, graded against this tool and this feature. */
  readonly options: ReadonlyArray<HolderOption>
  /** What it is being kept for, in the words the panel uses. */
  readonly feature: string | null
  readonly unit: UnitSystem
  /**
   * The button it came from. The box grows **up and to the left** of it
   * (Paul, 2026-08-31): the rows it is about are below and to the left, and a
   * box in the middle of the screen makes somebody find their place again.
   */
  readonly at: DOMRect
  /**
   * What the row already had chosen, where the table shows the holder and
   * collet columns. Absent is nothing chosen, which is what the box opens on.
   */
  readonly holderGuid?: string | null
  readonly colletGuid?: string | null
  readonly onConfirm: (choice: { holderGuid: string | null; colletGuid: string | null }) => void
  readonly onCancel: () => void
}

/** What is wrong with a holder, in the words a machinist would use. */
const troubleWith = (option: HolderOption): string | null => {
  // A chuck with no collet in the crib holds nothing yet, which is the first
  // thing to say about it — the stack below is a picture, not an offer.
  if (option.unstocked) {
    return describeGrade(option)
  }
  if (option.clears === false) {
    const what = describeGrade(option)
    return `holder collision with geometry${what === '' ? '' : ` — ${what}`}`
  }
  if (option.band === 'bad') {
    return 'too little of the tool in the holder'
  }
  return null
}

export const OrderDialog = ({
  tool,
  options,
  feature,
  unit,
  at,
  holderGuid: chosenHolder = null,
  colletGuid: chosenCollet = null,
  onConfirm,
  onCancel,
}: OrderDialogProps) => {
  const [holderGuid, setHolderGuid] = useState<string | null>(chosenHolder)
  const chosen = options.find((each) => each.holder.guid === holderGuid) ?? null
  const collets: ReadonlyArray<Collet> = chosen ? colletsFor(tool, chosen.holder, allCollets) : []
  const [colletGuid, setColletGuid] = useState<string | null>(chosenCollet)
  const collet = collets.find((each) => each.guid === colletGuid) ?? chosen?.collet ?? null
  const trouble = chosen === null ? null : troubleWith(chosen)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${tool.catalogNumber} to the order list`}
      // Anything outside it puts it away, so the box needs no dismissing of
      // its own — but it does not dim the page, because it is a question
      // about one row rather than about the whole of it.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel()
        }
      }}
      className="fixed inset-0 z-50"
    >
      {/* Bottom-right of the box to top-right of the button, clamped so the
          whole of it stays on the screen. */}
      <div
        style={{
          right: Math.max(8, window.innerWidth - at.right),
          bottom: Math.max(8, window.innerHeight - at.top + 6),
        }}
        className="absolute w-72"
      >
        <Card className="overflow-hidden shadow-xl">
          <div className="border-b border-zinc-900 px-3 py-2">
            <p className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
              Add to order list
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm">
              <span className="shrink-0 text-zinc-400">
                <ToolTypeIcon toolType={tool.form} />
              </span>
              <span className="truncate font-mono font-semibold text-zinc-100">
                {tool.catalogNumber}
              </span>
            </p>
            <p className="text-2xs mt-0.5 truncate text-zinc-500">
              {formLabel(tool)}
              {feature === null ? '' : ` · for the ${feature.toLowerCase()}`}
            </p>
          </div>

          <div className="flex flex-col gap-2 p-3">
            <label className="flex flex-col gap-1">
              <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
                Holder
              </span>
              <Combobox
                items={['', ...options.map((option) => option.holder.guid)]}
                value={holderGuid ?? ''}
                onValueChange={(next) => {
                  setHolderGuid(typeof next === 'string' && next !== '' ? next : null)
                  setColletGuid(null)
                }}
                itemToStringLabel={(guid) => {
                  if (guid === '') {
                    return 'No holder'
                  }
                  const option = options.find((each) => each.holder.guid === guid)
                  if (!option) {
                    return ''
                  }
                  const wrong = troubleWith(option)
                  return `${option.holder.catalogNumber}${wrong === null ? (option.recommended ? ' · recommended' : '') : ` · ${wrong}`}`
                }}
                size="sm"
                variant="ghost"
                aria-label="Holder"
              >
                <CatalogComboboxButton label="Holder" placeholder="No holder" />
                <Combobox.Popover>
                  <Combobox.List>
                    {['', ...options.map((option) => option.holder.guid)].map((guid) => {
                      const option = options.find((each) => each.holder.guid === guid)
                      const wrong = option === undefined ? null : troubleWith(option)
                      return (
                        <Combobox.Item key={guid || 'none'} value={guid}>
                          {guid === '' ? 'No holder' : option?.holder.catalogNumber}
                          {guid === '' || option === undefined
                            ? null
                            : wrong === null
                              ? option.recommended
                                ? ' · recommended'
                                : null
                              : ` · ${wrong}`}
                          <Combobox.ItemIndicator />
                        </Combobox.Item>
                      )
                    })}
                  </Combobox.List>
                </Combobox.Popover>
              </Combobox>
              {trouble === null ? (
                chosen?.stickout == null ? null : (
                  <span className="text-2xs text-zinc-500">
                    {formatLength(chosen.stickout, unit)} out
                  </span>
                )
              ) : (
                <span className="text-2xs text-danger">{trouble}</span>
              )}
            </label>

            {chosen && collets.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Collet
                </span>
                <Combobox
                  items={['', ...collets.map((each) => each.guid)]}
                  value={collet?.guid ?? ''}
                  onValueChange={(next) =>
                    setColletGuid(typeof next === 'string' && next !== '' ? next : null)
                  }
                  itemToStringLabel={(guid) => {
                    if (guid === '') {
                      return 'No collet'
                    }
                    const each = collets.find((colletOption) => colletOption.guid === guid)
                    return each === undefined
                      ? ''
                      : `${each.catalogNumber}${tool.geometry.SFDM !== undefined && isOnSize(each, tool.geometry.SFDM) ? ' · on-size' : ''}`
                  }}
                  size="sm"
                  variant="ghost"
                  aria-label="Collet"
                >
                  <CatalogComboboxButton label="Collet" placeholder="No collet" />
                  <Combobox.Popover>
                    <Combobox.List>
                      {['', ...collets.map((each) => each.guid)].map((guid) => {
                        const each = collets.find((colletOption) => colletOption.guid === guid)
                        return (
                          <Combobox.Item key={guid || 'none'} value={guid}>
                            {guid === '' ? 'No collet' : each?.catalogNumber}
                            {each !== undefined &&
                            tool.geometry.SFDM !== undefined &&
                            isOnSize(each, tool.geometry.SFDM)
                              ? ' · on-size'
                              : null}
                            <Combobox.ItemIndicator />
                          </Combobox.Item>
                        )
                      })}
                    </Combobox.List>
                  </Combobox.Popover>
                </Combobox>
              </label>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-900 px-3 py-2">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm({ holderGuid, colletGuid: collet?.guid ?? null })}>
              Add
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
