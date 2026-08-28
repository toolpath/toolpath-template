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
 * Nothing here is type-aware, so no `tsc` program is built to run it.
 */

/** Type names that also exist on the global namespace, where `React.` is clearer. */
const GLOBAL_SHADOWED =
  '^(MouseEvent|KeyboardEvent|FocusEvent|ChangeEvent|DragEvent|PointerEvent|TouchEvent|WheelEvent|ClipboardEvent|AnimationEvent|TransitionEvent)$'

/**
 * Each layer of the app, most specific first: `app-root` is last so that it
 * catches only the handful of files sitting directly in `app/`.
 */
const ELEMENTS = [
  { type: 'server', pattern: 'apps/dfm/server' },
  { type: 'route', pattern: 'apps/dfm/app/routes' },
  { type: 'component', pattern: 'apps/dfm/app/components' },
  { type: 'client', pattern: 'apps/dfm/app/client' },
  { type: 'shared', pattern: 'apps/dfm/app/shared' },
  { type: 'test', pattern: 'apps/dfm/tests' },
  { type: 'app-root', pattern: 'apps/dfm/app' },
]

/**
 * Who may import whom. `default: 'disallow'` is the point of the whole rule:
 * anything not listed is an error, which is what makes an `app/` file importing
 * `server/` fail rather than merely being noticed in review.
 */
const may = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { type: to } } },
})

const POLICIES = [
  may('server', ['server', 'shared']),
  may('route', ['route', 'component', 'client', 'shared', 'app-root']),
  may('component', ['component', 'client', 'shared']),
  may('client', ['client', 'shared']),
  may('shared', ['shared']),
  may('app-root', ['route', 'component', 'client', 'shared', 'app-root']),
  may('test', ['*']),
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
    ],
  },
  {
    files: ['apps/dfm/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin, boundaries },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      'boundaries/elements': ELEMENTS,
      'boundaries/include': ['apps/dfm/**/*.{ts,tsx}'],
      // Without a TypeScript resolver the plugin cannot follow an extensionless
      // `.tsx` import or a tsconfig alias, and every dependency reads as unknown
      // — which silently turns the whole layering rule into a no-op.
      'import/resolver': { typescript: { project: 'apps/dfm/tsconfig.json' } },
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
      // The layering AGENTS.md describes: the browser never reaches into the server.
      'boundaries/dependencies': ['error', { default: 'disallow', policies: POLICIES }],
    },
  },
  {
    // The browser half. Aliases are resolvable here because Vite and Vitest both
    // load `vite-tsconfig-paths`; the server is left on relative imports because
    // production runs `tsx server/prod.ts` with no bundler to resolve them.
    files: ['apps/dfm/app/**/*.{ts,tsx}'],
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
              name: '@toolpath/api',
              allowTypeImports: true,
              message:
                'Only apps/dfm/server may use the Toolpath SDK at runtime. Types are fine; values ship the SDK to the browser.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests may name SDK values freely: nothing a test imports reaches a browser.
    files: ['apps/dfm/**/*.test.{ts,tsx}', 'apps/dfm/tests/**/*.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
)
