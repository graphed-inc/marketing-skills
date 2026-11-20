import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@app/core"],
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "standalone",
  // Next 16 promotes these out of `experimental`. Tracing has to stay rooted at
  // the app directory so graphed.yaml's standalone server path still resolves.
  // instrumentation.ts is picked up without a config flag.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  serverExternalPackages: ["pg", "@electric-sql/pglite", "openai", "@graphed-inc/sdk"],
};

export default nextConfig;
