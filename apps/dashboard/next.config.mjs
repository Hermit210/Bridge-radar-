import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@radar/shared"],
  // An unrelated ~/yarn.lock outside this repo makes Next's workspace-root
  // auto-detection walk up past the real monorepo root and pick $HOME
  // instead — breaks output file tracing (missing webpack chunks at build
  // time). Pin it explicitly to the actual pnpm workspace root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
