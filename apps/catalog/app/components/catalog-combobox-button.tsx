import { CaretUpDownIcon } from '@phosphor-icons/react'
import { Combobox } from '@toolpath/ui'

export const CatalogComboboxButton = ({
  label,
  placeholder,
}: {
  readonly label: string
  readonly placeholder: string
}) => (
  <Combobox.Trigger
    nativeButton
    aria-label={label}
    className="group flex h-6 w-full items-center gap-1 rounded text-left text-2xs outline-none focus-visible:ring-2 focus-visible:ring-info/75"
  >
    <Combobox.Value placeholder={placeholder} className="truncate text-zinc-100" />
    <Combobox.Icon className="ml-auto">
      <CaretUpDownIcon weight="bold" className="size-3.5 text-zinc-400" />
    </Combobox.Icon>
  </Combobox.Trigger>
)
