import { useEffect, useState } from 'react'
import { parseAnalysisEvent, type AnalysisEvent } from '../shared/contracts'

const initialState: AnalysisEvent = {
  status: 'pending',
  progress: null,
  message: 'Checking analysis status…',
}

/** The browser consumes app-owned SSE; it never polls Toolpath Engine. */
export const useAnalysisEvents = (partId: string, jobId: string) => {
  const [state, setState] = useState<AnalysisEvent>(initialState)

  useEffect(() => {
    setState(initialState)
    const events = new EventSource(
      `/api/parts/${encodeURIComponent(partId)}/events?jobId=${encodeURIComponent(jobId)}`,
    )
    const onAnalysis = (event: MessageEvent<string>) => {
      try {
        const next = parseAnalysisEvent(JSON.parse(event.data))
        setState(next)
        if (next.status !== 'pending') events.close()
      } catch {
        events.close()
        setState({
          status: 'failed',
          message: 'The analysis service returned an invalid update. Reload to try again.',
        })
      }
    }
    events.addEventListener('analysis', onAnalysis)
    events.onerror = () => {
      // The server sends terminal Engine failures as `analysis` events. This is the remaining
      // case: the stream could not be opened (usually an expired connection cookie). Closing here
      // prevents EventSource from retrying an unauthorized request forever.
      events.close()
      setState({
        status: 'failed',
        message:
          'Your session expired or the connection was interrupted. Connect again to reopen this part.',
      })
    }
    return () => {
      events.removeEventListener('analysis', onAnalysis)
      events.close()
    }
  }, [jobId, partId])

  return state
}
