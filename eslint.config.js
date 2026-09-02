import boundaries from 'eslint-plugin-boundaries'
import tseslint from 'typescript-eslint'

/**
 * The sensor half of this repository's conventions.
 *
 * AGENTS.md states the rules; this file is what proves them. Only rules that
 * encode something AGENTS.md actually asks for live here — no general-purpose
 * lint sweep — so `pnpm lint` stays fast and every failure maps to a written
 * rule. The function-declaration rule is the one exception: it stays in
 * `scripts/check-style.mjs`, which owns it alone.
 *
 * Taken from the DFM repository's `eslint.config.js` (2026-08-27) and widened
 * to a workspace with packages. `apps/dfm` is left out for now: it is the
 * template's copy, and the branch that settled its styling has not landed here
 * yet. Add it to `LINTED` the day it does.
 *
 * Nothing here is type-aware, so no `tsc` program is built to run it.
 */

/** Type names that also exist on the global namespace, where `React.` is clearer. */
const GLOBAL_SHADOWED =
  '^(MouseEvent|KeyboardEvent|FocusEvent|ChangeEvent|DragEvent|PointerEvent|TouchEvent|WheelEvent|ClipboardEvent|AnimationEvent|TransitionEvent)$'

const LINTED = ['apps/catalog/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}', 'scripts/**/*.mjs']

/**
 * Each layer, most specific first: `app-root` is last so that it catches only
 * the handful of files sitting directly in `app/`. A package is one element,
 * because inside a package there are no layers to keep apart — only the rule
 * that it imports other packages and never an application.
 */
const ELEMENTS = [
  { type: 'server', pattern: 'apps/catalog/server' },
  { type: 'route', pattern: 'apps/catalog/app/routes' },
  { type: 'component', pattern: 'apps/catalog/app/components' },
  { type: 'client', pattern: 'apps/catalog/app/client' },
  { type: 'shared', pattern: 'apps/catalog/app/shared' },
  { type: 'test', pattern: 'apps/catalog/tests' },
  { type: 'app-root', pattern: 'apps/catalog/app' },
  { type: 'package', pattern: 'packages/*' },
]

/**
 * Who may import whom. `default: 'disallow'` is the point of the whole rule:
 * anything not listed is an error, which is what makes an `app/` file importing
 * `server/`, or a package importing an application, fail rather than merely
 * being noticed in review.
 */
const may = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { type: to } } },
})

/** A relative import inside a package carries its `.js` — AGENTS.md § Shared Code. */
const RELATIVE_JS = {
  regex: '^\\.{1,2}/(?!.*\\.js$).*$',
  message:
    'A relative import inside a package carries its .js extension, so the emitted JavaScript runs under Node without a bundler.',
}

/**
 * AGENTS.md: the one package that handles an API key is `@toolpath/part-server`,
 * and no other package constructs a client.
 */
const NO_SDK = {
  group: ['@toolpath/api'],
  allowTypeImports: true,
  message:
    'Only @toolpath/part-server may construct a Toolpath client. Import a type if a type is all you need.',
}

/**
 * The scrape is a command somebody runs, not something the product does.
 *
 * `@toolpath/tool-scraper` fetches vendors' catalogs. One module drives it —
 * `packages/catalog-data/src/scrape.ts` — and everything else may name its
 * types, which are erased, and never its values. Without this the distinction
 * is a sentence in a document: a route handler could import `scrapeFamily` and
 * the catalog would quietly become a live proxy onto five vendors' websites,
 * one request per page view.
 *
 * The same shape as the SDK rule above, for the same reason.
 */
const NO_SCRAPER = {
  group: ['@toolpath/tool-scraper', '@toolpath/tool-scraper/*'],
  allowTypeImports: true,
  message:
    'Only packages/catalog-data/src/scrape.ts may run the scraper. A scrape is a command somebody runs; import a type if a type is all you need.',
}

/**
 * The drawing is a renderer; the verdict is not.
 *
 * `@toolpath/tool-drawing` draws a tool and, optionally, the clearance around
 * it. What decides that clearance — `clearance()` in `catalog-data` — has a
 * dozen callers that draw nothing at all: the filters, the rules sheet, the
 * holder choice, the tool-fit sort. Letting a package import the drawing is how
 * that engine ends up behind a dependency on React, and the split between
 * `clearance.ts` here and `/clearance` there exists precisely to stop it.
 *
 * An application may import it; that is what an application is for. A package
 * may name its types, which are erased, and never its values.
 */
const NO_DRAWING = {
  group: ['@toolpath/tool-drawing', '@toolpath/tool-drawing/*'],
  allowTypeImports: true,
  message:
    'A package may not import @toolpath/tool-drawing. Drawing belongs to an application; a package that needs one takes the picture as data. Import a type if a type is all you need.',
}

const POLICIES = [
  may('server', ['server', 'shared', 'package']),
  may('route', ['route', 'component', 'client', 'shared', 'app-root', 'package']),
  may('component', ['component', 'client', 'shared', 'package']),
  may('client', ['client', 'shared', 'package']),
  may('shared', ['shared', 'package']),
  may('app-root', ['route', 'component', 'client', 'shared', 'app-root', 'package']),
  may('test', ['*']),
  // AGENTS.md: nothing in packages/ may import an application.
  may('package', ['package']),
]

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/build/**',
      '**/dist/**',
      '**/.react-router/**',
      '**/.turbo/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/scrape-out/**',
    ],
  },
  {
    files: LINTED,
    plugins: { '@typescript-eslint': tseslint.plugin, boundaries },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      'boundaries/elements': ELEMENTS,
      'boundaries/include': LINTED,
      // Without a TypeScript resolver the plugin cannot follow an extensionless
      // `.tsx` import or a tsconfig alias, and every dependency reads as unknown
      // — which silently turns the whole layering rule into a no-op.
      'import/resolver': {
        typescript: { project: ['apps/catalog/tsconfig.json', 'packages/*/tsconfig.json'] },
      },
    },
    rules: {
      // AGENTS.md: never write if statements on a single line.
      curly: ['error', 'all'],
      // AGENTS.md: `Array<Item>`, never `Item[]`.
      '@typescript-eslint/array-type': ['error', { default: 'generic', readonly: 'generic' }],
      // AGENTS.md: import parts of React individually, except where a global shadows the name.
      'no-restricted-syntax': [
        'error',
        {
          selector: `TSQualifiedName[left.name='React'][right.name!=/${GLOBAL_SHADOWED}/]`,
          message:
            'Import the React type individually (`import type { ReactNode } from "react"`). `React.` is only for names a global already takes, such as React.MouseEvent.',
        },
      ],
      // The layering AGENTS.md describes: the browser never reaches into the
      // server, and a package never reaches into an application.
      'boundaries/dependencies': ['error', { default: 'disallow', policies: POLICIES }],
    },
  },
  {
    // The browser half. Aliases are resolvable here because Vite and Vitest both
    // load `vite-tsconfig-paths`; the server is left on relative imports because
    // production runs `tsx server/prod.ts` with no bundler to resolve them.
    files: ['apps/catalog/app/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', '../**'],
              message:
                'Use the shared/, components/, client/ or routes/ alias instead of reaching out of the folder.',
            },
          ],
          paths: [
            {
              name: '@toolpath/part-server',
              allowTypeImports: true,
              message:
                'Only apps/catalog/server may use @toolpath/part-server: it is the one place an API key is handled. Types are fine; values ship it to the browser.',
            },
            {
              name: '@toolpath/api',
              allowTypeImports: true,
              message:
                'Only @toolpath/part-server may use the Toolpath SDK at runtime. Types are fine; values ship the SDK to the browser.',
            },
          ],
        },
      ],
    },
  },
  {
    // Packages run under Node without a bundler, so a relative import inside
    // one carries its `.js` extension — AGENTS.md § Shared Code.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [RELATIVE_JS, NO_SDK, NO_SCRAPER, NO_DRAWING] },
      ],
    },
  },
  {
    // The one module that runs the scraper. Everything else in the package may
    // name its types and nothing else — see NO_SCRAPER.
    files: ['packages/catalog-data/src/scrape.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [RELATIVE_JS, NO_SDK, NO_DRAWING] },
      ],
    },
  },
  {
    // part-server is the one place the SDK is allowed at runtime.
    files: ['packages/part-server/src/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
  {
    // Tests may name SDK values freely: nothing a test imports reaches a browser.
    files: [
      'apps/catalog/**/*.test.{ts,tsx}',
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/catalog/tests/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
)
