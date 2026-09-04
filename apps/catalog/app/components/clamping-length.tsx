import { RailBubble } from './filter-rail'
import { ClampingLengthIcon } from './tool-icons'
import type { ClampingRule } from 'shared/clamping-length'
import { Checkbox, Input, Toggle } from '@toolpath/ui'

/**
 * How much shank stays in the holder, in diameters.
 *
 * **ISO 13399's `LSCN`** — *clamping length minimum*, stated against the shank
 * diameter `DMM`. The manufacturers publish it per tool and this catalog
 * carries none of it: the five Seco end mills Paul checked want between 4 and
 * 6 diameters clamped, against the 3×D rule of thumb (2026-09-01). A shop that
 * knows its own answer says it once here, and every tool's length below the
 * holder — and the L/D beside it — is what that leaves.
 *
 * Not a filter: nothing is hidden by it. It changes the number every tool is
 * judged on, which is why it sits with the other knobs on the rail.
 */
export interface ClampingLengthProps {
  readonly rule: ClampingRule
  readonly onChange: (rule: ClampingRule) => void
  /** The sheet's own fallback, to say what changing it is a departure from. */
  readonly sheet: number
}

export const ClampingLengthFields = ({ rule, onChange }: ClampingLengthProps) => (
  <>
    <p className="text-2xs text-zinc-400">
      How much of the shank stays in the holder, in diameters — ISO 13399&rsquo;s{' '}
      <span className="font-mono">LSCN</span>, clamping length minimum. The rule of thumb is 3×D;
      the manufacturers publish 4 to 6. What is left below the holder is the overall length less
      what is held — and the L/D beside it.
    </p>
    <label className="text-2xs flex items-start gap-2 text-zinc-300">
      <Checkbox
        name="use-vendor-clamping-length"
        checked={rule.vendorSpec}
        onChange={(checked) => onChange({ ...rule, vendorSpec: checked })}
        size="sm"
        className="mt-0.5"
      />
      <span>
        Use the manufacturer&rsquo;s spec where it is published
        <span className="mt-0.5 block text-zinc-500">
          No vendor in this catalog states one yet, so every tool falls back for now.
        </span>
      </span>
    </label>
    <Toggle
      value={String(rule.perDiameter)}
      onValueChange={(value) => onChange({ ...rule, perDiameter: Number(value) })}
      size="sm"
      className="flex-wrap"
    >
      {[3, 4, 5, 6].map((each) => (
        <Toggle.Item key={each} value={String(each)} className="text-2xs px-2 py-0.5">
          {String(each)}×D
        </Toggle.Item>
      ))}
    </Toggle>
    <div className="text-2xs flex items-center gap-2 text-zinc-400">
      Or a multiple of your own
      <Input
        id="custom-clamping-length"
        name="custom-clamping-length"
        type="text"
        inputMode="decimal"
        value={rule.perDiameter}
        aria-label="Minimum clamping length, in diameters"
        onValueChange={(raw) => {
          const value = Number(raw ?? '')
          onChange({ ...rule, perDiameter: Number.isFinite(value) && value >= 0 ? value : 0 })
        }}
        variant="ghost"
        size="md"
        textEnd
        className="inline-flex w-16 rounded border border-zinc-700 font-mono text-xs text-zinc-100"
      />
      ×D
    </div>
  </>
)

export const ClampingLength = ({ rule, onChange, sheet }: ClampingLengthProps) => {
  /**
   * **Lit only when somebody has changed it** (Paul, 2026-09-01).
   *
   * The default is an answer the application holds, not one anybody gave:
   * the manufacturer's spec where it is published and the rule of thumb where
   * it is not. A rail bubble that reads as *set* on a fresh page says a shop
   * decided something it did not.
   */
  const changed = !rule.vendorSpec || rule.perDiameter !== sheet
  return (
    <RailBubble
      icon={<ClampingLengthIcon />}
      label="Minimum clamping length"
      value={
        changed
          ? [
              ...(rule.vendorSpec ? ['vendor spec'] : ['no vendor spec']),
              ...(rule.perDiameter > 0 ? [`${String(rule.perDiameter)}×D`] : []),
            ]
          : []
      }
      onClear={changed ? () => onChange({ vendorSpec: true, perDiameter: sheet }) : undefined}
    >
      <div className="flex flex-col gap-2">
        <ClampingLengthFields rule={rule} onChange={onChange} sheet={sheet} />
      </div>
    </RailBubble>
  )
}
