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
    <main className="flex min-h-screen items-center bg-gray-50 p-6 dark:bg-zinc-950">
      <Card className="mx-auto w-full max-w-3xl p-6 shadow-sm sm:p-10">
        <AppHeader>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-info">Toolpath</p>
          <h1 className="font-display text-4xl font-bold text-gray-900 dark:text-white">
            Part Viewer
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            Upload a CAD part and inspect its recognized features in 3D. Your API key stays in an
            encrypted, short-lived server session.
          </p>
        </AppHeader>

        {session.status === 'checking' ? (
          <p className="mt-8 text-sm text-zinc-400">Checking local session…</p>
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
