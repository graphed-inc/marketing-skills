# syntax=docker/dockerfile:1

# Single image builds the dashboard. `graphed deploy` uploads this repo and
# builds this Dockerfile; graphed.yaml runs the standalone Next server.
# The release command migrates with tsx before the server starts.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run -w @app/dashboard build
RUN rm -rf packages/dashboard/.next/cache
RUN npm prune --omit=dev

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
COPY --from=build /app/packages/dashboard/.next/static ./packages/dashboard/.next/standalone/packages/dashboard/.next/static
CMD ["node", "packages/dashboard/.next/standalone/packages/dashboard/server.js"]
