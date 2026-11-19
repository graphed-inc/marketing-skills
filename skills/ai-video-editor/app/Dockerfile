# syntax=docker/dockerfile:1
FROM node:24-slim
# ffmpeg pulls the audio out of each uploaded source for Graphed transcription (agent.mjs worker)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
ENV PORT=3000
CMD ["node", "server.mjs"]
