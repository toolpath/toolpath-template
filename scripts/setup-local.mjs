import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Every application that serves the part API needs its own private settings.
 *
 * Each gets its own generated session secret rather than a shared one: the
 * connection cookies are already domain-separated by application name, and two
 * independent secrets mean rotating one application's sessions cannot sign
 * anybody out of the other.
 */
const APPLICATIONS = ['apps/dfm', 'apps/catalog']

const createEnvironmentFile = (rootDirectory, application) => {
  const examplePath = resolve(rootDirectory, application, '.env.example')
  const environmentPath = resolve(rootDirectory, application, '.env')

  if (existsSync(environmentPath)) {
    return false
  }

  const example = readFileSync(examplePath, 'utf8')
  if (!example.includes('APP_SESSION_SECRET=') || !example.includes('TOOLPATH_API_BASE_URL=')) {
    throw new Error(`${application}/.env.example is missing the required environment variables.`)
  }

  const sessionSecret = randomBytes(32).toString('base64')
  const environment = example
    .replace('APP_SESSION_SECRET=', `APP_SESSION_SECRET=${sessionSecret}`)
    .replace('TOOLPATH_API_BASE_URL=', 'TOOLPATH_API_BASE_URL=https://api.toolpath.com')

  writeFileSync(environmentPath, environment, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  chmodSync(environmentPath, 0o600)
  return true
}

export const setupLocalEnvironment = (rootDirectory = defaultRootDirectory) => {
  const created = APPLICATIONS.filter((application) =>
    createEnvironmentFile(rootDirectory, application),
  )
  return { created }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { created } = setupLocalEnvironment()
  for (const application of APPLICATIONS) {
    console.log(
      created.includes(application)
        ? `Created ${application}/.env with the standard Toolpath API URL.`
        : `${application}/.env already exists; leaving it unchanged.`,
    )
  }
}
