import { Button } from '@toolpath/ui'
import { useRef } from 'react'
import type { FormEvent } from 'react'

export const ConnectionPanel = ({
  error,
  isConnecting,
  onConnect,
}: {
  error: string | null
  isConnecting: boolean
  onConnect: (apiKey: string) => Promise<void>
}) => {
  const form = useRef<HTMLFormElement>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const apiKey = new FormData(event.currentTarget).get('apiKey')
    if (typeof apiKey !== 'string') {
      return
    }
    try {
      await onConnect(apiKey)
      form.current?.reset()
    } catch {
      // useSession exposes the request error for rendering below.
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="mt-8 space-y-4">
      <label className="block text-sm font-semibold text-ink" htmlFor="apiKey">
        Toolpath Engine API key
        <input
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
          className="api-key-input mt-2 block w-full rounded-lg border border-edge-strong bg-transparent px-3 py-3 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-info/75"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isConnecting}
        disabled={isConnecting}
      >
        Connect
      </Button>
    </form>
  )
}
