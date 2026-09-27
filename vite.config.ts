import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const buildId =
  process.env.VELORA_BUILD_ID ||
  `${Date.now().toString(36)}-${(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 8)}`;
function releaseAssets() {
  let output = "dist";
  let precache: string[] = [];
  return {
    name: "velora-release-assets",
    apply: "build" as const,
    configResolved(config: { build: { outDir: string } }) {
      output = config.build.outDir;
    },
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      precache = Object.keys(bundle)
        .filter((name) => /\.(js|css|woff2)$/.test(name))
        .map((name) => "/" + name);
    },
    closeBundle() {
      const file = resolve(output, "sw.js");
      const source = readFileSync(file, "utf8")
        .replaceAll("__VELORA_BUILD__", buildId)
        .replace(
          '"__VELORA_ASSETS__"',
          precache.map((url) => JSON.stringify(url)).join(","),
        );
      new Function(source); // Fail the build if the generated worker is invalid.
      writeFileSync(file, source);
      writeFileSync(
        resolve(output, "version.json"),
        JSON.stringify({ version: buildId, builtAt: new Date().toISOString() }),
      );
    },
  };
}
export default defineConfig({
  plugins: [react(), releaseAssets()],
  define: { __APP_BUILD__: JSON.stringify(buildId) },
  server: {
    watch: { ignored: ["**/.venv/**", "**/.tools/**", "**/worker/data/**"] },
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/files": "http://127.0.0.1:8787",
    },
  },
});
