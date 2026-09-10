import { CheckIcon } from '@phosphor-icons/react'
import { IconButton, Input, cn } from '@toolpath/ui'
import { useEffect, useRef, useState } from 'react'

/**
 * A tool assembly called what a shop calls it, typed where its name is drawn.
 *
 * **A name goes in where the name is** (Paul, 2026-09-08: "the UI should be
 * minimal — enter the text where the placeholder is shown then click a small
 * check mark or hit enter"). The alternative was a dialog, which is a modal
 * over a page whose whole point is that the stack stays on screen while it is
 * being built; this replaces the label with a field the width of the label and
 * puts it back the moment the name is settled.
 *
 * **The placeholder is what it is called now**, rather than a prompt: the row
 * already says `Tool assembly 3`, so a field over it showing "Name…" would be
 * hiding the one piece of information somebody needs to decide whether to
 * bother. Typing nothing and confirming leaves the number — which is also the
 * way back from a name, and the reason there is no *un-name* control.
 *
 * One component for the two places that name a stack — the list row and the
 * card in the tree — because two of these would be two answers to *does Escape
 * cancel* and *does clicking away keep what was typed*.
 *
 * It draws and reports. What a name *is* belongs to `shared/feature-list.ts`
 * `renameItem` and `shared/assembly-tree.ts` `renameAssembly`, which trim it and
 * decide what an empty one means.
 */
export interface NameFieldProps {
  /** The name it already has, or empty where it has none. */
  readonly value: string
  /** What it goes on being called if nothing is typed — see above. */
  readonly placeholder: string
  /** What is being named, for the field and its tick to say so out loud. */
  readonly label: string
  /** Keep what was typed. Empty means "no name", not an empty name. */
  readonly onCommit: (name: string) => void
  /** Escape: leave it called whatever it was called. */
  readonly onCancel: () => void
  readonly className?: string
}

export const NameField = ({
  value,
  placeholder,
  label,
  onCommit,
  onCancel,
  className,
}: NameFieldProps) => {
  const [text, setText] = useState(value)
  const field = useRef<HTMLInputElement>(null)
  /**
   * Whether this field has already said what it had to say.
   *
   * Every way out of a name — the tick, Enter, Escape, a click elsewhere —
   * takes the field off screen, and the browser blurs an input it is removing.
   * Without this, cancelling with Escape would be followed by the blur handler
   * keeping the very text Escape threw away.
   */
  const done = useRef(false)

  useEffect(() => {
    // The field is opened *by* a press somebody has just made, so the caret
    // belongs in it: a naming field nobody can type into without clicking it
    // first is a dialog with extra steps.
    field.current?.focus()
    field.current?.select()
  }, [])

  const settle = (keep: boolean) => {
    if (done.current) {
      return
    }
    done.current = true
    if (keep) {
      onCommit(text.trim())
      return
    }
    onCancel()
  }

  const id = `name-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`

  return (
    <div
      /*
        **Wide enough to read what is being typed** (Paul, 2026-09-08: "this
        text entry box needs to be wider so I can see what I'm typing"). The
        list stands on the part and is only as wide as its rows, so a field
        asking for its width from a flex parent got the width of a caret — and
        the placeholder saying what the row is called now was invisible with it.
        A floor of its own, which the row grows to and a card holds.
      */
      className={cn('flex w-full min-w-48 items-center gap-1', className)}
      /*
        The row under it is a button, and in the list it is a right-click
        target: a click meant for the caret must not also select the row or put
        it down again.
      */
      onClick={(event) => event.stopPropagation()}
    >
      <Input
        ref={field}
        id={id}
        name={id}
        type="text"
        aria-label={`Name for ${label}`}
        placeholder={placeholder}
        value={text}
        variant="ghost"
        size="md"
        onValueChange={(next) => setText(next ?? '')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            settle(true)
            return
          }
          if (event.key === 'Escape') {
            /*
              `preventDefault` rather than `stopPropagation`: `use-escape`
              listens on the document, where a synthetic event's propagation
              has already finished, and it skips a press somebody else has
              answered. Without it one press would both close this field and
              drop the reading underneath it.
            */
            event.preventDefault()
            settle(false)
          }
        }}
        // Clicking away is confirming: what was typed is what is meant, and a
        // field that throws the name away on a misclick is worse than one that
        // keeps a name somebody can retype over.
        onBlur={() => settle(true)}
        className="w-full min-w-0 flex-1 rounded border border-zinc-800 px-1.5 py-0.5 text-xs"
      />
      <IconButton
        type="button"
        size="md"
        variant="muted"
        aria-label={`Save the name for ${label}`}
        title="Save this name"
        /*
          Mousedown would blur the field first, and the blur takes the field off
          screen before this press ever lands on it. Held off, so the tick is
          the press that settles the name.
        */
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => settle(true)}
        className="text-info !size-5 shrink-0 rounded border-0 bg-transparent hover:bg-zinc-800 [&_svg]:!size-3"
      >
        <CheckIcon aria-hidden="true" weight="bold" />
      </IconButton>
    </div>
  )
}
