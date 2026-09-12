import { useState } from 'react'
import { Button, Card, Input } from '@toolpath/ui'
import type { FusionReport } from 'shared/fusion-input'
import { useEscape } from 'shared/use-escape'
import { SECTION_LABEL } from 'shared/type'

export interface FusionExportDialogProps {
  readonly initialName: string
  readonly onCancel: () => void
  readonly onExport: (name: string) => Promise<FusionReport>
}

/**
 * The one last question before the bill becomes a file: what to call it.
 *
 * It asked two more until the exporter moved to
 * `@toolpath/tool-support/export/fusion` — a workpiece material and a maximum
 * spindle speed, which were PreTool's inputs for the feeds and speeds it wrote
 * into `start-values`. What goes out now is `defaultPreset`, a placeholder of
 * 1s that exists so the library loads at all, and it needs neither answer. The
 * two questions come back with `pretool-presets.ts`, and not before: asking a
 * shop for its spindle ceiling and then writing a 1 would be worse than not
 * asking.
 */
export const FusionExportDialog = ({
  initialName,
  onCancel,
  onExport,
}: FusionExportDialogProps) => {
  const [name, setName] = useState(initialName)
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<FusionReport | null>(null)
  const canExport = name.trim() !== '' && !working

  useEscape(true, onCancel)

  const submit = async () => {
    if (!canExport) {
      return
    }
    setWorking(true)
    try {
      setResult(await onExport(name.trim()))
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
            Every assembly on this bill, with its holder. Feeds and speeds are left for Fusion.
          </p>
        </div>
        <div className="space-y-4 p-4">
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
                  {each.catalogNumber} — {each.reason}.
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
