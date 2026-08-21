# DFM

A public, bring-your-own-key reference application for inspecting Toolpath Engine part features
and meshes. It keeps the `@toolpath/api` workflow visible and delegates HTTP,
validation, sessions, and SSE plumbing to Hono while React renders a conventional SPA. SSE monitors
the part-analysis job's queued and running progress until it succeeds or fails without polling.

## Run locally

```sh
cp apps/dfm/.env.example apps/dfm/.env
# Generate a value, paste it after APP_SESSION_SECRET= in apps/dfm/.env, then:
openssl rand -base64 32
pnpm install
pnpm --filter @toolpath/dfm dev
```

`APP_SESSION_SECRET` and `TOOLPATH_API_BASE_URL` are required in every environment.
`APP_SESSION_SECRET` is the encryption key for the BYOK session cookie and must remain stable
across restarts. `TOOLPATH_API_BASE_URL` is the server-only API URL; this reference app has
no default environment.

## Architecture

- `app/` is a client-rendered React SPA. It calls only app-owned `/api/*`
  routes; it never receives the API key or raw artifact URLs.
- `server/` is Hono-only. It serves the built SPA, seals the BYOK connection cookie with `jose`,
  validates requests with Zod, and is the sole location that uses the Toolpath SDK.
- `server/routes/parts.ts` is the core SDK example: it creates a part through the SDK, returns its
  short-lived presigned PUT URL, then starts analysis through the SDK. The browser uploads the CAD
  file directly to object storage; The server never receives or buffers CAD bytes.
- `server/routes/analysis.ts` forwards Engine job SSE as an app-owned, redacted SSE stream. The
  stream exists to monitor the part-analysis job's queued and running progress until it succeeds or
  fails; neither the browser nor the server polls for job status.
- `app/shared/` holds public response contracts and pure report-to-view-model helpers.

## Request flow

1. The SPA calls `GET /api/session` when it starts. Hono reads the encrypted `HttpOnly` cookie and
   returns only whether a connection exists.
2. `POST /api/session` seals a submitted API key in an encrypted, eight-hour `HttpOnly`, `Secure`,
   `SameSite=Lax` cookie.
3. `POST /api/parts` calls `POST /v1/parts` and returns its short-lived, single-object PUT URL.
   The browser uploads directly to that URL, then `POST /api/parts/:partId/analyze` calls
   `PATCH /v1/parts/{id}` through `@toolpath/api`.
4. `GET /api/parts/:partId/events` opens an app-owned SSE connection to monitor the part-analysis
   job's queued and running progress. The server forwards Toolpath API job SSE updates as
   `analysis` events, then fetches and emits a report when the job succeeds.
5. `GET /api/parts/:partId/mesh` reads a report solely to obtain an artifact URL, streams it, and
   retries once with a fresh report if the URL has expired.

To keep the application simple there is deliberately no application-level API-response cache. Every upstream request has one clear owner.

## Checks

```sh
pnpm --filter @toolpath/dfm check-types
pnpm --filter @toolpath/dfm test
pnpm --filter @toolpath/dfm build
pnpm --filter @toolpath/dfm test:e2e
```
