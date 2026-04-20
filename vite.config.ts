// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

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
  cloudflare: false,
  vite: { plugins: [fixVirtualClientEntryUrl()] },
});
