import { Button } from '@toolpath/ui'
import { useState } from 'react'
import type { UploadStatus } from 'client/use-part-upload'
import { CAD_EXTENSIONS } from 'shared/cad'

const uploadLabel = (status: UploadStatus): string => {
  switch (status) {
    case 'creating-part':
      return 'Creating part…'
    case 'uploading-file':
      return 'Uploading file…'
    case 'starting-analysis':
      return 'Starting analysis…'
    default:
      return 'Analyze part'
  }
}

export const UploadPanel = ({
  error,
  status,
  onUpload,
  onDisconnect,
  isDisconnecting,
}: {
  error: string | null
  status: UploadStatus
  onUpload: (file: File) => Promise<void>
  onDisconnect: () => Promise<void>
  isDisconnecting: boolean
}) => {
  const [file, setFile] = useState<File | null>(null)
  const isUploading = status !== 'idle'
  const isBusy = isUploading || isDisconnecting

  return (
    <div className="mt-8 space-y-6">
      <div className="space-y-4">
        <label className="block text-sm font-semibold text-ink" htmlFor="part">
          CAD file
          <input
            id="part"
            name="part"
            type="file"
            required
            accept={CAD_EXTENSIONS.join(',')}
            onChange={(event) => setFile(event.currentTarget.files?.item(0) ?? null)}
            className="mt-2 block w-full cursor-pointer rounded-lg border border-edge-strong bg-transparent px-3 py-3 text-sm text-ink-body file:mr-4 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-raised"
          />
        </label>
        <p className="text-xs text-ink-dim">
          Supported: STEP, IGES, SolidWorks part, Parasolid. Maximum 100 MiB.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="lg"
          isLoading={isUploading}
          disabled={!file || isBusy}
          onClick={() => {
            if (file) {
              void onUpload(file)
            }
          }}
        >
          {uploadLabel(status)}
        </Button>
      </div>
      <Button
        type="button"
        variant="muted"
        isLoading={isDisconnecting}
        disabled={isBusy}
        onClick={() => void onDisconnect()}
      >
        Disconnect API key
      </Button>
    </div>
  )
}
