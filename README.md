# Toolpath DFM Template

A design-for-manufacturability application for uploading a CAD part, starting
Toolpath Engine analysis, and inspecting the resulting features and mesh. Use this repository as a
GitHub template to build your own Toolpath API powered product.

See https://developers.toolpath.com/ for documentation on using the Toolpath API.

## Start here

1. Create a new github repository and select **Start with a template** to use this repository as a base to build your own application.
   ![Selecting the Toolpath template on GitHub](assets/make-template.png)
2. Install Node.js 24.18 or newer. Node.js is the program that runs this
   application on your computer. Download and install it from
   [nodejs.org](https://nodejs.org/en/download). Then open **Terminal** on macOS or Linux,
   or **PowerShell** on Windows, and run:

   ```sh
   node --version
   corepack enable
   ```

   The first command should show `v24.18.0` or a higher version.
   Corepack comes with Node.js and turns on the exact version of `pnpm` that
   this project needs to install and run its files.

3. Create your private local settings file:

   ```sh
   pnpm setup:local
   ```

   This creates a private `.env` for each application — `apps/dfm/.env` and
   `apps/catalog/.env` — that stays on your computer and is not added to GitHub.
   It generates each session secret without displaying it and sets the standard
   Toolpath API URL. It also installs the application files it needs.

   This also installs the Husky pre-commit hook. It formats staged files automatically before each
   commit so you can have nice formatting without having to think about it.

4. Start the application:

   ```sh
   pnpm dev
   ```

   Open the local address shown in the terminal, usually
   [http://localhost:5173](http://localhost:5173). You are ready when the
   Toolpath connection screen appears.

## Development

```sh
pnpm check # Run all quality checks, across every application and package
pnpm test:e2e # Run every Playwright E2E suite
pnpm dev # Start the DFM app on http://localhost:5173
pnpm dev:catalog # Start the tool catalog on http://localhost:5174
pnpm --filter @toolpath/dfm docker:build # Build DFM app docker container
```

Both applications pin their development port, so the two can run side by side.
In production they default to ports 3000 and 3001 respectively.

The application uses released `@toolpath/api`, `@toolpath/ui`, and `@toolpath/viewer` NPM packages.

See [the DFM application README](apps/dfm/README.md) for architecture and
request-flow details.

## Working on the tool catalog

Four things surprise people on their first day with `apps/catalog`. None of them
is a bug.

**Build the workspace packages before starting the dev server.** They are
consumed from `dist/`, which is not in git, so a fresh clone has nothing to
link:

```sh
pnpm build        # or pnpm check, which builds as part of the gate
pnpm dev:catalog  # http://localhost:5174
```

**A fresh checkout has nine tools, not seventeen thousand.** Vendor data is the
vendor's and is never committed, so `catalog-dataset` resolves to the committed
sample and most features answer "nothing fits". To work against a real catalog,
scrape one on your own machine:

```sh
pnpm --filter @toolpath/catalog-data scrape   # writes the gitignored scrape-out/
```

The dev server prints which dataset it picked at start-up. `CATALOG_DATASET`
overrides the choice if you have a `catalog.json` from somewhere else.

**Everyone brings their own Toolpath API key**, typed into the application
rather than kept in a file. Nothing secret travels with a branch.

**Never run `pnpm check` while the dev server is running.** It rebuilds the
workspace packages underneath Vite, which then serves stale optimised
dependencies and the page goes black. If that happens:

```sh
rm -rf apps/catalog/node_modules/.vite && pnpm dev:catalog
```

Then read [`docs/FEATURE-LIST.md`](docs/FEATURE-LIST.md) — it is the spec for
the part page, which is most of what the catalog is.

## The applications in this workspace

| Path           | What it is                                                                   |
| -------------- | ---------------------------------------------------------------------------- |
| `apps/dfm`     | The DFM application: upload a part, analyse it, inspect features and rules.  |
| `apps/catalog` | The tool catalog: browse cutting tools, and match them to a part's features. |
| `packages/`    | What the applications share, including the one place an API key is handled.  |

Code needed by both applications belongs in `packages/` rather than in one of
them — see `AGENTS.md` and [`docs/TOOL-CATALOG-PLAN.md`](docs/TOOL-CATALOG-PLAN.md).

## License

This project is licensed under the [MIT License](LICENSE).
