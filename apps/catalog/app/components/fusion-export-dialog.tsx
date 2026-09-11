import { useState } from 'react'
import { Button, Card, Input } from '@toolpath/ui'
import { PRETOOL_MATERIALS, type PretoolMaterial } from 'shared/pretool-presets'
import type { FusionExportDiagnostic, FusionExportSettings } from 'shared/fusion-library'
import { useEscape } from 'shared/use-escape'
import { SECTION_LABEL } from 'shared/type'

export interface FusionExportDialogProps {
  readonly initialMaterial: PretoolMaterial | null
  readonly initialName: string
  readonly onCancel: () => void
  readonly onExport: (
    settings: FusionExportSettings,
    name: string,
  ) => Promise<{
    readonly exported: number
    readonly skipped: ReadonlyArray<FusionExportDiagnostic>
    readonly holderWarnings: ReadonlyArray<FusionExportDiagnostic>
  }>
}

const labelFor = (material: PretoolMaterial): string =>
  material === 'AluWrought'
    ? 'Aluminum'
    : material === 'LowCSteel'
      ? 'Low Carbon Steel'
      : 'Stainless Steel'

/** The one last question before PreTool turns the bill into CAM starting data. */
export const FusionExportDialog = ({
  initialMaterial,
  initialName,
  onCancel,
  onExport,
}: FusionExportDialogProps) => {
  const [material, setMaterial] = useState<PretoolMaterial | null>(initialMaterial)
  const [name, setName] = useState(initialName)
  const [maxRpm, setMaxRpm] = useState('12000')
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<{
    readonly exported: number
    readonly skipped: ReadonlyArray<FusionExportDiagnostic>
    readonly holderWarnings: ReadonlyArray<FusionExportDiagnostic>
  } | null>(null)
  const rpm = Number(maxRpm)
  const canExport =
    material !== null && name.trim() !== '' && Number.isFinite(rpm) && rpm > 0 && !working

  useEscape(true, onCancel)

  const submit = async () => {
    if (!canExport || material === null) {
      return
    }
    setWorking(true)
    try {
      setResult(await onExport({ material, maxRpm: rpm }, name.trim()))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export Fusion tool library"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !working) {
          onCancel()
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <Card className="w-full max-w-md overflow-hidden shadow-xl">
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="text-sm font-semibold text-zinc-100">Fusion tool library</p>
          <p className="mt-1 text-xs text-zinc-400">
            PreTool will generate roughing and finishing presets for the chosen material.
          </p>
        </div>
        <div className="space-y-4 p-4">
          <fieldset>
            <legend className={SECTION_LABEL}>Workpiece material</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRETOOL_MATERIALS.map((each) => (
                <Button
                  key={each}
                  type="button"
                  size="md"
                  variant={material === each ? 'secondary' : 'muted'}
                  aria-pressed={material === each}
                  onClick={() => setMaterial(each)}
                >
                  {labelFor(each)}
                </Button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className={SECTION_LABEL}>Library name</span>
            <Input
              id="fusion-export-name"
              name="fusion-export-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Library name"
            />
            <span className="text-2xs text-zinc-500">
              Fusion will use this filename for the library.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={SECTION_LABEL}>Maximum spindle RPM</span>
            <Input
              id="fusion-export-max-rpm"
              name="fusion-export-max-rpm"
              type="number"
              min="1"
              step="1"
              value={maxRpm}
              onChange={(event) => setMaxRpm(event.target.value)}
              aria-label="Maximum spindle RPM"
            />
          </label>
          {result === null ? null : (
            <div
              aria-live="polite"
              className="space-y-2 rounded border border-zinc-800 bg-zinc-900/70 p-3 text-xs"
            >
              <p className="font-semibold text-zinc-200">
                {result.exported === 0
                  ? 'No Fusion library was downloaded.'
                  : `Downloaded ${result.exported} tool ${result.exported === 1 ? 'assembly' : 'assemblies'}.`}
              </p>
              {result.skipped.map((each) => (
                <p key={`${each.catalogNumber}:${each.reason}`} className="text-warning">
                  {each.catalogNumber} skipped — {each.reason}
                </p>
              ))}
              {result.holderWarnings.map((each) => (
                <p key={`${each.catalogNumber}:${each.reason}`} className="text-zinc-400">
                  {each.catalogNumber} — {each.reason}; exported without its holder shape.
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <Button
            type="button"
            size="md"
            variant="muted"
            onClick={onCancel}
            disabled={working}
            className="min-w-20"
          >
            Close
          </Button>
          <Button
            type="button"
            size="md"
            variant="secondary"
            onClick={submit}
            disabled={!canExport}
            className="min-w-32"
          >
            {working ? 'Preparing…' : 'Download .json'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
