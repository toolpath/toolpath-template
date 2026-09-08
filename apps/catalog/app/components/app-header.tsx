import { NavLink, useNavigate } from 'react-router'
import { Badge, IconButton, cn } from '@toolpath/ui'
import { Chip, ChipGroup } from 'components/chip'
import { UNIT_ABBREVIATION, UNIT_SYSTEMS, type UnitSystem } from '@toolpath/tool-support'
import { MoonIcon, SunIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import { forgetPart, orderListHref, partHref, usePartSession } from 'shared/part-session'
import { useTheme } from 'shared/use-theme'

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'px-3 py-2 text-sm font-semibold border-b-2 -mb-px',
    isActive
      ? 'border-primary text-zinc-100'
      : 'border-transparent text-zinc-400 hover:text-zinc-200',
  )

export interface AppHeaderProps {
  readonly unit: UnitSystem
  readonly onUnit: (unit: UnitSystem) => void
  readonly toolCount: number
  /** Opens an in-workspace uploader when a part is already on screen. */
  readonly onUploadPart?: () => void
}

export const AppHeader = ({ unit, onUnit, toolCount, onUploadPart }: AppHeaderProps) => {
  const [theme, onTheme] = useTheme()
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
        {/* A new part is always one press away. When another part is already
          loaded, return to its viewer and open the uploader there rather than
          discarding it for a separate form. */}
        <Chip
          className="ml-auto"
          title="Start again with another part"
          onClick={() => {
            if (onUploadPart) {
              onUploadPart()
              return
            }
            if (part) {
              void navigate(`${partHref(part)}&upload=1`)
              return
            }
            // The part in play is let go first, so the upload page opens ready
            // for the next one rather than offering a way back to the old.
            forgetPart()
            void navigate('/parts')
          }}
        >
          <UploadSimpleIcon className="size-3.5" />
          Upload part
        </Chip>
        {/* Light or dark: the palette flips, the classes do not. */}
        <IconButton
          size="lg"
          variant="muted"
          aria-label={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          toggled={theme === 'light'}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
          className="!size-7 [&_svg]:!size-4"
        >
          {theme === 'dark' ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
        </IconButton>
        <ChipGroup label="Units">
          {UNIT_SYSTEMS.map((each) => (
            <Chip key={each} pressed={each === unit} onClick={() => onUnit(each)}>
              {UNIT_ABBREVIATION[each]}
            </Chip>
          ))}
        </ChipGroup>
      </div>
      <nav className="flex gap-2 border-t border-zinc-900 px-6">
        {/*
          No Catalog or Families tab (Paul, 2026-09-01): the way in is a part,
          and the pages that browse the whole catalog on its own are hidden.
          The family list remains available as a separate reference route.
        */}
        {/* `end`, or the part's own tab stays lit on the order list
            underneath it and two tabs read as current at once. */}
        <NavLink to={part ? partHref(part) : '/parts'} end className={tabClass}>
          {part ? 'Part' : 'Parts'}
        </NavLink>
        {/*
          Always here (Paul, 2026-08-31). It used to appear only once a part
          was in session, so the one tab that says this application keeps a
          order list was invisible until somebody had already found the
          rest of it. With no part it points at the upload, which is what
          starting a bill actually takes.
        */}
        <NavLink
          to={part ? orderListHref(part) : '/parts'}
          title={part ? undefined : 'Upload a part to start an order list'}
          className={tabClass}
        >
          Order list
        </NavLink>
      </nav>
    </header>
  )
}
