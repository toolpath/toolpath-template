import { Badge, Card } from '@toolpath/ui'
import type { CatalogTool } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { getFamily } from 'shared/catalog'
import { formatGeometry, geometryRows } from 'shared/geometry'
import { ToolTypeIcon, formLabel } from './tool-icons'

/**
 * One tool, spelled out.
 *
 * The same sheet on the tool page and beside the part: what it is, the handful
 * of numbers it is chosen on, then every dimension the vendor states with its
 * code, its meaning and where it came from. A value this pipeline derived or
 * assumed is marked, because the whole argument for showing vendor data is
 * that a shop can check it.
 */

/** The numbers a tool is chosen on, in the order the question is asked. */
const KEY_CODES = ['DC', 'LCF', 'LBH', 'LD', 'OAL', 'SFDM', 'RE', 'NOF'] as const

const KEY_LABELS: Record<(typeof KEY_CODES)[number], string> = {
  DC: 'diameter',
  LCF: 'flute',
  LBH: 'below holder',
  LD: 'L/D',
  OAL: 'overall',
  SFDM: 'shank',
  RE: 'corner',
  NOF: 'flutes',
}

/**
 * What the vendor said about workpiece material — including when it said nothing.
 *
 * Three states, because two of them are silences that mean different things and
 * a shop acts differently on each. `[]` is the vendor's own index rating this
 * part for nothing, which is a statement; `null` is no index this scrape could
 * reach, which is not. Every Harvey tool is the second — Harvey publishes its
 * index per part rather than in the variant table — and before catalog version
 * 5 both read as "no material index", which put words in the vendor's mouth on
 * 12,773 tools.
 *
 * Neither is shown as a gap and neither is shown under every material: a tool
 * offered for a material nobody rated it for is how a shop ends up trusting a
 * recommendation nobody made.
 */
const MaterialIndex = ({ groups }: { groups: ReadonlyArray<string> | null }) => {
  if (groups === null) {
    return <span className="text-zinc-500">material not stated</span>
  }
  if (groups.length === 0) {
    return <span className="text-zinc-500">rated for no material</span>
  }
  return <span className="font-mono text-zinc-300">ISO {groups.join(' ')}</span>
}

export interface ToolSheetProps {
  readonly tool: CatalogTool
  readonly unit: Unit
  /** The strip and the header only — for a panel beside the part. */
}

export const ToolSheet = ({ tool, unit }: ToolSheetProps) => {
  const family = getFamily(tool.familyId)
  const rows = geometryRows(tool, unit)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading flex items-center gap-2 text-lg leading-tight font-bold text-zinc-100">
          <span className="text-zinc-400">
            <ToolTypeIcon toolType={tool.form} className="size-6" />
          </span>
          <span className="font-mono">{tool.catalogNumber}</span>
          {tool.geometry.DC === undefined ? null : (
            <span className="text-sm font-normal text-zinc-400">
              ⌀{formatLength(tool.geometry.DC, unit)}
            </span>
          )}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          {tool.brand}
          <Badge variant="secondary">{formLabel(tool)}</Badge>
          {/* The vendor's own name for the line, ahead of the family: it is
              what a shop calls the tool, and the family title repeats it. */}
          {tool.productLine === null ? null : <span>{tool.productLine}</span>}
          {family ? <span>{family.name}</span> : null}
          <MaterialIndex groups={tool.materialGroups} />
        </p>
      </div>

      {/* The strip: the numbers a tool is chosen on. A dot on one says the
          pipeline worked it out rather than the vendor stating it. */}
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
        {KEY_CODES.flatMap((code) => {
          const value = tool.geometry[code]
          if (value === undefined) {
            return []
          }
          const provenance = tool.provenance[code]
          return [
            <div
              key={code}
              className="flex items-baseline gap-1.5"
              title={
                provenance && provenance !== 'vendor-stated'
                  ? `${provenance} — not the vendor's figure`
                  : 'vendor-stated'
              }
            >
              <dd className="font-mono text-sm text-zinc-100">
                {formatGeometry(code, value, unit)}
                {provenance && provenance !== 'vendor-stated' ? (
                  /*
                    **A footnote mark, not a unit** (Paul, 2026-09-01: "L/D
                    ratio in tool details shows a degree sign instead of a X").
                    The degree sign after a number reads as degrees, and the two
                    figures this catalog derives — the L/D and the length below
                    the holder — are exactly the two it sat on.
                  */
                  <sup className="ml-0.5 text-zinc-500" aria-label={provenance}>
                    *
                  </sup>
                ) : null}
              </dd>
              <dt className="text-xs text-zinc-500">{KEY_LABELS[code]}</dt>
            </div>,
          ]
        })}
      </dl>

      <Card className="p-4">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Geometry stated for {tool.catalogNumber}</caption>
          <thead>
            <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
              <th scope="col" className="py-2 font-semibold">
                Field
              </th>
              <th scope="col" className="py-2 text-right font-semibold">
                Value
              </th>
              <th scope="col" className="py-2 pl-6 font-semibold">
                What it means
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-b border-zinc-900 align-top">
                <th scope="row" className="py-2 text-left font-normal text-zinc-200">
                  {row.label}
                  <span className="ml-2 font-mono text-xs text-zinc-500">{row.code}</span>
                </th>
                <td className="py-2 text-right font-mono text-zinc-100">{row.value}</td>
                <td className="py-2 pl-6 text-zinc-400">
                  {row.description ?? (
                    <span className="text-zinc-500">
                      The vendor publishes this code; this catalog does not define it.
                    </span>
                  )}
                  {row.provenance && row.provenance !== 'vendor-stated' ? (
                    <Badge variant="info" className="ml-2">
                      {row.provenance}
                    </Badge>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {tool.productLink ? (
        <a
          className="text-sm text-zinc-200 underline-offset-2 hover:underline"
          href={tool.productLink}
          rel="noreferrer noopener"
          target="_blank"
        >
          The vendor's page for {tool.catalogNumber}
        </a>
      ) : null}
    </div>
  )
}
