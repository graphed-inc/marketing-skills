# syntax=docker/dockerfile:1
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
ENV PORT=3000
CMD ["node", "server.mjs"]
