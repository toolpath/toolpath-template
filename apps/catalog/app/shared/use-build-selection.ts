import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { fromBuildParams, writeBuildParams, type BuildSelection } from '@toolpath/catalog-data'

/**
 * Where an assembly selection lives — the query string, or the caller.
 *
 * The picker and the drawing are two renderings of **one** assembly, so they
 * read and write one selection. On the tool page it is the URL: an assembly
 * *is* that page, and a link to one is the point. On the part page it is the
 * page's — an assembly belongs to a feature, and a rail of features cannot
 * share one address bar. A controlled selection wins outright over the URL,
 * so a stale `?holder=` never survives into a feature that never chose it.
 */
export interface BuildSelectionProps {
  /** Namespaces the query string, so one page can carry two assemblies. */
  readonly paramPrefix?: string
  /** Supply with `onSelectionChange` to drive this from somewhere else. */
  readonly selection?: BuildSelection
  readonly onSelectionChange?: (next: BuildSelection) => void
}

export const useBuildSelection = ({
  paramPrefix = '',
  selection: controlled,
  onSelectionChange,
}: BuildSelectionProps): readonly [BuildSelection, (next: BuildSelection) => void] => {
  const [params, setParams] = useSearchParams()
  const fromUrl = useMemo(() => fromBuildParams(params, paramPrefix), [params, paramPrefix])

  const update = useCallback(
    (next: BuildSelection) => {
      if (onSelectionChange !== undefined) {
        onSelectionChange(next)
        return
      }
      // `writeBuildParams`, not `toBuildParams`: the page's query string holds
      // more than this selection, and setting it whole would erase the rest.
      setParams(writeBuildParams(params, next, paramPrefix), { replace: true })
    },
    [onSelectionChange, paramPrefix, params, setParams],
  )

  return [controlled ?? fromUrl, update]
}
