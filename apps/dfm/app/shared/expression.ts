import { METRICS } from './metrics'
import type { FeatureMetrics } from './metrics'

/**
 * A rule written as a sum over the numbers a feature already has.
 *
 * The shipped rules each read one measurement, because each of them is one
 * measurement: a pocket's L/D, a hole's diameter. But a shop's own rule is
 * usually a ratio nobody thought to precompute — depth over the cutter that has
 * to reach it, area over stepdown — and adding a metric to the app for every
 * such rule is a release for every idea.
 *
 * So a custom rule carries a little arithmetic instead: names of measurements,
 * numbers, `+ - * /` and brackets. Nothing else — no calls, no variables, no
 * conditionals — because a rule is a number and this is only how it is worked
 * out. And nothing that runs what a user typed: this is a hand-written parser,
 * not `eval`.
 *
 * Every name is a `MetricId`, so the vocabulary is exactly the catalogue in
 * `metrics.ts` and a typo is caught in the box it is typed in rather than
 * quietly reading as nothing.
 */

/** Every measurement a rule can name, with what it means. */
export const MEASUREMENTS: ReadonlyArray<{ name: string; note: string }> = METRICS.map(
  (metric) => ({ name: metric.id, note: metric.note }),
)

const NAMES = new Set<string>(METRICS.map((metric) => metric.id))

type Token =
  | { kind: 'name'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'symbol'; value: string }

const tokenise = (source: string): Array<Token> | null => {
  const tokens: Array<Token> = []
  let at = 0

  while (at < source.length) {
    const char = source[at]!

    if (char === ' ' || char === '\t' || char === '\n') {
      at += 1

      continue
    }

    if ('+-*/()'.includes(char)) {
      tokens.push({ kind: 'symbol', value: char })
      at += 1

      continue
    }

    if (/[0-9.]/.test(char)) {
      let text = ''

      while (at < source.length && /[0-9.]/.test(source[at]!)) {
        text += source[at]
        at += 1
      }

      const value = Number(text)

      if (!Number.isFinite(value)) {
        return null
      }

      tokens.push({ kind: 'number', value })

      continue
    }

    if (/[A-Za-z]/.test(char)) {
      let text = ''

      while (at < source.length && /[A-Za-z]/.test(source[at]!)) {
        text += source[at]
        at += 1
      }

      if (!NAMES.has(text)) {
        return null
      }

      tokens.push({ kind: 'name', value: text })

      continue
    }

    return null
  }

  return tokens
}

/**
 * The sum itself, worked out left to right with the usual precedence.
 *
 * A hand-written descent rather than anything clever: four operators and
 * brackets is the whole language.
 */
const parse = (tokens: ReadonlyArray<Token>): ((metrics: FeatureMetrics) => number | null) => {
  let at = 0

  const peek = (): Token | undefined => tokens[at]
  const take = (): Token | undefined => tokens[at++]

  const primary = (metrics: FeatureMetrics): number | null => {
    const token = take()

    if (!token) {
      return null
    }

    if (token.kind === 'number') {
      return token.value
    }

    if (token.kind === 'name') {
      // Only names that are measurements get tokenised, so this is a lookup
      // rather than a claim: see `NAMES`. A measurement the Engine did not
      // report is null, and a sum over a missing number has no answer.
      const value: number | null | undefined = (metrics as Record<string, number | null>)[
        token.value
      ]

      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }

    if (token.value === '-') {
      const inner = primary(metrics)

      return inner === null ? null : -inner
    }

    if (token.value !== '(') {
      return null
    }

    const inner = sum(metrics)
    const closing = take()

    return closing && closing.kind === 'symbol' && closing.value === ')' ? inner : null
  }

  const product = (metrics: FeatureMetrics): number | null => {
    let left = primary(metrics)

    while (left !== null) {
      const token = peek()

      if (!token || token.kind !== 'symbol' || (token.value !== '*' && token.value !== '/')) {
        break
      }

      take()

      const right = primary(metrics)

      if (right === null) {
        return null
      }

      // A rule that divides by nothing has no answer, which is not the same as
      // an answer of zero: the feature is simply not one this rule is about.
      left = token.value === '*' ? left * right : right === 0 ? null : left / right
    }

    return left
  }

  const sum = (metrics: FeatureMetrics): number | null => {
    let left = product(metrics)

    while (left !== null) {
      const token = peek()

      if (!token || token.kind !== 'symbol' || (token.value !== '+' && token.value !== '-')) {
        break
      }

      take()

      const right = product(metrics)

      if (right === null) {
        return null
      }

      left = token.value === '+' ? left + right : left - right
    }

    return left
  }

  return (metrics: FeatureMetrics): number | null => {
    at = 0

    const value = sum(metrics)

    return at === tokens.length && value !== null && Number.isFinite(value) ? value : null
  }
}

/**
 * Whether the tokens are a sum at all.
 *
 * Structure only, without values: `(maxDepth` and `maxDepth +` are not
 * expressions however the numbers come out, and finding that out by running
 * them means a rule that reads as fine until it meets a feature.
 */
const structured = (tokens: ReadonlyArray<Token>): boolean => {
  let at = 0

  const primary = (): boolean => {
    const token = tokens[at++]

    if (!token) {
      return false
    }

    if (token.kind === 'number' || token.kind === 'name') {
      return true
    }

    if (token.value === '-') {
      return primary()
    }

    if (token.value !== '(') {
      return false
    }

    if (!sum()) {
      return false
    }

    const closing = tokens[at++]

    return closing?.kind === 'symbol' && closing.value === ')'
  }

  const product = (): boolean => {
    if (!primary()) {
      return false
    }

    while (true) {
      const token = tokens[at]

      if (!token || token.kind !== 'symbol' || (token.value !== '*' && token.value !== '/')) {
        return true
      }

      at += 1

      if (!primary()) {
        return false
      }
    }
  }

  const sum = (): boolean => {
    if (!product()) {
      return false
    }

    while (true) {
      const token = tokens[at]

      if (!token || token.kind !== 'symbol' || (token.value !== '+' && token.value !== '-')) {
        return true
      }

      at += 1

      if (!product()) {
        return false
      }
    }
  }

  return sum() && at === tokens.length
}

/**
 * A written rule, ready to run — or nothing, if it is not one.
 *
 * Checked once when the rule is written rather than on every feature: a rule
 * that does not parse should be caught by the person writing it, in the box
 * they are typing in.
 */
export const readExpression = (
  source: string,
): ((metrics: FeatureMetrics) => number | null) | null => {
  const tokens = tokenise(source)

  return tokens && tokens.length > 0 && structured(tokens) ? parse(tokens) : null
}

/** Whether it reads, for saying so beside the box. */
export const expressionReads = (source: string): boolean => readExpression(source) !== null
