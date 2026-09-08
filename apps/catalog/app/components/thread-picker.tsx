import { Combobox } from '@toolpath/ui'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import {
  THREADS,
  readLabel,
  threadNamed,
  threadOptions,
  threadsFor,
  type HoleMode,
  type ThreadSpec,
} from 'shared/threads'
import { CatalogComboboxButton } from './catalog-combobox-button'

/**
 * How this hole is made, and for what thread.
 *
 * **The model does not say.** A threaded hole is drawn as a hole, usually at
 * the tap drill and sometimes at the minor or nominal size, so the thread is a
 * guess from the diameter that somebody confirms or overrides (Paul,
 * 2026-08-31). The guess says *what it read* — "M6×1, ⌀5.00 is its tap drill"
 * — because that is checkable and a bare "M6" is not.
 *
 * **One control, and it asks one thing: which thread** (Paul, 2026-09-07: "we
 * should no longer show the 'cut tap' and 'form tap' rows in the feature dialog
 * when applying threads to a hole"). Cut tap and form tap were two rows of
 * figures underneath the thread, on the dialog somebody opens to say what the
 * hole *is*. How the thread is made is a different decision, made while looking
 * at the drills it decides, and it is `<PredrillChoice>` over the drill list
 * now. Choosing a thread here still means the cut tap until somebody says
 * otherwise there.
 *
 * The list holds the threads this hole reads as first and every thread after
 * them, for the hole that reads as nothing or reads as the wrong thing.
 */
export interface ThreadPickerProps {
  /** The bore the model draws, in millimetres. */
  readonly holeDiameter: number
  readonly mode: HoleMode
  /** The thread it is for; null while the hole is plain. */
  readonly spec: ThreadSpec | null
  readonly onChange: (choice: { mode: HoleMode; spec: ThreadSpec | null }) => void
  readonly unit: UnitSystem
}

export const ThreadPicker = ({ holeDiameter, mode, spec, onChange, unit }: ThreadPickerProps) => {
  const offered = threadOptions(holeDiameter, 2)
  const guesses = threadsFor(holeDiameter)

  return (
    <div className="mt-1.5 flex flex-col gap-1 border-t border-zinc-900 pt-1.5">
      {/*
        **Every number on this panel says what it is** (Paul, 2026-09-01: "it's
        not really clear what the boxes are showing — tap drill diameter,
        diameter of the modeled hole, what"). The hole the model draws is
        labelled as that, and the thread it reads as says what it read.
      */}
      {/*
        **The heading says what the hole is** (Paul, 2026-09-02: "when a hole is
        selected, it should say <Thread Spec> Threaded Hole instead of
        thread:plain"). A clear control used to sit here reading "plain hole",
        opposite the word THREAD, which read as a statement that the hole was
        plain — while an M3×0.5 was chosen underneath it. It has gone with the
        wording: the first option in the list below is "No thread — a plain
        hole", and one way to say a thing is enough (Paul, same day).
      */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
          {spec === null ? 'Thread' : `${spec.name} threaded hole`}
        </span>
      </div>

      <div className="text-2xs flex items-baseline justify-between gap-2 text-zinc-500">
        Modeled hole diameter:
        <span className="font-mono text-zinc-200">⌀{formatLength(holeDiameter, unit)}</span>
      </div>

      {/*
        **One control, and the suggestions are in it** (Paul, 2026-09-01: "only
        suggest threads in the drop down list — don't show the suggested thread
        spec at all, just the drop down"). Rows of chips over a select was two
        ways to answer one question, and the boxes took the top of a panel
        nobody should have to scroll. The threads the hole reads as are the
        first group in the list, each saying what it read as and by how much
        the model is off it.
      */}
      <div className="text-2xs mt-0.5 flex flex-col gap-0.5 text-zinc-500">
        <span>Thread:</span>
        <Combobox
          items={['', ...THREADS.map((each) => each.name)]}
          value={spec !== null && threadNamed(spec.name) ? spec.name : ''}
          onValueChange={(next) => {
            const chosen = typeof next === 'string' ? threadNamed(next) : null
            onChange(
              chosen === null
                ? { mode: 'plain', spec: null }
                : { mode: mode === 'plain' ? 'cut tap' : mode, spec: chosen },
            )
          }}
          itemToStringLabel={(name) => (name === '' ? 'No thread — a plain hole' : name)}
          size="sm"
          variant="ghost"
          aria-label="Thread specification"
        >
          <CatalogComboboxButton label="Thread" placeholder="No thread — a plain hole" />
          <Combobox.Popover>
            <Combobox.List>
              <Combobox.Item value="">
                No thread — a plain hole
                <Combobox.ItemIndicator />
              </Combobox.Item>
              {offered.length === 0 ? null : (
                <Combobox.Group>
                  <Combobox.GroupLabel>Closest match to modeled diameter</Combobox.GroupLabel>
                  {offered.map((each) => (
                    <Combobox.Item key={`closest-${each.spec.name}`} value={each.spec.name}>
                      {each.spec.name} — {readLabel(each.read)}
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))}
                </Combobox.Group>
              )}
              <Combobox.Group>
                <Combobox.GroupLabel>Every thread</Combobox.GroupLabel>
                {THREADS.map((each) => {
                  const guess = guesses.find((one) => one.spec.name === each.name)
                  return (
                    <Combobox.Item key={`every-${each.name}`} value={each.name}>
                      {each.name}
                      {guess ? ` — ${readLabel(guess.read)}` : ''}
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  )
                })}
              </Combobox.Group>
            </Combobox.List>
          </Combobox.Popover>
        </Combobox>
      </div>
    </div>
  )
}
