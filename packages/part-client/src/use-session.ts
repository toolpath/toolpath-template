import { useCallback, useEffect, useState } from 'react'
import { connect, disconnect, getSession, startDemoSession } from './api.js'
import { errorMessage } from './error-message.js'

export type SessionStatus = 'checking' | 'disconnected' | 'connected'
export type SessionAction = 'idle' | 'connecting' | 'disconnecting'

export interface UseSessionOptions {
  /**
   * When the browser has no connection, try for a shared demo key before
   * settling on `disconnected`. Off by default; an application that wants a
   * key-free trial turns it on. Demo keys are only sometimes available, so a
   * failure here silently leaves the session disconnected and the manual
   * key form in place.
   */
  demoFallback?: boolean
}

/** Owns the browser-visible session state; the API key itself always remains server-only. */
export const useSession = ({ demoFallback = false }: UseSessionOptions = {}) => {
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [action, setAction] = useState<SessionAction>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const settle = (connected: boolean) => {
      if (!cancelled) {
        setStatus(connected ? 'connected' : 'disconnected')
      }
    }
    void (async () => {
      try {
        const { connected } = await getSession()
        if (connected || !demoFallback) {
          settle(connected)
          return
        }
        const demo = await startDemoSession().catch(() => ({ connected: false }))
        settle(demo.connected)
      } catch {
        settle(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [demoFallback])

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
