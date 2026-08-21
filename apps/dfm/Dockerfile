# syntax=docker/dockerfile:1
# DFM is a client-rendered React Router app served by its Hono API server.
# Build from the repository root so pnpm can install the app workspace.
ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-slim AS base
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/dfm/package.json apps/dfm/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# The SDK runs on the server and the UI/viewer packages are bundled by Vite.
RUN pnpm --filter @toolpath/dfm build
# A self-contained production dependency closure keeps the runtime image independent of pnpm.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @toolpath/dfm deploy --legacy --prod /prod

FROM node:${NODE_VERSION}-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod .
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/prod.ts"]
