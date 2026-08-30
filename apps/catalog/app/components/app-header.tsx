import { NavLink, useNavigate } from 'react-router'
import { Badge } from '@toolpath/ui'
import { Chip, ChipGroup } from 'components/chip'
import { UNITS, type Unit } from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import { UploadSimpleIcon } from '@phosphor-icons/react'
import { forgetPart, partHref, usePartSession } from 'shared/part-session'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  classNames(
    'px-3 py-2 text-sm font-semibold border-b-2 -mb-px',
    isActive
      ? 'border-primary text-zinc-100'
      : 'border-transparent text-zinc-400 hover:text-zinc-200',
  )

export interface AppHeaderProps {
  readonly unit: Unit
  readonly onUnit: (unit: Unit) => void
  readonly toolCount: number
}

export const AppHeader = ({ unit, onUnit, toolCount }: AppHeaderProps) => {
  // A part stays loaded while somebody reads the catalog, so the tab that
  // brought them there takes them back to it rather than to an upload form
  // they would have to fill in again.
  const part = usePartSession()
  const navigate = useNavigate()

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-3 px-6 pt-4 pb-2">
        <h1 className="font-heading text-lg font-bold text-zinc-100">Tool catalog</h1>
        <Badge variant="secondary">{toolCount} tools</Badge>
        {/* A new part is always one press away, from wherever somebody is: it is
          the way in to everything else here, and hunting for it through the
          part already open is the wrong first step. */}
        <Chip
          className="ml-auto"
          title="Start again with another part"
          onClick={() => {
            // The part in play is let go first, so the upload page opens ready
            // for the next one rather than offering a way back to the old.
            forgetPart()
            void navigate('/parts')
          }}
        >
          <UploadSimpleIcon className="size-3.5" />
          Upload part
        </Chip>
        <ChipGroup label="Units">
          {UNITS.map((each) => (
            <Chip key={each} pressed={each === unit} onClick={() => onUnit(each)}>
              {each}
            </Chip>
          ))}
        </ChipGroup>
      </div>
      <nav className="flex gap-2 border-t border-zinc-900 px-6">
        <NavLink to="/" end className={tabClass}>
          Catalog
        </NavLink>
        <NavLink to="/families" className={tabClass}>
          Families
        </NavLink>
        <NavLink to={part ? partHref(part) : '/parts'} className={tabClass}>
          {part ? 'Part' : 'Parts'}
        </NavLink>
      </nav>
    </header>
  )
}
