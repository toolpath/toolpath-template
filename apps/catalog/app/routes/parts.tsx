import { Button, Card } from '@toolpath/ui'
import { useSession } from '@toolpath/part-client'
import { AppHeader } from 'components/app-header'
import { ConnectForm } from 'components/connect-form'
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
 * uploading one needs the shop's own Toolpath API key, which is why this page
 * asks for a connection, and why the key is handed to this application's server
 * and never held in the browser. The only other page that asks is a part opened
 * by its link with no connection yet, with the same form (`ConnectForm`).
 */
const Parts = () => {
  const [unit, setUnit] = useUnit()
  // Try a shared demo key first, so the catalog can be used without one; the
  // manual key form below is the fallback when no demo key is available.
  const session = useSession({ demoFallback: true })
  const upload = usePartUpload()

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      {/* This is the viewer stage before the first mesh exists. */}
      <div className="min-h-0 flex-1 p-3">
        <section className="relative size-full overflow-hidden rounded-xl bg-zinc-950">
          {session.status === 'checking' ? (
            // A demo key is being tried; hold the stage rather than flash the
            // manual key form on the way to the uploader.
            <Card className="flex size-full items-center justify-center p-6">
              <p role="status" className="text-sm text-zinc-400">
                Connecting…
              </p>
            </Card>
          ) : session.status === 'connected' ? (
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
                <ConnectForm
                  action={session.action}
                  error={session.error}
                  onConnect={session.connectWithKey}
                />
              </div>
            </Card>
          )}
        </section>
      </div>
    </main>
  )
}

export default Parts
