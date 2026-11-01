import path from "node:path";
import fs from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dashboard shares ONE data layer with the field app (../common.js, ../config.js,
// ../data/seed.js). In production those files sit one folder up from /dashboard/;
// in dev this middleware serves them from the repo root so the same runtime paths work.
const ROOT = path.resolve(__dirname, "..");
const SHARED = ["/config.js", "/common.js", "/data/seed.js"];
const isShared = (u: string) => SHARED.includes(u) || u.startsWith("/assets/");
function sharedLegacyFiles(): Plugin {
  return {
    name: "herpwatch-shared-legacy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!isShared(url) || !fs.existsSync(path.join(ROOT, url))) return next();
        res.setHeader("Content-Type", url.endsWith(".svg") ? "image/svg+xml" : url.endsWith(".png") ? "image/png" : "application/javascript");
        res.end(fs.readFileSync(path.join(ROOT, url)));
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), sharedLegacyFiles()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // Built output is committed at ../dashboard so GitHub Pages works in both
  // "Deploy from a branch" and "GitHub Actions" modes.
  build: { outDir: "../dashboard", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
