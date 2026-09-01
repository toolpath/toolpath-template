import { useRef, type FormEvent } from 'react'
import { Button, Card } from '@toolpath/ui'
import { CAD_EXTENSIONS } from '@toolpath/part-contracts'
import { useSession } from '@toolpath/part-client'
import { AppHeader } from 'components/app-header'
import { usePartUpload } from 'client/use-part-upload'
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

      {/*
        The panel the part will be drawn in, holding the way to get one into
        it — same place, same size, so nothing moves out from under somebody
        between uploading a part and reading it.
      */}
      <div className="min-h-0 flex-1 p-3">
        <Card className="flex size-full min-h-0 items-center justify-center overflow-auto p-6">
          <div className="flex w-full max-w-xl flex-col gap-6">
            <div>
              <h2 className="font-heading text-xl font-bold text-zinc-100">
                Match tools to a part
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Upload a CAD part, select the features you want to cut, and the catalog narrows to
                the tools that can cut all of them.
              </p>
            </div>

            {session.status === 'connected' ? (
              <div className="flex flex-col gap-4">
                <label className="text-sm font-semibold text-zinc-100" htmlFor="cad">
                  CAD file
                  <input
                    id="cad"
                    name="cad"
                    type="file"
                    accept={CAD_EXTENSIONS.join(',')}
                    disabled={upload.status !== 'idle'}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void upload.upload(file)
                      }
                    }}
                    className="mt-2 block w-full text-sm text-zinc-300"
                  />
                </label>
                <p className="text-xs text-zinc-500">
                  {CAD_EXTENSIONS.join(', ')} — the file is uploaded straight to Toolpath storage,
                  not through this application.
                </p>
                {upload.status !== 'idle' ? (
                  <p role="status" className="text-sm text-zinc-300">
                    {upload.status === 'creating-part'
                      ? 'Preparing the upload…'
                      : upload.status === 'uploading-file'
                        ? 'Uploading the file…'
                        : 'Starting analysis…'}
                  </p>
                ) : null}
                {upload.error ? (
                  <p role="alert" className="text-danger text-sm">
                    {upload.error}
                  </p>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  disabled={session.action !== 'idle'}
                  onClick={() => void session.disconnectSession()}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <div>
                <form ref={form} onSubmit={connect} className="flex flex-col gap-4">
                  <label className="text-sm font-semibold text-zinc-100" htmlFor="apiKey">
                    Toolpath API key
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
                      className="api-key-input focus-visible:ring-info/75 mt-2 block w-full rounded-lg border border-zinc-700 bg-transparent px-3 py-3 font-mono text-sm text-zinc-100 outline-none focus-visible:ring-2"
                    />
                  </label>
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
            )}
          </div>
        </Card>
      </div>
    </main>
  )
}

export default Parts
