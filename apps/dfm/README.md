# DFM

A public, bring-your-own-key reference application for inspecting Toolpath Engine part features
and meshes. It keeps the `@toolpath/api` workflow visible and delegates HTTP,
validation, sessions, and SSE plumbing to Hono while React renders a conventional SPA. SSE monitors
the part-analysis job's queued and running progress until it succeeds or fails without polling.

## Run locally

```sh
pnpm setup:local
pnpm --filter @toolpath/dfm dev
```

`APP_SESSION_SECRET` and `TOOLPATH_API_BASE_URL` are required in every environment.
`APP_SESSION_SECRET` is the encryption key for the BYOK session cookie and must remain stable
across restarts. `TOOLPATH_API_BASE_URL` is the server-only API URL. `pnpm setup:local` sets it
to `https://api.toolpath.com`; change it in `apps/dfm/.env` when using another Engine environment.

## Architecture

- `app/` is a client-rendered React SPA. It calls only app-owned `/api/*`
  routes; it never receives the API key or raw artifact URLs.
- `server/` is Hono-only. It serves the built SPA and composes the part API from
  `@toolpath/part-server` (`createPartApi({ appName: 'part-viewer' })`), which seals the BYOK
  connection cookie with `jose`, validates requests with Zod, and is the sole location that uses the
  Toolpath SDK. The browser half is `@toolpath/part-client`; the shared report contracts are
  `@toolpath/part-contracts`.
- `packages/part-server/src/routes/files.ts` is the core SDK example: it creates a file through the
  SDK, returns its short-lived presigned PUT URL, inspects it for its solid bodies, then makes a part
  of the body chosen and starts its analysis. The browser uploads the CAD file directly to object
  storage; the server never receives or buffers CAD bytes.
- `packages/part-server/src/routes/analysis.ts` forwards Engine job SSE as an app-owned, redacted SSE stream. The
  stream exists to monitor the part-analysis job's queued and running progress until it succeeds or
  fails; neither the browser nor the server polls for job status.
- `app/shared/` holds public response contracts and pure report-to-view-model helpers.

## Request flow

1. The SPA calls `GET /api/session` when it starts. Hono reads the encrypted `HttpOnly` cookie and
   returns only whether a connection exists.
2. `POST /api/session` seals a submitted API key in an encrypted, eight-hour `HttpOnly`, `Secure`,
   `SameSite=Lax` cookie.
3. `POST /api/files` calls `POST /v1/files?filename=...` and returns its short-lived,
   single-object PUT URL. The browser uploads directly to that URL, then `PATCH /api/files/:fileId`
   starts the file's inspection (`PATCH /v1/files/{id}`) and `GET /api/files/:fileId/events` follows
   it as redacted `inspection` events, ending in the file's bodies (`GET /v1/files/{id}`). A file of
   one body goes straight on; a file of several shows its bodies on the start page.
   `POST /api/files/:fileId/parts` makes a part of the body chosen
   (`POST /v1/files/{id}/parts`) and starts its analysis
   (`PATCH /v1/parts/{id}?featureDetails=true`).
4. `GET /api/parts/:partId/events` opens an app-owned SSE connection to monitor the part-analysis
   job's queued and running progress. The server forwards `GET /v1/jobs/{id}/events` updates as
   redacted `analysis` events, then reads `GET /v1/parts/{id}?jobId=...` when the job succeeds.
   Missing feature datasheets are fetched in batches from
   `GET /v1/parts/{id}/features?ids=...` before the public part result is emitted.
5. `GET /api/parts/:partId/mesh` reads the part result solely to obtain an artifact URL, streams
   it, and retries once with a fresh part result if the URL has expired.

To keep the application simple there is deliberately no application-level API-response cache. Every upstream request has one clear owner.

## Checks

```sh
pnpm --filter @toolpath/dfm check-types
pnpm --filter @toolpath/dfm test
pnpm --filter @toolpath/dfm build
pnpm --filter @toolpath/dfm test:e2e
```

These four narrow a loop while working on one thing. `pnpm check`, from the
repository root, is the gate: it adds `pnpm check-style` and `pnpm lint`, and
`lint` is what proves the layering described above — that `app/` never imports
`server/`, and that the Toolpath SDK is imported for its types only outside
`server/`. Neither is caught by any of the four commands here.
