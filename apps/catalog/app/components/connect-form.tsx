import { useRef, type FormEvent } from 'react'
import { Button, Input } from '@toolpath/ui'
import type { SessionAction } from '@toolpath/part-client'

/**
 * The catalog's one form for connecting a Toolpath API key.
 *
 * Two pages ask with it: the start page, before there is a part, and a part
 * opened by its link — from another Toolpath application, a bookmark, a link
 * somebody sent — with no connection yet (`routes/part.tsx`, `OpenedByLink`).
 * It is only the form. The session is the page's (`useSession`): its request
 * error comes back in as `error`, and its `action` says when a request is in
 * flight, so a press cannot start a second one.
 */
export const ConnectForm = ({
  action,
  error,
  onConnect,
}: {
  action: SessionAction
  error: string | null
  onConnect: (apiKey: string) => Promise<void>
}) => {
  const form = useRef<HTMLFormElement>(null)

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const apiKey = new FormData(event.currentTarget).get('apiKey')
    if (typeof apiKey !== 'string') {
      return
    }
    try {
      await onConnect(apiKey)
      form.current?.reset()
    } catch {
      // The session exposes the request error, which comes back in as `error`.
    }
  }

  return (
    <form ref={form} onSubmit={connect} className="flex flex-col gap-4">
      <label className="text-sm font-semibold text-zinc-100" htmlFor="apiKey">
        Toolpath API key
      </label>
      <Input
        id="apiKey"
        name="apiKey"
        type="text"
        required
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore="true"
        data-lpignore="true"
        variant="ghost"
        size="xl"
        className="api-key-input mt-2 w-full rounded-lg border border-zinc-700 font-mono text-sm text-zinc-100"
      />
      <p className="text-xs text-zinc-500">
        The key is sent to this application's server, sealed into an encrypted session cookie, and
        never stored in the browser.
      </p>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="self-start" disabled={action !== 'idle'}>
        {action === 'connecting' ? 'Connecting…' : 'Connect'}
      </Button>
    </form>
  )
}
