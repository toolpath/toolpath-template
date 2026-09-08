# syntax=docker/dockerfile:1
# Catalog is a client-rendered React Router app served by its Hono API server.
# Build from the repository root so pnpm can install the app workspace and the
# app-owned packages it depends on.
ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-slim AS base
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/catalog/package.json apps/catalog/package.json
COPY packages/catalog-data/package.json packages/catalog-data/package.json
COPY packages/part-client/package.json packages/part-client/package.json
COPY packages/part-contracts/package.json packages/part-contracts/package.json
COPY packages/part-server/package.json packages/part-server/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# Catalog imports the four workspace packages above, so Turbo builds that
# dependency closure before Vite bundles the browser application.
RUN pnpm turbo run build --filter=@toolpath/catalog
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @toolpath/catalog deploy --legacy --prod /prod

FROM node:${NODE_VERSION}-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod .
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/prod.ts"]
