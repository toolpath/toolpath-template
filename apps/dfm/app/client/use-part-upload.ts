import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { type PartUploadPhase, uploadPart } from './api'
import { errorMessage } from './error-message'

export type UploadStatus = 'idle' | PartUploadPhase

/** Owns the finite create → direct upload → analyze workflow for one selected CAD file. */
export const usePartUpload = () => {
  const navigate = useNavigate()
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const { partId, jobId } = await uploadPart(file, { onPhaseChange: setStatus })
        await navigate(`/parts/${encodeURIComponent(partId)}?job=${encodeURIComponent(jobId)}`)
      } catch (reason) {
        setStatus('idle')
        setError(errorMessage(reason))
      }
    },
    [navigate],
  )

  return { status, error, upload }
}
