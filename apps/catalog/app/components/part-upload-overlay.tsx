import { useState, type ReactNode } from 'react'
import { Button, Card } from '@toolpath/ui'
import { CAD_EXTENSIONS } from '@toolpath/part-contracts'
import type { UploadStatus } from 'client/use-part-upload'

export interface ReplacementAnalysis {
  readonly message: string
  readonly progress: number | null
}

export interface PartUploadOverlayProps {
  readonly status: UploadStatus
  readonly error: string | null
  readonly analysis: ReplacementAnalysis | null
  readonly onUpload: (file: File) => void
  readonly onClose?: () => void
  /** Makes the uploader the complete viewer stage, not a floating dialog. */
  readonly full?: boolean
  readonly title?: string
  readonly description?: string
  readonly footer?: ReactNode
}

/**
 * The uploader occupies the viewer stage, whether it is the first part or a
 * replacement for the part already being read.
 */
export const PartUploadOverlay = ({
  status,
  error,
  analysis,
  onUpload,
  onClose,
  full = false,
  title = 'Upload another part',
  description = 'The current part stays here while the new one is analysed.',
  footer,
}: PartUploadOverlayProps) => {
  const [dragging, setDragging] = useState(false)
  const busy = status !== 'idle' || analysis !== null
  const message =
    analysis?.message ??
    (status === 'creating-part'
      ? 'Preparing the upload…'
      : status === 'uploading-file'
        ? 'Uploading the file…'
        : status === 'starting-analysis'
          ? 'Starting analysis…'
          : null)

  const choose = (file: File | undefined) => {
    if (file) {
      onUpload(file)
    }
  }

  return (
    <div
      className={
        full
          ? 'absolute inset-0 z-50 p-3'
          : 'pointer-events-none absolute inset-0 z-50 grid place-items-center p-6'
      }
    >
      <div
        {...(full ? {} : { role: 'dialog', 'aria-label': 'Upload a replacement part' })}
        className={full ? 'size-full' : 'pointer-events-auto w-full max-w-md'}
      >
        <Card
          className={
            full
              ? 'flex size-full items-center justify-center bg-zinc-950/85 p-6 shadow-none backdrop-blur-sm'
              : 'p-5 shadow-xl'
          }
        >
          <div className={full ? 'flex size-full max-w-2xl flex-col justify-center' : undefined}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-heading text-xl font-bold text-zinc-100">{title}</h2>
                <p className="mt-2 max-w-xl text-sm text-zinc-400">{description}</p>
              </div>
              {!busy && onClose ? (
                <Button aria-label="Cancel upload" variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </Button>
              ) : null}
            </div>

            {busy ? (
              <div
                className={
                  full
                    ? 'mt-6 grid min-h-72 place-items-center rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-center'
                    : 'mt-5 rounded-lg border border-zinc-800 bg-zinc-950/70 p-4'
                }
              >
                <div>
                  <p role="status" className="text-sm text-zinc-200">
                    {message}
                  </p>
                  {analysis?.progress === null || analysis === null ? null : (
                    <p className="mt-2 font-mono text-xs text-zinc-500">
                      {Math.round(analysis.progress * 100)}%
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <label
                htmlFor="replacement-cad"
                onDragEnter={() => setDragging(true)}
                onDragLeave={() => setDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  choose(event.dataTransfer.files[0])
                }}
                className={`mt-6 flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition ${
                  full ? 'min-h-72 flex-1' : ''
                } ${
                  dragging
                    ? 'border-info bg-info/10 text-zinc-100'
                    : 'border-zinc-700 bg-zinc-950/70 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900/70'
                }`}
              >
                <span className="text-base font-semibold">Choose or drop a CAD file</span>
                <span className="mt-2 text-xs text-zinc-500">{CAD_EXTENSIONS.join(', ')}</span>
                <input
                  id="replacement-cad"
                  name="cad"
                  type="file"
                  accept={CAD_EXTENSIONS.join(',')}
                  aria-label="Choose or drop a CAD file"
                  onChange={(event) => choose(event.target.files?.[0])}
                  className="sr-only"
                />
              </label>
            )}

            {error ? (
              <p role="alert" className="text-danger mt-4 text-sm">
                {error}
              </p>
            ) : null}
            {footer ? <div className="mt-4">{footer}</div> : null}
          </div>
        </Card>
      </div>
    </div>
  )
}
