import { Button } from '@toolpath/ui'
import { bodyDescription, bodyLabel, type PartBody } from '@toolpath/part-contracts'
import type { UploadStatus } from 'client/use-part-upload'
import { uploadLabel } from 'components/upload-panel'
import { useUnit } from 'shared/use-unit'

export interface BodyPickerProps {
  readonly bodies: ReadonlyArray<PartBody>
  readonly status: UploadStatus
  readonly error: string | null
  readonly onChoose: (bodyIndex: number) => void
  /** Back to choosing a file, leaving this one's bodies behind. */
  readonly onBack: () => void
}

/**
 * The bodies of an uploaded file holding several, on the start page in place
 * of the file chooser: a part is one body, and choosing one makes it and opens
 * it. The file is not sent again — it was inspected once, and every body of it
 * is named by its index.
 */
export const BodyPicker = ({ bodies, status, error, onChoose, onBack }: BodyPickerProps) => {
  const [unit] = useUnit()
  const busy = status !== 'idle'

  return (
    <div className="mt-8 space-y-4">
      <h2 className="font-display text-2xl font-bold text-ink">
        This file holds {bodies.length} solid bodies. Choose the one to machine.
      </h2>
      <ul className="flex flex-col gap-2">
        {bodies.map((body) => (
          <li key={body.index}>
            <Button
              variant="secondary"
              full
              disabled={busy}
              className="whitespace-normal py-2 text-left"
              onClick={() => onChoose(body.index)}
            >
              <span className="block text-sm">{bodyLabel(body)}</span>
              <span className="block font-normal text-ink-muted">
                {bodyDescription(body, unit)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {busy ? (
        <p role="status" className="text-sm text-ink-muted">
          {uploadLabel(status)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="muted" disabled={busy} onClick={onBack}>
        Choose a different file
      </Button>
    </div>
  )
}
