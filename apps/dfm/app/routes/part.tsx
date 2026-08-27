import { Link, useParams, useSearchParams } from 'react-router'
import { Card } from '@toolpath/ui'
import { PartInspector } from 'components/part-inspector'
import { useAnalysisEvents } from 'client/use-analysis-events'

const FailedPart = ({ message }: { message: string }) => (
  <main className="grid min-h-screen place-items-center bg-ground p-6 text-ink">
    <Card className="max-w-md border-danger/40 p-8 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-danger">Analysis failed</p>
      <h1 className="mt-2 font-display text-3xl font-bold">This part could not be opened</h1>
      <p className="mt-4 text-sm leading-6 text-ink-muted">{message}</p>
      <Link
        className="mt-7 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
        to="/"
      >
        Upload another part
      </Link>
    </Card>
  </main>
)

const PartRoute = () => {
  const { partId } = useParams()
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get('job')
  if (!partId || !jobId) {
    return <FailedPart message="No analysis job was supplied for this part." />
  }
  return <ActivePart partId={partId} jobId={jobId} />
}

const ActivePart = ({ partId, jobId }: { partId: string; jobId: string }) => {
  const state = useAnalysisEvents(partId, jobId)
  if (state.status === 'ready') {
    return <PartInspector report={state.report} jobId={jobId} />
  }
  if (state.status === 'failed') {
    return <FailedPart message={state.message} />
  }
  const percent = state.progress === null ? null : `${Math.round(state.progress * 100)}%`
  return (
    <main className="grid min-h-screen place-items-center bg-ground p-6 text-ink">
      <Card className="max-w-md p-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-info">Toolpath Engine</p>
        <h1 className="mt-2 font-display text-3xl font-bold">{state.message}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          The server is monitoring this analysis. The viewer will open automatically when its report
          is ready.
        </p>
        {percent ? <p className="mt-6 font-mono text-2xl text-ink-strong">{percent}</p> : null}
      </Card>
    </main>
  )
}

export default PartRoute
