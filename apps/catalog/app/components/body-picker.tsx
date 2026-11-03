import type { ReactNode } from 'react'
import { Button } from '@toolpath/ui'
import { bodyDescription, bodyLabel, type PartBody } from '@toolpath/part-contracts'
import type { UploadStatus } from 'client/use-part-upload'
import { PartUploadOverlay } from 'components/part-upload-overlay'
import { useUnit } from 'shared/use-unit'

export interface BodyPickerProps {
  readonly bodies: ReadonlyArray<PartBody>
  readonly status: UploadStatus
  readonly error: string | null
  readonly onChoose: (bodyIndex: number) => void
  /** Back to choosing a file, leaving this one's bodies behind. */
  readonly onBack: () => void
  readonly onClose?: () => void
  readonly footer?: ReactNode
}

/**
 * The bodies of an uploaded file holding several, on the uploader's own stage
 * in place of its file chooser: a part is one body, and choosing one makes it
 * and opens it as any upload does. The file is not sent again — it was
 * inspected once, and every body of it is named by its index.
 */
export const BodyPicker = ({
  bodies,
  status,
  error,
  onChoose,
  onBack,
  onClose,
  footer,
}: BodyPickerProps) => {
  const [unit] = useUnit()

  return (
    <PartUploadOverlay
      full
      title={`This file holds ${bodies.length} solid bodies. Choose the one to machine.`}
      description="A part is one body."
      status={status}
      error={error}
      analysis={null}
      onUpload={() => {}}
      onClose={onClose}
      footer={footer}
    >
      <ul className="flex flex-col gap-2">
        {bodies.map((body) => (
          <li key={body.index}>
            <Button
              variant="secondary"
              full
              className="whitespace-normal py-2 text-left"
              onClick={() => onChoose(body.index)}
            >
              <span className="block text-sm">{bodyLabel(body)}</span>
              <span className="block font-normal text-zinc-400">{bodyDescription(body, unit)}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onBack}>
        Choose a different file
      </Button>
    </PartUploadOverlay>
  )
}
