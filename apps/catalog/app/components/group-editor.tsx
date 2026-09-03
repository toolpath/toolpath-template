import { XIcon } from '@phosphor-icons/react'
import { Button, cn } from '@toolpath/ui'
import { Chip } from './chip'
import type { Results } from 'shared/feature-list'

/**
 * Building a group: which features are in it, and what it should answer.
 *
 * **The features are picked on the part**, with the mechanism that already
 * exists — a click is a click, and a group is what several of them add up to
 * (Paul, 2026-09-02). What this box adds is the two things a click cannot say:
 * "all of these at once", which is the quick buttons, and what the group is
 * being asked for, which is the only thing about a group that is not simply
 * its contents.
 *
 * The result option is the whole reason a group is a thing rather than a
 * multiple selection:
 *
 * - **one for all** — a tool that cuts every feature in the group. Six holes
 *   of five sizes have one drill between them or they have none, and that is
 *   the answer worth knowing before a job is quoted.
 * - **one each** — the best tool for each of them, which is six answers in a
 *   row that opens.
 */
export interface GroupEditorProps {
  /** What is in the group as it stands — clicked on the part, or added by kind. */
  readonly tags: ReadonlyArray<string>
  readonly results: Results
  readonly onResults: (results: Results) => void
  readonly onDrop: (tag: string) => void
  /** Every kind of feature on the part, with the tags of that kind. */
  readonly types: ReadonlyArray<{ readonly name: string; readonly tags: ReadonlyArray<string> }>
  readonly onAddAll: (tags: ReadonlyArray<string>) => void
  readonly nameOf: (tag: string) => string
  readonly onConfirm: () => void
  readonly onCancel: () => void
  /** Whether this is an edit of a group that already exists, for the words on the button. */
  readonly editing?: boolean
  /**
   * Whether a tool has been picked from the list below.
   *
   * **Picking one is what finishes the group** (Paul, 2026-09-02: "I must
   * select a tool from the list when creating a feature, and that is what adds
   * it to the BOM"). The list under the part is already showing what fits the
   * group as it stands, so the last step is choosing from it rather than
   * confirming and choosing again somewhere else.
   */
  readonly picked?: boolean
}

const CHOICES: ReadonlyArray<{ value: Results; label: string; note: string }> = [
  {
    value: 'all',
    label: 'One tool for all of them',
    note: 'Only tools that can cut every feature in the group.',
  },
  {
    value: 'each',
    label: 'The best tool for each',
    // And it takes them: there is no one tool to pick for six questions, so
    // the rules' own answer to each is what goes on the bill (Paul,
    // 2026-09-02).
    note: 'The best tool for each feature, chosen for you.',
  },
]

export const GroupEditor = ({
  tags,
  results,
  onResults,
  onDrop,
  types,
  onAddAll,
  nameOf,
  onConfirm,
  onCancel,
  editing = false,
  picked = false,
}: GroupEditorProps) => (
  <div className="flex flex-col gap-2">
    <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
      {editing ? 'Edit group' : 'New group'}
    </span>

    <p className="text-2xs text-zinc-500">
      Click the features on the part — click one again to take it out, and use its arrow to say
      which way up it is cut.
    </p>

    {/* What is in it, each with the way out. Empty says so rather than
        leaving a gap somebody has to interpret. */}
    {tags.length === 0 ? (
      <p className="text-2xs rounded border border-dashed border-zinc-800 px-2 py-1.5 text-zinc-600">
        Nothing in this group yet.
      </p>
    ) : (
      /*
        **Capped, and it scrolls** (Paul, 2026-09-02: "long lists of holes are
        still making the create group option go off the screen"). Thirty holes
        is thirty chips, which is a form taller than the window whatever the
        box is allowed to spill over. The chips are the part of it that grows
        without bound, so the cap goes there and the quick buttons, the result
        options and the confirm stay where they were put.

        The one scrollbar this panel has, and it is inside a control rather
        than around the box: what has to stay readable at a glance is what the
        group *is*, and the first rows of it say that.
      */
      <ul className="flex max-h-28 flex-wrap gap-1 overflow-y-auto pr-1">
        {tags.map((tag) => (
          <li key={tag}>
            <button
              type="button"
              aria-label={`Take ${nameOf(tag)} out of the group`}
              onClick={() => onDrop(tag)}
              className="text-2xs focus-visible:ring-info/60 flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              <span className="max-w-32 truncate">{nameOf(tag)}</span>
              <XIcon aria-hidden="true" className="shrink-0 text-zinc-500" />
            </button>
          </li>
        ))}
      </ul>
    )}

    {/*
      **Every hole on the part, in one press** (Paul, 2026-09-02: "quick buttons
      to select all of a type of features"). Twelve holes clicked one at a time
      is twelve chances to miss one, and "all the through holes" is the question
      somebody actually has.
    */}
    {types.length === 0 ? null : (
      <div className="flex flex-col gap-1">
        <span className="text-2xs text-zinc-500">Add every…</span>
        <div className="flex flex-wrap gap-1">
          {types.map((type) => (
            <Chip
              key={type.name}
              onClick={() => onAddAll(type.tags)}
              label={`Add every ${type.name} — ${String(type.tags.length)} of them`}
              title={`Add all ${String(type.tags.length)} to the group`}
            >
              {type.name}
              <span className="text-zinc-500">{type.tags.length}</span>
            </Chip>
          ))}
        </div>
      </div>
    )}

    <fieldset className="flex flex-col gap-1">
      <legend className="text-2xs mb-1 text-zinc-500">Results</legend>
      {CHOICES.map((choice) => (
        <label
          key={choice.value}
          className={cn(
            'flex cursor-pointer items-start gap-2 rounded border px-1.5 py-1 transition',
            results === choice.value
              ? 'border-info/60 bg-info/15'
              : 'border-zinc-800 hover:border-zinc-700',
          )}
        >
          <input
            type="radio"
            name="group-results"
            value={choice.value}
            checked={results === choice.value}
            onChange={() => onResults(choice.value)}
            className="accent-info mt-0.5 shrink-0"
          />
          <span className="flex min-w-0 flex-col">
            <span
              className={cn('text-2xs', results === choice.value ? 'text-info' : 'text-zinc-300')}
            >
              {choice.label}
            </span>
            <span className="text-2xs text-zinc-500">{choice.note}</span>
          </span>
        </label>
      ))}
    </fieldset>

    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      {/* A group of nothing is not a group, and a group with no tool is not an
          answer: the way out of either is Cancel, so the confirm says nothing
          it cannot do. */}
      <Button size="sm" disabled={tags.length === 0 || !picked} onClick={onConfirm}>
        {editing
          ? 'Save group'
          : /*
              **The button says what it does** (Paul, 2026-09-02: "create group
              button should be 'create group and add tool'"). Confirming a group
              is what puts its tool on the bill, and a button called *Create
              group* did not say that it was also ordering something.
            */
            results === 'each'
            ? 'Create group and add tools'
            : 'Create group and add tool'}
      </Button>
      {tags.length > 0 && !picked ? (
        <span className="text-2xs text-zinc-500">Pick a tool from the list below.</span>
      ) : null}
    </div>
  </div>
)
