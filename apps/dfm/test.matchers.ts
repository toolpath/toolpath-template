/*
 * Testing Library's DOM matchers.
 *
 * `@testing-library/jest-dom` was a declared dependency that nothing ever
 * loaded, so component assertions fell back to what plain `expect` can say:
 * `toBeTruthy()` on a query that already throws, `toBeNull()` on one that
 * cannot, and `aria-pressed` read off the element by hand. All three say what
 * they mean here instead — and say considerably more when they fail, because
 * these matchers print the element they found rather than `false`.
 *
 * Its own file rather than a line in `test.setup.ts`: that one seals a session
 * secret for the server tests, and what a matcher is has nothing to do with it.
 * It is listed in `tsconfig.json` as well as in `setupFiles`, because the
 * matchers reach the test files as a `declare module 'vitest'` augmentation and
 * a file TypeScript never reads augments nothing.
 */
import '@testing-library/jest-dom/vitest'
