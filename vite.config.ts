import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import type { Plugin } from "vite";
import path from "node:path";

// Vite 7 + TanStack Start compatibility fix:
// TanStack Start SSR generates script URLs like /@id/virtual:tanstack-start-client-entry
// but Vite 7 serves null-byte virtual modules at /@id/__x00__<id>.
// This middleware rewrites the request URL before Vite's transform pipeline sees it.
function fixVirtualClientEntryUrl(): Plugin {
  return {
    name: "fix-virtual-client-entry-url",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/@id/virtual:tanstack-start-client-entry") {
          req.url = "/@id/__x00__virtual:tanstack-start-client-entry";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackStart(),
    react(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    fixVirtualClientEntryUrl(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
  },
});
