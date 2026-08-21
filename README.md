# Toolpath DFM Template

A customer-facing design-for-manufacturability application for uploading a CAD part, starting
Toolpath Engine analysis, and inspecting the resulting features and mesh. Use this repository as a
GitHub template to build your own Toolpath-powered product.

## Start here

1. Select **Use this template** on GitHub, or clone this repository.
2. Install Node.js 24.18+ and enable Corepack.
3. Create a local environment file and set the required values:

```sh
cp apps/dfm/.env.example apps/dfm/.env
openssl rand -base64 32
pnpm install --frozen-lockfile
pnpm dev
```

Set the generated value as `APP_SESSION_SECRET` and set `TOOLPATH_API_BASE_URL` in
`apps/dfm/.env`. The application accepts each user's Toolpath API key through its
bring-your-own-key connection screen; do not put API keys in environment variables.

## Development

```sh
pnpm check
pnpm test:e2e
docker build --file apps/dfm/Dockerfile --target prod --tag part-viewer:local .
```

The application uses released `@toolpath/api`, `@toolpath/ui`, and `@toolpath/viewer` packages.
Update those versions deliberately and commit the resulting lockfile changes.

See [the application README](apps/dfm/README.md) for architecture and request-flow
details.

## Deployment

This template intentionally includes no Toolpath deployment credentials, cloud configuration, or
deployment automation. Deploy it through your own platform and configure `APP_SESSION_SECRET` and
`TOOLPATH_API_BASE_URL` with that platform's secret and environment-variable system.

## License

This project is licensed under the [MIT License](LICENSE).
