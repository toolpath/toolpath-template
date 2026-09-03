import { Badge, Card } from '@toolpath/ui'
import { Link } from 'react-router'
import { AppHeader } from 'components/app-header'
import { allTools, builtAt, families } from 'shared/catalog'
import { useUnit } from 'shared/use-unit'

/**
 * The families the catalog was built from.
 *
 * A family is the unit a vendor publishes and a scrape is run in, so it is
 * also the unit somebody asks "what did we actually ingest" about — which is
 * why the build date is stated here rather than hidden in a footer.
 */
const Families = () => {
  const [unit, setUnit] = useUnit()

  return (
    <main className="min-h-screen">
      <AppHeader unit={unit} onUnit={setUnit} toolCount={allTools.length} />

      <div className="flex flex-col gap-4 p-6">
        <p className="text-sm text-zinc-400">
          {families.length} families, built {builtAt}.
        </p>

        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {families.map((family) => (
            <li key={family.id}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start gap-2">
                  <h2 className="font-heading text-base font-semibold text-zinc-100">
                    {family.name}
                  </h2>
                  <Badge variant="secondary" className="ml-auto">
                    {family.toolCount}
                  </Badge>
                </div>
                <p className="text-sm text-zinc-400">
                  {family.brand} · published in{' '}
                  {family.unitSystem === 'inches' ? 'inches' : 'millimetres'}
                </p>
                <p className="text-xs text-zinc-500">{family.toolTypes.join(', ')}</p>
                <Link
                  to={`/?familyId=${encodeURIComponent(family.id)}`}
                  className="mt-auto text-sm text-zinc-200 underline-offset-2 hover:underline"
                >
                  Browse this family
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

export default Families
