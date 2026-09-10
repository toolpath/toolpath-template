import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setupLocalEnvironment } from './setup-local.mjs'

const fixtureDirectories = []

const APPLICATIONS = ['apps/dfm', 'apps/catalog']

const createFixture = () => {
  const rootDirectory = mkdtempSync(join(tmpdir(), 'toolpath-setup-'))
  for (const application of APPLICATIONS) {
    const appDirectory = join(rootDirectory, application)
    mkdirSync(appDirectory, { recursive: true })
    writeFileSync(
      join(appDirectory, '.env.example'),
      'APP_SESSION_SECRET=\nTOOLPATH_API_BASE_URL=\n',
    )
  }
  fixtureDirectories.push(rootDirectory)
  return rootDirectory
}

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('setupLocalEnvironment', () => {
  it('creates a private environment file for every application', () => {
    const rootDirectory = createFixture()

    assert.deepEqual(setupLocalEnvironment(rootDirectory), { created: APPLICATIONS })

    for (const application of APPLICATIONS) {
      const environmentPath = join(rootDirectory, application, '.env')
      const environment = readFileSync(environmentPath, 'utf8')
      assert.match(environment, /APP_SESSION_SECRET=[A-Za-z0-9+/]{43}=/)
      assert.match(environment, /TOOLPATH_API_BASE_URL=https:\/\/api\.toolpath\.com/)

      if (process.platform !== 'win32') {
        assert.equal(statSync(environmentPath).mode & 0o777, 0o600)
      }
    }
  })

  /**
   * Two applications must not end up sharing one secret by accident: rotating
   * one application's sessions has to leave the other's alone.
   */
  it('gives each application its own secret', () => {
    const rootDirectory = createFixture()
    setupLocalEnvironment(rootDirectory)

    const secrets = APPLICATIONS.map(
      (application) =>
        /APP_SESSION_SECRET=(.+)/.exec(
          readFileSync(join(rootDirectory, application, '.env'), 'utf8'),
        )[1],
    )

    assert.notEqual(secrets[0], secrets[1])
  })

  it('preserves an existing environment file', () => {
    const rootDirectory = createFixture()
    const environmentPath = join(rootDirectory, 'apps/dfm', '.env')
    const existingEnvironment =
      'APP_SESSION_SECRET=existing\nTOOLPATH_API_BASE_URL=https://example.test\n'
    writeFileSync(environmentPath, existingEnvironment)

    assert.deepEqual(setupLocalEnvironment(rootDirectory), { created: ['apps/catalog'] })
    assert.equal(readFileSync(environmentPath, 'utf8'), existingEnvironment)
  })
})
