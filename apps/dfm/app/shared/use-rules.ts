import { useCallback, useMemo, useState } from 'react'
import type { PartFeature } from '@toolpath/part-contracts'

import { DEFAULT_RULE_SET, PRESET_SETS } from './rule-presets'
import type { FeatureVerdict, PartScore, PlanLimits, Rule, RuleSet } from './rules'
import { evaluatePart, scorePart } from './rules'

/**
 * The rule set the app is judging with.
 *
 * Rules are deliberately session-only in the public reference viewer. The
 * panel is a place to explore how limits change a verdict, not a place to
 * maintain a shop's configuration; reloading or choosing another preset starts
 * from shipped data again.
 */

/** Rules the panel can edit without changing their module-level preset. */
const copyRules = (rules: ReadonlyArray<Rule>): Array<Rule> => rules.map((rule) => ({ ...rule }))

/** A fresh working copy of a shipped preset. */
const copyRuleSet = (set: RuleSet): RuleSet => ({
  ...set,
  rules: copyRules(set.rules),
  ...(set.bandNames ? { bandNames: { ...set.bandNames } } : {}),
  ...(set.plan
    ? {
        plan: {
          ...set.plan,
          ...(set.plan.machine ? { machine: { ...set.plan.machine } } : {}),
        },
      }
    : {}),
})

const sameRuleSet = (left: RuleSet, right: RuleSet): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

export interface RulesState {
  /** Whether the working copy differs from its selected shipped preset. */
  dirty: boolean
  /** Every feature judged, in report order. */
  verdicts: Array<FeatureVerdict>
  score: PartScore
  ruleSet: RuleSet
  presets: ReadonlyArray<RuleSet>
  /** The shipped preset the working copy will reset to. */
  presetId: string
  /** Changes whenever the working copy is replaced by a preset. */
  revision: number
  /** Replaces one rule, matched by id. */
  updateRule: (rule: Rule) => void
  /** Updates the plan limits in this temporary working copy. */
  updatePlan: (limits: PlanLimits) => void
  addRule: () => void
  removeRule: (id: string) => void
  /** Replaces this session's working copy with the selected shipped preset. */
  loadPreset: (id: string) => void
  /** Restores the currently selected shipped preset. */
  resetRules: () => void
}

export const useRules = (
  features: ReadonlyArray<PartFeature>,
  /** The part's bounding box, for the rules that judge the part itself. */
  boundingBox?: ReadonlyArray<number>,
): RulesState => {
  const [presetId, setPresetId] = useState(DEFAULT_RULE_SET.id)
  const [revision, setRevision] = useState(0)
  const [ruleSet, setRuleSet] = useState<RuleSet>(() => copyRuleSet(DEFAULT_RULE_SET))

  const selectedPreset = PRESET_SETS.find((set) => set.id === presetId) ?? DEFAULT_RULE_SET

  const updateRule = useCallback((rule: Rule) => {
    setRuleSet((current) => ({
      ...current,
      rules: current.rules.map((existing) => (existing.id === rule.id ? rule : existing)),
    }))
  }, [])

  const addRule = useCallback(() => {
    // A threshold on reach, which is the measurement every feature carries — a
    // new rule that applies to nothing reads as broken before it is filled in.
    setRuleSet((current) => ({
      ...current,
      rules: [
        ...current.rules,
        {
          id: globalThis.crypto?.randomUUID?.() ?? `rule-${current.rules.length}`,
          type: 'threshold',
          name: 'New rule',
          metric: 'depthBelowPartTop',
          direction: 'higher is harder',
          thresholds: [1, 2, 3, 4],
          weight: 2,
          enabled: true,
          featureTypes: [],
          note: '',
        },
      ],
    }))
  }, [])

  const removeRule = useCallback((id: string) => {
    setRuleSet((current) => ({
      ...current,
      rules: current.rules.filter((rule) => rule.id !== id),
    }))
  }, [])

  const loadPreset = useCallback((id: string) => {
    const selected = PRESET_SETS.find((set) => set.id === id)

    if (!selected) return

    setPresetId(selected.id)
    setRevision((current) => current + 1)
    setRuleSet(copyRuleSet(selected))
  }, [])

  const updatePlan = useCallback((plan: PlanLimits) => {
    setRuleSet((current) => ({ ...current, plan }))
  }, [])

  const resetRules = useCallback(() => {
    setRevision((current) => current + 1)
    setRuleSet(copyRuleSet(selectedPreset))
  }, [selectedPreset])

  // Every feature against every rule on each change. A few hundred features by
  // a dozen rules is a few thousand comparisons — cheap enough to redo on a
  // threshold drag, which is what makes the recolour feel immediate.
  const verdicts = useMemo(
    () => evaluatePart(ruleSet.rules, features, boundingBox, ruleSet.plan?.machine),
    [boundingBox, features, ruleSet],
  )

  return {
    verdicts,
    score: useMemo(() => scorePart(verdicts), [verdicts]),
    ruleSet,
    presets: PRESET_SETS,
    presetId,
    revision,
    dirty: !sameRuleSet(selectedPreset, ruleSet),
    updateRule,
    updatePlan,
    addRule,
    removeRule,
    loadPreset,
    resetRules,
  }
}
