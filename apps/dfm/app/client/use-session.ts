import { useCallback, useEffect, useState } from 'react'
import { connect, disconnect, getSession, startDemoSession } from './api'
import { errorMessage } from './error-message'

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
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    let cancelled = false
    const settle = ({
      connected,
      isDemo: isDemoSession = false,
    }: {
      connected: boolean
      isDemo?: boolean
    }) => {
      if (!cancelled) {
        setStatus(connected ? 'connected' : 'disconnected')
        setIsDemo(connected && isDemoSession)
      }
    }
    void (async () => {
      try {
        const session = await getSession()
        const { connected } = session
        if (connected || !demoFallback) {
          settle(session)
          return
        }
        const demo = await startDemoSession().catch(() => ({ connected: false }))
        settle(demo)
      } catch {
        settle({ connected: false })
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
      const session = await connect(apiKey)
      setStatus('connected')
      setIsDemo(session.isDemo === true)
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
      setIsDemo(false)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setAction('idle')
    }
  }, [])

  return { status, action, error, isDemo, connectWithKey, disconnectSession }
}
