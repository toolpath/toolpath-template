import { useCallback, useEffect, useRef, useState } from 'react'
import type { PartBody } from '@toolpath/part-contracts'
import { errorMessage } from './error-message.js'
import {
  makePart,
  openFile,
  type StartedPart,
  type UploadPhase,
  type UploadedFile,
} from './upload.js'

export type UploadStatus = 'idle' | UploadPhase

/**
 * One CAD file from choosing it to its part's analysis starting, for any
 * application: a file of one body goes straight on, a file of several waits on
 * `bodies` until `choose` names one, and `reset` goes back to choosing a file.
 *
 * What happens once a part is started — a route, a replacement followed in
 * place — is the application's, so it is `onStarted`. A choice lives only as
 * long as this hook: a reload while choosing loses it, and the file is chosen
 * again.
 */
export const useFileUpload = (onStarted: (part: StartedPart) => void | Promise<void>) => {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<UploadedFile | null>(null)
  const running = useRef<AbortController | null>(null)

  /** Abandons whatever was running — its answer is no longer wanted — and starts afresh. */
  const begin = () => {
    running.current?.abort()
    running.current = new AbortController()
    setError(null)
    return running.current.signal
  }
  const fail = (signal: AbortSignal, reason: unknown) => {
    if (!signal.aborted) {
      setStatus('idle')
      setError(errorMessage(reason))
    }
  }

  useEffect(() => () => running.current?.abort(), [])

  const upload = useCallback(
    async (file: File) => {
      const signal = begin()
      setChoice(null)
      try {
        const opened = await openFile(file, { onPhaseChange: setStatus, signal })
        if ('choice' in opened) {
          setChoice(opened.choice)
          setStatus('idle')
          return
        }
        await onStarted(opened.part)
      } catch (reason) {
        fail(signal, reason)
      }
    },
    [onStarted],
  )

  const choose = useCallback(
    async (bodyIndex: number) => {
      if (!choice) {
        return
      }
      const signal = begin()
      setStatus('starting-analysis')
      try {
        await onStarted(await makePart(choice.fileId, bodyIndex, { signal }))
      } catch (reason) {
        fail(signal, reason)
      }
    },
    [choice, onStarted],
  )

  const reset = useCallback(() => {
    running.current?.abort()
    running.current = null
    setStatus('idle')
    setError(null)
    setChoice(null)
  }, [])

  const bodies: ReadonlyArray<PartBody> | null = choice?.bodies ?? null
  return { status, error, bodies, upload, choose, reset }
}
