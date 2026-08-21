import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))
const examplePath = resolve(rootDirectory, 'apps/dfm/.env.example')
const environmentPath = resolve(rootDirectory, 'apps/dfm/.env')

if (existsSync(environmentPath)) {
  console.log('apps/dfm/.env already exists; leaving it unchanged.')
  process.exit(0)
}

const example = readFileSync(examplePath, 'utf8')
if (!example.includes('APP_SESSION_SECRET=') || !example.includes('TOOLPATH_API_BASE_URL=')) {
  throw new Error('apps/dfm/.env.example is missing the required environment variables.')
}

const sessionSecret = randomBytes(32).toString('base64')
const environment = example
  .replace('APP_SESSION_SECRET=', `APP_SESSION_SECRET=${sessionSecret}`)
  .replace('TOOLPATH_API_BASE_URL=', 'TOOLPATH_API_BASE_URL=https://api.toolpath.com')

writeFileSync(environmentPath, environment, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
chmodSync(environmentPath, 0o600)
console.log('Created apps/dfm/.env with the standard Toolpath API URL.')
