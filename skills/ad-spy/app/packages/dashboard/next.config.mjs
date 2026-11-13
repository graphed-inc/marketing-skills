import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@app/core"],
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["pg", "@electric-sql/pglite", "@graphed-inc/sdk"],
    outputFileTracingRoot: path.join(__dirname, "..", ".."),
    instrumentationHook: true,
  },
};

export default nextConfig;
