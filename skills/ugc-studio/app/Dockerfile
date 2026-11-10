# syntax=docker/dockerfile:1

# Builds the Next.js dashboard. graphed.yaml runs the standalone server.
# The release command migrates before the server starts. ffmpeg and python3
# stay in the runtime image for the clip pipeline.

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

FROM node:24-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
COPY --from=build /app/packages/dashboard/.next/static ./packages/dashboard/.next/standalone/packages/dashboard/.next/static
CMD ["node", "packages/dashboard/serve.cjs"]
