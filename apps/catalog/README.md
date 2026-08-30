# @toolpath/catalog

A browsable catalog of cutting tools — what a shop has available, what each tool
measures, what the vendor's terse codes mean — and the tools that can cut a
given part's features.

**Tool data is bundled at build time** and filtered entirely in the browser.
**Parts are not**: uploading and analysing one needs the user's Toolpath API
key, so this application also serves the shared part API from
`@toolpath/part-server`. That is the only thing its server does.

```sh
pnpm dev:catalog          # http://localhost:5173
pnpm --filter @toolpath/catalog test
pnpm --filter @toolpath/catalog test:e2e
```

`pnpm setup:local` writes this application's `.env`. It needs
`APP_SESSION_SECRET` and `TOOLPATH_API_BASE_URL`, the same two the DFM app
needs, with its own generated secret.

## The two data boundaries

`app/shared/catalog.ts` is the only module that touches the bundled dataset.
Everything else asks it for tools, so replacing today's sample with an ingested
dataset — or later with a fetch — is a change to that one file.

`app/shared/tool-fit.ts` is the only module that turns selected features into
tools. The narrowing itself is `@toolpath/catalog-data`'s `fit.ts`, tested there
against literals; this is the thin binding to the bundled catalog.

What ships today is the **sample dataset**: nine plausible tools that exercise
the catalog's shape. It is not a vendor's data. Real ingestion is phase 2 in
[`docs/TOOL-CATALOG-PLAN.md`](../../docs/TOOL-CATALOG-PLAN.md).

## Deploying

Clean paths need the host to **serve `index.html` for unknown paths**. Without
that rewrite, a refresh on `/tools/<guid>` returns 404 and the deploy looks
broken only to people who follow a shared link. `server/prod.ts` implements it,
and `tests/catalog.spec.ts` covers it, so a deploy that forgets fails in CI.
