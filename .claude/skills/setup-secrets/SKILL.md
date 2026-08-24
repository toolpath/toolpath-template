---
name: setup-secrets
description: Set up this template's local server-only environment configuration without exposing secret values. Use when asked to configure local Toolpath credentials or environment settings.
---

# Setup Local Environment

This template intentionally uses a local, gitignored environment file instead
of an encrypted-in-repository secret system. Do not introduce SOPS, age, a new
secret manager, or browser-accessible environment variables unless the user
explicitly chooses that broader change.

Run `pnpm setup:local` from the repository root. It creates
`apps/dfm/.env` only when it does not already exist, generates the session
secret without displaying it, and installs locked dependencies. Never read,
print, stage, or ask the user to paste the contents of this file.

The local file must contain the documented server-only values:

- `APP_SESSION_SECRET`, which must stay stable across server restarts;
- `TOOLPATH_API_BASE_URL`, normally `https://api.toolpath.com`.

The user supplies their Toolpath API key through the application's BYOK
connection flow, where it is held in an encrypted HttpOnly session cookie; do
not add it to source, `.env.example`, browser code, logs, or test fixtures.
For deployment, direct the user to the platform's secret store and ensure the
two documented environment values are configured there. Confirm only file
existence or command success, never secret values.
