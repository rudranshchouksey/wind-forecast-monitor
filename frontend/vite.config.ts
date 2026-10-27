/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const REACT = /node_modules\/(react|react-dom|scheduler)\//;
const RECHARTS =
  /node_modules\/(recharts|recharts-scale|react-smooth|d3-[a-z]+|victory-vendor|lodash|decimal\.js-light|eventemitter3|tiny-invariant|fast-equals)\//;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8000" } },
  },
  build: {
    sourcemap: true,
    manifest: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // React is its own chunk so Rollup cannot hoist it into the Recharts chunk, which (with
        // its d3 dependencies) loads only with the lazy chart components.
        manualChunks: (id) => {
          if (REACT.test(id)) return "react";
          if (RECHARTS.test(id)) return "recharts";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test/**", "src/main.tsx"],
    },
  },
});
