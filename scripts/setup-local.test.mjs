import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setupLocalEnvironment } from './setup-local.mjs'

const fixtureDirectories = []

const createFixture = () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'toolpath-setup-'))
  const appDirectory = join(rootDirectory, 'apps/dfm')
  mkdirSync(appDirectory, { recursive: true })
  writeFileSync(join(appDirectory, '.env.example'), 'APP_SESSION_SECRET=\nTOOLPATH_API_BASE_URL=\n')
  fixtureDirectories.push(rootDirectory)
  return { rootDirectory, appDirectory }
}

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('setupLocalEnvironment', () => {
  it('creates a private environment file with generated local settings', () => {
    const { rootDirectory, appDirectory } = createFixture()

    assert.deepEqual(setupLocalEnvironment(rootDirectory), { created: true })

    const environmentPath = join(appDirectory, '.env')
    const environment = readFileSync(environmentPath, 'utf8')
    assert.match(environment, /APP_SESSION_SECRET=[A-Za-z0-9+/]{43}=/)
    assert.match(environment, /TOOLPATH_API_BASE_URL=https:\/\/api\.toolpath\.com/)

    if (process.platform !== 'win32') {
      assert.equal(statSync(environmentPath).mode & 0o777, 0o600)
    }
  })

  it('preserves an existing environment file', () => {
    const { rootDirectory, appDirectory } = createFixture()
    const environmentPath = join(appDirectory, '.env')
    const existingEnvironment =
      'APP_SESSION_SECRET=existing\nTOOLPATH_API_BASE_URL=https://example.test\n'
    writeFileSync(environmentPath, existingEnvironment)

    assert.deepEqual(setupLocalEnvironment(rootDirectory), { created: false })
    assert.equal(readFileSync(environmentPath, 'utf8'), existingEnvironment)
  })
})
