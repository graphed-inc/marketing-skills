import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @app/core ships TypeScript source (no build step) — Next compiles it.
  transpilePackages: ["@app/core"],
  // Keep dev output out of `.next` so `next build` while the dev server is
  // running does not clobber its assets.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Standalone output keeps the production image small. Tracing from the
  // repo root puts server.js at
  // packages/dashboard/.next/standalone/packages/dashboard/server.js,
  // which is the command graphed.yaml runs.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
};

export default nextConfig;
