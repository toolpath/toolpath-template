import { useState, type ReactNode } from 'react'
import { Button } from '@toolpath/ui'
import { uploadedFile } from '@toolpath/part-client'
import { bodyDescription, bodyLabel, type PartBody } from '@toolpath/part-contracts'
import { usePartUpload, type UploadStatus } from 'client/use-part-upload'
import { PartUploadOverlay } from 'components/part-upload-overlay'
import { useUnit } from 'shared/use-unit'

export interface BodyPickerProps {
  readonly partId: string
  /** The failed analysis' own message, which says how many bodies there are. */
  readonly message: string
  readonly bodies: ReadonlyArray<PartBody>
  readonly status: UploadStatus
  readonly error: string | null
  readonly onUpload: (file: File, bodyIndex: number) => void
  readonly onClose?: () => void
  readonly footer?: ReactNode
}

/**
 * A file holding several solid bodies, in place of the failure it was: one
 * choice per body, and the choice uploads the file again for that body.
 *
 * Drawn on the uploader's own stage, so the upload that follows looks exactly
 * like any other. The file this tab uploaded is sent again without asking; a
 * part opened by its link, or after a reload, has none, and the stage asks for
 * the file with its own chooser.
 */
export const BodyPicker = ({
  partId,
  message,
  bodies,
  status,
  error,
  onUpload,
  onClose,
  footer,
}: BodyPickerProps) => {
  const [asking, setAsking] = useState<PartBody | null>(null)
  const [unit] = useUnit()

  const choose = (body: PartBody) => {
    const file = uploadedFile(partId)
    if (file) {
      onUpload(file, body.index)
      return
    }
    setAsking(body)
  }

  return (
    <PartUploadOverlay
      full
      title={message}
      description={
        asking
          ? `Choose the file again to open ${bodyLabel(asking)}.`
          : 'A part is one body. The file is uploaded again for the one chosen.'
      }
      status={status}
      error={error}
      analysis={null}
      onUpload={(file) => {
        if (asking) {
          onUpload(file, asking.index)
        }
      }}
      onClose={onClose}
      footer={footer}
    >
      {asking ? null : (
        <ul className="flex flex-col gap-2">
          {bodies.map((body) => (
            <li key={body.index}>
              <Button
                variant="secondary"
                full
                className="whitespace-normal py-2 text-left"
                onClick={() => choose(body)}
              >
                <span className="block text-sm">{bodyLabel(body)}</span>
                <span className="block font-normal text-zinc-400">
                  {bodyDescription(body, unit)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PartUploadOverlay>
  )
}

/** {@link BodyPicker} on the app's own upload, which opens the new part as any upload does. */
export const BodyChoice = (
  props: Pick<BodyPickerProps, 'partId' | 'message' | 'bodies' | 'footer'>,
) => {
  const { status, error, upload } = usePartUpload()
  return (
    <BodyPicker
      {...props}
      status={status}
      error={error}
      onUpload={(file, bodyIndex) => void upload(file, { bodyIndex })}
    />
  )
}
