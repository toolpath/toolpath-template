import type { ApiProblem } from '@toolpath/part-contracts'

export class AppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AppApiError'
  }
}

/** A request to this application's own server, its failure worded by the server. */
export const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as ApiProblem | null
    throw new AppApiError(problem?.message ?? 'Request failed.', response.status)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/** Reads only connection state; the encrypted API key stays in the HttpOnly cookie. */
export const getSession = () =>
  api<{ connected: boolean }>('/api/session', { signal: AbortSignal.timeout(5_000) })

export const connect = (apiKey: string) =>
  api<{ connected: true }>('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })

/**
 * Asks the server to connect with a shared demo key. Reports whether one was
 * available; when it is not, the caller keeps asking for the user's own key.
 */
export const startDemoSession = () =>
  api<{ connected: boolean }>('/api/session/demo', { method: 'POST' })

export const disconnect = () => api<void>('/api/session', { method: 'DELETE' })
