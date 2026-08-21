import { useEffect, useMemo, useState } from 'react'
import { Button } from '@toolpath/ui'
import { RuleCard } from './rule-editor'
import { Heading } from './heading'
import { RulesSummaryPanel } from './rules-summary'
import type { RulesSummary } from '../shared/rules-summary'
import type { Band } from '../shared/rules'
import type { RulesState } from '../shared/use-rules'
import type { Unit } from '../shared/units'
import type { PartFeature } from '../shared/contracts'
import type { FeatureScore } from '../shared/feature-score'
import { ruleHits } from '../shared/rule-text'
import { moveThroughList } from '../shared/list-keys'

/**
 * The limits the part is being judged against, and every one of them editable.
 *
 * The numbers are on the rows rather than behind a press, because moving one is
 * what a shop is here for. What a rule reads, who it judges and its shape are
 * under `more`: decided once, and in the way when they are not being decided.
 */
export const RulesPanel = ({
  rules,
  features,
  scores,
  summary,
  types,
  unit,
  focusedTag,
  onChoose,
  onHover,
}: {
  rules: RulesState
  features: readonly PartFeature[]
  /** How hard each feature is, for the rows a rule bit on. */
  scores: ReadonlyMap<string, FeatureScore>
  /** What this set makes of this part, computed once for the page. */
  summary: RulesSummary
  /** The feature types this part actually has, for aiming a rule. */
  types: readonly string[]
  unit: Unit
  focusedTag: string | null
  onChoose: (tag: string) => void
  onHover: (tags: string[]) => void
}) => {
  // Folded by default. Fifteen rules with their limits and what each caught is
  // several screens of panel, and the question somebody arrives with is which
  // rule to look at — which is answerable from the names and the counts alone.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const set = rules.ruleSet

  const hits = useMemo(() => ruleHits(rules.verdicts, features), [features, rules.verdicts])

  /**
   * The two questions anybody arrives with — "what is making this part hard"
   * and "what do the rules say about my pockets" — neither of which is
   * answerable across fourteen rules and two hundred readings.
   */
  const [band, setBand] = useState<Band | null>(null)
  const [type, setType] = useState<string>('')

  const shownHits = (id: string) =>
    (hits.get(id) ?? []).filter(
      (hit) => (band === null || hit.band === band) && (type === '' || hit.featureType === type),
    )
  const filtering = band !== null || type !== ''

  // A rule written from nothing is all defaults, so it opens on the fields
  // somebody has to fill in rather than on limits that mean nothing yet.
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!pending) return
    const written = set.rules.at(-1)
    if (written) {
      setEditing(written.id)
      setOpen((shown) => new Set([...shown, written.id]))
    }
    setPending(false)
  }, [pending, set.rules])

  return (
    <aside className="size-full overflow-y-auto bg-zinc-900 p-3 text-xs">
      <Heading>Rule set</Heading>

      <div className="mb-2 flex items-center gap-4">
        {/* Presets make the demo's assumptions explicit while edits remain a
            temporary way to explore what those assumptions change. */}
        <select
          aria-label="Rule set"
          className="h-8 min-w-0 flex-1 rounded border border-zinc-700 bg-transparent px-2 text-xs text-zinc-100"
          onChange={(event) => rules.loadPreset(event.target.value)}
          value={rules.presetId}
        >
          {rules.presets.map((each) => (
            <option key={each.id} value={each.id}>
              {each.name}
            </option>
          ))}
        </select>

        <Button
          className="shrink-0"
          onClick={() => {
            rules.addRule()
            setPending(true)
          }}
          size="sm"
          variant="secondary"
        >
          Add rule
        </Button>
      </div>

      {/* One list for the whole panel, so the arrows walk from a rule into the
          features under it and on into the next rule — which is the order it
          reads in, and the order somebody expects to travel. */}
      <div className="pt-2">
        <RulesSummaryPanel
          band={band}
          onChoose={onChoose}
          onHover={onHover}
          onPickBand={setBand}
          summary={summary}
          unit={unit}
        />
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <Heading>What it cost</Heading>
        <select
          aria-label="Feature type"
          className="ml-auto h-6 rounded border border-zinc-700 bg-transparent px-1 text-2xs text-zinc-400"
          onChange={(event) => setType(event.target.value)}
          value={type}
        >
          <option value="">every feature type</option>
          {types.map((each) => (
            <option key={each} value={each}>
              {each.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <ul
        className="mt-1"
        data-keynav="rules"
        onKeyDown={(event) =>
          moveThroughList(event, {
            onOpen: (value) => setOpen((shown) => new Set([...shown, value])),
            onClose: () => setOpen(new Set()),
          })
        }
      >
        {set.rules
          .filter((rule) => !filtering || shownHits(rule.id).length > 0)
          .map((rule) => (
            <RuleCard
              key={`${rules.revision}:${rule.id}`}
              focusedTag={focusedTag}
              hits={shownHits(rule.id)}
              onChoose={onChoose}
              onHover={onHover}
              scores={scores}
              onChange={rules.updateRule}
              editing={editing === rule.id}
              onEdit={() => {
                // Editing a folded rule showed nothing: the settings live
                // inside what the chevron opens, so pressing the pencil is
                // also a request to see the rule.
                setEditing((editingId) => (editingId === rule.id ? null : rule.id))
                setOpen((shown) => new Set([...shown, rule.id]))
              }}
              onOpen={() =>
                setOpen((shown) => {
                  const next = new Set(shown)
                  if (next.has(rule.id)) next.delete(rule.id)
                  else next.add(rule.id)
                  return next
                })
              }
              onRemove={() => rules.removeRule(rule.id)}
              open={open.has(rule.id)}
              rule={rule}
              types={types}
              unit={unit}
            />
          ))}
      </ul>

      <div className="mt-4 flex items-center gap-2 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
        <span className="flex-1">
          Rule changes are temporary and reset on reload or when choosing another preset.
        </span>
        {rules.dirty ? (
          <button className="text-warning underline" onClick={rules.resetRules} type="button">
            Reset changes
          </button>
        ) : null}
      </div>
    </aside>
  )
}
