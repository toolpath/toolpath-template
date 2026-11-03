import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card } from '@toolpath/ui'
import { uploadedFile } from '@toolpath/part-client'
import { bodyDescription, bodyLabel, type PartBody } from '@toolpath/part-contracts'
import { usePartUpload, type UploadStatus } from 'client/use-part-upload'
import { UploadPanel, uploadLabel } from 'components/upload-panel'
import { useUnit } from 'shared/use-unit'

export interface BodyPickerProps {
  readonly partId: string
  /** The failed analysis' own message, which says how many bodies there are. */
  readonly message: string
  readonly bodies: ReadonlyArray<PartBody>
  readonly status: UploadStatus
  readonly error: string | null
  readonly onUpload: (file: File, bodyIndex: number) => Promise<void>
}

/**
 * A file holding several solid bodies, in place of the failure it was: one
 * choice per body, and the choice uploads the file again for that body.
 *
 * The file this tab uploaded is sent again without asking; after a reload there
 * is none, so the start page's own file control asks for it.
 */
export const BodyPicker = ({
  partId,
  message,
  bodies,
  status,
  error,
  onUpload,
}: BodyPickerProps) => {
  const [asking, setAsking] = useState<PartBody | null>(null)
  const [unit] = useUnit()
  const busy = status !== 'idle'

  const choose = (body: PartBody) => {
    const file = uploadedFile(partId)
    if (file) {
      void onUpload(file, body.index)
      return
    }
    setAsking(body)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ground p-6 text-ink">
      <Card className="w-full max-w-md p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">Choose a body</p>
        <h1 className="mt-2 font-display text-2xl font-bold">{message}</h1>
        {asking ? (
          <>
            <p className="mt-4 text-sm leading-6 text-ink-muted">
              Choose the file again to open {bodyLabel(asking)}.
            </p>
            <UploadPanel
              error={error}
              status={status}
              onUpload={(file) => onUpload(file, asking.index)}
            />
          </>
        ) : (
          <>
            <ul className="mt-6 flex flex-col gap-2">
              {bodies.map((body) => (
                <li key={body.index}>
                  <Button
                    variant="secondary"
                    full
                    disabled={busy}
                    className="whitespace-normal py-2 text-left"
                    onClick={() => choose(body)}
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
              <p role="status" className="mt-4 text-sm text-ink-muted">
                {uploadLabel(status)}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="mt-4 text-sm text-red-200">
                {error}
              </p>
            ) : null}
          </>
        )}
        <Link className="mt-6 inline-block text-sm text-ink-muted hover:underline" to="/">
          Upload another part
        </Link>
      </Card>
    </main>
  )
}

/** {@link BodyPicker} on the app's own upload, which opens the new part as any upload does. */
export const BodyChoice = (props: Pick<BodyPickerProps, 'partId' | 'message' | 'bodies'>) => {
  const { status, error, upload } = usePartUpload()
  return (
    <BodyPicker
      {...props}
      status={status}
      error={error}
      onUpload={(file, bodyIndex) => upload(file, { bodyIndex })}
    />
  )
}
