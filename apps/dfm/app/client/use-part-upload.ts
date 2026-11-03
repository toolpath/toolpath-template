import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useFileUpload, type StartedPart } from '@toolpath/part-client'

export type { UploadStatus } from '@toolpath/part-client'

/**
 * One CAD file to its part: `@toolpath/part-client` runs the upload, the
 * inspection and the choice of body; this opens the part once it is started.
 */
export const usePartUpload = () => {
  const navigate = useNavigate()
  const open = useCallback(
    ({ partId, jobId }: StartedPart) =>
      navigate(`/parts/${encodeURIComponent(partId)}?job=${encodeURIComponent(jobId)}`),
    [navigate],
  )
  return useFileUpload(open)
}
