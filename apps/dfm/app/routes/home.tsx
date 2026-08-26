import { ToolpathIcon } from '../components/panel-icons'
import { AppHeader } from '../components/app-header'
import { ConnectionPanel } from '../components/connection-panel'
import { UploadPanel } from '../components/upload-panel'
import { usePartUpload } from '../client/use-part-upload'
import { useSession } from '../client/use-session'
import { Card } from '@toolpath/ui'

export default function HomeRoute() {
  const session = useSession()
  const partUpload = usePartUpload()

  return (
    <main className="flex min-h-screen items-center bg-ground p-6">
      <Card className="mx-auto w-full max-w-3xl p-6 shadow-sm sm:p-10">
        <AppHeader>
          <div className="mb-2 flex items-center gap-3">
            <ToolpathIcon className="size-10" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">Toolpath</p>
              <h1 className="font-display text-4xl font-bold text-ink">DFM</h1>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
            Upload a CAD part and inspect its recognized features in 3D. Your API key stays in an
            encrypted, short-lived server session.
          </p>
        </AppHeader>

        {session.status === 'checking' ? (
          <p className="mt-8 text-sm text-ink-muted">Checking local session…</p>
        ) : session.status === 'connected' ? (
          <UploadPanel
            error={partUpload.error ?? session.error}
            status={partUpload.status}
            onUpload={partUpload.upload}
            onDisconnect={session.disconnectSession}
            isDisconnecting={session.action === 'disconnecting'}
          />
        ) : (
          <ConnectionPanel
            error={session.error}
            isConnecting={session.action === 'connecting'}
            onConnect={session.connectWithKey}
          />
        )}
      </Card>
    </main>
  )
}
