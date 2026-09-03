import { type UnitSystem } from '@toolpath/tool-support'
import { memo, useEffect, useMemo, useState } from 'react'
import { Button } from '@toolpath/ui'
import { RuleCard } from './rule-editor'
import { Heading } from './heading'
import { RulesSummaryPanel } from './rules-summary'
import { PlanChoices } from './plan-choices'
import type { WhatBit } from 'shared/best-reading'
import { judgesFeatures, judgesPlan } from 'shared/rules'
import type { RulesSummary } from 'shared/rules-summary'
import type { Band } from 'shared/rules'
import type { RulesState } from 'shared/use-rules'
import type { PartFeature } from 'shared/contracts'
import type { FeatureScore } from 'shared/feature-score'
import { ruleHits } from 'shared/rule-text'
import { moveThroughList } from 'shared/list-keys'
import { keynavAttributes } from 'shared/row-nav'

/**
 * The limits the part is being judged against, and every one of them editable.
 *
 * The numbers are on the rows rather than behind a press, because moving one is
 * what a shop is here for. What a rule reads, who it judges and its shape are
 * under `more`: decided once, and in the way when they are not being decided.
 */
const RulesPanelView = ({
  rules,
  bit,
  now,
  features,
  scores,
  summary,
  types,
  unit,
  partSides,
  focusedTag,
  onChoose,
  onHover,
}: {
  rules: RulesState
  /**
   * What each op-planning limit decided on the last arrangement built.
   *
   * The panel's answer to the question it could not answer before: *which of
   * these is doing anything on my part?* `undefined` until a plan exists,
   * which is not the same as "nothing did anything".
   */
  bit?: WhatBit
  /**
   * What the plan on screen **is**, right now.
   *
   * The ledger beside it describes the last arrangement a generator built, and
   * it is honest about that — but a plan is edited by hand for as long as
   * somebody works on it, so a page that only ever showed the ledger described
   * a plan that stopped existing at the first press. These are read live off
   * the plan, so choosing a way up or mapping a feature changes them while the
   * page is open.
   */
  now: { setups: number; mapped: number }
  features: ReadonlyArray<PartFeature>
  /** How hard each feature is, for the rows a rule bit on. */
  scores: ReadonlyMap<string, FeatureScore>
  /** What this set makes of this part, computed once for the page. */
  summary: RulesSummary
  /** The feature types this part actually has, for aiming a rule. */
  types: ReadonlyArray<string>
  unit: UnitSystem
  /** The part's own size, for the sizes-taken card. Null before a mesh lands. */
  partSides?: ReadonlyArray<number> | null
  focusedTag: string | null
  onChoose: (tag: string) => void
  onHover: (tags: Array<string>) => void
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
    if (!pending) {
      return
    }
    const written = set.rules.at(-1)
    if (written) {
      setEditing(written.id)
      setOpen((shown) => new Set([...shown, written.id]))
    }
    setPending(false)
  }, [pending, set.rules])

  return (
    <aside className="size-full overflow-y-auto bg-ground p-3 text-xs">
      <Heading>Rule set</Heading>

      <div className="mb-2 flex items-center gap-4">
        {/* Presets make the demo's assumptions explicit while edits remain a
            temporary way to explore what those assumptions change. */}
        <select
          aria-label="Rule set"
          className="h-8 min-w-0 flex-1 rounded border border-edge-strong bg-transparent px-2 text-xs text-ink"
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
        {/*
          Nothing to judge yet, and it says so.

          The page is about how hard **the work the plan will do** is, so before
          there is a plan there is no answer — and the honest one is that,
          rather than judging every reading the Engine reported. Most of those
          are alternatives nobody chose, so that answer described trouble no
          operation on this part would ever meet.
        */}
        {features.length === 0 ? (
          <p className="mb-2 rounded border border-edge px-2 py-1.5 text-2xs leading-4 text-ink-dim">
            No directions are mapped. The rules below are what will be applied — what they make of
            this part appears here once something is mapped.
          </p>
        ) : null}
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
        {/*
          The plan panel that used to sit here is gone.

          It held six prices in three currencies, then two of those and a
          drawer of mechanics. All of it is now in the list above, under *The
          plan itself* — a shop reads one list of rules rather than a list and
          a panel of settings underneath it in units nothing else used.
        */}
        <Heading>What it cost</Heading>
        <select
          aria-label="Feature type"
          className="ml-auto h-6 rounded border border-edge-strong bg-transparent px-1 text-2xs text-ink-muted"
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
        {...keynavAttributes('rules')}
        onKeyDown={(event) =>
          moveThroughList(event, {
            onOpen: (value) => setOpen((shown) => new Set([...shown, value])),
            onClose: () => setOpen(new Set()),
          })
        }
      >
        {/*
          The two that judge the **arrangement**, first and labelled.

          They are rules in every sense the rest are — four thresholds and a
          refusal, a weight, a note, on and off — and they read in the same
          editor. What differs is what they are about, and a list that did not
          say so would have "Setups the plan runs" sitting between two rules
          about hole diameters as though it were one more.

          Not filtered by the band press either: that narrows to rules that
          judged a *feature*, and these judged none.
        */}
        {set.rules.filter(judgesPlan).length === 0 ? null : (
          <li className="mb-1 mt-2 text-2xs font-bold uppercase tracking-wider text-ink-dim first:mt-0">
            The plan itself
          </li>
        )}
        {/*
          Setups the geometry forced past the shop's wall.

          A refusal past three ways up is a statement about *choices*, and a
          forced direction is not one — it is the only thing that reaches an
          undercut, and dropping it would leave the part uncut. So geometry
          wins, and this is the half that was missing: it used to happen in
          silence, and got filed for months as an arrangement that could not
          count.
        */}
        {/*
          What the rules above are judging, as it stands.

          A threshold with no reading beside it is a rule somebody has to go and
          check somewhere else — and the somewhere else is another tab.
        */}
        <li className="mb-1 flex items-center gap-2 rounded border border-edge px-1.5 py-1 text-2xs text-ink-dim">
          <span>
            <span className="font-semibold tabular-nums text-ink-body">{now.setups}</span>{' '}
            {now.setups === 1 ? 'setup' : 'setups'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <span className="font-semibold tabular-nums text-ink-body">
              {(now.mapped * 100).toFixed(0)}%
            </span>{' '}
            of the part cut
          </span>
        </li>
        {bit === undefined || bit.waysUpForced === 0 ? null : (
          <li className="mb-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-1 text-2xs leading-4 text-warning">
            {bit.waysUpForced === 1 ? 'One setup is' : `${String(bit.waysUpForced)} setups are`}{' '}
            past your refusal because nothing else reaches the ground they cut. A wall is about
            choices, and these were not one.
          </li>
        )}
        {set.rules.filter(judgesPlan).map((rule) => (
          <RuleCard
            key={`${rules.revision}:${rule.id}`}
            focusedTag={focusedTag}
            hits={[]}
            onChoose={onChoose}
            onHover={onHover}
            scores={scores}
            onChange={rules.updateRule}
            editing={editing === rule.id}
            onEdit={() => {
              setEditing((editingId) => (editingId === rule.id ? null : rule.id))
              setOpen((shown) => new Set([...shown, rule.id]))
            }}
            onOpen={() =>
              setOpen((shown) => {
                const next = new Set(shown)
                if (next.has(rule.id)) {
                  next.delete(rule.id)
                } else {
                  next.add(rule.id)
                }
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

        {/*
          The two decisions about a plan that are not scales — a refusal and a
          choice of ranking — with the two that are. They were a separate panel
          below the list, which is where nobody found them.
        */}
        <PlanChoices
          limits={set.plan}
          onChange={rules.updatePlan}
          refused={bit?.worstBand}
          partSides={partSides}
          revision={rules.revision}
          unit={unit}
        />

        {set.rules.filter(judgesPlan).length === 0 ? null : (
          <li className="mb-1 mt-3 text-2xs font-bold uppercase tracking-wider text-ink-dim">
            Every feature
          </li>
        )}
        {set.rules
          .filter(judgesFeatures)
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
                  if (next.has(rule.id)) {
                    next.delete(rule.id)
                  } else {
                    next.add(rule.id)
                  }
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

      <div className="mt-4 flex items-center gap-2 border-t border-edge pt-3 text-xs text-ink-muted">
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

/*
 * Memoised. Its inputs are the rule set and what the rules made of the plan —
 * neither of which moves when a pointer crosses a face row on another tab.
 */
export const RulesPanel = memo(RulesPanelView)
