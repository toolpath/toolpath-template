import { useEffect, useRef } from 'react'
import { CaretDownIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react'
import { classNames } from '@toolpath/domain/class-names'

/**
 * The assemblies kept for this part, one chip per feature, folded up.
 *
 * Minimal on purpose: a bar that says how many, opening to the chips when
 * something is saved and folding again on any press outside it. Pressing a
 * chip lights that feature on the part and draws that tool — it is how a
 * person finds their way back to a decision, not where the decision is made.
 */
export interface SavedEntry {
  readonly featureTag: string
  /** What the feature is — "Pocket ×4" — or "the part" for a choice made with nothing focused. */
  readonly feature: string
  readonly assembly: string
  readonly toolGuid: string
}

export interface SavedStripProps {
  readonly entries: ReadonlyArray<SavedEntry>
  readonly open: boolean
  readonly onOpen: (open: boolean) => void
  /** The chip being pointed at, lit on the part. */
  readonly picked: string | null
  readonly onPick: (entry: SavedEntry) => void
  readonly onRemove: (entry: SavedEntry) => void
}

export const SavedStrip = ({
  entries,
  open,
  onOpen,
  picked,
  onPick,
  onRemove,
}: SavedStripProps) => {
  const box = useRef<HTMLDivElement>(null)

  // Folds on any press that is not inside it — Paul's rule — so it never sits
  // open over the list somebody is reading.
  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        onOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, onOpen])

  if (entries.length === 0) {
    return null
  }

  return (
    <div ref={box} data-saved-strip="" className="border-b border-zinc-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        className="text-2xs flex w-full items-center gap-1.5 px-3 py-1.5 text-left font-semibold tracking-wide text-zinc-400 uppercase hover:text-zinc-200"
      >
        {open ? <CaretDownIcon /> : <CaretRightIcon />}
        Saved assemblies · {entries.length}
      </button>
      {open ? (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-2">
          {entries.map((entry) => (
            <li key={entry.featureTag} className="flex items-stretch">
              <button
                type="button"
                aria-pressed={picked === entry.featureTag}
                onClick={() => onPick(entry)}
                className={classNames(
                  'text-2xs rounded-l-md border px-2 py-1 text-left transition',
                  picked === entry.featureTag
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100',
                )}
              >
                <span className="block font-semibold">{entry.feature}</span>
                <span className="block font-mono text-zinc-400">{entry.assembly}</span>
              </button>
              <button
                type="button"
                aria-label={`Forget the assembly saved for ${entry.feature}`}
                onClick={() => onRemove(entry)}
                className="rounded-r-md border border-l-0 border-zinc-800 px-1.5 text-zinc-500 transition hover:text-zinc-100"
              >
                <XIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
