import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useFileUpload, type StartedPart } from '@toolpath/part-client'

export type { UploadStatus } from '@toolpath/part-client'
export type StartedPartUpload = StartedPart

export interface UsePartUploadOptions {
  /**
   * Lets a workspace keep its current view mounted while it follows the new
   * job. Without it, the standalone upload page opens the analysis route.
   */
  readonly onStarted?: (part: StartedPartUpload) => void
}

/**
 * One CAD file to its part: `@toolpath/part-client` runs the upload, the
 * inspection and the choice of body; this decides where a started part goes,
 * since the route is this application's own.
 */
export const usePartUpload = ({ onStarted }: UsePartUploadOptions = {}) => {
  const navigate = useNavigate()
  const open = useCallback(
    async (part: StartedPart) => {
      if (onStarted) {
        onStarted(part)
        return
      }
      await navigate(
        `/parts/${encodeURIComponent(part.partId)}?job=${encodeURIComponent(part.jobId)}`,
      )
    },
    [navigate, onStarted],
  )
  return useFileUpload(open)
}
