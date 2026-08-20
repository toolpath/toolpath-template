import type { ApiProblem } from '../shared/contracts'
import { validateCadFile } from '../shared/cad'

export class AppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AppApiError'
  }
}

export type PartUploadPhase = 'creating-part' | 'uploading-file' | 'starting-analysis'

export interface UploadPartOptions {
  onPhaseChange?: (phase: PartUploadPhase) => void
}

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
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

export const disconnect = () => api<void>('/api/session', { method: 'DELETE' })

const uploadToEngine = async (file: File, uploadUrl: string): Promise<void> => {
  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: file.type ? { 'Content-Type': file.type } : undefined,
      body: file,
    })
  } catch {
    throw new AppApiError(
      'Could not upload the CAD file. Check your connection and try again.',
      502,
    )
  }
  if (!response.ok)
    throw new AppApiError(
      `Could not upload the CAD file (HTTP ${response.status}).`,
      response.status,
    )
}

/** Creates an Engine part, uploads directly to its short-lived PUT URL, then starts analysis. */
export const uploadPart = async (
  file: File,
  { onPhaseChange }: UploadPartOptions = {},
): Promise<{ partId: string; jobId: string }> => {
  const validationError = validateCadFile(file)
  if (validationError) throw new AppApiError(validationError, 400)

  onPhaseChange?.('creating-part')
  const { partId, uploadUrl } = await api<{ partId: string; uploadUrl: string }>('/api/parts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name }),
  })
  onPhaseChange?.('uploading-file')
  await uploadToEngine(file, uploadUrl)
  onPhaseChange?.('starting-analysis')
  return api<{ partId: string; jobId: string }>(
    `/api/parts/${encodeURIComponent(partId)}/analyze`,
    {
      method: 'POST',
    },
  )
}
