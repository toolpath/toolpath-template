import {
  parseInspectionEvent,
  validateCadFile,
  type InspectionEvent,
  type PartBody,
} from '@toolpath/part-contracts'
import { AppApiError, api } from './api.js'

/** How far an upload has got, from the file being created to its part's analysis starting. */
export type UploadPhase =
  | 'creating-file'
  | 'uploading-file'
  | 'inspecting-file'
  | 'starting-analysis'

export interface UploadFileOptions {
  readonly onPhaseChange?: (phase: UploadPhase) => void
  readonly signal?: AbortSignal
}

/** An uploaded, inspected file: what a part can be made of. */
export interface UploadedFile {
  readonly fileId: string
  readonly bodies: ReadonlyArray<PartBody>
}

/** A part made of one body, its analysis running. */
export interface StartedPart {
  readonly partId: string
  readonly jobId: string
}

const json = (body: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const uploadToEngine = async (file: File, uploadUrl: string, signal?: AbortSignal) => {
  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: file.type ? { 'Content-Type': file.type } : undefined,
      body: file,
      signal,
    })
  } catch (reason) {
    if (signal?.aborted) {
      throw reason
    }
    throw new AppApiError(
      'Could not upload the CAD file. Check your connection and try again.',
      502,
    )
  }
  if (!response.ok) {
    throw new AppApiError(
      `Could not upload the CAD file (HTTP ${response.status}).`,
      response.status,
    )
  }
}

/**
 * Follows a file's inspection over this server's event stream until it lists
 * the file's bodies, or says why it cannot.
 */
const waitForInspection = (
  fileId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<ReadonlyArray<PartBody>> =>
  new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const events = new EventSource(
      `/api/files/${encodeURIComponent(fileId)}/events?jobId=${encodeURIComponent(jobId)}`,
    )
    const settle = (finish: () => void) => {
      events.close()
      signal?.removeEventListener('abort', onAbort)
      finish()
    }
    const onAbort = () => settle(() => reject(signal?.reason))
    signal?.addEventListener('abort', onAbort, { once: true })

    events.addEventListener('inspection', (event: MessageEvent<string>) => {
      let next: InspectionEvent
      try {
        next = parseInspectionEvent(JSON.parse(event.data))
      } catch {
        settle(() =>
          reject(
            new AppApiError(
              'The upload service returned an invalid update. Upload the file again.',
              502,
            ),
          ),
        )
        return
      }
      if (next.status === 'ready') {
        const { bodies } = next
        settle(() => resolve(bodies))
      } else if (next.status === 'failed') {
        const { message } = next
        settle(() => reject(new AppApiError(message, 422)))
      }
    })
    // Every failure the server knows of arrives as an `inspection` event; this is
    // a stream that would not open — usually an expired connection — and closing
    // it stops `EventSource` retrying an unauthorised request for ever.
    events.onerror = () =>
      settle(() =>
        reject(
          new AppApiError(
            'Your session expired or the connection was interrupted. Connect again and upload the file.',
            502,
          ),
        ),
      )
  })

/**
 * Creates a file, PUTs its bytes straight to object storage, inspects it, and
 * waits for the bodies it holds. Nothing large passes through this
 * application's server.
 */
export const uploadFile = async (
  file: File,
  { onPhaseChange, signal }: UploadFileOptions = {},
): Promise<UploadedFile> => {
  const validationError = validateCadFile(file)
  if (validationError) {
    throw new AppApiError(validationError, 400)
  }

  onPhaseChange?.('creating-file')
  const { fileId, uploadUrl } = await api<{ fileId: string; uploadUrl: string }>('/api/files', {
    method: 'POST',
    ...json({ filename: file.name }),
    signal,
  })
  onPhaseChange?.('uploading-file')
  await uploadToEngine(file, uploadUrl, signal)
  onPhaseChange?.('inspecting-file')
  const { jobId } = await api<{ fileId: string; jobId: string }>(
    `/api/files/${encodeURIComponent(fileId)}`,
    { method: 'PATCH', signal },
  )
  return { fileId, bodies: await waitForInspection(fileId, jobId, signal) }
}

/** Makes a part of one body of an inspected file, and starts its analysis. */
export const makePart = (
  fileId: string,
  bodyIndex: number,
  { signal }: Pick<UploadFileOptions, 'signal'> = {},
) =>
  api<StartedPart>(`/api/files/${encodeURIComponent(fileId)}/parts`, {
    method: 'POST',
    ...json({ bodyIndex }),
    signal,
  })

/**
 * The whole of an upload up to a choice: a file of one body goes straight on to
 * its part, and a file of several stops for somebody to choose.
 */
export const openFile = async (
  file: File,
  options: UploadFileOptions = {},
): Promise<{ readonly part: StartedPart } | { readonly choice: UploadedFile }> => {
  const uploaded = await uploadFile(file, options)
  const [only, ...others] = uploaded.bodies
  if (!only || others.length > 0) {
    return { choice: uploaded }
  }
  options.onPhaseChange?.('starting-analysis')
  return { part: await makePart(uploaded.fileId, only.index, options) }
}
