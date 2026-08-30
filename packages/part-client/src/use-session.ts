import { useCallback, useEffect, useState } from 'react'
import { connect, disconnect, getSession } from './api.js'
import { errorMessage } from './error-message.js'

export type SessionStatus = 'checking' | 'disconnected' | 'connected'
export type SessionAction = 'idle' | 'connecting' | 'disconnecting'

/** Owns the browser-visible session state; the API key itself always remains server-only. */
export const useSession = () => {
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [action, setAction] = useState<SessionAction>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getSession()
      .then(({ connected }) => setStatus(connected ? 'connected' : 'disconnected'))
      .catch(() => setStatus('disconnected'))
  }, [])

  const connectWithKey = useCallback(async (apiKey: string) => {
    setAction('connecting')
    setError(null)
    try {
      await connect(apiKey)
      setStatus('connected')
    } catch (reason) {
      setError(errorMessage(reason))
      throw reason
    } finally {
      setAction('idle')
    }
  }, [])

  const disconnectSession = useCallback(async () => {
    setAction('disconnecting')
    setError(null)
    try {
      await disconnect()
      setStatus('disconnected')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setAction('idle')
    }
  }, [])

  return { status, action, error, connectWithKey, disconnectSession }
}
