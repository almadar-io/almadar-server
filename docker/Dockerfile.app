# syntax=docker/dockerfile:1

# Reference self-host image for Almadar app servers consuming @almadar/server
# (Express or Hono — both read the same env contract). Multi-stage: build the
# app, then run on a slim runtime with production deps only.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 3030
# DATA_BACKEND: firebase | postgres | mock (mock forbidden in production)
CMD ["node", "dist/index.js"]
