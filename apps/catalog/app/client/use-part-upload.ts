import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, uploadPart, type PartUploadPhase } from '@toolpath/part-client'

export type UploadStatus = 'idle' | PartUploadPhase

/**
 * Owns the create → direct upload → analyse workflow for one CAD file.
 *
 * It stays in the application rather than in `@toolpath/part-client` because it
 * ends in a route, and the route is this application's own.
 */
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
