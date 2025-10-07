import { defineConfig } from "tsdown";

export default defineConfig({
  // Build universal root and server-only subpath
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  platform: "neutral",
  target: "es2022"
});
