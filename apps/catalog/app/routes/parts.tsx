import { useRef, type FormEvent } from 'react'
import { Button, Card, Input } from '@toolpath/ui'
import { useSession } from '@toolpath/part-client'
import { AppHeader } from 'components/app-header'
import { usePartUpload } from 'client/use-part-upload'
import { PartUploadOverlay } from 'components/part-upload-overlay'
import { allTools } from 'shared/catalog'
import { useUnit } from 'shared/use-unit'

/**
 * Where a part enters the catalog: **in the viewer's own space** (Paul,
 * 2026-09-01).
 *
 * This is the same page the part is worked on, before there is a part — the
 * upload sits in the panel the part will be drawn in, rather than on a form
 * somebody fills in somewhere else and is then taken away from. It is also the
 * application's front door now that the catalog browser is hidden.
 *
 * The tool data on every other page is bundled and public. A part is neither:
 * uploading one needs the shop's own Toolpath API key, which is why this is the
 * only page in the application that asks for a connection, and why the key is
 * handed to this application's server and never held in the browser.
 */
const Parts = () => {
  const [unit, setUnit] = useUnit()
  const session = useSession()
  const upload = usePartUpload()
  const form = useRef<HTMLFormElement>(null)

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const apiKey = new FormData(event.currentTarget).get('apiKey')
    if (typeof apiKey !== 'string') {
      return
    }
    try {
      await session.connectWithKey(apiKey)
      form.current?.reset()
    } catch {
      // useSession exposes the request error for rendering below.
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      {/* This is the viewer stage before the first mesh exists. */}
      <div className="min-h-0 flex-1 p-3">
        <section className="relative size-full overflow-hidden rounded-xl bg-zinc-950">
          {session.status === 'connected' ? (
            <PartUploadOverlay
              full
              title="Match tools to a part"
              description="Upload a CAD part, select the features you want to cut, and the catalog narrows to the tools that can cut all of them."
              status={upload.status}
              error={upload.error}
              analysis={null}
              onUpload={(file) => void upload.upload(file)}
              footer={
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={session.action !== 'idle'}
                  onClick={() => void session.disconnectSession()}
                >
                  Disconnect
                </Button>
              }
            />
          ) : (
            <Card className="flex size-full min-h-0 items-center justify-center overflow-auto p-6">
              <div>
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
                    The key is sent to this application's server, sealed into an encrypted session
                    cookie, and never stored in the browser.
                  </p>
                  {session.error ? (
                    <p role="alert" className="text-danger text-sm">
                      {session.error}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    variant="primary"
                    className="self-start"
                    disabled={session.action !== 'idle'}
                  >
                    {session.action === 'connecting' ? 'Connecting…' : 'Connect'}
                  </Button>
                </form>
              </div>
            </Card>
          )}
        </section>
      </div>
    </main>
  )
}

export default Parts
